import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/ui/Spinner';

// Same worker setup as PdfViewer — assigning twice is harmless
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const RENDER_SCALE = 1.5;

interface Props {
  jobId: string;
}

/**
 * Canvas preview of the signed PDF (via pdf.js, like the main viewer) —
 * browser <object>/<embed> PDF plugins are unreliable, especially on Linux.
 */
export function SignedPdfPreview({ jobId }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(`/api/files/${jobId}/signed`).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('download.previewError');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfRef.current?.destroy().catch(() => {});
      pdfRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || loading) return;

    let cancelled = false;
    (async () => {
      const pdfPage = await pdf.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [page, loading]);

  if (error) {
    return (
      <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{t(error)}</div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 p-3">
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="max-h-[28rem] overflow-auto rounded-lg">
            <canvas ref={canvasRef} className="mx-auto block h-auto max-w-full shadow-card-md" />
          </div>
          {numPages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-3 text-sm text-slate-600">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-2 py-1 hover:bg-slate-200 disabled:opacity-40"
                aria-label={t('download.prevPage')}
              >
                ‹
              </button>
              <span>{t('download.pageShort', { current: page, total: numPages })}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(numPages, p + 1))}
                disabled={page >= numPages}
                className="rounded-lg px-2 py-1 hover:bg-slate-200 disabled:opacity-40"
                aria-label={t('download.nextPage')}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
