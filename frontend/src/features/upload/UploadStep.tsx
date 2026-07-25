import React, { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '../../store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { BillingModal } from '../billing/BillingModal';
import { setCredits } from '../auth/authSlice';
import { setUploadResult } from './uploadSlice';
import { dateLocale } from '../../i18n';
import {
  MAX_UPLOAD_BYTES,
  FREE_UPLOAD_BYTES,
  creditsForSize,
  formatBytes,
} from '../../lib/uploadPolicy';
import {
  UploadError,
  uploadPdfWithProgress,
  type UploadProgress,
} from '../../lib/uploadWithProgress';

interface Props {
  onNext: () => void;
  /** Отваря глобалния AuthModal (App.tsx) — файловете над лимита искат акаунт */
  onRequireLogin: () => void;
}

export function UploadStep({ onNext, onRequireLogin }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const [dragOver, setDragOver] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  /** Файл над безплатния лимит, изчакващ потвърждение (или вход) */
  const [pending, setPending] = useState<File | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<{ required: number; available: number } | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = upload !== null;

  const size = (bytes: number) => formatBytes(bytes, dateLocale());
  const cost = (credits: number) => t('upload.creditCount', { count: credits });

  const startUpload = useCallback(
    async (file: File) => {
      setPending(null);
      setErrorKey(null);
      setShortfall(null);
      setUpload({ phase: 'uploading', progress: 0 });
      try {
        const result = await uploadPdfWithProgress(file, setUpload);
        if (result.creditsCharged > 0 && result.creditsRemaining !== null) {
          dispatch(setCredits(result.creditsRemaining));
        }
        dispatch(
          setUploadResult({ jobId: result.jobId, numPages: result.numPages, fileName: file.name }),
        );
        onNext();
      } catch (err) {
        setUpload(null);
        if (err instanceof UploadError) {
          switch (err.code) {
            case 'FILE_TOO_LARGE_LOGIN_REQUIRED':
              onRequireLogin();
              return;
            case 'INSUFFICIENT_CREDITS':
              setShortfall({ required: err.required ?? 0, available: err.available ?? 0 });
              return;
            case 'FILE_EXCEEDS_HARD_CAP':
              setErrorKey('upload.errHardCap');
              return;
          }
        }
        setErrorKey('upload.error');
      }
    },
    [dispatch, onNext, onRequireLogin],
  );

  // Файловете до безплатния лимит тръгват веднага; над него първо показваме
  // цената (или искаме вход), за да не чака цяло качване напразно.
  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.includes('pdf')) return;
      setErrorKey(null);
      setShortfall(null);
      if (file.size > MAX_UPLOAD_BYTES) {
        setPending(null);
        setErrorKey('upload.errHardCap');
        return;
      }
      if (creditsForSize(file.size) === 0) {
        void startUpload(file);
        return;
      }
      setPending(file);
    },
    [startUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Позволява повторен избор на същия файл след отказ
    e.target.value = '';
  };

  const pendingCredits = pending ? creditsForSize(pending.size) : 0;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Card className="w-full max-w-lg text-center">
        <h2 className="mb-2 text-xl font-semibold text-slate-900">{t('upload.title')}</h2>
        <p className="mb-6 text-sm text-slate-500">{t('upload.subtitle')}</p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors',
            busy
              ? 'cursor-default border-slate-200 bg-slate-50'
              : dragOver
                ? 'cursor-pointer border-brand-500 bg-brand-50'
                : 'cursor-pointer border-slate-200 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40',
          ].join(' ')}
        >
          <svg
            className="mb-3 h-12 w-12 text-slate-300"
            fill="none"
            viewBox="0 0 48 48"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 40h32V20L28 8H8v32z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M28 8v12h12" />
          </svg>
          <p className="text-sm font-medium text-slate-600">
            {t('upload.dragHint')}{' '}
            <span className="text-brand-600 underline underline-offset-2">
              {t('upload.chooseFileLink')}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-400">{t('upload.onlyPdf')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('upload.freeTierHint', { free: size(FREE_UPLOAD_BYTES) })}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {/* Файл над безплатния лимит — цена или покана за вход, преди качването */}
        {pending && (
          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-4 text-left">
            <p className="text-sm font-medium text-slate-900">
              {pending.name} · {size(pending.size)}
            </p>
            {user ? (
              <>
                <p className="mt-1.5 text-sm text-slate-600">
                  {t('upload.sizeFeeBody', {
                    free: size(FREE_UPLOAD_BYTES),
                    cost: cost(pendingCredits),
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {user.accountType === 'business'
                    ? t('upload.sizeFeeBusiness')
                    : t('upload.sizeFeeBalance', { count: user.credits })}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => void startUpload(pending)}>
                    {user.accountType === 'business'
                      ? t('upload.confirmUploadBusiness')
                      : t('upload.confirmUpload', { cost: cost(pendingCredits) })}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                    {t('upload.cancelPending')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-sm text-slate-600">
                  {t('upload.loginRequiredBody', {
                    free: size(FREE_UPLOAD_BYTES),
                    cost: cost(pendingCredits),
                  })}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" size="sm" onClick={onRequireLogin}>
                    {t('upload.loginCta')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                    {t('upload.cancelPending')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {upload && (
          <div className="mt-6 text-left">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">
                {upload.phase === 'processing'
                  ? t('upload.processing')
                  : t('upload.uploading', { percent: Math.round(upload.progress * 100) })}
              </span>
            </div>
            <ProgressBar value={upload.progress} indeterminate={upload.phase === 'processing'} />
          </div>
        )}

        {shortfall && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
            <p>
              {t('upload.errInsufficient', {
                required: cost(shortfall.required),
                available: shortfall.available,
              })}
            </p>
            <Button variant="primary" size="sm" className="mt-2" onClick={() => setShowUpsell(true)}>
              {t('upload.buyCredits')}
            </Button>
          </div>
        )}

        {errorKey && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
            {t(errorKey, { max: size(MAX_UPLOAD_BYTES) })}
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          {t('upload.chooseButton')}
        </Button>
      </Card>

      {/* Upsell при недостатъчни кредити за размера на файла */}
      <BillingModal
        open={showUpsell}
        onClose={() => setShowUpsell(false)}
        intro={t('upload.upsellText')}
      />
    </div>
  );
}
