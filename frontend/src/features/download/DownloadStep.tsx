import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Trans, useTranslation } from 'react-i18next';
import type { RootState } from '../../store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRequestDownloadMutation } from '../../store/api';
import { setCredits } from '../auth/authSlice';
import { BillingModal } from '../billing/BillingModal';
import { SignedPdfPreview } from './SignedPdfPreview';

interface Props {
  jobId: string;
  onReset: () => void;
  /** Отваря глобалния AuthModal (App.tsx) при опит за изтегляне без вход */
  onRequireLogin: () => void;
}

export function DownloadStep({ jobId, onReset, onRequireLogin }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { fileName } = useSelector((s: RootState) => s.upload);
  const { user, syncing } = useSelector((s: RootState) => s.auth);
  const [requestDownload, { isLoading }] = useRequestDownloadMutation();
  const [showUpsell, setShowUpsell] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The credit is debited once, at token issuance; re-downloads with the same
  // token are free. Kept in sessionStorage so a page reload doesn't re-charge.
  const tokenStorageKey = `download-token-${jobId}`;
  const [downloadToken, setDownloadToken] = useState<string | null>(
    () => sessionStorage.getItem(tokenStorageKey),
  );

  const suggestedName = fileName ? fileName.replace(/\.pdf$/i, '_signed.pdf') : 'signed.pdf';

  const triggerDownload = (token: string) => {
    const a = document.createElement('a');
    a.href = `/api/download/${token}`;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownload = async () => {
    setError(null);

    // Re-download with the already-paid token — no second debit
    if (downloadToken) {
      triggerDownload(downloadToken);
      return;
    }

    if (!user) {
      onRequireLogin();
      return;
    }

    try {
      const { downloadToken: token, creditsRemaining } = await requestDownload({
        jobId,
      }).unwrap();
      dispatch(setCredits(creditsRemaining));
      setDownloadToken(token);
      try {
        sessionStorage.setItem(tokenStorageKey, token);
      } catch {
        // storage full — re-download after reload would just cost a credit
      }
      triggerDownload(token);
    } catch (err) {
      const status = (err as { status?: number | string }).status;
      if (status === 401) {
        onRequireLogin();
      } else if (status === 402) {
        setShowUpsell(true);
      } else {
        setError(t('download.requestError'));
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <Card className="w-full max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-5 w-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('download.title')}</h2>
            <p className="text-sm text-slate-500">{t('download.subtitle')}</p>
          </div>
        </div>

        {/* Preview — always visible, regardless of auth state */}
        <SignedPdfPreview jobId={jobId} />

        {!user && !downloadToken && !syncing && (
          <p className="mb-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <Trans i18nKey="download.loginPrompt" components={{ b: <strong /> }} />
          </p>
        )}

        {downloadToken && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {t('download.downloaded')}
          </p>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <Button
          variant="primary"
          className="mb-3 w-full"
          onClick={handleDownload}
          loading={isLoading || syncing}
        >
          {downloadToken
            ? t('download.btnAgain')
            : syncing
              ? t('download.btnLoggingIn')
              : user
                ? t('download.btnDownload')
                : t('download.btnLogin')}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            sessionStorage.removeItem(tokenStorageKey);
            onReset();
          }}
        >
          {t('download.signAnother')}
        </Button>
      </Card>

      {/* Upsell — 0 credits: пакети + абонамент (Stripe) */}
      <BillingModal
        open={showUpsell}
        onClose={() => setShowUpsell(false)}
        intro={t('download.upsellText')}
      />
    </div>
  );
}
