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
 *  - CORS restricted to APP_ORIGIN only
 *  - Listens on loopback 127.0.0.1
 *  - PIN is read from PKCS11_PIN env var — never travels over HTTP
 *
 * PKCS#11 library selection (PKCS11_LIB env var):
 *  Linux SoftHSM2:  /usr/lib64/softhsm/libsofthsm2.so
 *  Linux OpenSC:    /usr/lib64/opensc-pkcs11.so
 *  Windows OpenSC:  C:\Windows\System32\opensc-pkcs11.dll
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { isPkcs11Available, listCertificates, signHash } from './pkcs11Signer';

const PORT = parseInt(process.env.AGENT_PORT ?? '17357', 10);
const ALLOWED_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const pkcs11 = isPkcs11Available();
  res.json({ ok: true, version: '1.0.0', pkcs11: pkcs11 ? 'available' : 'unavailable' });
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

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper agent listening on http://127.0.0.1:${PORT}`);
  const lib = process.env.PKCS11_LIB ?? '(not set — set PKCS11_LIB env var)';
  console.log(`PKCS11_LIB: ${lib}`);
  console.log(`PKCS11_SLOT: ${process.env.PKCS11_SLOT ?? '0'}`);
  console.log(`PKCS11_PIN: ${process.env.PKCS11_PIN ? '****' : '(not set)'}`);
});
