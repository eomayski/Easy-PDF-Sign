import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

interface Props {
  downloadToken: string;
  onReset: () => void;
}

export function DownloadStep({ downloadToken, onReset }: Props) {
  const { fileName } = useSelector((s: RootState) => s.upload);

  const downloadUrl = `/api/download/${downloadToken}`;
  const suggestedName = fileName ? fileName.replace(/\.pdf$/i, '_signed.pdf') : 'signed.pdf';

  return (
    <div className="flex flex-col items-center py-12">
      <Card className="w-full max-w-md text-center">
        {/* Success icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-8 w-8 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-slate-900">Документът е подписан!</h2>
        <p className="mb-6 text-sm text-slate-500">
          Подписаният PDF е готов за изтегляне. Файлът ще бъде изтрит от сървъра след изтегляне.
        </p>

        <a
          href={downloadUrl}
          download={suggestedName}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Изтегли подписания PDF
        </a>

        <Button variant="ghost" size="sm" className="w-full" onClick={onReset}>
          Подпиши нов документ
        </Button>
      </Card>
    </div>
  );
}
