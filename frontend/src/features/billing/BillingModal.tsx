import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '../../store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  useBillingPortalMutation,
  usePurchaseCreditsMutation,
  useSubscribeBusinessMutation,
} from '../../store/api';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Допълнителен увод (напр. „нямате кредити“ от DownloadStep) */
  intro?: string;
}

/**
 * Пакети и абонамент (Stripe). Плащането става на hosted Stripe страница —
 * бутоните само взимат checkout/portal URL от бекенда и правят пълен redirect.
 * Кредитите се начисляват от webhook-а след успешно плащане; App.tsx показва
 * банер и опреснява баланса при връщането (?billing=success).
 */
export function BillingModal({ open, onClose, intro }: Props) {
  const { t } = useTranslation();
  const { user } = useSelector((s: RootState) => s.auth);
  const [purchase, { isLoading: purchasing }] = usePurchaseCreditsMutation();
  const [subscribe, { isLoading: subscribing }] = useSubscribeBusinessMutation();
  const [portal, { isLoading: portalLoading }] = useBillingPortalMutation();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const returnPath = window.location.pathname;

  const redirectTo = async (fetchUrl: () => Promise<string>) => {
    setError(null);
    try {
      window.location.href = await fetchUrl();
    } catch (err) {
      const status = (err as { status?: number | string }).status;
      setError(t(status === 503 ? 'billing.notAvailable' : 'billing.error'));
    }
  };

  const isBusiness = user.accountType === 'business';

  return (
    <Modal open={open} onClose={onClose} title={t('billing.title')}>
      <div className="space-y-4">
        {intro && <p className="text-sm text-slate-600">{intro}</p>}

        {isBusiness ? (
          <>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{t('billing.bizTitle')}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {t('billing.bizActive')}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{t('billing.bizActiveNote')}</p>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              loading={portalLoading}
              onClick={() => void redirectTo(async () => (await portal({ returnPath }).unwrap()).portalUrl)}
            >
              {t('billing.bizManage')}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{t('billing.packTitle')}</span>
                <span className="text-lg font-bold text-brand-700">{t('billing.packPrice')}</span>
              </div>
              <p className="mb-3 mt-1 text-sm text-slate-500">{t('billing.packNote')}</p>
              <Button
                variant="primary"
                className="w-full"
                loading={purchasing}
                onClick={() =>
                  void redirectTo(async () => (await purchase({ returnPath }).unwrap()).checkoutUrl)
                }
              >
                {t('billing.packBuy')}
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{t('billing.bizTitle')}</span>
                <span className="text-lg font-bold text-slate-700">{t('billing.bizPrice')}</span>
              </div>
              <p className="mb-3 mt-1 text-sm text-slate-500">{t('billing.bizNote')}</p>
              <Button
                variant="secondary"
                className="w-full"
                loading={subscribing}
                onClick={() =>
                  void redirectTo(async () => (await subscribe({ returnPath }).unwrap()).checkoutUrl)
                }
              >
                {t('billing.bizSubscribe')}
              </Button>
            </div>
          </>
        )}

        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <p className="text-center text-xs text-slate-400">{t('billing.stripeNote')}</p>

        <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  );
}
