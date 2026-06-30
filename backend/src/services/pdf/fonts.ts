import fs from 'fs';
import os from 'os';

/**
 * Returns the bytes of a system font that supports Cyrillic characters.
 * Uses OS-specific paths — no downloading, no bundling required.
 *
 * Priority list per platform is ordered by availability likelihood.
 */
export function loadCyrillicFont(): Buffer {
  const platform = os.platform();

  const candidates: string[] =
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

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }

  throw new Error(
    `No Cyrillic-capable system font found. Checked: ${candidates.join(', ')}. ` +
      'Please install Arial or a similar Cyrillic font on this system.',
  );
}

let cachedFont: Buffer | null = null;

/** Loads the font once and caches it for the lifetime of the process. */
export function getCyrillicFont(): Buffer {
  if (!cachedFont) cachedFont = loadCyrillicFont();
  return cachedFont;
}
