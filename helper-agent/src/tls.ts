/**
 * Local TLS material for the loopback HTTPS listener.
 *
 * Why this exists: Safari is the only browser that treats `http://127.0.0.1`
 * from an HTTPS page as mixed content and blocks it (WebKit bug 171934, open
 * since 2017). Serving HTTPS on loopback is the only way a Safari user can
 * reach the agent at all.
 *
 * The chain is generated **on the machine** at install time:
 *   ca.pem / ca.key     — private CA, 10 years, name-constrained to localhost
 *   server.pem / .key   — leaf for localhost, 800 days
 *
 * The CA is added to the System keychain by installer/macos/scripts/postinstall.
 * Two deliberate decisions:
 *
 *  - **Name constraints are critical.** A stolen ca.key can only ever sign for
 *    localhost / 127.0.0.1, so it is worthless for impersonating a real site —
 *    unlike an unconstrained mkcert-style CA. (Caveat: this depends on the
 *    verifier honouring constraints on a trust anchor. macOS, Chrome and NSS
 *    do; a verifier that does not leaves us exactly at mkcert's risk level.)
 *  - **The CA key is kept** (0600) rather than destroyed after issuance, so the
 *    agent can re-issue the leaf before it expires — no reinstall, no second
 *    trip to the keychain. Apple caps *server* certificates from admin-added
 *    roots at 825 days; CA certificates are not capped, hence the two very
 *    different lifetimes.
 *
 * Generation goes through the openssl CLI (present on every macOS) driven by
 * real config files: `-addext` is not available on the LibreSSL that ships with
 * macOS, and hand-rolled ASN.1 is exactly the kind of code that yields a subtly
 * invalid certificate.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TlsMaterial {
  caPath: string;
  certPath: string;
  keyPath: string;
  /** Leaf expiry. */
  notAfter: Date;
}

const CA_DAYS = 3650; // CA certs are not subject to Apple's 825-day cap
const LEAF_DAYS = 800; // must stay under 825 for admin-added roots
const RENEW_BEFORE_DAYS = 30;

/**
 * ::1 is deliberately absent from both the constraints and the leaf SAN: the
 * agent binds 127.0.0.1 only, and IPv6 name-constraint syntax is the part of
 * openssl most likely to differ between builds.
 */
const CA_CONFIG = `[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ca

[dn]
CN = Easy PDF Sign Local CA
O = Easy PDF Sign

[v3_ca]
basicConstraints = critical,CA:true,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical,permitted;DNS:localhost,permitted;IP:127.0.0.1/255.255.255.255
`;

const LEAF_REQ_CONFIG = `[req]
distinguished_name = dn
prompt = no

[dn]
CN = localhost
O = Easy PDF Sign
`;

const LEAF_EXT_CONFIG = `basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost,IP:127.0.0.1
`;

/** ~/Library/Application Support/EasyPDFSign/tls on macOS, ~/.easy-pdf-sign/tls elsewhere. */
export function tlsDir(): string {
  return process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'EasyPDFSign', 'tls')
    : join(homedir(), '.easy-pdf-sign', 'tls');
}

function paths(dir: string) {
  return {
    caPath: join(dir, 'ca.pem'),
    caKeyPath: join(dir, 'ca.key'),
    certPath: join(dir, 'server.pem'),
    keyPath: join(dir, 'server.key'),
  };
}

function openssl(args: string[]): string {
  return execFileSync('openssl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tmpFile(contents: string, suffix: string): string {
  const file = join(tmpdir(), `eps-${process.pid}-${suffix}`);
  writeFileSync(file, contents);
  return file;
}

/** Leaf expiry, or null if the certificate is missing or unreadable. */
function readNotAfter(certPath: string): Date | null {
  if (!existsSync(certPath)) return null;
  try {
    const out = openssl(['x509', '-in', certPath, '-noout', '-enddate']); // notAfter=Jul 28 12:00:00 2028 GMT
    const parsed = new Date(out.split('=')[1]?.trim() ?? '');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function daysUntil(date: Date): number {
  return (date.getTime() - Date.now()) / 86_400_000;
}

function generateCa(dir: string): void {
  const { caPath, caKeyPath } = paths(dir);
  const config = tmpFile(CA_CONFIG, 'ca.cnf');
  try {
    openssl(['genrsa', '-out', caKeyPath, '2048']);
    chmodSync(caKeyPath, 0o600);
    openssl([
      'req', '-x509', '-new', '-key', caKeyPath,
      '-sha256', '-days', String(CA_DAYS),
      '-config', config,
      '-out', caPath,
    ]);
    chmodSync(caPath, 0o644);
  } finally {
    rmSync(config, { force: true });
  }
}

function issueLeaf(dir: string): void {
  const { caPath, caKeyPath, certPath, keyPath } = paths(dir);
  const reqConfig = tmpFile(LEAF_REQ_CONFIG, 'leaf.cnf');
  const extConfig = tmpFile(LEAF_EXT_CONFIG, 'leaf-ext.cnf');
  const csrPath = join(tmpdir(), `eps-${process.pid}-leaf.csr`);
  try {
    openssl(['genrsa', '-out', keyPath, '2048']);
    chmodSync(keyPath, 0o600);
    openssl(['req', '-new', '-key', keyPath, '-config', reqConfig, '-out', csrPath]);
    openssl([
      'x509', '-req', '-in', csrPath,
      '-CA', caPath, '-CAkey', caKeyPath, '-CAcreateserial',
      '-sha256', '-days', String(LEAF_DAYS),
      '-extfile', extConfig,
      '-out', certPath,
    ]);
    chmodSync(certPath, 0o644);
  } finally {
    rmSync(reqConfig, { force: true });
    rmSync(extConfig, { force: true });
    rmSync(csrPath, { force: true });
  }
}

/**
 * Returns usable TLS material, generating or renewing it as needed.
 * Throws if openssl is missing or generation fails — every caller treats that
 * as "no HTTPS", never as fatal: the plain HTTP listener keeps working in every
 * browser except Safari.
 */
export function ensureTlsMaterial(): TlsMaterial {
  const dir = tlsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { caPath, caKeyPath, certPath, keyPath } = paths(dir);

  if (!existsSync(caPath) || !existsSync(caKeyPath)) {
    generateCa(dir);
    rmSync(certPath, { force: true }); // a leaf from a previous CA is worthless
  }

  const current = readNotAfter(certPath);
  if (current === null || !existsSync(keyPath) || daysUntil(current) < RENEW_BEFORE_DAYS) {
    issueLeaf(dir);
  }

  const notAfter = readNotAfter(certPath);
  if (!notAfter) throw new Error('certificate generation produced an unreadable certificate');

  return { caPath, certPath, keyPath, notAfter };
}

/** Reads the PEM pair for https.createServer / setSecureContext. */
export function readTlsPair(material: TlsMaterial): { cert: string; key: string } {
  return {
    cert: readFileSync(material.certPath, 'utf8'),
    key: readFileSync(material.keyPath, 'utf8'),
  };
}
