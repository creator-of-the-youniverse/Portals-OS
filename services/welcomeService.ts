/**
 * @file welcomeService
 *
 * Client bindings for @welcome. Pure Neon-backed Vercel functions:
 *   GET  /api/welcome/pulse           collective energy + presence heartbeat
 *   GET  /api/youniverseIdentity      does a room already exist?
 *   POST /api/claim                   ignite a new Youniverse
 */

import type { FoundationLawId } from "../lib/welcomeWorld";
import { SYSTEM_HANDLES } from "../lib/welcomeWorld";

export interface WelcomePulse {
  now: string;
  presence: number;
  sparkedToday: number;
  total: number;
  recent: { handle: string; hue: number | null; at: string }[];
  broadcasts: { id: string; kind: string; message: string; hue: number | null }[];
}

export async function fetchPulse(visitorId: string, signal?: AbortSignal): Promise<WelcomePulse | null> {
  try {
    const res = await fetch(`/api/welcome/pulse?v=${encodeURIComponent(visitorId)}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status === "ok" ? (data as WelcomePulse) : null;
  } catch {
    return null;
  }
}

export type RoomStatus = "open" | "exists" | "system" | "invalid" | "unknown";

/** Is this address still unforged? */
export async function checkRoom(handle: string, signal?: AbortSignal): Promise<RoomStatus> {
  if (SYSTEM_HANDLES.has(handle)) return "system";
  try {
    const res = await fetch(`/api/youniverseIdentity?username=${encodeURIComponent(handle)}`, { signal });
    if (res.status === 404) return "open";
    if (res.status === 200) return "exists";
    if (res.status === 400) return "invalid";
    return "unknown";
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return "unknown";
  }
}

export type IgniteResult =
  | { ok: true; handle: string; subdomain: string; handoffToken?: string; redirectUrl?: string }
  | { ok: false; reason: "taken" | "reserved" | "invalid" | "network" | "error"; message: string };

export async function igniteYouniverse(input: {
  handle: string;
  email: string;
  foundation: FoundationLawId[];
  energyHue: number;
}): Promise<IgniteResult> {
  try {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 201 && (data?.status === "created" || data?.success)) {
      return {
        ok: true,
        handle: data.username,
        subdomain: data.subdomain,
        handoffToken: data.handoffToken,
        redirectUrl: data.redirectUrl,
      };
    }
    if (data?.status === "username-taken") {
      return { ok: false, reason: "taken", message: `@${input.handle} was forged by someone else moments ago.` };
    }
    if (data?.status === "reserved") {
      return { ok: false, reason: "reserved", message: `@${input.handle} belongs to the network itself.` };
    }
    if (data?.status === "invalid") {
      return { ok: false, reason: "invalid", message: data?.message ?? "Something about that signal didn't hold." };
    }
    return { ok: false, reason: "error", message: "The gate faltered. Try the key again." };
  } catch {
    return { ok: false, reason: "network", message: "The network is out of reach. Check your connection." };
  }
}
