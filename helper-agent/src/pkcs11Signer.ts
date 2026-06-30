/**
 * PKCS#11 signing + PAdES-B-B CMS building.
 *
 * Environment variables:
 *   PKCS11_LIB   — path to the PKCS#11 library (optional; auto-detected per-OS if absent)
 *   PKCS11_SLOT  — slot index (default 0)
 *   PKCS11_PIN   — user PIN (optional; if absent the user is prompted via OS dialog)
 *
 * PIN handling:
 *   The PIN is never stored in memory longer than a single sign operation.
 *   It is obtained at sign-time via (in priority order):
 *     1. PKCS11_PIN env var (for automated testing only)
 *     2. osascript dialog (macOS — built in, no extra install)
 *     3. pinentry (standard secure-entry daemon on Linux/macOS)
 *     4. zenity --password (GNOME)
 *     5. kdialog --password (KDE)
 *     6. WinForms masked dialog via PowerShell (Windows — built in)
 *     7. readline prompt in the helper-agent terminal (last resort)
 */
import { createHash } from 'crypto';
import { execFileSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import fs from 'fs';
import forge from 'node-forge';
import type { CertInfo } from './types';

// ─── Lazy Graphene load ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Graphene: any = null;

function loadGraphene() {
  if (Graphene) return Graphene;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Graphene = require('graphene-pk11');
  } catch {
    throw new Error(
      'graphene-pk11 native module not available. ' +
        'Install build tools (gcc-c++, make) and run npm install in helper-agent/.',
    );
  }
  return Graphene;
}

// ─── PKCS#11 module (loaded once, no session cached) ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mod: any = null;

/** Tries known PKCS#11 library locations per-OS when PKCS11_LIB is not set. */
function autoDetectPkcs11Lib(): string | null {
  const candidates: string[] =
    process.platform === 'win32'
      ? [
          // SafeNet eToken (Evrotrust, Info Notary, some B-Trust)
          'C:\\Windows\\System32\\eTPkcs11.dll',
          // B-Trust / Bit4id middleware
          'C:\\Windows\\System32\\bit4ipki.dll',
          // OpenSC (generic open-source driver)
          'C:\\Windows\\System32\\opensc-pkcs11.dll',
          'C:\\Program Files\\OpenSC Project\\OpenSC\\pkcs11\\opensc-pkcs11.dll',
          // Gemalto / Thales IDPrime
          'C:\\Windows\\System32\\IDPrimeNet.dll',
          // Atos CardOS / Siemens
          'C:\\Windows\\System32\\acospkcs11.dll',
        ]
      : process.platform === 'darwin'
        ? [
            // SafeNet eToken
            '/usr/local/lib/libeTPkcs11.dylib',
            '/Library/Frameworks/eToken.framework/Versions/Current/libeTPkcs11.dylib',
            // OpenSC (via Homebrew or the official .pkg installer)
            '/usr/local/lib/opensc-pkcs11.so',
            '/usr/local/lib/pkcs11/opensc-pkcs11.so',
            '/Library/OpenSC/lib/opensc-pkcs11.so',
            '/opt/homebrew/lib/opensc-pkcs11.so',
            // Bit4id
            '/usr/local/lib/libbit4ipki.dylib',
          ]
        : [
            // Linux: SafeNet eToken
            '/usr/lib64/libeTPkcs11.so',
            '/usr/lib/libeTPkcs11.so',
            '/usr/lib/x86_64-linux-gnu/libeTPkcs11.so',
            // OpenSC (generic open-source driver, most distros)
            '/usr/lib64/opensc-pkcs11.so',
            '/usr/lib/opensc-pkcs11.so',
            '/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so',
            '/usr/lib/pkcs11/opensc-pkcs11.so',
            // Bit4id
            '/usr/lib64/libbit4ipki.so',
            '/usr/lib/libbit4ipki.so',
          ];

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function getModule() {
  if (_mod) return _mod;
  const G = loadGraphene();
  const lib = process.env.PKCS11_LIB ?? autoDetectPkcs11Lib();
  if (!lib) {
    throw new Error(
      'PKCS11_LIB is not set and no PKCS#11 library was auto-detected. ' +
      'Set PKCS11_LIB in helper-agent/.env to the path of your card middleware DLL.',
    );
  }
  _mod = G.Module.load(lib);
  _mod.initialize();
  return _mod;
}

function getSlot() {
  const G = loadGraphene();
  const mod = getModule();
  const slotIdx = parseInt(process.env.PKCS11_SLOT ?? '0', 10);
  const slots = mod.getSlots(true); // only slots with tokens
  if (slotIdx >= slots.length) {
    throw new Error(`PKCS11_SLOT=${slotIdx} but only ${slots.length} slot(s) with tokens found`);
  }
  return { slot: slots.items(slotIdx), G };
}

function openSession(slot: unknown, G: { SessionFlag: { RW_SESSION: number; SERIAL_SESSION: number } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (slot as any).open(G.SessionFlag.RW_SESSION | G.SessionFlag.SERIAL_SESSION);
}

export function isPkcs11Available(): boolean {
  try {
    getSlot();
    return true;
  } catch {
    return false;
  }
}

// ─── Certificate listing (no PIN required — certs are public objects) ─────────

export function listCertificates(): CertInfo[] {
  const { slot, G } = getSlot();
  const session = openSession(slot, G);
  try {
    const results: CertInfo[] = [];
    const objs = session.find({ class: G.ObjectClass.CERTIFICATE });
    for (let i = 0; i < objs.length; i++) {
      const obj = objs.items(i);
      try {
        const certDer = obj.getAttribute('value') as Buffer;
        const cert = parseCertDer(certDer);
        const rawId = obj.getAttribute('id') as Buffer | null;
        const id = rawId && rawId.length > 0 ? rawId.toString('hex') : `cert-${i}`;
        results.push({
          id,
          subject: dnToString(cert.subject),
          issuer: dnToString(cert.issuer),
          validFrom: (cert.validity.notBefore as Date).toISOString(),
          validTo: (cert.validity.notAfter as Date).toISOString(),
          keyUsage: extractKeyUsage(cert),
        });
      } catch {
        // skip certificates that cannot be parsed
      }
    }
    return results;
  } finally {
    session.close();
  }
}

// ─── Signing (PIN prompted at sign-time) ──────────────────────────────────────

/**
 * Signs the PDF byte-range hash with the private key identified by certId.
 * Prompts the user for their PIN via OS dialog unless PKCS11_PIN is set.
 * Returns a hex-encoded DER CMS ContentInfo / SignedData.
 */
export async function signHash(hashHex: string, certId: string): Promise<string> {
  const { slot, G } = getSlot();
  const session = openSession(slot, G);
  try {
    const pin = await promptPin();
    if (!pin) {
      throw new Error(
        'PIN не беше въведен. Ако агентът работи като systemd service, ' +
        'изпълнете: systemctl --user set-environment DISPLAY=:0 и рестартирайте service-а. ' +
        'Или задайте PKCS11_PIN в ~/.config/easy-pdf-sign-helper.env',
      );
    }
    session.login(pin);

    // Locate certificate
    let certDer: Buffer | null = null;
    const certObjs = session.find({ class: G.ObjectClass.CERTIFICATE });
    for (let i = 0; i < certObjs.length; i++) {
      const obj = certObjs.items(i);
      const rawId = obj.getAttribute('id') as Buffer | null;
      const id = rawId && rawId.length > 0 ? rawId.toString('hex') : `cert-${i}`;
      if (id === certId) {
        certDer = obj.getAttribute('value') as Buffer;
        break;
      }
    }
    if (!certDer) throw new Error(`Certificate id=${certId} not found on token`);

    // Locate private key with the same CKA_ID
    const privKeyObjs = session.find({
      class: G.ObjectClass.PRIVATE_KEY,
      id: Buffer.from(certId, 'hex'),
    });
    if (privKeyObjs.length === 0) {
      throw new Error(`Private key for certId=${certId} not found on token`);
    }
    const privKey = privKeyObjs.items(0);

    // Build signed attributes DER (SET, tag 0x31) — fed to C_Sign
    const pdfHash = Buffer.from(hashHex, 'hex');
    const signingTime = new Date();
    const signedAttrsDer = buildSignedAttrsDer(pdfHash, certDer, signingTime);

    // CKM_SHA256_RSA_PKCS: PKCS#11 lib hashes internally and applies PKCS#1v1.5
    const signer = session.createSign('SHA256_RSA_PKCS', privKey);
    signer.update(signedAttrsDer);
    const signatureBytes: Buffer = signer.final();

    return buildCms(certDer, signedAttrsDer, signatureBytes).toString('hex');
  } finally {
    try { session.logout(); } catch { /* may already be logged out */ }
    session.close();
  }
}

// ─── PIN acquisition ──────────────────────────────────────────────────────────

async function promptPin(): Promise<string> {
  // 1. Env var override (for testing / CI)
  if (process.env.PKCS11_PIN) return process.env.PKCS11_PIN;

  if (process.platform === 'darwin') {
    // 2. Native macOS dialog via osascript — always present, no extra install
    try {
      const script =
        'tell application "System Events"\n' +
        'set pinResult to display dialog "PIN за смарт картата:" default answer "" with hidden answer with title "Easy PDF Sign"\n' +
        'return text returned of pinResult\n' +
        'end tell';
      return promptViaExec('osascript', ['-e', script]);
    } catch { /* not available */ }
  }

  if (process.platform === 'linux' || process.platform === 'darwin') {
    // 3. pinentry (standard on most Linux desktops; used by GPG; also installable on macOS via Homebrew)
    try { return await promptViaPinentry(); } catch { /* not available */ }
    // 4. zenity (GNOME)
    try { return promptViaExec('zenity', ['--password', '--title=Easy PDF Sign', '--text=Въведете PIN за смарт картата:']); } catch { /* not available */ }
    // 5. kdialog (KDE)
    try { return promptViaExec('kdialog', ['--password', 'Въведете PIN за смарт картата:']); } catch { /* not available */ }
  }

  if (process.platform === 'win32') {
    // 5. WinForms masked dialog via PowerShell 5.1+ (available on all Windows 10/11)
    try {
      const ps = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$f=New-Object Windows.Forms.Form;',
        '$f.Text="Easy PDF Sign";$f.TopMost=$true;$f.FormBorderStyle="FixedDialog";',
        '$f.StartPosition="CenterScreen";$f.ClientSize=[Drawing.Size]::new(280,110);',
        '$f.MinimizeBox=$false;$f.MaximizeBox=$false;',
        '$l=New-Object Windows.Forms.Label;',
        '$l.Text="PIN за смарт картата:";$l.AutoSize=$true;$l.Location=[Drawing.Point]::new(12,14);',
        '$t=New-Object Windows.Forms.TextBox;',
        '$t.PasswordChar=[char]0x2022;$t.Width=256;$t.Location=[Drawing.Point]::new(12,38);',
        '$ok=New-Object Windows.Forms.Button;',
        '$ok.Text="OK";$ok.DialogResult="OK";$ok.Location=[Drawing.Point]::new(88,70);',
        '$f.Controls.AddRange(@($l,$t,$ok));$f.AcceptButton=$ok;',
        'if($f.ShowDialog()-eq"OK"){$t.Text}',
      ].join('');
      return promptViaExec('powershell', ['-NoProfile', '-Command', ps]);
    } catch { /* not available */ }
  }

  // 6. Terminal fallback — always works when agent is started in a terminal
  return promptViaTerminal();
}

/** Calls pinentry via the Assuan protocol and returns the entered PIN. */
function promptViaPinentry(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('pinentry', [], { stdio: ['pipe', 'pipe', 'ignore'] });
    let state: 'init' | 'desc' | 'prompt' | 'getpin' | 'done' = 'init';
    let pin = '';

    const send = (cmd: string) => proc.stdin!.write(cmd + '\n');

    const rl = createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      if (line.startsWith('ERR')) {
        reject(new Error(`pinentry: ${line}`));
        proc.kill();
        return;
      }
      if (line.startsWith('D ')) { pin = line.slice(2); return; }
      if (!line.startsWith('OK')) return;

      switch (state) {
        case 'init':   state = 'desc';   send('SETDESC Въведете PIN за вашата смарт карта (Easy PDF Sign)'); break;
        case 'desc':   state = 'prompt'; send('SETPROMPT PIN:'); break;
        case 'prompt': state = 'getpin'; send('GETPIN'); break;
        case 'getpin': state = 'done';   resolve(pin); send('BYE'); break;
      }
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (state !== 'done') reject(new Error(`pinentry exited with code ${code} before PIN was entered`));
    });
  });
}

/** Runs a command (zenity / kdialog / powershell) and returns its stdout trimmed. */
function promptViaExec(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { stdio: ['inherit', 'pipe', 'ignore'] }).toString().trim();
}

/** Reads PIN from the terminal where the helper agent is running. */
function promptViaTerminal(): Promise<string> {
  return new Promise((resolve) => {
    // Disable echo if possible so the PIN is not shown
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write('\nEasy PDF Sign — Въведете PIN за смарт картата: ');
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// ─── SignedAttributes DER (SET, tag 0x31) ─────────────────────────────────────

function buildSignedAttrsDer(pdfHash: Buffer, certDer: Buffer, signingTime: Date): Buffer {
  const OID_CONTENT_TYPE    = '1.2.840.113549.1.9.3';
  const OID_SIGNING_TIME    = '1.2.840.113549.1.9.5';
  const OID_MESSAGE_DIGEST  = '1.2.840.113549.1.9.4';
  const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47'; // id-aa-signingCertificateV2 (RFC 5035)
  const OID_SHA256          = '2.16.840.1.101.3.4.2.1';
  const OID_DATA            = '1.2.840.113549.1.7.1';

  const certHash = createHash('sha256').update(certDer).digest();

  const ctAttr = derSeq([derOid(OID_CONTENT_TYPE), derSet([derOid(OID_DATA)])]);

  const stAttr = derSeq([
    derOid(OID_SIGNING_TIME),
    derSet([derUtcTime(formatUtcTime(signingTime))]),
  ]);

  const mdAttr = derSeq([
    derOid(OID_MESSAGE_DIGEST),
    derSet([derOctetStr(pdfHash)]),
  ]);

  // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm AlgorithmIdentifier, certHash OCTET STRING }
  const essCertIdV2 = derSeq([derSeq([derOid(OID_SHA256)]), derOctetStr(certHash)]);
  // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
  const sigCertV2Attr = derSeq([
    derOid(OID_SIGNING_CERT_V2),
    derSet([derSeq([derSeq([essCertIdV2])])]),
  ]);

  return derSet([ctAttr, stAttr, mdAttr, sigCertV2Attr]);
}

// ─── CMS ContentInfo / SignedData builder ─────────────────────────────────────

function buildCms(certDer: Buffer, signedAttrsDer: Buffer, signatureBytes: Buffer): Buffer {
  const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
  const OID_SHA256      = '2.16.840.1.101.3.4.2.1';
  const OID_SHA256_RSA  = '1.2.840.113549.1.1.11';
  const OID_DATA        = '1.2.840.113549.1.7.1';

  // Change SET tag 0x31 → IMPLICIT [0] 0xA0 for the CMS embedding (RFC 5652 §5.4)
  const signedAttrsTagged = Buffer.concat([Buffer.from([0xa0]), signedAttrsDer.slice(1)]);

  const sha256Alg    = derSeq([derOid(OID_SHA256), NULL]);
  const sha256RsaAlg = derSeq([derOid(OID_SHA256_RSA), NULL]);

  const issuerDer = getIssuerDer(certDer);
  const serialDer = getSerialDer(certDer);

  const signerInfoDer = derSeq([
    derIntByte(1),
    derSeq([issuerDer, serialDer]),  // IssuerAndSerialNumber
    sha256Alg,
    signedAttrsTagged,
    sha256RsaAlg,
    derOctetStr(signatureBytes),
  ]);

  const signedDataDer = derSeq([
    derIntByte(1),
    derSet([sha256Alg]),
    derSeq([derOid(OID_DATA)]),       // encapContentInfo (detached)
    derCtx0(certDer),                 // certificates [0] IMPLICIT
    derSet([signerInfoDer]),
  ]);

  return derSeq([derOid(OID_SIGNED_DATA), derCtx0(signedDataDer)]);
}

// ─── Low-level DER primitives ─────────────────────────────────────────────────

const NULL = Buffer.from([0x05, 0x00]);

function derTlv(tag: number, content: Buffer): Buffer {
  const len = content.length;
  let lenBuf: Buffer;
  if (len < 0x80)       lenBuf = Buffer.from([len]);
  else if (len < 0x100) lenBuf = Buffer.from([0x81, len]);
  else if (len < 0x10000) lenBuf = Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  else lenBuf = Buffer.from([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.concat([Buffer.from([tag]), lenBuf, content]);
}

const derSeq     = (c: Buffer[]) => derTlv(0x30, Buffer.concat(c));
const derSet     = (c: Buffer[]) => derTlv(0x31, Buffer.concat(c));
const derCtx0    = (c: Buffer)   => derTlv(0xa0, c);
const derIntByte = (v: number)   => derTlv(0x02, Buffer.from([v & 0xff]));
const derOctetStr = (b: Buffer)  => derTlv(0x04, b);
const derUtcTime  = (s: string)  => derTlv(0x17, Buffer.from(s, 'ascii'));

function derOid(oid: string): Buffer {
  return Buffer.from(
    forge.asn1.toDer(
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
        forge.asn1.oidToDer(oid).getBytes()),
    ).getBytes(),
    'binary',
  );
}

// ─── Certificate field extraction ────────────────────────────────────────────

function parseCertDer(der: Buffer): forge.pki.Certificate {
  return forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))),
  );
}

function dnToString(dn: forge.pki.Certificate['subject']): string {
  const cn = dn.getField('CN');
  if (cn) return cn.value as string;
  return dn.attributes.map((a: forge.pki.CertificateField) => `${a.shortName}=${a.value}`).join(', ');
}

function extractKeyUsage(cert: forge.pki.Certificate): string[] {
  const ext = cert.getExtension('keyUsage') as Record<string, boolean> | null;
  if (!ext) return [];
  return (['digitalSignature', 'nonRepudiation', 'keyEncipherment'] as const).filter(k => ext[k]);
}

function getIssuerDer(certDer: Buffer): Buffer {
  const certAsn1 = forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')));
  const tbs = (certAsn1 as { value: forge.asn1.Asn1[] }).value[0] as { value: forge.asn1.Asn1[] };
  const firstChild = tbs.value[0] as { tagClass: number; type: number };
  const hasVersion = firstChild.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && firstChild.type === 0;
  return Buffer.from(forge.asn1.toDer(tbs.value[hasVersion ? 3 : 2]).getBytes(), 'binary');
}

function getSerialDer(certDer: Buffer): Buffer {
  const bytes = Buffer.from(parseCertDer(certDer).serialNumber, 'hex');
  const normalized = (bytes[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), bytes]) : bytes;
  return derTlv(0x02, normalized);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatUtcTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return String(d.getUTCFullYear()).slice(-2) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}
