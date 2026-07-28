/**
 * Easy PDF Sign — Local PKCS#11 Helper Agent (Phase 1)
 *
 * Listens on http://127.0.0.1:PORT and exposes:
 *   GET  /health         → { ok, version, pkcs11 }
 *   GET  /certificates   → CertInfo[]
 *   POST /sign           → body: { hash: string (hex), certId: string }
 *                       ← { cms: string (hex DER) }
 *
 * Security:
 *  - CORS restricted to an explicit origin allowlist (APP_ORIGIN env var,
 *    comma-separated, overrides the built-in defaults). Keep this strict:
 *    the origin check is what stops arbitrary websites from asking the
 *    local agent to sign hashes.
 *  - Listens on loopback 127.0.0.1
 *  - PIN is read from PKCS11_PIN env var — never travels over HTTP
 *
 * PKCS#11 library selection (PKCS11_LIB env var):
 *  Linux SoftHSM2:  /usr/lib64/softhsm/libsofthsm2.so
 *  Linux OpenSC:    /usr/lib64/opensc-pkcs11.so
 *  Windows OpenSC:  C:\Windows\System32\opensc-pkcs11.dll
 */
import 'dotenv/config';
import https from 'node:https';
import express from 'express';
import cors from 'cors';
import { isPkcs11Available, listCertificates, signHash } from './pkcs11Signer';
import { ensureTlsMaterial, readTlsPair, type TlsMaterial } from './tls';

const PORT = parseInt(process.env.AGENT_PORT ?? '17357', 10);
const TLS_PORT = parseInt(process.env.AGENT_TLS_PORT ?? '17358', 10);

/**
 * HTTPS on loopback exists for Safari only — it is the one browser that blocks
 * http://127.0.0.1 from an HTTPS page. Elsewhere plain HTTP is reached without
 * a locally trusted certificate, so we do not touch the user's trust store.
 * AGENT_TLS=1 forces it on for testing on other platforms.
 */
const TLS_ENABLED = process.env.AGENT_TLS === '1' || process.platform === 'darwin';

let tlsMaterial: TlsMaterial | null = null;

// Single source of truth for the version: package.json. Works in dev (src/),
// after tsc (dist/) and inside the pkg snapshot alike — the file sits one level
// above the entry point in all three, and pkg.config.json ships it as an asset.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: AGENT_VERSION } = require('../package.json') as { version: string };

// Production site + local dev. APP_ORIGIN (comma-separated) overrides.
const DEFAULT_ORIGINS = [
  'https://pdf-easy.online',
  'https://easy-pdf-sign-nine.vercel.app',
  'http://localhost:5173',
];
const ALLOWED_ORIGINS = process.env.APP_ORIGIN
  ? process.env.APP_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const pkcs11 = isPkcs11Available();
  res.json({
    ok: true,
    version: AGENT_VERSION,
    pkcs11: pkcs11 ? 'available' : 'unavailable',
    tls: { enabled: tlsMaterial !== null, expires: tlsMaterial?.notAfter.toISOString() ?? null },
  });
});

// ─── Certificates ────────────────────────────────────────────────────────────

app.get('/certificates', (_req, res) => {
  try {
    const certs = listCertificates();
    res.json(certs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `PKCS#11 error: ${message}` });
  }
});

// ─── Sign ────────────────────────────────────────────────────────────────────

app.post('/sign', (req, res) => {
  const { hash, certId } = req.body as { hash?: string; certId?: string };

  if (!hash || !certId) {
    res.status(400).json({ error: 'hash and certId are required' });
    return;
  }
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    res.status(400).json({ error: 'hash must be a 64-char hex-encoded SHA-256 digest' });
    return;
  }

  signHash(hash, certId)
    .then((cms) => res.json({ cms }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: `Signing failed: ${message}` });
    });
});

// ─── TLS (loopback HTTPS, for Safari) ────────────────────────────────────────

/**
 * `--init-tls` is called by the macOS installer as the console user: it creates
 * the material and prints the CA path, which postinstall then feeds to
 * `security add-trusted-cert`. Kept in-process so there is exactly one
 * implementation of "where the certificates live".
 */
if (process.argv.includes('--init-tls')) {
  try {
    const material = ensureTlsMaterial();
    console.log(material.caPath);
    process.exit(0);
  } catch (err: unknown) {
    console.error(`TLS setup failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function startTls(): void {
  if (!TLS_ENABLED) return;
  try {
    tlsMaterial = ensureTlsMaterial();
  } catch (err: unknown) {
    // Not fatal: HTTP still serves every browser but Safari.
    console.warn(`TLS disabled — ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const tlsServer = https.createServer(readTlsPair(tlsMaterial), app);
  tlsServer.on('error', (err: NodeJS.ErrnoException) => {
    console.warn(`HTTPS listener failed on 127.0.0.1:${TLS_PORT}: ${err.message}`);
    tlsMaterial = null;
  });
  tlsServer.listen(TLS_PORT, '127.0.0.1', () => {
    console.log(
      `HTTPS on https://127.0.0.1:${TLS_PORT} (certificate valid until ` +
      `${tlsMaterial?.notAfter.toISOString().slice(0, 10)})`,
    );
  });

  // The leaf outlives any single session, but the agent may run for months at a
  // time — re-check daily and swap the context in place rather than making the
  // user reinstall once it expires. unref() so this timer never holds the
  // process open by itself.
  setInterval(() => {
    try {
      const renewed = ensureTlsMaterial();
      if (renewed.notAfter.getTime() !== tlsMaterial?.notAfter.getTime()) {
        tlsServer.setSecureContext(readTlsPair(renewed));
        console.log(`Certificate renewed, valid until ${renewed.notAfter.toISOString().slice(0, 10)}`);
      }
      tlsMaterial = renewed;
    } catch (err: unknown) {
      console.warn(`Certificate renewal failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 24 * 60 * 60 * 1000).unref();
}

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper agent v${AGENT_VERSION} listening on http://127.0.0.1:${PORT}`);
  console.log(`Runtime: ${process.platform}/${process.arch} (node ${process.version})`);
  // The usual cause of "the browser cannot see the agent" is an origin that is
  // not on this list — log it so it can be compared with the address bar.
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  const lib = process.env.PKCS11_LIB ?? '(not set — set PKCS11_LIB env var)';
  console.log(`PKCS11_LIB: ${lib}`);
  console.log(`PKCS11_SLOT: ${process.env.PKCS11_SLOT ?? '0'}`);
  console.log(`PKCS11_PIN: ${process.env.PKCS11_PIN ? '****' : '(not set)'}`);
  startTls();
});

// Without this the process dies with an unhandled 'error' event and an
// unreadable stack — most often because an older copy is still on the port.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use — another Easy PDF Sign Helper is running. ` +
      'Stop it (or log out and back in) and start this one again.',
    );
  } else {
    console.error(`Failed to listen on 127.0.0.1:${PORT}: ${err.message}`);
  }
  process.exit(1);
});
