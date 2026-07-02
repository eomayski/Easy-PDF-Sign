import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { setMethod, setStatus, setDownloadToken, setError } from './signingSlice';
import {
  usePrepareSignMutation,
  useCompleteSignMutation,
  useConfirmAdViewMutation,
} from '../../store/api';
import { viewportToPdfRect } from '../../lib/coords';
import { detectOS, getHelperDownloads } from '../../lib/detectOS';
import type { SigningMethod, SignaturePlacement, VisualSignatureConfig } from '../../types';
import type { CertInfo } from './types';

const AGENT_BASE = 'http://127.0.0.1:17357';

interface Props {
  placement: SignaturePlacement;
  visualConfig: VisualSignatureConfig;
  onDone: (downloadToken: string) => void;
  onBack: () => void;
}

export function SigningStep({ placement, visualConfig, onDone, onBack }: Props) {
  const dispatch = useDispatch();
  const { jobId } = useSelector((s: RootState) => s.upload);
  const { status } = useSelector((s: RootState) => s.signing);
  const [prepareSign] = usePrepareSignMutation();
  const [completeSign] = useCompleteSignMutation();
  const [confirmAdView] = useConfirmAdViewMutation();

  const [selectedMethod, setSelectedMethod] = useState<SigningMethod>('physical');

  // Physical flow state
  const [certs, setCerts] = useState<CertInfo[]>([]);
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null);
  const [showCertPicker, setShowCertPicker] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');

  const isBusy = status === 'preparing' || status === 'awaiting-agent' || status === 'completing';

  // Ping the local helper agent whenever the physical method is selected,
  // so we can show an install prompt instead of a confusing connection error.
  useEffect(() => {
    if (selectedMethod !== 'physical') return;
    let cancelled = false;
    setAgentStatus('checking');
    fetch(`${AGENT_BASE}/health`, { signal: AbortSignal.timeout(2000) })
      .then((res) => {
        if (!cancelled) setAgentStatus(res.ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setAgentStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMethod]);

  // ─── Mock flow ─────────────────────────────────────────────────────────────

  async function runMockFlow(jobIdVal: string) {
    dispatch(setStatus('completing'));
    const adResult = await confirmAdView({
      jobId: jobIdVal,
      reward: { provider: 'mock', adSessionId: 'mock-session' },
    }).unwrap();
    dispatch(setDownloadToken(adResult.downloadToken));
    dispatch(setStatus('done'));
    onDone(adResult.downloadToken);
  }

  // ─── Physical flow ─────────────────────────────────────────────────────────

  async function fetchCertsFromAgent(): Promise<CertInfo[]> {
    const res = await fetch(`${AGENT_BASE}/certificates`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Agent returned ${res.status}`);
    }
    return res.json() as Promise<CertInfo[]>;
  }

  async function signWithAgent(hash: string, certId: string): Promise<string> {
    const res = await fetch(`${AGENT_BASE}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, certId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Agent returned ${res.status}`);
    }
    const data = await res.json() as { cms: string };
    return data.cms;
  }

  async function runPhysicalFlow() {
    // Fetch certs first — the signer name must be known before calling prepare
    // so the visual signature can show the real name from the certificate.
    dispatch(setStatus('awaiting-agent'));
    setAgentError(null);
    const certList = await fetchCertsFromAgent();
    if (certList.length === 0) {
      throw new Error('Няма намерени сертификати. Уверете се, че смарт картата е поставена.');
    }
    setCerts(certList);
    setSelectedCertId(certList[0].id);
    setShowCertPicker(true);
    // The rest continues in onConfirmCert() after the user picks a cert
  }

  async function onConfirmCert() {
    if (!jobId || !selectedCertId) return;
    setShowCertPicker(false);
    setAgentError(null);

    const selectedCert = certs.find((c) => c.id === selectedCertId);
    const cnMatch = selectedCert?.subject.match(/CN=([^,]+)/);
    const cn = cnMatch ? cnMatch[1].trim() : selectedCert?.subject;
    const signerName = cn ? `Digitally signed by: ${cn}` : undefined;

    try {
      // 1. Backend: apply visual (with real signer name) + PAdES placeholder, get hash
      dispatch(setStatus('preparing'));
      const pdfRect = viewportToPdfRect(placement.rect, placement.scale, placement.pageHeight);
      const prepResult = await prepareSign({
        jobId,
        page: placement.page,
        pdfRect,
        visualConfig,
        method: 'physical',
        signerName,
      }).unwrap();

      const hash = prepResult.byteRangeHash;
      if (!hash) throw new Error('Backend did not return byteRangeHash');

      // 2. Agent: sign the hash (prompts PIN via OS dialog)
      dispatch(setStatus('awaiting-agent'));
      const cms = await signWithAgent(hash, selectedCertId);

      // 3. Backend: embed CMS → signed PDF
      dispatch(setStatus('completing'));
      await completeSign({ jobId, cms }).unwrap();

      // 4. Ad confirmation + download token
      const adResult = await confirmAdView({
        jobId,
        reward: { provider: 'mock', adSessionId: 'mock-session' },
      }).unwrap();
      dispatch(setDownloadToken(adResult.downloadToken));
      dispatch(setStatus('done'));
      onDone(adResult.downloadToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Грешка при подписването.';
      setAgentError(msg);
      dispatch(setError(msg));
    }
  }

  // ─── Main handler ──────────────────────────────────────────────────────────

  const handleSign = async () => {
    if (!jobId) return;
    dispatch(setMethod(selectedMethod));

    try {
      if (selectedMethod === 'mock') {
        dispatch(setStatus('preparing'));
        const pdfRect = viewportToPdfRect(placement.rect, placement.scale, placement.pageHeight);
        const prepResult = await prepareSign({
          jobId,
          page: placement.page,
          pdfRect,
          visualConfig,
          method: 'mock',
        }).unwrap();
        await runMockFlow(prepResult.jobId);
      } else if (selectedMethod === 'physical') {
        await runPhysicalFlow();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Грешка при подписването.';
      dispatch(setError(msg));
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-lg">
        <Card className="mb-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Метод на подписване
          </h3>

          <div className="space-y-3">
            <MethodCard
              value="physical"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Физически КЕП (смарт карта)"
              description="Изисква инсталиран helper agent и смарт карта. Квалифициран PAdES подпис."
              badge="КЕП"
              badgeColor="bg-brand-100 text-brand-700"
            />
            <MethodCard
              value="mock"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Демо подпис (без КЕП)"
              description="Добавя визуален слой без криптографски подпис. Само за тест."
              badge="Демо"
              badgeColor="bg-amber-100 text-amber-700"
            />
            <MethodCard
              value="cloud"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Облачен КЕП (Evrotrust / B-Trust)"
              description="Подписвате от мобилното приложение на доставчика. Квалифициран PAdES подпис."
              badge="Скоро"
              badgeColor="bg-slate-100 text-slate-500"
              disabled
            />
          </div>
        </Card>

        {status === 'error' && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {agentError ?? 'Грешка при подписването. Опитайте отново.'}
          </div>
        )}

        {isBusy && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <Spinner size="sm" />
            {status === 'preparing' && 'Подготвяне на документа...'}
            {status === 'awaiting-agent' && 'Комуникация с helper agent...'}
            {status === 'completing' && 'Финализиране на подписа...'}
          </div>
        )}

        {selectedMethod === 'physical' && agentStatus === 'unavailable' && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm">
            <p className="font-semibold text-amber-800 mb-1">
              Easy PDF Sign Helper не е открит
            </p>
            <p className="text-amber-700 mb-3">
              За подписване със смарт карта е необходимо да инсталирате локалния помощен агент.
              Инсталирайте го веднъж — след това ще работи автоматично.
            </p>
            <div className="flex flex-wrap gap-2">
              {getHelperDownloads(detectOS()).map((dl) => (
                <a
                  key={dl.url}
                  href={dl.url}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  ↓ {dl.label}
                </a>
              ))}
            </div>
            <button
              onClick={() => {
                setAgentStatus('checking');
                fetch(`${AGENT_BASE}/health`, { signal: AbortSignal.timeout(2000) })
                  .then((res) => setAgentStatus(res.ok ? 'available' : 'unavailable'))
                  .catch(() => setAgentStatus('unavailable'));
              }}
              className="ml-3 text-amber-700 underline hover:text-amber-900"
            >
              Провери отново
            </button>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack} disabled={isBusy}>
            ← Назад
          </Button>
          <Button
            variant="primary"
            onClick={handleSign}
            loading={isBusy}
            disabled={isBusy || (selectedMethod === 'physical' && agentStatus !== 'available')}
          >
            Подпиши документа
          </Button>
        </div>
      </div>

      {/* Certificate picker modal (physical flow) */}
      <Modal
        open={showCertPicker}
        onClose={() => {
          setShowCertPicker(false);
          dispatch(setError('Подписването е отменено.'));
        }}
        title="Изберете сертификат"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Намерени сертификати на смарт картата:
          </p>

          {certs.map((cert) => (
            <button
              key={cert.id}
              onClick={() => setSelectedCertId(cert.id)}
              className={[
                'w-full rounded-xl border-2 p-4 text-left transition-colors',
                selectedCertId === cert.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <div className="font-medium text-slate-900 text-sm">{cert.subject}</div>
              <div className="text-xs text-slate-500 mt-1">
                Издател: {cert.issuer}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Валиден до: {new Date(cert.validTo).toLocaleDateString('bg-BG')}
              </div>
              {cert.keyUsage.includes('nonRepudiation') && (
                <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  КЕП (nonRepudiation)
                </span>
              )}
            </button>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCertPicker(false);
                dispatch(setError('Подписването е отменено.'));
              }}
            >
              Отказ
            </Button>
            <Button
              variant="primary"
              onClick={onConfirmCert}
              disabled={!selectedCertId}
            >
              Подпиши с избрания сертификат
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── MethodCard ───────────────────────────────────────────────────────────────

interface MethodCardProps {
  value: SigningMethod;
  current: SigningMethod;
  onChange: (v: SigningMethod) => void;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  disabled?: boolean;
}

function MethodCard({
  value,
  current,
  onChange,
  title,
  description,
  badge,
  badgeColor,
  disabled,
}: MethodCardProps) {
  const selected = current === value;
  return (
    <button
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
      className={[
        'w-full rounded-xl border-2 p-4 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-slate-100 opacity-50'
          : selected
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-900">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </button>
  );
}
