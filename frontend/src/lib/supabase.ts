import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Трябва да се изпълни ПРЕДИ createClient — клиентът изчиства recovery токена от URL-а.
import './recovery';

const url = import.meta.env.VITE_SUPABASE_URL;
// New Supabase projects issue "publishable" keys (sb_publishable_...);
// VITE_SUPABASE_ANON_KEY is the legacy fallback. Both are safe to expose.
const publicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when the env vars are missing (e.g. fresh clone without .env.local) —
// the app still runs, but login is unavailable and downloads stay gated.
export const supabase: SupabaseClient | null =
  url && publicKey ? createClient(url, publicKey) : null;

export const isSupabaseConfigured = supabase !== null;
