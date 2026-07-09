import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Stepper } from './components/ui/Stepper';
import { LanguageSwitcher } from './components/ui/LanguageSwitcher';
import { LandingPage } from './features/landing/LandingPage';
import { UploadStep } from './features/upload/UploadStep';
import { ViewerStep } from './features/viewer/ViewerStep';
import { SignConfigStep } from './features/sign-config/SignConfigStep';
import { SigningStep } from './features/signing/SigningStep';
import { DownloadStep } from './features/download/DownloadStep';
import { AuthModal } from './features/auth/AuthModal';
import { AccountWidget } from './features/auth/AccountWidget';
import { BillingReturnBanner } from './features/billing/BillingReturnBanner';
import { useSupabaseSession } from './features/auth/useSupabaseSession';
import { resetUpload, setUploadResult } from './features/upload/uploadSlice';
import { reset as resetSigning } from './features/signing/signingSlice';
import { clearFlow, loadFlow, saveFlow } from './lib/flowPersistence';
import type { RootState } from './store';
import type { SignaturePlacement, VisualSignatureConfig } from './types';

const STEP_KEYS = ['steps.upload', 'steps.position', 'steps.appearance', 'steps.signing'];

export function App() {
  useSupabaseSession();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const upload = useSelector((s: RootState) => s.upload);
  const { jobId } = upload;

  const navigate = useNavigate();

  // Restore the flow after a full page reload (e.g. the Google OAuth redirect)
  const [restored] = useState(() => loadFlow());
  const [step, setStep] = useState(restored?.step ?? 0);
  const [placement, setPlacement] = useState<SignaturePlacement | null>(
    restored?.placement ?? null,
  );
  const [visualConfig, setVisualConfig] = useState<VisualSignatureConfig | null>(
    restored?.visualConfig ?? null,
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    if (restored) {
      dispatch(setUploadResult(restored.upload));
      // При възстановен flow (OAuth redirect / F5 на "/") влизаме директно в него.
      navigate('/sign', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the persisted flow in sync while a job is in progress
  useEffect(() => {
    if (jobId && upload.fileName) {
      saveFlow({
        step,
        upload: { jobId, numPages: upload.numPages, fileName: upload.fileName },
        placement,
        visualConfig,
      });
    }
  }, [step, jobId, upload.numPages, upload.fileName, placement, visualConfig]);

  const handleReset = () => {
    clearFlow();
    dispatch(resetUpload());
    dispatch(resetSigning());
    setStep(0);
    setPlacement(null);
    setVisualConfig(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
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
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-slate-400 lg:block">
              {t('header.tagline')}
            </span>
            <LanguageSwitcher />
            <AccountWidget onLoginClick={() => setAuthModalOpen(true)} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <BillingReturnBanner />
        <Routes>
          <Route path="/" element={<LandingPage onStart={() => navigate('/sign')} />} />

          <Route
            path="/sign"
            element={
              <>
                {/* Stepper (hidden on download step) */}
                {step < 4 && (
                  <div className="mb-8">
                    <Stepper steps={STEP_KEYS.map((k) => ({ label: t(k) }))} current={step} />
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
                    onDone={() => setStep(4)}
                  />
                )}

                {step === 4 && jobId && (
                  <DownloadStep
                    jobId={jobId}
                    onReset={handleReset}
                    onRequireLogin={() => setAuthModalOpen(true)}
                  />
                )}
              </>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
