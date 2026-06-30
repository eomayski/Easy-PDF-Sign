export type SigningMethod = 'physical' | 'cloud' | 'mock';
export type JobStatus = 'uploaded' | 'prepared' | 'signed' | 'downloaded';
export type SignatureLayout =
  | 'text-left-image-right'
  | 'text-only'
  | 'image-only'
  | 'text-above-image';

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualSignatureConfig {
  showName: boolean;
  showDate: boolean;
  freeText: string;
  imageDataUrl: string | null;
  handwrittenDataUrl: string | null;
  layout: SignatureLayout;
}

export interface SignJob {
  id: string;
  status: JobStatus;
  originalPath: string;
  signedPath: string | null;
  preparedPath: string | null;
  preparedByteRange: number[] | null;
  fileName: string;
  method: SigningMethod | null;
  byteRangeHash: string | null;
  adViewed: boolean;
  downloadToken: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface AdReward {
  provider: string;
  adSessionId: string;
  signalToken?: string;
}
