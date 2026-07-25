import { supabase } from './supabase';

/**
 * Google OAuth в отделен таб, вместо да презарежда текущата страница.
 *
 * Причината: consent екранът на Google отказва да се рендира в iframe, така че
 * вписването изисква top-level навигация. Ако тя стане в *този* таб, страницата
 * се разгражда и избраният `File` се губи (браузърът не позволява да се запази).
 * В отделен таб главната страница остава жива.
 *
 * Сесията се връща сама: supabase-js държи `BroadcastChannel`, кръстен на
 * storageKey-а, и препредава auth събитията към всички табове от същия origin,
 * така че `useSupabaseSession` в оригиналния таб получава SIGNED_IN без
 * допълнителна комуникация.
 */

const TAB_NAME = 'eps-oauth';
const TAB_MARKER = 'eps-oauth-tab';
const SESSION_TIMEOUT_MS = 120_000;

/**
 * Отваря празен таб СИНХРОННО — задължително преди каквото и да е `await`.
 * След await потребителският жест е изразходван и блокерът спира отварянето
 * (Safari е особено строг). Връща null, ако е блокиран или недостъпен.
 *
 * Без window features нарочно: така браузърът прави таб, а на мобилни устройства
 * попъп прозорци практически няма и features биха били безсмислени.
 */
export function openBlankAuthTab(): Window | null {
  try {
    const tab = window.open('', TAB_NAME);
    if (!tab) return null;
    try {
      // about:blank наследява нашия origin, затова sessionStorage на новия таб
      // е достъпен оттук. Маркерът е per-tab и надживява навигацията към Google
      // и обратно, докато `window.name` се изчиства при cross-origin навигация
      // (Chrome 88+ и аналогично в Firefox/Safari — мярка срещу проследяване).
      tab.sessionStorage?.setItem(TAB_MARKER, '1');
    } catch {
      // Остава резервната проверка по window.name.
    }
    return tab;
  } catch {
    return null;
  }
}

function hasOAuthParams(): boolean {
  const pattern = /[?&#](access_token|code|error|error_description)=/;
  return pattern.test(window.location.hash) || pattern.test(window.location.search);
}

/**
 * true, ако този документ е табът, който сами отворихме за вписването.
 *
 * Разчита само на признаци, които поставяме ние — `window.opener` нарочно НЕ се
 * проверява: ако потребителят е отворил сайта през `target="_blank"`, opener-ът
 * е ненулев и при резервния пълен redirect бихме затворили главния му таб.
 * Фалшивата отрицателна оценка е безобидна (табът просто показва приложението),
 * фалшивата положителна — не.
 */
export function isOAuthCallbackTab(): boolean {
  if (typeof window === 'undefined' || !hasOAuthParams()) return false;
  try {
    if (sessionStorage.getItem(TAB_MARKER) === '1') return true;
  } catch {
    // sessionStorage недостъпен — пробваме по име.
  }
  return window.name === TAB_NAME;
}

export function clearOAuthTabMarker(): void {
  try {
    sessionStorage.removeItem(TAB_MARKER);
  } catch {
    // ignore
  }
}

/**
 * Изчаква supabase-js да размени токена от URL-а за сесия (`detectSessionInUrl`).
 * Резолва true при успешна сесия, false при грешка или таймаут — в който случай
 * извикващият трябва да покаже нормалното приложение, за да не остане празен таб.
 */
export function waitForOAuthSession(): Promise<boolean> {
  // Локална константа: TS не пази narrowing-а на импортиран binding в closure.
  const client = supabase;
  if (!client) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      listener?.subscription.unsubscribe();
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), SESSION_TIMEOUT_MS);

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        finish(true);
      } else if (event === 'INITIAL_SESSION' && !session) {
        // Клиентът е инициализиран, но URL-ът не даде сесия — отказ или грешка.
        finish(false);
      }
    });

    // Ако сесията е налична още преди listener-ът да е закачен.
    void client.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });
  });
}
