export interface CertInfo {
  id: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  keyUsage: string[];
}
