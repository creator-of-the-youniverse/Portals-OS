/**
 * @file Core TypeScript types for Club Youniverse — used in Portals-OS integration.
 */

import type { Session } from "@supabase/supabase-js";

// --- Auth ---
export type { Session };


export type UserRole = 'owner' | 'admin' | 'bouncer' | 'vip' | 'user' | 'guest';

export interface Profile {
  user_id: string;
  name: string;
  email?: string;
  role?: UserRole;
  tagline?: string;
  bio?: string;
  website_url?: string;
  twitter_handle?: string;
  is_premium: boolean;
  is_artist: boolean;
  is_admin?: boolean;
  is_first_100?: boolean;
  stripe_customer_id?: string;
  current_streak?: number;
  last_streak_update?: string;
  avatar_url?: string;
  phone_number?: string;
  roast_consent: boolean;
  created_at: string;
  updated_at: string;
  last_debut_at?: string | null;
  stats?: {
    plays: number;
    uploads: number;
    votes_cast: number;
    graveyard_count: number;
  };
}

// --- Core Data Models ---

export interface Song {
  id: string;
  uploaderId: string;
  title: string;
  artistName: string;
  source: "suno" | "producer.ai" | "mubert" | "upload";
  audioUrl: string;
  durationSec: number;
  genre?: string;
  stars: number;
  liveStarsSum: number;
  liveStarsCount: number;
  isDsw: boolean;
  boxRoundsSeen: number;
  boxRoundsLost: number;
  boxAppearanceCount: number;
  status: "pool" | "in_box" | "next_play" | "now_playing" | "graveyard" | "debut";
  coverArtUrl?: string;
  is_canvas?: boolean;
  lyrics?: string | ChoreographedLine[];
  playCount: number;
  upvotes: number;
  downvotes: number;
  lastPlayedAt: string;
  sunoUrl?: string;
  downloadUrl?: string;
  userRating?: number;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  isPremium: boolean;
  phoneNumber?: string;
}

export interface BoxRound {
  id: string;
  candidates: Song[];
  startedAt: string;
}

export interface ChatMessage {
  id: string;
  user: {
    name: string;
    isDj?: boolean;
    isAdmin?: boolean;
  };
  text: string;
  timestamp: number;
}

export interface SiteControlCommand {
  type: "change_theme" | "trigger_fx" | "force_reboot" | "update_component";
  payload: any;
}

// --- App State & Navigation ---
//export type AppState = 'HOME' | 'CLUB' | 'DJ_BOOTH' | 'PROFILE';
export type View = 'sidewalk' | 'home' | 'club' | 'dj-booth' | 'radio' | 'profile';

export type RadioState =
  | "POOL"
  | "THE_BOX"
  | "BOX_WIN"
  | "NEXT_PLAY"
  | "NOW_PLAYING"
  | "DJ_TALKING"
  | "REBOOT"
  | "IDLE";

// --- UI & Settings ---
export type ThemeName = "dark" | "light" | "gradient1" | "gradient2";

export interface Settings {
  theme: ThemeName;
  customCardBackground: string | null;
  defaultAspectRatio?: string;
  defaultStyleKeywords?: string;
}

export interface DjProfile {
  name: string;
  personality: string;
  voiceName: string;
}

export enum AnimationType {
  FADE = 'fade',
  SLIDE = 'slide',
  BOUNCE = 'bounce',
  TYPEWRITER = 'typewriter',
  EXPOSE = 'expose',
  GLITCH = 'glitch',
  EXPLODE = 'explode',
  SHAKE = 'shake'
}

export interface ChoreographedLine {
  id: string;
  time: number;
  text: string;
  meta: {
    color: string;
    animation: AnimationType;
    scale: number;
    rotation: number;
    fontFamily?: 'sans' | 'marker' | 'tech';
    sentiment?: 'bright' | 'energetic' | 'calm' | 'dark';
    secondaryText?: string;
  };
}

export interface DjBanterScriptInput {
  event: string;
  song?: {
    finalRating?: number;
    title?: string;
    artistName?: string;
  };
  djProfile?: {
    name?: string;
  };
}
