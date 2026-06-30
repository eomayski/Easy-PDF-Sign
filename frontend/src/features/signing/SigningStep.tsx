import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { setMethod, setStatus, setDownloadToken, setError } from './signingSlice';
import { usePrepareSignMutation, useConfirmAdViewMutation } from '../../store/api';
import { viewportToPdfRect } from '../../lib/coords';
import type { SigningMethod, SignaturePlacement, VisualSignatureConfig } from '../../types';

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
  const [confirmAdView] = useConfirmAdViewMutation();

  const [selectedMethod, setSelectedMethod] = useState<SigningMethod>('mock');

  const isBusy = status === 'preparing' || status === 'awaiting-agent' || status === 'completing';

  const handleSign = async () => {
    if (!jobId) return;
    dispatch(setMethod(selectedMethod));
    dispatch(setStatus('preparing'));

    try {
      const pdfRect = viewportToPdfRect(placement.rect, placement.scale, placement.pageHeight);

      const prepResult = await prepareSign({
        jobId,
        page: placement.page,
        pdfRect,
        visualConfig,
        method: selectedMethod,
      }).unwrap();

      if (selectedMethod === 'mock') {
        // Mock flow: backend already "signed" it, just get the download token
        dispatch(setStatus('completing'));
        const adResult = await confirmAdView({
          jobId: prepResult.jobId,
          reward: { provider: 'mock', adSessionId: 'mock-session' },
        }).unwrap();
        dispatch(setDownloadToken(adResult.downloadToken));
        dispatch(setStatus('done'));
        onDone(adResult.downloadToken);
      } else if (selectedMethod === 'physical') {
        // Phase 1: forward hash to local helper-agent
        dispatch(setStatus('awaiting-agent'));
        // TODO Phase 1: call LocalSigningProvider
        throw new Error('Физическият КЕП е налице само с инсталиран helper agent (Фаза 1).');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Грешка при подписването.';
      dispatch(setError(msg));
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-lg">
        {/* Method selection */}
        <Card className="mb-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Метод на подписване
          </h3>

          <div className="space-y-3">
            <MethodCard
              value="mock"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Демо подпис (без КЕП)"
              description="Добавя визуален слой без криптографски подпис. Само за тест."
              badge="Фаза 0"
              badgeColor="bg-amber-100 text-amber-700"
            />
            <MethodCard
              value="physical"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Физически КЕП (смарт карта)"
              description="Изисква инсталиран helper agent и смарт карта. Квалифициран PAdES подпис."
              badge="Фаза 1"
              badgeColor="bg-brand-100 text-brand-700"
              disabled
            />
            <MethodCard
              value="cloud"
              current={selectedMethod}
              onChange={setSelectedMethod}
              title="Облачен КЕП (Evrotrust / B-Trust)"
              description="Подписвате от мобилното приложение на доставчика. Квалифициран PAdES подпис."
              badge="Фаза 3"
              badgeColor="bg-slate-100 text-slate-500"
              disabled
            />
          </div>
        </Card>

        {/* Status / error */}
        {status === 'error' && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Грешка при подписването. Опитайте отново.
          </div>
        )}

        {isBusy && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <Spinner size="sm" />
            {status === 'preparing' && 'Подготвяне на документа...'}
            {status === 'awaiting-agent' && 'Изчакване на helper agent...'}
            {status === 'completing' && 'Финализиране на подписа...'}
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack} disabled={isBusy}>
            ← Назад
          </Button>
          <Button variant="primary" onClick={handleSign} loading={isBusy} disabled={isBusy}>
            Подпиши документа
          </Button>
        </div>
      </div>
    </div>
  );
}

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
