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

export function getHelperDownload(os: DetectedOS): HelperDownload {
  switch (os) {
    case 'windows':
      return { label: 'Изтегли за Windows (.exe)', url: '/downloads/easy-pdf-sign-helper-setup.exe' };
    case 'macos':
      return { label: 'Изтегли за macOS (.pkg)', url: '/downloads/easy-pdf-sign-helper.pkg' };
    case 'linux':
      return { label: 'Изтегли за Linux (.deb)', url: '/downloads/easy-pdf-sign-helper.deb' };
    default:
      return { label: 'Изтегли Easy PDF Sign Helper', url: '/downloads/' };
  }
}
