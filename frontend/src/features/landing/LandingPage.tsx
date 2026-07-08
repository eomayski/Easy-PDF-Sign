import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import './landing.css';

interface Props {
  /** Стартира flow-а за подписване (скрива landing-а). */
  onStart: () => void;
}

const STEP_COUNT = 5;

export function LandingPage({ onStart }: Props) {
  const { t } = useTranslation();
  const flowHeadRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <Hero onStart={onStart} onHow={() => flowHeadRef.current?.scrollIntoView({ behavior: 'smooth' })} />

      <div ref={flowHeadRef} className="scroll-mt-20 pt-4">
        <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {t('landing.flowTitle')}
        </h2>
        <p className="max-w-2xl text-slate-500">{t('landing.flowSub')}</p>
      </div>

      <FlowSection />
      <WhySection />
      <FinalCta onStart={onStart} />

      <footer className="border-t border-slate-200 py-8 text-sm text-slate-500">
        <div className="flex flex-wrap justify-between gap-3">
          <span>© 2026 Easy PDF Sign · pdf-easy.online</span>
          <span>{t('landing.foot')}</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onStart, onHow }: { onStart: () => void; onHow: () => void }) {
  const { t } = useTranslation();
  const inkRef = useRef<SVGPathElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Мастиленият щрих под акцентната дума се "изписва" при зареждане.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      videoRef.current?.pause();
      return;
    }
    const path = inkRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.style.transition = 'stroke-dashoffset 1.1s ease .35s';
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = '0';
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="relative left-1/2 -mt-8 w-screen -translate-x-1/2 overflow-hidden">
      {/* Видео фон + градиенти за четимост на текста и преход към фона на страницата */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/hero-bg.webm"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-slate-50 via-slate-50/85 to-slate-50/25"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-50"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-12 sm:pt-16">
        <span className="inline-flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-brand-800">
          <span className="h-px w-6 bg-brand-600" aria-hidden="true" />
          {t('landing.eyebrow')}
        </span>

        <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 [text-wrap:balance] sm:text-5xl lg:text-6xl">
          {t('landing.h1a')}
          <span className="relative whitespace-nowrap">
            {t('landing.h1b')}
            <svg
              className="pointer-events-none absolute -bottom-[0.3em] left-[-2%] h-[0.5em] w-[104%] overflow-visible"
              viewBox="0 0 300 40"
              aria-hidden="true"
            >
              <path
                ref={inkRef}
                d="M4,30 C40,8 70,34 110,22 C150,10 160,36 205,24 C245,14 265,30 296,18"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                className="text-brand-600 opacity-85"
              />
            </svg>
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-slate-500">{t('landing.lead')}</p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={onStart}>
            {t('landing.ctaSign')}
          </Button>
          <Button variant="secondary" size="lg" onClick={onHow}>
            {t('landing.ctaHow')}
          </Button>
        </div>

        <div className="mt-11 flex flex-wrap gap-x-7 gap-y-2.5 border-t border-slate-200 pt-5 text-sm text-slate-500">
          {[
            [
              'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
              t('landing.trust1'),
            ],
            [
              'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
              t('landing.trust2'),
            ],
            ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', t('landing.trust3')],
          ].map(([d, label]) => (
            <span key={label} className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 shrink-0 text-brand-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={d} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Flow: pinned scroll section ──────────────────────────────────────────────

function FlowSection() {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const track = trackRef.current;
      if (!track) return;
      const vh = window.innerHeight;
      const total = track.offsetHeight - vh;
      const p = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / total));
      setProgress(p);
      setActive(Math.min(STEP_COUNT - 1, Math.floor(p * STEP_COUNT)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const steps = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`landing.s${n}h`),
    text: t(`landing.s${n}p`),
  }));

  return (
    <section ref={trackRef} className="relative" style={{ height: `calc(${STEP_COUNT} * 85vh + 100vh)` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="grid w-full grid-cols-1 content-center items-center gap-5 md:grid-cols-[5fr_7fr] md:gap-16">
          {/* Списък със стъпки (desktop) */}
          <div className="relative hidden pl-9 md:block">
            <div className="absolute bottom-2 left-2.5 top-2 w-0.5 rounded bg-slate-200">
              <div
                className="w-full rounded bg-brand-600 transition-[height] duration-150"
                style={{ height: `${progress * 100}%` }}
              />
            </div>
            {steps.map((s, i) => (
              <div
                key={s.title}
                className={`relative py-3 transition-opacity duration-300 ${i === active ? 'opacity-100' : 'opacity-40'}`}
              >
                <span
                  className={[
                    'absolute -left-9 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold transition-colors duration-300',
                    i === active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : i < active
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-slate-200 bg-slate-50 text-slate-400',
                  ].join(' ')}
                >
                  {i + 1}
                </span>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">{s.title}</h3>
                <p className="mt-1 max-w-md text-[15px] text-slate-500">{s.text}</p>
              </div>
            ))}
          </div>

          {/* Рамка на браузър с мини-екраните */}
          <div
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(49,46,129,0.25),0_4px_14px_-8px_rgba(49,46,129,0.12)]"
            role="img"
            aria-label={t('landing.demoAria')}
          >
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <i className="block h-2.5 w-2.5 rounded-full bg-slate-200" />
                <i className="block h-2.5 w-2.5 rounded-full bg-slate-200" />
                <i className="block h-2.5 w-2.5 rounded-full bg-slate-200" />
              </span>
              <span className="mx-auto flex max-w-[260px] flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1.5 font-mono text-xs text-slate-500">
                <svg className="h-2.5 w-2.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 11h14v10H5V11z" />
                </svg>
                pdf-easy.online
              </span>
            </div>

            <div className="relative h-[clamp(340px,52vh,520px)] bg-slate-100">
              {[<Panel1 key={0} />, <Panel2 key={1} active={active === 1} />, <Panel3 key={2} />, <Panel4 key={3} />, <Panel5 key={4} />].map(
                (panel, i) => (
                  <div
                    key={i}
                    className={[
                      'absolute inset-0 flex flex-col justify-center gap-3 p-5 transition-all duration-500 motion-reduce:transition-none sm:p-7',
                      i === active
                        ? 'translate-y-0 opacity-100'
                        : i < active
                          ? 'pointer-events-none -translate-y-6 opacity-0'
                          : 'pointer-events-none translate-y-6 opacity-0',
                    ].join(' ')}
                  >
                    {panel}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Активна стъпка + индикатор (mobile) */}
          <div className="md:hidden">
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{steps[active].title}</h3>
            <p className="mt-1 text-sm text-slate-500">{steps[active].text}</p>
            <div className="mt-3.5 flex gap-1.5" aria-hidden="true">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-brand-600' : 'w-2 bg-slate-200'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Мини-UI екрани (пресъздават изгледа на приложението) ────────────────────

function Panel1() {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex justify-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`block h-1 w-8 rounded ${i === 0 ? 'bg-brand-600' : 'bg-slate-200'}`} />
        ))}
      </div>
      <div className="rounded-xl border-2 border-dashed border-brand-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
        <svg className="mx-auto mb-2.5 h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <strong className="mb-0.5 block text-[15px] text-slate-900">{t('landing.p1Drop')}</strong>
        {t('landing.p1Or')}
      </div>
      <div className="text-center">
        <MiniBtn ghost>{t('landing.p1Choose')}</MiniBtn>
      </div>
    </>
  );
}

function Panel2({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
        {t('landing.p2Page')}
        <span className="flex gap-1.5">
          <MiniBtn ghost small>{t('viewer.prev')}</MiniBtn>
          <MiniBtn ghost small>{t('viewer.next')}</MiniBtn>
        </span>
      </div>
      <MiniDoc>
        <DocLine w="w-3/5" /> <DocLine w="w-[85%]" /> <DocLine w="w-[72%]" /> <DocLine w="w-[85%]" /> <DocLine w="w-2/5" />
        <div
          className={`relative mt-3.5 flex h-16 items-center justify-center rounded-md border-2 border-dashed border-brand-600 bg-brand-600/5 text-[11px] font-semibold text-brand-800 ${active ? 'landing-rect-in' : ''}`}
        >
          {(['-top-[5px] -left-[5px]', '-top-[5px] -right-[5px]', '-bottom-[5px] -left-[5px]', '-bottom-[5px] -right-[5px]'] as const).map((pos) => (
            <i key={pos} className={`absolute h-2 w-2 rounded-sm border-2 border-brand-600 bg-white ${pos}`} />
          ))}
          {t('landing.p2Zone')}
        </div>
      </MiniDoc>
      <p className="m-0 text-center text-xs text-emerald-600">{t('viewer.zoneSelected')}</p>
    </>
  );
}

function Panel3() {
  const { t } = useTranslation();
  return (
    <>
      <MiniCard title={t('landing.p3Title')}>
        <CfgRow checked>{t('landing.p3Name')}</CfgRow>
        <CfgRow checked>{t('landing.p3Date')}</CfgRow>
        <CfgRow>{t('landing.p3Reason')}</CfgRow>
      </MiniCard>
      <MiniDoc narrow>
        <DocLine w="w-[85%]" /> <DocLine w="w-3/5" />
        <SigFill />
      </MiniDoc>
    </>
  );
}

function Panel4() {
  const { t } = useTranslation();
  return (
    <>
      <MiniCard title={t('signing.methodTitle')}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2.5 rounded-lg border-2 border-brand-600 bg-brand-50 px-3.5 py-3 text-sm">
            <span>
              {t('signing.physicalTitle')}
              <small className="block text-xs text-slate-500">{t('landing.p4M1s')}</small>
            </span>
            <span className="rounded-full bg-brand-100 px-2 py-1 text-[10px] font-semibold text-brand-800">
              {t('signing.physicalBadge')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2.5 rounded-lg border-2 border-slate-200 bg-white px-3.5 py-3 text-sm opacity-55">
            <span>
              {t('landing.p4M2')}
              <small className="block text-xs text-slate-500">Evrotrust / B-Trust</small>
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
              {t('signing.cloudBadge')}
            </span>
          </div>
        </div>
      </MiniCard>
      <div className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-800">
        <Spinner size="sm" />
        {t('landing.p4Status')}
      </div>
    </>
  );
}

function Panel5() {
  const { t } = useTranslation();
  return (
    <>
      <MiniCard>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span>
            <span className="block text-base font-semibold text-slate-900">{t('download.title')}</span>
            <span className="block text-[13px] text-slate-500">{t('landing.p5File')}</span>
          </span>
        </div>
      </MiniCard>
      <MiniDoc narrow>
        <DocLine w="w-3/5" /> <DocLine w="w-[85%]" /> <DocLine w="w-2/5" />
        <SigFill signed />
      </MiniDoc>
      <div className="text-center">
        <MiniBtn>{t('landing.p5Dl')}</MiniBtn>
      </div>
    </>
  );
}

// ─── Мини-UI примитиви ────────────────────────────────────────────────────────

function MiniBtn({ children, ghost, small }: { children: React.ReactNode; ghost?: boolean; small?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        small ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2.5 text-[13px]',
        ghost ? 'border border-slate-200 bg-white text-slate-900' : 'bg-brand-600 text-white',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function MiniCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {title && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      )}
      {children}
    </div>
  );
}

function MiniDoc({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div
      className={`mx-auto rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-[0_6px_18px_-10px_rgba(49,46,129,0.18)] ${narrow ? 'w-[min(300px,86%)]' : 'w-[min(330px,88%)]'}`}
    >
      {children}
    </div>
  );
}

function DocLine({ w }: { w: string }) {
  return <div className={`mb-2 h-[7px] rounded ${w} bg-slate-200/80`} />;
}

function CfgRow({ checked, children }: { checked?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 py-1.5 text-[13px] text-slate-700 last:border-b-0">
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${checked ? 'bg-brand-600 text-white' : 'border-[1.5px] border-slate-300 bg-white'}`}
      >
        {checked && (
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {children}
    </div>
  );
}

/** Подписът в демото е нарочно на английски — както изглежда в реалния PDF. */
function SigFill({ signed }: { signed?: boolean }) {
  return (
    <div
      className={`mt-3.5 rounded-md border px-3.5 py-2.5 ${signed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="font-mono text-[10px] font-semibold text-slate-500">Digitally signed by:</div>
      <div className={`text-[17px] font-semibold italic ${signed ? 'text-emerald-600' : 'text-brand-800'}`}>
        Your Name
      </div>
      <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">Date: 2026.07.07 14:32:05 +03&apos;00&apos;</div>
    </div>
  );
}

// ─── Защо / финален CTA ───────────────────────────────────────────────────────

function WhySection() {
  const { t } = useTranslation();
  return (
    <section className="grid grid-cols-1 gap-8 py-24 md:grid-cols-3 md:gap-12">
      {[1, 2, 3].map((n) => (
        <div key={n} className="border-t-2 border-slate-900 pt-4">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-800">
            {t(`landing.why${n}k`)}
          </span>
          <h3 className="mb-2 mt-2.5 text-xl font-bold tracking-tight text-slate-900">{t(`landing.why${n}h`)}</h3>
          <p className="text-[15px] text-slate-500">{t(`landing.why${n}p`)}</p>
        </div>
      ))}
    </section>
  );
}

function FinalCta({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="pb-20">
      <div className="flex flex-wrap items-center justify-between gap-7 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 p-10 text-white sm:p-14">
        <div>
          <h2 className="mb-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('landing.cta2h')}</h2>
          <p className="text-white/85">{t('landing.cta2p')}</p>
        </div>
        <button
          onClick={onStart}
          className="rounded-lg bg-white px-6 py-3 text-[15px] font-semibold text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700"
        >
          {t('landing.ctaSign')}
        </button>
      </div>
    </section>
  );
}
