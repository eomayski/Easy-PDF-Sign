import React, { useCallback, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { setUploadResult } from './uploadSlice';
import { useUploadPdfMutation } from '../../store/api';

interface Props {
  onNext: () => void;
}

export function UploadStep({ onNext }: Props) {
  const dispatch = useDispatch();
  const [uploadPdf, { isLoading, error }] = useUploadPdfMutation();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.includes('pdf')) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const result = await uploadPdf(formData).unwrap();
        dispatch(
          setUploadResult({ jobId: result.jobId, numPages: result.numPages, fileName: file.name }),
        );
        onNext();
      } catch {
        // error shown below
      }
    },
    [uploadPdf, dispatch, onNext],
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
        <h2 className="mb-2 text-xl font-semibold text-slate-900">Качете PDF документ</h2>
        <p className="mb-6 text-sm text-slate-500">
          Изберете файл или го плъзнете тук. Файлът ще бъде изтрит след изтегляне.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors',
            dragOver
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-200 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40',
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
            Плъзнете PDF тук или{' '}
            <span className="text-brand-600 underline underline-offset-2">изберете файл</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">Само PDF файлове</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
            Грешка при качването. Моля, опитайте отново.
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          loading={isLoading}
          onClick={() => inputRef.current?.click()}
        >
          Изберете PDF файл
        </Button>
      </Card>
    </div>
  );
}
