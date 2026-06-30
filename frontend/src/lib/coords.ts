import type { ViewportRect, PdfRect } from '../types';

/**
 * Converts a rectangle drawn on the pdf.js canvas (viewport space) to
 * PDF user-space coordinates consumed by pdf-lib on the backend.
 *
 * pdf.js renders at `scale` × 72dpi, origin top-left.
 * pdf-lib uses PDF user-space: origin bottom-left, units = points (1/72 inch).
 *
 * @param viewportRect  Rectangle in viewport pixels (top-left origin)
 * @param scale         The scale factor used to render the PDF page
 * @param pageHeightPt  Height of the PDF page in points (from pdf.js page.view[3])
 */
export function viewportToPdfRect(
  viewportRect: ViewportRect,
  scale: number,
  pageHeightPt: number,
): PdfRect {
  const x = viewportRect.x / scale;
  const y = viewportRect.y / scale;
  const width = viewportRect.width / scale;
  const height = viewportRect.height / scale;

  // Flip Y: PDF origin is bottom-left, browser is top-left
  const pdfY = pageHeightPt - y - height;

  return { x, y: pdfY, width, height };
}

/**
 * Converts a PDF user-space rect back to viewport pixels.
 * Inverse of viewportToPdfRect — useful for rendering a saved rect on the canvas.
 */
export function pdfRectToViewport(
  pdfRect: PdfRect,
  scale: number,
  pageHeightPt: number,
): ViewportRect {
  const viewX = pdfRect.x * scale;
  const viewHeight = pdfRect.height * scale;
  const viewWidth = pdfRect.width * scale;
  const viewY = (pageHeightPt - pdfRect.y - pdfRect.height) * scale;

  return { x: viewX, y: viewY, width: viewWidth, height: viewHeight };
}
