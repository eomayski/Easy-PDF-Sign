import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MeResponse } from '../../store/api';

interface AuthState {
  /** null = не е логнат (или сесията още не е проверена — виж sessionChecked) */
  user: MeResponse | null;
  /** true след първоначалната проверка на Supabase сесията при зареждане */
  sessionChecked: boolean;
  /** true докато тече вход: Supabase сесия има, но /auth/me още не е отговорил */
  syncing: boolean;
  /** true когато потребителят е дошъл от линк за нова парола — отваря AuthModal в режим „reset“ */
  passwordRecovery: boolean;
  /** true само ако акаунтът има email/парола identity (Google-only акаунтите нямат парола) */
  hasPasswordIdentity: boolean;
}

const initialState: AuthState = {
  user: null,
  sessionChecked: false,
  syncing: false,
  passwordRecovery: false,
  hasPasswordIdentity: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthUser(state, action: PayloadAction<MeResponse>) {
      state.user = action.payload;
      state.sessionChecked = true;
      state.syncing = false;
    },
    setCredits(state, action: PayloadAction<number>) {
      if (state.user) state.user.credits = action.payload;
    },
    setAuthSyncing(state, action: PayloadAction<boolean>) {
      // Само докато още няма зареден user (вход/начална сесия) — периодичният
      // token refresh не бива да мига UI-а с „Влизане…“.
      state.syncing = action.payload && !state.user;
    },
    startPasswordRecovery(state) {
      state.passwordRecovery = true;
    },
    endPasswordRecovery(state) {
      state.passwordRecovery = false;
    },
    setHasPasswordIdentity(state, action: PayloadAction<boolean>) {
      state.hasPasswordIdentity = action.payload;
    },
    clearAuth(state) {
      state.user = null;
      state.sessionChecked = true;
      state.syncing = false;
      state.passwordRecovery = false;
      state.hasPasswordIdentity = false;
    },
  },
});

export const {
  setAuthUser,
  setCredits,
  setAuthSyncing,
  startPasswordRecovery,
  endPasswordRecovery,
  setHasPasswordIdentity,
  clearAuth,
} = authSlice.actions;
export default authSlice.reducer;
