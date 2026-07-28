/// <reference types="vite/client" />

/**
 * Версията от `helper-agent/package.json`, инжектирана при билд от
 * `vite.config.ts` (define). Използва се в `lib/detectOS.ts`.
 */
declare const __HELPER_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy key name (older Supabase projects) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
