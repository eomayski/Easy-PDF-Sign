import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Spinner } from '../../components/ui/Spinner';

// Use URL resolution so Vite bundles the worker correctly
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export interface PageDimensions {
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  scale: number;
}

interface Props {
  jobId: string;
  currentPage: number;
  onPageCount: (n: number) => void;
  onPageDimensions: (dims: PageDimensions) => void;
  /** Overlay rendered on top of the PDF canvas (for the signature box) */
  overlay?: React.ReactNode;
}

const RENDER_SCALE = 1.5;

export function PdfViewer({ jobId, currentPage, onPageCount, onPageDimensions, overlay }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderPage = useCallback(async (pdf: PDFDocumentProxy, pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderTask = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
      onPageDimensions({
        widthPx: viewport.width,
        heightPx: viewport.height,
        widthPt: page.view[2],
        heightPt: page.view[3],
        scale: RENDER_SCALE,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'RenderingCancelledException') return;
      throw e;
    }
  }, [onPageDimensions]);

  // Load PDF document once
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(`/api/files/${jobId}`).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        onPageCount(pdf.numPages);
        await renderPage(pdf, currentPage);
        setLoading(false);
      } catch {
        if (!cancelled) setError('viewer.loadError');
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Re-render when page changes
  useEffect(() => {
    if (!pdfRef.current) return;
    renderPage(pdfRef.current, currentPage);
  }, [currentPage, renderPage]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {loading && (
        <div className="flex h-64 w-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{t(error)}</div>
      )}
      <canvas
        ref={canvasRef}
        className={loading ? 'hidden' : 'block shadow-card-md'}
      />
      {/* Konva overlay sits exactly on top of the canvas */}
      {!loading && overlay && (
        <div className="pointer-events-auto absolute inset-0">{overlay}</div>
      )}
    </div>
  );
}
