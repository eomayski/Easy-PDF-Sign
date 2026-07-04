import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useRequestDownloadMutation } from '../../store/api';
import { setCredits } from '../auth/authSlice';
import { SignedPdfPreview } from './SignedPdfPreview';

interface Props {
  jobId: string;
  onReset: () => void;
  /** Отваря глобалния AuthModal (App.tsx) при опит за изтегляне без вход */
  onRequireLogin: () => void;
}

export function DownloadStep({ jobId, onReset, onRequireLogin }: Props) {
  const dispatch = useDispatch();
  const { fileName } = useSelector((s: RootState) => s.upload);
  const { user } = useSelector((s: RootState) => s.auth);
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
        setError('Грешка при заявката за изтегляне. Опитайте отново.');
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
            <h2 className="text-lg font-semibold text-slate-900">Документът е подписан!</h2>
            <p className="text-sm text-slate-500">
              Прегледайте резултата и изтеглете файла. Той ще бъде изтрит от сървъра след
              изтегляне.
            </p>
          </div>
        </div>

        {/* Preview — always visible, regardless of auth state */}
        <SignedPdfPreview jobId={jobId} />

        {!user && !downloadToken && (
          <p className="mb-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            За да изтеглите подписания документ, е необходимо да влезете в акаунта си. Новите
            акаунти получават <strong>5 безплатни кредита</strong>.
          </p>
        )}

        {downloadToken && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Документът е изтеглен. Ако нещо се е объркало с файла, можете да го изтеглите
            отново безплатно, докато не затворите страницата (до 1 час след качването).
          </p>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <Button
          variant="primary"
          className="mb-3 w-full"
          onClick={handleDownload}
          loading={isLoading}
        >
          {downloadToken
            ? 'Изтегли отново (безплатно)'
            : user
              ? 'Изтегли подписания PDF (1 кредит)'
              : 'Влез и изтегли'}
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
          Подпиши нов документ
        </Button>
      </Card>

      {/* Upsell — 0 credits (packages arrive with the payment milestone) */}
      <Modal open={showUpsell} onClose={() => setShowUpsell(false)} title="Нямате налични кредити">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Изчерпали сте безплатните си кредити за изтегляне. Скоро ще можете да закупите
            пакет или да преминете на бизнес абонамент:
          </p>
          <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">50 кредита</span>
              <span className="text-lg font-bold text-brand-700">€2.90</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Еднократно плащане, кредитите не изтичат.
            </p>
          </div>
          <Button variant="primary" className="w-full" disabled>
            Купи пакет — очаквайте скоро
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowUpsell(false)}>
            Затвори
          </Button>
        </div>
      </Modal>
    </div>
  );
}
