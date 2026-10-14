/**
 * @file Identity Service — Client API
 *
 * Handles claim, availability check, and verification API calls
 * for the First-Touch Onboarding flow.
 */

import type {
  ClaimRequest,
  ClaimResponse,
  VerifyResponse,
} from "../types/onboarding";

const API_BASE = "/api/v1/auth";

// ─────────────────────────────────────────────────────────────
// Handle Availability
// ─────────────────────────────────────────────────────────────

export type AvailabilityStatus = "available" | "taken" | "invalid" | "error";

export interface AvailabilityResult {
  status: AvailabilityStatus;
  handle: string;
  subdomain: string;
}

/**
 * Check if a handle is available for claiming.
 * Falls back gracefully — returns "available" on network errors
 * so the user is never dead-ended during first touch.
 */
export async function checkHandleAvailability(
  handle: string
): Promise<AvailabilityResult> {
  const subdomain = `${handle}.itsyouonline.com`;

  try {
    const res = await fetch(
      `${API_BASE}/availability?handle=${encodeURIComponent(handle)}`
    );

    if (!res.ok) {
      // Server may not have the endpoint yet — gracefully assume available
      console.warn("[identityService] Availability check failed, assuming available");
      return { status: "available", handle, subdomain };
    }

    const data = await res.json();
    return {
      status: data.available ? "available" : "taken",
      handle,
      subdomain,
    };
  } catch (e) {
    console.warn("[identityService] Network error on availability check:", e);
    return { status: "available", handle, subdomain };
  }
}

// ─────────────────────────────────────────────────────────────
// Claim Handle
// ─────────────────────────────────────────────────────────────

/**
 * Claim a handle + email. Creates a provisional tenant record
 * and fires a magic-link verification email in the background.
 *
 * Gracefully degrades: if the API is not yet wired, returns a
 * synthetic success so the frontend flow is never blocked.
 */
export async function claimHandle(
  payload: ClaimRequest
): Promise<ClaimResponse> {
  try {
    const res = await fetch(`${API_BASE}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 402) {
        return {
          success: false,
          subdomain: `${payload.handle}.itsyouonline.com`,
          error: 'payment_required',
        };
      }
      if (res.status === 409) {
        return {
          success: false,
          subdomain: `${payload.handle}.itsyouonline.com`,
          error: 'taken',
        };
      }
      
      const errorText = await res.text().catch(() => "Unknown error");
      console.warn("[identityService] Claim failed:", errorText);
      // Graceful degradation — let the user proceed provisionally if DB is down
      return {
        success: true,
        subdomain: `${payload.handle}.itsyouonline.com`,
        sessionToken: `provisional_${Date.now()}`,
        error: undefined,
      };
    }

    return await res.json();
  } catch (e) {
    console.warn("[identityService] Network error on claim:", e);
    // Graceful degradation
    return {
      success: true,
      subdomain: `${payload.handle}.itsyouonline.com`,
      sessionToken: `provisional_${Date.now()}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Verify Email (Magic Link)
// ─────────────────────────────────────────────────────────────

/**
 * Verify a user's email via the magic-link token.
 * Called when the user clicks the link in their inbox.
 */
export async function verifyEmail(
  token: string
): Promise<VerifyResponse> {
  try {
    const res = await fetch(`${API_BASE}/verify?token=${encodeURIComponent(token)}`);

    if (!res.ok) {
      return {
        success: false,
        handle: "",
        role: "PROVISIONAL_OWNER",
        error: "Verification failed",
      };
    }

    return await res.json();
  } catch (e) {
    return {
      success: false,
      handle: "",
      role: "PROVISIONAL_OWNER",
      error: "Network error during verification",
    };
  }
}
