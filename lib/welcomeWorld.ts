/**
 * @file welcomeWorld
 *
 * Pure logic for @welcome — the Foundational World.
 * @welcome is not a signup service; it is a Youniverse with system
 * permissions. Everything here is deterministic and framework-free.
 */

import { YOUNIVERSE_ROOT_DOMAIN } from "./youniverseRouting";

export const WELCOME_HANDLE = "welcome";

/** Handles that resolve to system Youniverses (never personally claimable). */
export const SYSTEM_HANDLES = new Set([WELCOME_HANDLE]);

export const THESIS = {
  primary: "The web shouldn't just record that you logged in.",
  secondary: "It should recognize that you exist.",
};

/** Ambient micro-text that drifts through the scenery. */
export const AMBIENT_WHISPERS = [
  "every room here was built for exactly one person",
  "you are not a session. you are a presence.",
  "the door remembers who walked through it",
  "one address. one of one.",
  "this is the living room of the network",
  "existence is the only credential that matters",
];

// ─────────────────────────────────────────────────────────────
// Address resolution
// ─────────────────────────────────────────────────────────────

export function isDevHost(hostname = window.location.hostname): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".vercel.app")
  );
}

/** Absolute URL for any Youniverse — @welcome included. */
export function youniverseUrl(
  handle: string,
  opts: { query?: Record<string, string>; hash?: string } = {}
): string {
  const params = new URLSearchParams(opts.query);
  let base: string;

  if (isDevHost()) {
    // Dev: @welcome is the bare origin; personal rooms use ?@=handle.
    if (handle !== WELCOME_HANDLE) params.set("@", handle);
    base = `${window.location.origin}/`;
  } else {
    base = `https://${handle}.${YOUNIVERSE_ROOT_DOMAIN}/`;
  }

  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ""}${opts.hash ? `#${opts.hash}` : ""}`;
}

export const welcomeUrl = () => youniverseUrl(WELCOME_HANDLE);

// ─────────────────────────────────────────────────────────────
// Stage I — Threshold Signal: the energy of a handle
// ─────────────────────────────────────────────────────────────

export interface HandleEnergy {
  hue: number;      // primary atmospheric hue 0–359
  hue2: number;     // companion hue
  seed: number;     // stable 32-bit seed for procedural scenery
  tempo: number;    // 0.6–1.4 — how fast the room breathes
}

/** FNV-1a 32-bit — tiny, stable, well-distributed. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function handleEnergy(handle: string): HandleEnergy {
  const seed = fnv1a(handle.toLowerCase());
  const hue = seed % 360;
  const hue2 = (hue + 35 + ((seed >>> 9) % 90)) % 360;
  const tempo = 0.6 + ((seed >>> 17) % 80) / 100;
  return { hue, hue2, seed, tempo };
}

/** The resting tone of @welcome itself before any name is spoken. */
export const WELCOME_ENERGY: HandleEnergy = { hue: 258, hue2: 196, seed: 1, tempo: 1 };

// ─────────────────────────────────────────────────────────────
// Stage II — Foundation Values: the laws of a personal universe
// ─────────────────────────────────────────────────────────────

export type FoundationLawId =
  | "open" | "private" | "creative" | "minimal"
  | "curious" | "builder" | "playful" | "quiet";

export interface FoundationLaw {
  id: FoundationLawId;
  label: string;
  glyph: string;
  whisper: string;
  conflicts?: FoundationLawId[];
}

export const FOUNDATION_LAWS: FoundationLaw[] = [
  { id: "open",     label: "Open",     glyph: "◯", whisper: "your doors face the street",       conflicts: ["private"] },
  { id: "private",  label: "Private",  glyph: "◐", whisper: "your doors open only from inside", conflicts: ["open"] },
  { id: "creative", label: "Creative", glyph: "✦", whisper: "the walls are for painting" },
  { id: "minimal",  label: "Minimal",  glyph: "—", whisper: "nothing here without a reason",    conflicts: ["playful"] },
  { id: "curious",  label: "Curious",  glyph: "?", whisper: "every corner leads somewhere" },
  { id: "builder",  label: "Builder",  glyph: "△", whisper: "tools within reach, always" },
  { id: "playful",  label: "Playful",  glyph: "∿", whisper: "gravity is optional",              conflicts: ["minimal"] },
  { id: "quiet",    label: "Quiet",    glyph: "·", whisper: "the room speaks only when asked" },
];

export const MAX_LAWS = 3;

/** Toggle a law, resolving conflicts and the max-3 rule. */
export function toggleLaw(current: FoundationLawId[], id: FoundationLawId): FoundationLawId[] {
  if (current.includes(id)) return current.filter((l) => l !== id);
  const law = FOUNDATION_LAWS.find((l) => l.id === id);
  const withoutConflicts = current.filter((l) => !law?.conflicts?.includes(l));
  if (withoutConflicts.length >= MAX_LAWS) return withoutConflicts;
  return [...withoutConflicts, id];
}

/** The secret initial configuration a personal Youniverse boots with. */
export interface YouniverseFoundationConfig {
  laws: FoundationLawId[];
  hue: number;
  visibility: "public" | "private";
  density: "sparse" | "balanced" | "rich";
  motion: "still" | "calm" | "lively";
  ambient: "silence" | "low" | "radio";
  greeting: "whisper" | "warm" | "bold";
  pinnedApps: string[];
}

export function foundationToConfig(laws: FoundationLawId[], hue: number): YouniverseFoundationConfig {
  const has = (l: FoundationLawId) => laws.includes(l);
  const pinned = new Set<string>();
  // Ids map to apps.config.ts registry entries.
  if (has("creative")) { pinned.add("weaver"); pinned.add("omniedia"); }
  if (has("builder")) { pinned.add("weaver"); pinned.add("terminal"); pinned.add("fileManager"); }
  if (has("curious")) { pinned.add("browser"); pinned.add("oracle"); }
  if (has("open")) pinned.add("messages");
  if (has("playful")) pinned.add("clubYouniverse");
  if (has("minimal") || has("quiet")) pinned.add("markdownEditor");

  return {
    laws,
    hue,
    visibility: has("open") ? "public" : "private",
    density: has("minimal") ? "sparse" : has("builder") || has("creative") ? "rich" : "balanced",
    motion: has("quiet") || has("minimal") ? "still" : has("playful") ? "lively" : "calm",
    ambient: has("quiet") ? "silence" : has("playful") || has("creative") ? "radio" : "low",
    greeting: has("quiet") || has("private") ? "whisper" : has("playful") ? "bold" : "warm",
    pinnedApps: [...pinned],
  };
}

// ─────────────────────────────────────────────────────────────
// Stage III → One-of-One Transition: arrival payload
// Carried in the URL fragment (never sent to any server).
// ─────────────────────────────────────────────────────────────

export interface ArrivalPayload {
  handle: string;
  laws: FoundationLawId[];
  hue: number;
  forgedAt: string;
  handoffToken?: string;
  redirectUrl?: string;
}

export const ARRIVAL_HASH_KEY = "arrival";

export function encodeArrival(p: ArrivalPayload): string {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(p))));
  return `${ARRIVAL_HASH_KEY}=${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function decodeArrival(hash: string): ArrivalPayload | null {
  const match = hash.replace(/^#/, "").match(new RegExp(`(?:^|&)${ARRIVAL_HASH_KEY}=([^&]+)`));
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b64 + "===".slice((b64.length + 3) % 4))));
    const p = JSON.parse(json);
    if (typeof p?.handle !== "string" || typeof p?.hue !== "number" || !Array.isArray(p?.laws)) return null;
    return p as ArrivalPayload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Local memory
// ─────────────────────────────────────────────────────────────

export const STORAGE = {
  activeHandle: "active_youniverse_handle",
  visitorId: "welcome_visitor_id",
  foundation: (handle: string) => `youniverse_foundation_${handle}`,
  arrived: (handle: string) => `youniverse_arrived_${handle}`,
};

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(STORAGE.visitorId);
    if (!id) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(STORAGE.visitorId, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function loadFoundation(handle: string): YouniverseFoundationConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE.foundation(handle));
    return raw ? (JSON.parse(raw) as YouniverseFoundationConfig) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Global seasonal themes — the whole network shares one sky
// ─────────────────────────────────────────────────────────────

export interface SeasonalMoment {
  id: string;
  label: string;
  line: string;
  hueShift: number;     // nudges the communal atmosphere
  isCelebration: boolean;
}

const TURNINGS = [
  { month: 2, day: 20, id: "vernal",  label: "Vernal Equinox",  line: "light and dark stand equal — the network leans toward spring" },
  { month: 5, day: 21, id: "summer",  label: "Summer Solstice", line: "the longest light of the year falls across every room" },
  { month: 8, day: 22, id: "autumnal", label: "Autumnal Equinox", line: "balance returns — the network exhales" },
  { month: 11, day: 21, id: "winter", label: "Winter Solstice", line: "the longest night — every lit window matters" },
];

const SEASONS = [
  { id: "winter", label: "Deep Winter", line: "the hearth at @welcome burns a little brighter", hueShift: -20 },
  { id: "spring", label: "Early Bloom", line: "new rooms are sprouting across the network", hueShift: 30 },
  { id: "summer", label: "High Summer", line: "the gate stays warm long into the evening", hueShift: 50 },
  { id: "autumn", label: "Turning Season", line: "the air at the threshold carries amber", hueShift: -45 },
];

export function getSeasonalMoment(date = new Date()): SeasonalMoment {
  const y = date.getUTCFullYear();
  for (const t of TURNINGS) {
    const target = Date.UTC(y, t.month, t.day);
    if (Math.abs(date.getTime() - target) <= 36 * 3600 * 1000) {
      return { id: t.id, label: t.label, line: t.line, hueShift: 0, isCelebration: true };
    }
  }
  const m = date.getUTCMonth();
  const s = m === 11 || m <= 1 ? SEASONS[0] : m <= 4 ? SEASONS[1] : m <= 7 ? SEASONS[2] : SEASONS[3];

  // Days until the next turning — a quiet countdown in the scenery.
  const upcoming = TURNINGS
    .map((t) => ({ ...t, at: Date.UTC(y, t.month, t.day) }))
    .concat(TURNINGS.map((t) => ({ ...t, at: Date.UTC(y + 1, t.month, t.day) })))
    .filter((t) => t.at > date.getTime())
    .sort((a, b) => a.at - b.at)[0];
  const days = Math.ceil((upcoming.at - date.getTime()) / 86_400_000);

  return {
    id: s.id,
    label: s.label,
    line: `${s.line} · ${days} days to the ${upcoming.label.toLowerCase()}`,
    hueShift: s.hueShift,
    isCelebration: false,
  };
}

/** Milestones the whole network celebrates together. */
export function getMilestone(total: number): string | null {
  const marks = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 1_000_000];
  const hit = marks.filter((m) => total >= m).pop();
  if (!hit) return null;
  // Celebrate while we're within 2% past the mark.
  return total - hit <= Math.max(3, hit * 0.02)
    ? `${hit.toLocaleString()} Youniverses now exist. The network crossed a threshold together.`
    : null;
}
