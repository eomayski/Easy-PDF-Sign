import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MeResponse } from '../../store/api';

interface AuthState {
  /** null = не е логнат (или сесията още не е проверена — виж sessionChecked) */
  user: MeResponse | null;
  /** true след първоначалната проверка на Supabase сесията при зареждане */
  sessionChecked: boolean;
}

const initialState: AuthState = {
  user: null,
  sessionChecked: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthUser(state, action: PayloadAction<MeResponse>) {
      state.user = action.payload;
      state.sessionChecked = true;
    },
    setCredits(state, action: PayloadAction<number>) {
      if (state.user) state.user.credits = action.payload;
    },
    clearAuth(state) {
      state.user = null;
      state.sessionChecked = true;
    },
  },
});

export const { setAuthUser, setCredits, clearAuth } = authSlice.actions;
export default authSlice.reducer;
