import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SignaturePad from 'signature_pad';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export function HandwrittenSignatureModal({ open, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    padRef.current = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: '#1e293b',
    });
    return () => {
      padRef.current?.off();
      padRef.current = null;
    };
  }, [open]);

  const handleSave = useCallback(() => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    const dataUrl = pad.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  }, [onSave, onClose]);

  const handleClear = () => padRef.current?.clear();

  return (
    <Modal open={open} onClose={onClose} title={t('handwritten.title')} maxWidth="lg">
      <p className="mb-4 text-sm text-slate-500">{t('handwritten.hint')}</p>
      <canvas
        ref={canvasRef}
        width={480}
        height={180}
        className="w-full rounded-lg border border-slate-200 bg-white touch-none"
        style={{ cursor: 'crosshair' }}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={handleClear}>
          {t('handwritten.clear')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={handleSave}>
          {t('handwritten.save')}
        </Button>
      </div>
    </Modal>
  );
}
