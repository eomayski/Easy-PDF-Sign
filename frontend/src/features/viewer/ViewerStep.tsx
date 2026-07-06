import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { PdfViewer, type PageDimensions } from './PdfViewer';
import { SignatureBox } from '../signature-box/SignatureBox';
import { Button } from '../../components/ui/Button';
import type { ViewportRect, SignaturePlacement } from '../../types';

interface Props {
  onNext: (placement: SignaturePlacement) => void;
  onBack: () => void;
}

export function ViewerStep({ onNext, onBack }: Props) {
  const { jobId, numPages } = useSelector((s: RootState) => s.upload);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [dims, setDims] = useState<PageDimensions | null>(null);
  const [rect, setRect] = useState<ViewportRect | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const handleDims = useCallback((d: PageDimensions) => {
    setDims(d);
    setRect(null); // reset box when navigating pages
    setWarning(null);
  }, []);

  const canContinue = rect && rect.width > 60 && rect.height > 30;

  const handleNext = () => {
    if (!canContinue || !dims) {
      setWarning(
        rect
          ? 'Зоната за подпис е твърде малка — уголемете правоъгълника.'
          : 'Не е избрана позиция за подписа. Начертайте правоъгълник върху страницата, като натиснете и влачите.',
      );
      return;
    }
    onNext({
      page: currentPage,
      rect,
      scale: dims.scale,
      pageWidth: dims.widthPt,
      pageHeight: dims.heightPt,
    });
  };

  if (!jobId) return null;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-3xl">
        <div className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <strong>Начертайте зона</strong> за подписа: натиснете и влачете правоъгълник върху страницата.
          Можете да го преместите и преоразмерите след нанасянето.
        </div>

        {/* Page navigation */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            Страница {currentPage} от {pageCount || numPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              ← Предишна
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= (pageCount || numPages)}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Следваща →
            </Button>
          </div>
        </div>

        {/* PDF canvas + signature box overlay */}
        <div className="flex justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 scrollbar-thin">
          <PdfViewer
            jobId={jobId}
            currentPage={currentPage}
            onPageCount={setPageCount}
            onPageDimensions={handleDims}
            overlay={
              dims ? (
                <SignatureBox
                  width={dims.widthPx}
                  height={dims.heightPx}
                  rect={rect}
                  onChange={(r) => {
                    setRect(r);
                    if (r) setWarning(null);
                  }}
                />
              ) : undefined
            }
          />
        </div>

        {canContinue && (
          <p className="mt-2 text-center text-xs text-emerald-600">
            ✓ Зоната за подпис е избрана. Можете да продължите.
          </p>
        )}

        {warning && !canContinue && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
            {warning}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-3xl justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Назад
        </Button>
        <Button variant="primary" onClick={handleNext}>
          Конфигурирай изглед →
        </Button>
      </div>
    </div>
  );
}
