/**
 * Засича дали страницата е заредена от линк за възстановяване на парола.
 *
 * Модулът се изпълнява при import — трябва да прочете URL-а, преди
 * supabase-js (`detectSessionInUrl`) да е обменил токена и да е изчистил
 * hash-а. Затова се импортира от `lib/supabase.ts` преди `createClient`.
 *
 * Покрива двата варианта на Supabase имейл шаблона:
 *   implicit: #access_token=...&type=recovery
 *   PKCE:     ?code=...  /  ?token_hash=...&type=recovery
 */
function detect(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return hash.get('type') === 'recovery' || search.get('type') === 'recovery';
}

let pending = detect();

/**
 * Връща true само първия път след зареждане от recovery линк — след това
 * флагът е изразходван, за да не отваря модала при всеки следващ вход в
 * същия таб (SIGNED_IN след logout/login не е recovery).
 */
export function consumeRecoveryFlag(): boolean {
  const value = pending;
  pending = false;
  return value;
}
