import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppDispatch } from '../../store';
import { api } from '../../store/api';
import { setAuthUser } from '../auth/authSlice';

/**
 * Показва резултата от Stripe Checkout при връщането (?billing=success|cancelled)
 * и маха параметъра от URL-а. Кредитите се начисляват от webhook-а, който може
 * да изостане с 1–2 сек. след redirect-а — затова балансът се опреснява със
 * закъснение, вместо да разчитаме на първоначалния /auth/me при зареждането.
 */
export function BillingReturnBanner() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const billing = params.get('billing');
    if (billing !== 'success' && billing !== 'cancelled') return;

    setNotice(billing);
    params.delete('billing');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });

    if (billing !== 'success') return;
    const refresh = async () => {
      try {
        const me = await dispatch(
          api.endpoints.getMe.initiate(undefined, { forceRefetch: true }),
        ).unwrap();
        dispatch(setAuthUser(me));
      } catch {
        // не е логнат (изтекла сесия) — нищо за опресняване
      }
    };
    const timers = [1500, 5000].map((ms) => window.setTimeout(() => void refresh(), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // Връщането от Stripe е пълно зареждане на страницата — веднъж при mount стига.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!notice) return null;

  const success = notice === 'success';
  return (
    <div
      className={`mb-6 flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
        success ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span>{t(success ? 'billing.successBanner' : 'billing.cancelledBanner')}</span>
      <button
        type="button"
        className="ml-4 font-semibold opacity-60 transition hover:opacity-100"
        aria-label={t('common.close')}
        onClick={() => setNotice(null)}
      >
        ✕
      </button>
    </div>
  );
}
