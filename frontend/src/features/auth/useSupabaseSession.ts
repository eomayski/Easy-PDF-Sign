import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { api } from '../../store/api';
import { supabase } from '../../lib/supabase';
import { clearAuth, setAuthSyncing, setAuthUser } from './authSlice';

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
        event === 'USER_UPDATED'
      ) {
        if (session) {
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
