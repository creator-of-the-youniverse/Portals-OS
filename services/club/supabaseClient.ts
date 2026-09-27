/**
 * @file Club Youniverse — Supabase client for Portals-OS integration.
 * Uses separate env vars (VITE_CLUB_SUPABASE_URL / VITE_CLUB_SUPABASE_ANON_KEY)
 * so it doesn't conflict with Portals-OS's own Supabase instance.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_CLUB_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_CLUB_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Club Youniverse] Missing VITE_CLUB_SUPABASE_URL or VITE_CLUB_SUPABASE_ANON_KEY. " +
    "Add them to .env.local to enable live radio sync."
  );
}

export const clubSupabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-key"
);
