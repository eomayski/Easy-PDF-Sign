import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'login' | 'register';

export function AuthModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    resetMessages();
    setBusy(true);
    try {
      if (tab === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        // useSupabaseSession picks up SIGNED_IN and loads /auth/me
        onClose();
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          // Email confirmation disabled — logged in straight away
          onClose();
        } else {
          setInfo('Изпратихме ви имейл за потвърждение. Отворете връзката в него, за да активирате акаунта си.');
        }
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    resetMessages();
    setBusy(true);
    try {
      // Redirects the whole page to Google and back; the signing flow is
      // preserved via sessionStorage (see lib/flowPersistence.ts).
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (err) throw err;
    } catch (err) {
      setError(translateAuthError(err));
      setBusy(false);
    }
  };

  const handleForgottenPassword = async () => {
    if (!supabase) return;
    resetMessages();
    if (!email) {
      setError('Въведете имейл адреса си, за да изпратим връзка за нова парола.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email);
      if (err) throw err;
      setInfo('Изпратихме ви имейл с връзка за смяна на паролата.');
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={tab === 'login' ? 'Вход' : 'Регистрация'} maxWidth="sm">
      {!isSupabaseConfigured ? (
        <p className="text-sm text-slate-500">
          Входът не е конфигуриран (липсват VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
        </p>
      ) : (
        <div>
          {/* Tabs */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ['login', 'Вход'],
                ['register', 'Регистрация'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  resetMessages();
                }}
                className={[
                  'rounded-lg py-2 text-sm font-medium transition-colors',
                  tab === value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'register' && (
            <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              Новите акаунти получават <strong>5 безплатни кредита</strong> за изтегляне на
              подписани документи.
            </p>
          )}

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Продължи с Google
          </button>

          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            или с имейл
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-slate-700">
                Имейл
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
                Парола
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            {info && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {info}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              {tab === 'login' ? 'Влез' : 'Регистрирай се'}
            </Button>
          </form>

          {tab === 'login' && (
            <button
              type="button"
              onClick={handleForgottenPassword}
              disabled={busy}
              className="mt-3 text-sm text-slate-500 underline hover:text-slate-700"
            >
              Забравена парола?
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

function translateAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('Invalid login credentials')) return 'Грешен имейл или парола.';
  if (msg.includes('already registered')) return 'Този имейл вече е регистриран.';
  if (msg.includes('Password should be')) return 'Паролата трябва да е поне 6 символа.';
  if (msg.includes('Email not confirmed'))
    return 'Имейлът не е потвърден — проверете пощата си за връзката за потвърждение.';
  if (msg.includes('rate limit') || msg.includes('Too many'))
    return 'Твърде много опити — изчакайте малко и опитайте отново.';
  return msg || 'Възникна грешка. Опитайте отново.';
}
