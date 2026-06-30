import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { PdfRect, VisualSignatureConfig, SigningMethod } from '../types';

export interface UploadResponse {
  jobId: string;
  numPages: number;
}

export interface PrepareSignResponse {
  jobId: string;
  byteRangeHash?: string;
}

export interface CompleteSignResponse {
  jobId: string;
  status: string;
}

export interface ConfirmAdViewResponse {
  downloadToken: string;
}

export interface AdReward {
  provider: string;
  adSessionId: string;
  signalToken?: string;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (builder) => ({
    uploadPdf: builder.mutation<UploadResponse, FormData>({
      query: (formData) => ({
        url: '/upload',
        method: 'POST',
        body: formData,
      }),
    }),
    prepareSign: builder.mutation<
      PrepareSignResponse,
      {
        jobId: string;
        page: number;
        pdfRect: PdfRect;
        visualConfig: VisualSignatureConfig;
        method: SigningMethod;
      }
    >({
      query: (body) => ({
        url: '/sign/prepare',
        method: 'POST',
        body,
      }),
    }),
    completeSign: builder.mutation<CompleteSignResponse, { jobId: string; cms: string }>({
      query: (body) => ({
        url: '/sign/complete',
        method: 'POST',
        body,
      }),
    }),
    pollJob: builder.query<{ status: string; ready: boolean }, string>({
      query: (jobId) => `/jobs/${jobId}`,
    }),
    confirmAdView: builder.mutation<ConfirmAdViewResponse, { jobId: string; reward: AdReward }>({
      query: (body) => ({
        url: '/ads/confirm-view',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useUploadPdfMutation,
  usePrepareSignMutation,
  useCompleteSignMutation,
  usePollJobQuery,
  useConfirmAdViewMutation,
} = api;
