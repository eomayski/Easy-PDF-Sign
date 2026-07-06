import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MeResponse } from '../../store/api';

interface AuthState {
  /** null = не е логнат (или сесията още не е проверена — виж sessionChecked) */
  user: MeResponse | null;
  /** true след първоначалната проверка на Supabase сесията при зареждане */
  sessionChecked: boolean;
  /** true докато тече вход: Supabase сесия има, но /auth/me още не е отговорил */
  syncing: boolean;
}

const initialState: AuthState = {
  user: null,
  sessionChecked: false,
  syncing: false,
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
    clearAuth(state) {
      state.user = null;
      state.sessionChecked = true;
      state.syncing = false;
    },
  },
});

export const { setAuthUser, setCredits, setAuthSyncing, clearAuth } = authSlice.actions;
export default authSlice.reducer;
