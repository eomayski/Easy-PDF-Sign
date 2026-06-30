export interface CertInfo {
  id: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  keyUsage: string[];
}

/**
 * LocalSigningProvider — interface that the web app uses to talk to this agent.
 * Both the physical (PKCS#11) implementation and the MockLocalProvider implement it.
 */
export interface LocalSigningProvider {
  /** Returns true if the agent is reachable and a card is inserted. */
  isAvailable(): Promise<boolean>;
  /** Lists signing certificates available on the card. */
  listCertificates(): Promise<CertInfo[]>;
  /**
   * Signs the given hash with the private key for certId.
   * The private key NEVER leaves the card — only a detached CMS/PKCS#7 is returned.
   * @param hash    SHA-256 digest of the ByteRange (from the backend)
   * @param certId  Certificate identifier from listCertificates()
   * @returns       DER-encoded detached CMS signature (PKCS#7 ContentInfo)
   */
  signHash(hash: Uint8Array, certId: string): Promise<Uint8Array>;
}
