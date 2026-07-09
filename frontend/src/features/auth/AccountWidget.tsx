import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '../../store';
import { Button } from '../../components/ui/Button';
import { BillingModal } from '../billing/BillingModal';
import { supabase } from '../../lib/supabase';

interface Props {
  onLoginClick: () => void;
}

export function AccountWidget({ onLoginClick }: Props) {
  const { t } = useTranslation();
  const { user, sessionChecked } = useSelector((s: RootState) => s.auth);
  const [billingOpen, setBillingOpen] = useState(false);

  if (!sessionChecked) return null;

  if (!user) {
    return (
      <Button variant="secondary" size="sm" onClick={onLoginClick}>
        {t('auth.login')}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-slate-600 sm:block">{user.email}</span>
      <button
        type="button"
        className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-200"
        title={t('account.billingOpen')}
        onClick={() => setBillingOpen(true)}
      >
        {user.accountType === 'business'
          ? 'Business'
          : t('account.credits', { count: user.credits })}
      </button>
      <BillingModal open={billingOpen} onClose={() => setBillingOpen(false)} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void supabase?.auth.signOut();
        }}
      >
        {t('account.logout')}
      </Button>
    </div>
  );
}
