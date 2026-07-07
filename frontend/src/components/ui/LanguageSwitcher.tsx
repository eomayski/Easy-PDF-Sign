import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';

/** Toggles BG ↔ EN; the label always shows the language you would switch to. */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isBg = i18n.language === 'bg';

  return (
    <button
      type="button"
      onClick={() => setLanguage(isBg ? 'en' : 'bg')}
      aria-label={isBg ? 'Switch to English' : 'Превключи на български'}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {isBg ? 'EN' : 'БГ'}
    </button>
  );
}
