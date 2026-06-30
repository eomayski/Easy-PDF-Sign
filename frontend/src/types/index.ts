export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SignatureLayout = 'text-left-image-right' | 'text-only' | 'image-only' | 'text-above-image';

export interface VisualSignatureConfig {
  showName: boolean;
  showDate: boolean;
  freeText: string;
  imageDataUrl: string | null;
  handwrittenDataUrl: string | null;
  layout: SignatureLayout;
}

export interface SignaturePlacement {
  page: number;
  rect: ViewportRect;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export type SigningMethod = 'physical' | 'cloud' | 'mock';

export interface SignJob {
  jobId: string;
  numPages: number;
  status: 'uploaded' | 'prepared' | 'signed' | 'downloaded';
}

export interface CertInfo {
  id: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
}
