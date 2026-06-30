import { applyVisualSignature } from '../pdf/visualSignature';
import type { PdfRect, VisualSignatureConfig } from '../../types';

/**
 * Phase 0 mock signing: applies the visual layer only, no real crypto.
 * Returns the final PDF bytes.
 */
export async function mockSign(
  pdfBytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
  config: VisualSignatureConfig,
): Promise<Uint8Array> {
  return applyVisualSignature(pdfBytes, pageIndex, rect, config, 'Mock Signer (Demo)');
}
