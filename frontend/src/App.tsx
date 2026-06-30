import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Stepper } from './components/ui/Stepper';
import { UploadStep } from './features/upload/UploadStep';
import { ViewerStep } from './features/viewer/ViewerStep';
import { SignConfigStep } from './features/sign-config/SignConfigStep';
import { SigningStep } from './features/signing/SigningStep';
import { DownloadStep } from './features/download/DownloadStep';
import { resetUpload } from './features/upload/uploadSlice';
import { reset as resetSigning } from './features/signing/signingSlice';
import type { SignaturePlacement, VisualSignatureConfig } from './types';

const STEPS = [
  { label: 'Качване' },
  { label: 'Позиция' },
  { label: 'Изглед' },
  { label: 'Подписване' },
];

export function App() {
  const dispatch = useDispatch();
  const [step, setStep] = useState(0);
  const [placement, setPlacement] = useState<SignaturePlacement | null>(null);
  const [visualConfig, setVisualConfig] = useState<VisualSignatureConfig | null>(null);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);

  const handleReset = () => {
    dispatch(resetUpload());
    dispatch(resetSigning());
    setStep(0);
    setPlacement(null);
    setVisualConfig(null);
    setDownloadToken(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-7 w-7 text-brand-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-lg font-bold text-slate-900">Easy PDF Sign</span>
          </div>
          <span className="hidden text-xs text-slate-400 sm:block">
            Квалифициран електронен подпис (PAdES / eIDAS)
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Stepper (hidden on download step) */}
        {step < 4 && downloadToken === null && (
          <div className="mb-8">
            <Stepper steps={STEPS} current={step} />
          </div>
        )}

        {step === 0 && <UploadStep onNext={() => setStep(1)} />}

        {step === 1 && (
          <ViewerStep
            onBack={() => setStep(0)}
            onNext={(p) => {
              setPlacement(p);
              setStep(2);
            }}
          />
        )}

        {step === 2 && placement && (
          <SignConfigStep
            placement={placement}
            onBack={() => setStep(1)}
            onNext={(config) => {
              setVisualConfig(config);
              setStep(3);
            }}
          />
        )}

        {step === 3 && placement && visualConfig && (
          <SigningStep
            placement={placement}
            visualConfig={visualConfig}
            onBack={() => setStep(2)}
            onDone={(token) => {
              setDownloadToken(token);
              setStep(4);
            }}
          />
        )}

        {step === 4 && downloadToken && (
          <DownloadStep downloadToken={downloadToken} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
