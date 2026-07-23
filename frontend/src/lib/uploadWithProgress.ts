import type { UploadResponse } from '../store/api';

export interface UploadProgress {
  /** 'uploading' докато текат байтовете; 'processing' след като са изпратени и чакаме сървъра */
  phase: 'uploading' | 'processing';
  /** 0..1 — дял качени байтове (в 'processing' винаги 1) */
  progress: number;
}

/**
 * Качва PDF към /api/upload през XHR, за да докладва реален прогрес на
 * качването — нещо, което RTK Query (fetch) не може. Качването е отворено
 * (без акаунт), затова не прикачаме токен. Виж UploadStep за UI-а.
 */
export function uploadPdfWithProgress(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';

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
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.send(formData);
  });
}
