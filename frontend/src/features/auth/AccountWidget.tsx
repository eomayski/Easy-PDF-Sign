import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';

interface Props {
  onLoginClick: () => void;
}

export function AccountWidget({ onLoginClick }: Props) {
  const { user, sessionChecked } = useSelector((s: RootState) => s.auth);

  if (!sessionChecked) return null;

  if (!user) {
    return (
      <Button variant="secondary" size="sm" onClick={onLoginClick}>
        Вход
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-slate-600 sm:block">{user.email}</span>
      <span
        className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
        title="Налични кредити за изтегляне"
      >
        {user.accountType === 'business' ? 'Business' : `Кредити: ${user.credits}`}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void supabase?.auth.signOut();
        }}
      >
        Изход
      </Button>
    </div>
  );
}
