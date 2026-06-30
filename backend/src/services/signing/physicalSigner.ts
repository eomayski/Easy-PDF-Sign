import { createHash } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { findByteRange, SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { applyVisualSignature } from '../pdf/visualSignature';
import type { PdfRect, VisualSignatureConfig } from '../../types';

// 8 KB gives ~16 384 hex chars of placeholder — enough for a single-cert RSA-2048 CMS.
const SIGNATURE_LENGTH = 8192;

export interface PrepareResult {
  pdfWithPlaceholder: Buffer;
  byteRangeHash: string;
  byteRange: number[];
}

/**
 * Phase 1 "prepare" step:
 *  1. Apply visual signature appearance with pdf-lib.
 *  2. Add PAdES placeholder using @signpdf/placeholder-pdf-lib.
 *  3. Replace the /ByteRange placeholder with actual byte offsets.
 *  4. Return SHA-256 of the byte range (everything except the signature slot).
 *
 * The returned pdfWithPlaceholder has the final ByteRange values but the
 * signature slot still contains zero bytes — ready for CMS injection.
 */
export async function preparePAdES(
  pdfBytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
  config: VisualSignatureConfig,
  signerName?: string,
): Promise<PrepareResult> {
  // 1. Draw visual layer
  const pdfWithVisual = await applyVisualSignature(pdfBytes, pageIndex, rect, config, signerName);

  // 2. Add placeholder
  const pdfDoc = await PDFDocument.load(pdfWithVisual);
  pdfDoc.registerFontkit(fontkit);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: 'Квалифициран електронен подпис',
    contactInfo: '',
    name: 'Easy PDF Sign',
    location: 'България',
    signatureLength: SIGNATURE_LENGTH,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });

  // useObjectStreams: false is required — @signpdf expects a cross-reference table, not a stream
  let pdf = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

  // 3. Locate ByteRange placeholder and compute actual byte offsets
  //    (replicates the first half of SignPdf.sign() from @signpdf/signpdf)
  const { byteRangePlaceholder, byteRangePlaceholderPosition } = findByteRange(pdf);
  if (!byteRangePlaceholder || byteRangePlaceholderPosition === undefined) {
    throw new Error('PAdES prepare: ByteRange placeholder not found in PDF');
  }

  const byteRangeEnd = byteRangePlaceholderPosition + byteRangePlaceholder.length;
  const contentsTagPos = pdf.indexOf('/Contents ', byteRangeEnd);
  const placeholderPos = pdf.indexOf('<', contentsTagPos);
  const placeholderEnd = pdf.indexOf('>', placeholderPos);
  const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;

  const byteRange: number[] = [0, 0, 0, 0];
  byteRange[1] = placeholderPos;
  byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
  byteRange[3] = pdf.length - byteRange[2];

  // 4. Write actual ByteRange into the PDF (padded to same length so offsets don't shift)
  let actualByteRange = `/ByteRange [${byteRange.join(' ')}]`;
  actualByteRange += ' '.repeat(byteRangePlaceholder.length - actualByteRange.length);
  pdf = Buffer.concat([
    pdf.slice(0, byteRangePlaceholderPosition),
    Buffer.from(actualByteRange),
    pdf.slice(byteRangeEnd),
  ]);

  // 5. Hash the byte range content (everything EXCEPT the <hex-signature> slot)
  const hash = createHash('sha256');
  hash.update(pdf.slice(byteRange[0], byteRange[1]));              // before '<'
  hash.update(pdf.slice(byteRange[2], byteRange[2] + byteRange[3])); // after '>'
  const byteRangeHash = hash.digest('hex');

  return { pdfWithPlaceholder: pdf, byteRangeHash, byteRange };
}

/**
 * Phase 1 "complete" step:
 * Embeds the hex-encoded DER CMS returned by the helper agent into the
 * signature placeholder slot of the PDF prepared by preparePAdES().
 */
export function completePAdES(
  pdfWithPlaceholder: Buffer,
  byteRange: number[],
  cmsHex: string,
): Buffer {
  const placeholderLength = byteRange[2] - byteRange[1] - 2; // exclude '<' and '>'
  if (cmsHex.length > placeholderLength) {
    throw new Error(
      `CMS too large for placeholder: ${cmsHex.length} hex chars > ${placeholderLength} available`,
    );
  }
  const paddedHex = cmsHex.padEnd(placeholderLength, '0');

  return Buffer.concat([
    pdfWithPlaceholder.slice(0, byteRange[1] + 1),     // up to and including '<'
    Buffer.from(paddedHex, 'ascii'),
    pdfWithPlaceholder.slice(byteRange[2] - 1),         // from '>' onwards
  ]);
}
