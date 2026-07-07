import { useTranslation } from 'react-i18next';

interface Step {
  label: string;
}

interface StepperProps {
  steps: Step[];
  current: number;
}

export function Stepper({ steps, current }: StepperProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('steps.aria')} className="flex items-center justify-center gap-0">
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;

        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  done
                    ? 'bg-brand-600 text-white'
                    : active
                      ? 'border-2 border-brand-600 bg-white text-brand-600'
                      : 'border-2 border-slate-200 bg-white text-slate-400',
                ].join(' ')}
              >
                {done ? (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={[
                  'mt-1 text-xs font-medium',
                  active ? 'text-brand-600' : done ? 'text-slate-600' : 'text-slate-400',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  'mb-4 h-0.5 w-12 transition-colors sm:w-20',
                  idx < current ? 'bg-brand-600' : 'bg-slate-200',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
