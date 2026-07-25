import { supabase } from './supabase';

export interface UploadResponse {
  jobId: string;
  numPages: number;
  /** Size-fee credits actually debited (0 for free-tier files and business accounts) */
  creditsCharged: number;
  /** Balance after the debit; null when nothing was charged */
  creditsRemaining: number | null;
}

export interface UploadProgress {
  /** 'uploading' докато текат байтовете; 'processing' след като са изпратени и чакаме сървъра */
  phase: 'uploading' | 'processing';
  /** 0..1 — дял качени байтове (в 'processing' винаги 1) */
  progress: number;
}

/** Structured codes from POST /api/upload — see docs/API.md. */
export type UploadErrorCode =
  | 'FILE_TOO_LARGE_LOGIN_REQUIRED'
  | 'INSUFFICIENT_CREDITS'
  | 'FILE_EXCEEDS_HARD_CAP';

export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: UploadErrorCode | undefined,
    /** Credits needed for this file (INSUFFICIENT_CREDITS only) */
    readonly required?: number,
    /** Credits the account holds (INSUFFICIENT_CREDITS only) */
    readonly available?: number,
  ) {
    super(`Upload failed (${status}${code ? ` ${code}` : ''})`);
    this.name = 'UploadError';
  }
}

/**
 * Качва PDF към /api/upload през XHR, за да докладва реален прогрес на
 * качването — нещо, което RTK Query (fetch) не може. Малките файлове минават
 * и без акаунт; токенът се прикача, когато има сесия, защото файловете над
 * безплатния лимит се таксуват при качване (виж lib/uploadPolicy.ts).
 */
export async function uploadPdfWithProgress(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadResponse> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress({ phase: 'uploading', progress: e.loaded / e.total });
      }
    };
    // Байтовете са изпратени — оттук нататък сървърът обработва (брои страници и т.н.).
    xhr.upload.onload = () => onProgress({ phase: 'processing', progress: 1 });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as UploadResponse);
        return;
      }
      const body = (xhr.response ?? {}) as {
        code?: UploadErrorCode;
        required?: number;
        available?: number;
      };
      reject(new UploadError(xhr.status, body.code, body.required, body.available));
    };
    xhr.onerror = () => reject(new UploadError(0, undefined));
    xhr.ontimeout = () => reject(new UploadError(0, undefined));

    xhr.send(formData);
  });
}
