import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PdfRect, VisualSignatureConfig, SignatureLayout } from '../../types';

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x,
      y: y - i * (size + 2),
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
}

function embedBase64Image(pdfDoc: PDFDocument, dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const bytes = Buffer.from(base64, 'base64');

  if (header.includes('png')) {
    return pdfDoc.embedPng(bytes);
  }
  return pdfDoc.embedJpg(bytes);
}

/**
 * Draws the visible signature rectangle (appearance) on the given page.
 * Returns the modified PDF bytes.
 */
export async function applyVisualSignature(
  pdfBytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
  config: VisualSignatureConfig,
  signerName?: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[pageIndex];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { x, y, width, height } = rect;

  // Background
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.97, 0.97, 1),
    borderColor: hexToRgb('#6366f1'),
    borderWidth: 1,
  });

  const pad = 4;
  const innerX = x + pad;
  const innerY = y + height - pad;
  const innerW = width - pad * 2;

  const layout: SignatureLayout = config.layout;
  const hasImage =
    (config.imageDataUrl || config.handwrittenDataUrl) &&
    (layout === 'text-left-image-right' || layout === 'image-only' || layout === 'text-above-image');

  // Embed image if present
  let embeddedImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  const activeImageUrl = config.handwrittenDataUrl ?? config.imageDataUrl;
  if (activeImageUrl && hasImage) {
    try {
      embeddedImage = await embedBase64Image(pdfDoc, activeImageUrl);
    } catch {
      // ignore image embed errors
    }
  }

  const textColumnW =
    layout === 'text-left-image-right' && embeddedImage ? innerW * 0.55 : innerW;
  const imgColumnW = innerW - textColumnW - pad;

  // Draw text content
  if (layout !== 'image-only') {
    let curY = innerY;
    const nameSize = Math.max(6, Math.min(9, height / 5));
    const labelSize = Math.max(5, Math.min(7, height / 6));

    if (config.showName) {
      const displayName = signerName ?? 'Подписан от сертификат';
      drawText(page, displayName, innerX, curY - nameSize, boldFont, nameSize, textColumnW);
      curY -= nameSize + 3;
    }

    if (config.showDate) {
      const dateStr = new Date().toLocaleDateString('bg-BG', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      page.drawText(`Дата: ${dateStr}`, {
        x: innerX,
        y: curY - labelSize,
        size: labelSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      curY -= labelSize + 3;
    }

    if (config.freeText) {
      drawText(page, config.freeText, innerX, curY - labelSize, font, labelSize, textColumnW);
    }
  }

  // Draw image
  if (embeddedImage) {
    const imgX =
      layout === 'text-left-image-right'
        ? x + textColumnW + pad * 2
        : innerX;
    const imgY = y + pad;
    const imgH =
      layout === 'text-above-image' ? height * 0.5 : height - pad * 2;
    const imgW =
      layout === 'text-left-image-right'
        ? imgColumnW
        : layout === 'text-above-image'
          ? innerW
          : innerW;

    const dims = embeddedImage.scale(1);
    const scale = Math.min(imgW / dims.width, imgH / dims.height);

    page.drawImage(embeddedImage, {
      x: imgX,
      y: imgY,
      width: dims.width * scale,
      height: dims.height * scale,
    });
  }

  return pdfDoc.save();
}
