import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { HandwrittenSignatureModal } from './HandwrittenSignatureModal';
import type { VisualSignatureConfig, SignatureLayout, SignaturePlacement } from '../../types';

interface Props {
  placement: SignaturePlacement;
  onNext: (config: VisualSignatureConfig) => void;
  onBack: () => void;
}

const layouts: { value: SignatureLayout; labelKey: string }[] = [
  { value: 'text-left-image-right', labelKey: 'config.layoutTextLeftImageRight' },
  { value: 'text-only', labelKey: 'config.layoutTextOnly' },
  { value: 'image-only', labelKey: 'config.layoutImageOnly' },
  { value: 'text-above-image', labelKey: 'config.layoutTextAboveImage' },
];

export function SignConfigStep({ onNext, onBack }: Props) {
  const { t } = useTranslation();
  const [showName, setShowName] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [freeText, setFreeText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [handwrittenDataUrl, setHandwrittenDataUrl] = useState<string | null>(null);
  const [layout, setLayout] = useState<SignatureLayout>('text-left-image-right');
  const [showHandwrittenModal, setShowHandwrittenModal] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const activeImage = handwrittenDataUrl ?? imageDataUrl;

  const handleNext = () => {
    onNext({ showName, showDate, freeText, imageDataUrl, handwrittenDataUrl, layout });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="grid w-full max-w-2xl gap-4">
        {/* Text fields */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('config.textSection')}
          </h3>

          <label className="mb-3 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={showName}
              onChange={(e) => setShowName(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">{t('config.showName')}</span>
          </label>

          <label className="mb-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={showDate}
              onChange={(e) => setShowDate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">{t('config.showDate')}</span>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('config.freeText')}
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={2}
              placeholder={t('config.freeTextPlaceholder')}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
        </Card>

        {/* Image / handwritten */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('config.imageSection')}
          </h3>

          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleImageUpload}
              />
              <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t('config.uploadStamp')}
              </span>
            </label>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowHandwrittenModal(true)}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              }
            >
              {t('config.drawSignature')}
            </Button>

            {activeImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImageDataUrl(null);
                  setHandwrittenDataUrl(null);
                }}
              >
                {t('config.removeImage')}
              </Button>
            )}
          </div>

          {activeImage && (
            <div className="mt-3 inline-block rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                src={activeImage}
                alt={t('config.previewAlt')}
                className="max-h-20 max-w-full object-contain"
              />
            </div>
          )}
        </Card>

        {/* Layout */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('config.layoutSection')}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {layouts.map((l) => (
              <button
                key={l.value}
                onClick={() => setLayout(l.value)}
                className={[
                  'rounded-lg border p-2 text-xs font-medium transition-colors',
                  layout === l.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50/40',
                ].join(' ')}
              >
                {t(l.labelKey)}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex w-full max-w-2xl justify-between">
        <Button variant="secondary" onClick={onBack}>
          {t('common.back')}
        </Button>
        <Button variant="primary" onClick={handleNext}>
          {t('config.continueButton')}
        </Button>
      </div>

      <HandwrittenSignatureModal
        open={showHandwrittenModal}
        onClose={() => setShowHandwrittenModal(false)}
        onSave={setHandwrittenDataUrl}
      />
    </div>
  );
}
