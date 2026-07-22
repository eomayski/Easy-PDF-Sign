import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { api } from '../../store/api';
import { supabase } from '../../lib/supabase';
import { consumeRecoveryFlag } from '../../lib/recovery';
import {
  clearAuth,
  setAuthSyncing,
  setAuthUser,
  setHasPasswordIdentity,
  startPasswordRecovery,
} from './authSlice';
import type { User } from '@supabase/supabase-js';

/**
 * true, ако акаунтът има email/парола identity. Google-only акаунтите нямат —
 * на тях не показваме „Смяна на парола“.
 */
function hasEmailIdentity(user: User): boolean {
  if (user.identities?.length) {
    return user.identities.some((i) => i.provider === 'email');
  }
  const providers = user.app_metadata?.providers as string[] | undefined;
  return providers?.includes('email') ?? user.app_metadata?.provider === 'email';
}

/**
 * Keeps the auth slice in sync with the Supabase session: on app start and on
 * every sign-in / token refresh, fetches GET /auth/me (which also provisions
 * the user + signup bonus server-side) and stores the result.
 */
export function useSupabaseSession() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!supabase) {
      dispatch(clearAuth());
      return;
    }

    let active = true;

    const syncMe = async () => {
      dispatch(setAuthSyncing(true));
      try {
        const me = await dispatch(
          api.endpoints.getMe.initiate(undefined, { forceRefetch: true }),
        ).unwrap();
        if (active) dispatch(setAuthUser(me));
      } catch {
        if (active) dispatch(clearAuth());
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        dispatch(clearAuth());
        return;
      }
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY'
      ) {
        if (session) {
          // PASSWORD_RECOVERY се емитира само при implicit линкове; при PKCE
          // идва SIGNED_IN, затова разчитаме и на URL-а. Флагът се консумира
          // винаги (преди ||), за да не „преживее“ до следващ вход в същия таб.
          const fromLink = consumeRecoveryFlag();
          if (fromLink || event === 'PASSWORD_RECOVERY') {
            dispatch(startPasswordRecovery());
          }
          dispatch(setHasPasswordIdentity(hasEmailIdentity(session.user)));
          void syncMe();
        } else {
          dispatch(clearAuth());
        }
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [dispatch]);
}
