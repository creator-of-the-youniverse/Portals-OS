
/**
 * Identity Service — Client API
 *
 * Handle discovery uses the canonical identity resolver.
 * Claims use the existing /api/claim endpoint.
 * Errors never imply availability or successful ownership.
 */

import type {
  ClaimRequest,
  VerifyResponse,
  ClaimResponse,
} from "../types/onboarding";

export type AvailabilityStatus = "available" | "taken" | "invalid" | "error";

export interface AvailabilityResult {
  status: AvailabilityStatus;
  handle: string;
  subdomain: string;
}

export async function checkHandleAvailability(
  handle: string
): Promise<AvailabilityResult> {
  const subdomain = `${handle}.itsyouonline.com`;

  try {
    const res = await fetch(
      `/api/youniverseIdentity?username=${encodeURIComponent(handle)}`
    );

    if (res.status === 200) {
      const data = await res.json();
      return {
        status: data.status === "found" ? "taken" : "error",
        handle,
        subdomain,
      };
    }

    if (res.status === 404) {
      return { status: "available", handle, subdomain };
    }

    if (res.status === 400) {
      return { status: "invalid", handle, subdomain };
    }

    console.warn("[identityService] Availability check failed:", res.status);
    return { status: "error", handle, subdomain };
  } catch (error) {
    console.warn("[identityService] Availability network error:", error);
    return { status: "error", handle, subdomain };
  }
}

export async function claimHandle(
  payload: ClaimRequest
): Promise<ClaimResponse> {
  const subdomain = `${payload.handle}.itsyouonline.com`;

  try {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 201 && (data.status === "created" || data.status === "pending_verification" || data.success === true)) {
      return {
        success: true,
        subdomain: data.subdomain ?? subdomain,
        sessionToken: data.sessionToken,
      };
    }

    if (res.status === 409 || data.status === "username-taken") {
      return { success: false, subdomain, error: "taken" };
    }

    if (res.status === 402 || data.status === "payment_required") {
      return { success: false, subdomain, error: "payment_required" };
    }

    console.warn("[identityService] Claim rejected:", res.status, data.status);
    return {
      success: false,
      subdomain,
      error: data.message || data.status || "claim_failed",
    };
  } catch (error) {
    console.warn("[identityService] Claim network error:", error);
    return { success: false, subdomain, error: "network_error" };
  }
}

/**
 * Email verification remains on its existing route pending backend audit.
 */
export async function verifyEmail(
  token: string
): Promise<VerifyResponse> {
  try {
    const res = await fetch(
      `/api/v1/auth/verify?token=${encodeURIComponent(token)}`
    );

    if (!res.ok) {
      return {
        success: false,
        handle: "",
        role: "PROVISIONAL_OWNER",
        error: "Verification failed",
      };
    }

    return await res.json();
  } catch {
    return {
      success: false,
      handle: "",
      role: "PROVISIONAL_OWNER",
      error: "Network error during verification",
    };
  }
}
