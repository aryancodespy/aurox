import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
  Replace these values with your real Supabase project credentials.
  On Netlify, a simple beginner-friendly option is to generate this file with
  your project URL and publishable anon key before deploy.
*/
export const SUPABASE_URL = "https://iegktbmpuvtyzmyjysrs.supabase.co/";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZ2t0Ym1wdXZ0eXpteWp5c3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDI1MjAsImV4cCI6MjA5NjQxODUyMH0.UBjUEV3ugXIDcYRd2FwiMbqIE0Fpn0SD3ZcXoARCuHY";
export const SUPABASE_STORAGE_BUCKET = "product-images";

export const SUPABASE_ENABLED =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  SUPABASE_URL.indexOf("YOUR_PROJECT_ID") === -1 &&
  SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;

export const supabase = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

export function getSupabaseClient() {
  return supabase;
}

export function ensureSupabaseConfig() {
  return SUPABASE_ENABLED;
}
