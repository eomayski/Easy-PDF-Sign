import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import uploadReducer from '../features/upload/uploadSlice';
import signingReducer from '../features/signing/signingSlice';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    upload: uploadReducer,
    signing: signingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
