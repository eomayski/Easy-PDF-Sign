import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import uploadReducer from '../features/upload/uploadSlice';
import signingReducer from '../features/signing/signingSlice';
import authReducer from '../features/auth/authSlice';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    upload: uploadReducer,
    signing: signingReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
