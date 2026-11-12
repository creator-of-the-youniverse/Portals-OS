/**
 * @file Club Youniverse — Supabase client for Portals-OS integration.
 * Uses separate env vars (VITE_CLUB_SUPABASE_URL / VITE_CLUB_SUPABASE_ANON_KEY)
 * so it doesn't conflict with Portals-OS's own Supabase instance.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Canonical Club Youniverse production backend
const DEFAULT_URL = "https://ktfezfnkghtwbkmhxdyd.supabase.co";
const DEFAULT_KEY = "sb_publishable_Cpca6J3OdRz7czjQJN-KeQ_RNFc9QQU";

const RAW_URL = (import.meta.env.VITE_CLUB_SUPABASE_URL as string | undefined)?.trim();
const RAW_KEY = (import.meta.env.VITE_CLUB_SUPABASE_ANON_KEY as string | undefined)?.trim();

const SUPABASE_URL = RAW_URL || DEFAULT_URL;
const SUPABASE_ANON_KEY = RAW_KEY || DEFAULT_KEY;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return (
    value.includes("placeholder") ||
    value.includes("your-club-project") ||
    value.includes("your-club-anon-key")
  );
}

export const isClubConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !isPlaceholder(SUPABASE_URL) &&
  !isPlaceholder(SUPABASE_ANON_KEY)
);

if (!isClubConfigured) {
  console.info(
    "[Club Youniverse] Club Radio backend is in standby (missing or placeholder VITE_CLUB_SUPABASE_URL / VITE_CLUB_SUPABASE_ANON_KEY)."
  );
}

export const clubSupabase: SupabaseClient | null = isClubConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
