/**
 * lib/ownerAuth.ts
 *
 * Framework-independent owner authentication and session token validation helpers.
 * Used by OwnerLoginModal.tsx and tested by tests/group1-security.test.mjs.
 */

export interface OwnerValidationResult {
  ok: boolean;
  status?: number;
  errorMessage?: string;
  isOwner?: boolean;
}

/**
 * Validates a candidate bearer session token against the server-authoritative
 * /api/youniverse/[handle]/context endpoint.
 *
 * Fails closed on missing handles, empty tokens, network errors, non-200 responses,
 * and responses where isOwner !== true.
 */
export async function validateOwnerTokenOnServer(
  handle: string,
  candidateToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OwnerValidationResult> {
  const cleanHandle = (handle || '').toLowerCase().replace(/^@/, '').trim();
  if (!cleanHandle) {
    return {
      ok: false,
      errorMessage: 'Cannot verify ownership without a valid handle.',
    };
  }

  const cleanToken = (candidateToken || '').trim();
  if (!cleanToken) {
    return {
      ok: false,
      errorMessage: 'Please enter your session token or verification key.',
    };
  }

  try {
    const res = await fetchFn(`/api/youniverse/${encodeURIComponent(cleanHandle)}/context`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });

    if (!res.ok) {
      let errorMessage = 'Ownership verification failed. Please check your credentials.';
      if (res.status === 401) {
        errorMessage = 'Invalid, expired, or revoked session token.';
      } else if (res.status === 404) {
        errorMessage = `No Youniverse found for @${cleanHandle}.`;
      } else if (res.status === 403) {
        errorMessage = 'This Youniverse is suspended or unavailable.';
      }
      return {
        ok: false,
        status: res.status,
        errorMessage,
      };
    }

    const data = await res.json().catch(() => null);
    if (data && data.success === true && data.isOwner === true) {
      return {
        ok: true,
        status: 200,
        isOwner: true,
      };
    }

    return {
      ok: false,
      status: 200,
      isOwner: false,
      errorMessage: 'This token does not have owner access to this Youniverse.',
    };
  } catch {
    return {
      ok: false,
      errorMessage: 'Could not connect to verification service. Please try again.',
    };
  }
}

export interface StorageLike {
  setItem(key: string, value: string): void;
}

export interface ProcessMagicLinkParams {
  res: { ok: boolean; status: number };
  data: any;
  handle: string;
  validateOwnerToken: (token: string) => Promise<boolean>;
  onLoginSuccess: (token: string) => void;
  storage?: StorageLike;
}

export type MagicLinkOutcome =
  | { type: 'success_authenticated'; token: string }
  | { type: 'success_link_dispatched'; message: string }
  | { type: 'error_validation_failed' }
  | { type: 'error'; message: string };

/**
 * Dispatches magic link responses and guards against conflicting error/success states.
 *
 * Invariant: If a returned sessionToken fails validation, it must NEVER:
 *  1. Persist the token to storage.
 *  2. Invoke onLoginSuccess.
 *  3. Return or display a success_link_dispatched state.
 */
export async function processMagicLinkResponse({
  res,
  data,
  handle,
  validateOwnerToken,
  onLoginSuccess,
  storage,
}: ProcessMagicLinkParams): Promise<MagicLinkOutcome> {
  if (res.ok && data?.success) {
    if (data.sessionToken) {
      const isVerifiedOwner = await validateOwnerToken(data.sessionToken);
      if (isVerifiedOwner) {
        if (storage) {
          storage.setItem('youniverse_session_token', data.sessionToken);
          const cleanHandle = (handle || '').toLowerCase().replace(/^@/, '').trim();
          if (cleanHandle) {
            storage.setItem(`youniverse_os_active_${cleanHandle}`, 'true');
          }
        }
        onLoginSuccess(data.sessionToken);
        return { type: 'success_authenticated', token: data.sessionToken };
      }
      // Explicit outcome: Token validation failed, do NOT return a dispatched success
      return { type: 'error_validation_failed' };
    }
    return {
      type: 'success_link_dispatched',
      message: 'A magic authentication link has been dispatched to your email.',
    };
  } else if (res.status === 402) {
    return {
      type: 'error',
      message: 'Upgrade required for this domain.',
    };
  } else if (res.status === 409) {
    // Already claimed handle awaiting verification link
    return {
      type: 'success_link_dispatched',
      message: 'Authentication link sent. Please verify in your inbox.',
    };
  } else {
    // Fail-closed on all unexpected errors or failure responses
    return {
      type: 'error',
      message: data?.message || 'Failed to dispatch magic link. Please try again.',
    };
  }
}
