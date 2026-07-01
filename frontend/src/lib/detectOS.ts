export type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * Best-effort client OS detection used to pick the right helper-agent
 * installer. navigator.userAgentData is preferred (Chromium); falls back
 * to userAgent string parsing for Firefox/Safari.
 */
export function detectOS(): DetectedOS {
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? navigator.userAgent;

  if (/win/i.test(platform)) return 'windows';
  if (/mac/i.test(platform)) return 'macos';
  if (/linux/i.test(platform)) return 'linux';
  return 'unknown';
}

export interface HelperDownload {
  label: string;
  url: string;
}

const RELEASES_BASE = 'https://github.com/eomayski/Easy-PDF-Sign/releases/latest/download';

export function getHelperDownload(os: DetectedOS): HelperDownload {
  switch (os) {
    case 'windows':
      return { label: 'Изтегли за Windows (.exe)', url: `${RELEASES_BASE}/easy-pdf-sign-helper-setup.exe` };
    case 'macos':
      return { label: 'Изтегли за macOS', url: `${RELEASES_BASE}/easy-pdf-sign-helper-macos` };
    case 'linux':
      return { label: 'Изтегли за Linux (.deb)', url: `${RELEASES_BASE}/easy-pdf-sign-helper.deb` };
    default:
      return { label: 'Изтегли Easy PDF Sign Helper', url: 'https://github.com/eomayski/Easy-PDF-Sign/releases/latest' };
  }
}

/** Returns all installer links for the given OS. Linux gets both .rpm and .deb. */
export function getHelperDownloads(os: DetectedOS): HelperDownload[] {
  if (os === 'linux') {
    return [
      { label: 'Изтегли за Fedora/RHEL (.rpm)', url: `${RELEASES_BASE}/easy-pdf-sign-helper.rpm` },
      { label: 'Изтегли за Debian/Ubuntu (.deb)', url: `${RELEASES_BASE}/easy-pdf-sign-helper.deb` },
    ];
  }
  return [getHelperDownload(os)];
}
