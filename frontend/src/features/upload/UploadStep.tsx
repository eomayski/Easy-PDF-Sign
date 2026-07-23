import React, { useCallback, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { setUploadResult } from './uploadSlice';
import { uploadPdfWithProgress, type UploadProgress } from '../../lib/uploadWithProgress';

interface Props {
  onNext: () => void;
}

export function UploadStep({ onNext }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [dragOver, setDragOver] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = upload !== null;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.includes('pdf')) return;
      setError(false);
      setUpload({ phase: 'uploading', progress: 0 });
      try {
        const result = await uploadPdfWithProgress(file, setUpload);
        dispatch(
          setUploadResult({ jobId: result.jobId, numPages: result.numPages, fileName: file.name }),
        );
        onNext();
      } catch {
        setError(true);
        setUpload(null);
      }
    },
    [dispatch, onNext],
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
  };

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
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {upload && (
          <div className="mt-6 text-left">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">
                {upload.phase === 'processing'
                  ? t('upload.processing')
                  : t('upload.uploading', { percent: Math.round(upload.progress * 100) })}
              </span>
            </div>
            <ProgressBar
              value={upload.progress}
              indeterminate={upload.phase === 'processing'}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
            {t('upload.error')}
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
    </div>
  );
}
