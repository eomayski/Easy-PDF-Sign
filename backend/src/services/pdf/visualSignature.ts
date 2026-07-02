import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getCyrillicFont } from './fonts';
import type { PdfRect, VisualSignatureConfig, SignatureLayout } from '../../types';

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
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

async function embedBase64Image(
  pdfDoc: PDFDocument,
  dataUrl: string,
): Promise<Awaited<ReturnType<PDFDocument['embedPng']>>> {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const bytes = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  return header.includes('png') ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
}

/**
 * Draws the visible signature appearance on the specified page.
 * Embeds a system font with Cyrillic support so Bulgarian text renders correctly.
 */
export async function applyVisualSignature(
  pdfBytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
  config: VisualSignatureConfig,
  signerName?: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = getCyrillicFont();
  const font = await pdfDoc.embedFont(fontBytes);
  const boldFont = font; // same font; a bold variant would need a separate TTF

  const page = pdfDoc.getPages()[pageIndex];
  const { x, y, width, height } = rect;

  // Background + border
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.97, 0.97, 1),
    borderColor: rgb(0.388, 0.4, 0.945), // brand-500 ≈ #6366f1
    borderWidth: 1,
  });

  const pad = 4;
  const innerX = x + pad;
  const innerW = width - pad * 2;

  const layout: SignatureLayout = config.layout;

  // Embed image if needed
  let embeddedImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  const activeImageUrl = config.handwrittenDataUrl ?? config.imageDataUrl;
  const wantsImage =
    activeImageUrl &&
    (layout === 'text-left-image-right' || layout === 'image-only' || layout === 'text-above-image');

  if (wantsImage && activeImageUrl) {
    try {
      embeddedImage = await embedBase64Image(pdfDoc, activeImageUrl);
    } catch {
      // ignore
    }
  }

  const textColumnW =
    layout === 'text-left-image-right' && embeddedImage ? innerW * 0.55 : innerW;

  // Draw text
  if (layout !== 'image-only') {
    const nameSize = Math.max(6, Math.min(9, height / 5));
    const labelSize = Math.max(5, Math.min(7, height / 6));
    let curY = y + height - pad - nameSize;

    if (config.showName) {
      const displayName = signerName ?? 'Подписан от сертификат';
      drawWrappedText(page, displayName, innerX, curY, boldFont, nameSize, textColumnW);
      curY -= nameSize + 4;
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
        y: curY,
        size: labelSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      curY -= labelSize + 4;
    }

    if (config.freeText) {
      drawWrappedText(page, config.freeText, innerX, curY, font, nameSize, textColumnW);
    }
  }

  // Draw image
  if (embeddedImage) {
    const imgPad = pad * 2;
    const imgX =
      layout === 'text-left-image-right' ? x + textColumnW + imgPad : innerX;
    const imgY = y + pad;
    const imgH =
      layout === 'text-above-image' ? height * 0.45 : height - pad * 2;
    const imgW =
      layout === 'text-left-image-right' ? innerW - textColumnW - imgPad : innerW;

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
