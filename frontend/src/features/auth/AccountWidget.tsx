import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '../../store';
import { Button } from '../../components/ui/Button';
import { BillingModal } from '../billing/BillingModal';
import { AuthModal } from './AuthModal';
import { supabase } from '../../lib/supabase';

interface Props {
  onLoginClick: () => void;
}

export function AccountWidget({ onLoginClick }: Props) {
  const { t } = useTranslation();
  const { user, sessionChecked, hasPasswordIdentity } = useSelector((s: RootState) => s.auth);
  const [billingOpen, setBillingOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Затваряне при клик навън или Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (!sessionChecked) return null;

  if (!user) {
    return (
      <Button variant="secondary" size="sm" onClick={onLoginClick}>
        {t('auth.login')}
      </Button>
    );
  }

  const balanceLabel =
    user.accountType === 'business' ? 'Business' : t('account.credits', { count: user.credits });

  const itemClass =
    'block w-full px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('account.menu')}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white py-1.5 pl-1.5 pr-2 transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold uppercase text-brand-700">
          {user.email?.[0] ?? '?'}
        </span>
        <span className="hidden max-w-[12rem] truncate text-sm text-slate-600 sm:block">
          {user.email}
        </span>
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
          </div>

          <button
            type="button"
            role="menuitem"
            className={`${itemClass} flex items-center justify-between`}
            title={t('account.billingOpen')}
            onClick={() => {
              setMenuOpen(false);
              setBillingOpen(true);
            }}
          >
            <span>{t('billing.title')}</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {balanceLabel}
            </span>
          </button>

          {/* Google-only акаунтите нямат парола — няма какво да сменят */}
          {hasPasswordIdentity && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setMenuOpen(false);
                setPasswordOpen(true);
              }}
            >
              {t('account.changePassword')}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className={`${itemClass} border-t border-slate-100`}
            onClick={() => {
              setMenuOpen(false);
              void supabase?.auth.signOut();
            }}
          >
            {t('account.logout')}
          </button>
        </div>
      )}

      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} />
      {hasPasswordIdentity && (
        <AuthModal open={passwordOpen} mode="reset" onClose={() => setPasswordOpen(false)} />
      )}
    </div>
  );
}
