import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { bg } from './bg';
import { en } from './en';

export type AppLanguage = 'bg' | 'en';

const STORAGE_KEY = 'eps-lang';

function detectLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bg' || stored === 'en') return stored;
  } catch {
    // storage unavailable — fall through to browser language
  }
  return navigator.language?.toLowerCase().startsWith('bg') ? 'bg' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    bg: { translation: bg },
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: 'bg',
  interpolation: { escapeValue: false }, // React escapes by default
});

export function setLanguage(lang: AppLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore — the choice just won't persist
  }
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

/** Locale for date formatting, matching the active UI language. */
export function dateLocale(): string {
  return i18n.language === 'bg' ? 'bg-BG' : 'en-GB';
}

document.documentElement.lang = i18n.language;

export default i18n;
