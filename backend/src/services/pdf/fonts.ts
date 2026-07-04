import fs from 'fs';
import os from 'os';
import path from 'path';

// Bundled with the repo (assets/fonts/, OFL/Apache-licensed) so the backend
// works on bare containers (Railway's Debian image ships no fonts at all).
// Resolves correctly from both src/ (ts-node-dev) and dist/ (production).
const BUNDLED_FONT = path.join(__dirname, '../../../assets/fonts/NotoSans-Regular.ttf');

/**
 * Returns the bytes of a Cyrillic-capable font: the bundled Noto Sans first,
 * then OS-specific system fallbacks.
 */
export function loadCyrillicFont(): Buffer {
  const platform = os.platform();

  const systemCandidates: string[] =
    platform === 'win32'
      ? [
          'C:\\Windows\\Fonts\\arial.ttf',
          'C:\\Windows\\Fonts\\tahoma.ttf',
          'C:\\Windows\\Fonts\\calibri.ttf',
          'C:\\Windows\\Fonts\\verdana.ttf',
        ]
      : platform === 'darwin'
        ? [
            '/Library/Fonts/Arial.ttf',
            '/System/Library/Fonts/Supplemental/Arial.ttf',
            '/Library/Fonts/Tahoma.ttf',
          ]
        : [
            // Fedora / RHEL / openSUSE paths
            '/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf',
            '/usr/share/fonts/open-sans/OpenSans-Regular.ttf',
            '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
            '/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf',
            // Debian / Ubuntu paths
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            // Arch Linux paths
            '/usr/share/fonts/TTF/DejaVuSans.ttf',
            '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
          ];

  const candidates = [BUNDLED_FONT, ...systemCandidates];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }

  throw new Error(
    `No Cyrillic-capable font found. Checked: ${candidates.join(', ')}. ` +
      'The bundled assets/fonts/NotoSans-Regular.ttf appears to be missing from the deployment.',
  );
}

let cachedFont: Buffer | null = null;

/** Loads the font once and caches it for the lifetime of the process. */
export function getCyrillicFont(): Buffer {
  if (!cachedFont) cachedFont = loadCyrillicFont();
  return cachedFont;
}
