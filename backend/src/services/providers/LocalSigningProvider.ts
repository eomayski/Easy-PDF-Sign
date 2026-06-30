/**
 * LocalSigningProvider — interface implemented by the helper-agent client.
 * The web backend never calls PKCS#11 directly; it delegates to the browser
 * which in turn calls the local helper agent on 127.0.0.1.
 *
 * This file exists for documentation/typing purposes.
 * The actual implementation lives in /helper-agent.
 */
export interface CertInfo {
  id: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  keyUsage: string[];
}

export interface LocalSigningProvider {
  isAvailable(): Promise<boolean>;
  listCertificates(): Promise<CertInfo[]>;
  signHash(hash: Uint8Array, certId: string): Promise<Uint8Array>;
}
