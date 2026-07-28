/**
 * Разпознаване само на Safari — единственият случай, в който браузърът е
 * причината агентът да не се вижда (блокира `http://127.0.0.1` от HTTPS
 * страница). Без HTTPS от агента там няма как да се подпише, затова
 * съобщението трябва да е конкретно, а не общото „не е открит“.
 */
export function isSafari(): boolean {
  const ua = navigator.userAgent;
  // Chrome и Edge на macOS също съдържат "Safari" в UA — изключваме ги.
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
}
