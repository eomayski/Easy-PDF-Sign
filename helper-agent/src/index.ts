/**
 * Easy PDF Sign — Local PKCS#11 Helper Agent (Phase 1 stub)
 *
 * Listens on https://127.0.0.1:PORT and exposes:
 *   GET  /health            → { ok: true }
 *   GET  /certificates      → CertInfo[]
 *   POST /sign              → body: { hash: string (hex), certId: string }
 *                          ← { cms: string (hex) }
 *
 * Security:
 *  - CORS restricted to the app origin only
 *  - Listens on loopback only (127.0.0.1)
 *  - TLS via self-signed cert (for production: use mkcert or OS-trusted cert)
 *
 * TODO Phase 1:
 *  - Replace stub responses with real graphene-pkcs11 / node-pkcs11 calls
 *  - Add PIN prompt via OS dialog (node-credential-provider)
 *  - Package with `pkg` for distribution as a standalone installer
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const PORT = parseInt(process.env.AGENT_PORT ?? '17357', 10);
const ALLOWED_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0', pkcs11: 'stub' });
});

// TODO Phase 1: list real certificates from inserted smart card via PKCS#11
app.get('/certificates', (_req, res) => {
  res.json([
    {
      id: 'stub-cert-1',
      subject: 'CN=Demo User, O=Test Org, C=BG',
      issuer: 'CN=Demo CA',
      validFrom: '2024-01-01T00:00:00Z',
      validTo: '2027-01-01T00:00:00Z',
      keyUsage: ['digitalSignature', 'nonRepudiation'],
    },
  ]);
});

// TODO Phase 1: sign hash using PKCS#11 private key (key never leaves the card)
app.post('/sign', (req, res) => {
  const { hash, certId } = req.body as { hash: string; certId: string };

  if (!hash || !certId) {
    res.status(400).json({ error: 'hash and certId are required' });
    return;
  }

  // Stub: return empty CMS — real impl will call PKCS#11 sign
  res.status(501).json({
    error: 'PKCS#11 signing not yet implemented. This is the Phase 1 stub.',
    hint: 'Install the full helper agent and make sure your smart card is inserted.',
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Helper agent listening on http://127.0.0.1:${PORT}`);
  console.log('PKCS#11 support: STUB (Phase 1 not yet implemented)');
});
