interface ProgressBarProps {
  /** 0..1 */
  value: number;
  /** Пълна лента + непрекъснат sweep, когато прогресът не е измерим (обработка) */
  indeterminate?: boolean;
  className?: string;
}

/**
 * Тънка лента за прогрес с постоянен shimmer sweep върху запълнената част —
 * така потребителят вижда едновременно напредъка и че нещо активно се случва.
 */
export function ProgressBar({ value, indeterminate = false, className }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={['h-2.5 w-full overflow-hidden rounded-full bg-slate-100', className]
        .filter(Boolean)
        .join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
    >
      <div
        className="relative h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
        style={{ width: indeterminate ? '100%' : `${pct}%` }}
      >
        <div className="absolute inset-0 animate-progress-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>
    </div>
  );
}
