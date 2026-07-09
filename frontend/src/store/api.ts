import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { supabase } from '../lib/supabase';
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

export interface MeResponse {
  userId: string;
  email: string;
  accountType: 'free' | 'business';
  credits: number;
}

export interface RequestDownloadResponse {
  downloadToken: string;
  creditsRemaining: number;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: async (headers) => {
      if (!supabase) return headers;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set('authorization', `Bearer ${token}`);
      return headers;
    },
  }),
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
        signerName?: string;
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
    getMe: builder.query<MeResponse, void>({
      query: () => '/auth/me',
    }),
    requestDownload: builder.mutation<RequestDownloadResponse, { jobId: string }>({
      query: (body) => ({
        url: '/download/request',
        method: 'POST',
        body,
      }),
    }),
    // Billing (Stripe) — всички връщат URL за пълен redirect към hosted страница
    purchaseCredits: builder.mutation<{ checkoutUrl: string }, { returnPath?: string }>({
      query: (body) => ({
        url: '/credits/purchase',
        method: 'POST',
        body,
      }),
    }),
    subscribeBusiness: builder.mutation<{ checkoutUrl: string }, { returnPath?: string }>({
      query: (body) => ({
        url: '/billing/subscribe',
        method: 'POST',
        body,
      }),
    }),
    billingPortal: builder.mutation<{ portalUrl: string }, { returnPath?: string }>({
      query: (body) => ({
        url: '/billing/portal',
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
  useGetMeQuery,
  useRequestDownloadMutation,
  usePurchaseCreditsMutation,
  useSubscribeBusinessMutation,
  useBillingPortalMutation,
} = api;
