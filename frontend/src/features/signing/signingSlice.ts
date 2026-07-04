import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SigningMethod } from '../../types';

type SigningStatus = 'idle' | 'preparing' | 'awaiting-agent' | 'completing' | 'done' | 'error';

interface SigningState {
  method: SigningMethod;
  status: SigningStatus;
  byteRangeHash: string | null;
  errorMessage: string | null;
}

const initialState: SigningState = {
  method: 'mock',
  status: 'idle',
  byteRangeHash: null,
  errorMessage: null,
};

const signingSlice = createSlice({
  name: 'signing',
  initialState,
  reducers: {
    setMethod(state, action: PayloadAction<SigningMethod>) {
      state.method = action.payload;
    },
    setStatus(state, action: PayloadAction<SigningStatus>) {
      state.status = action.payload;
    },
    setByteRangeHash(state, action: PayloadAction<string>) {
      state.byteRangeHash = action.payload;
    },
    setError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.errorMessage = action.payload;
    },
    reset() {
      return initialState;
    },
  },
});

export const { setMethod, setStatus, setByteRangeHash, setError, reset } =
  signingSlice.actions;
export default signingSlice.reducer;
