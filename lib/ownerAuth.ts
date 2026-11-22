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

export interface PasswordSignInResult {
  ok: boolean;
  status: number;
  errorMessage?: string;
  humanId?: string;
}

/**
 * Authenticates a human user with email and password via /api/auth/password/login.
 * Requests credentials: 'include' so HttpOnly session cookie is set in browser.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  fetchFn: typeof fetch = fetch
): Promise<PasswordSignInResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    return {
      ok: false,
      status: 400,
      errorMessage: 'Please enter both your email address and password.',
    };
  }

  try {
    const res = await fetchFn('/api/auth/password/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portals-Request': '1',
      },
      credentials: 'include',
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.success) {
      return {
        ok: true,
        status: res.status,
        humanId: data.humanId,
      };
    }

    return {
      ok: false,
      status: res.status,
      errorMessage: data?.message || 'Invalid email or password. Please try again.',
    };
  } catch {
    return {
      ok: false,
      status: 500,
      errorMessage: 'Could not connect to authentication service. Please try again.',
    };
  }
}

/**
 * Requests a password reset link via /api/auth/password/recover.
 */
export async function requestPasswordRecovery(
  email: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; message: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  try {
    const res = await fetchFn('/api/auth/password/recover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portals-Request': '1',
      },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      message: data?.message || 'If an account exists for this email, a reset link has been dispatched.',
    };
  } catch {
    return {
      ok: false,
      message: 'Could not connect to recovery service. Please try again.',
    };
  }
}

export interface EnrollWithPasswordResult {
  ok: boolean;
  status: number;
  humanId?: string;
  enrollmentStatus?: 'created' | 'existing';
  errorMessage?: string;
}

/**
 * First-time enrollment: establishes the Human Continuity Principal and links
 * a Youniverse association. Calls POST /api/auth/enroll.
 *
 * Requires an active session cookie (issued after email verification).
 * Returns the humanId and enrollmentStatus on success.
 */
export async function enrollWithPassword(
  handle: string,
  email: string,
  password: string,
  fetchFn: typeof fetch = fetch
): Promise<EnrollWithPasswordResult> {
  const cleanHandle = (handle || '').toLowerCase().replace(/^@/, '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanHandle) {
    return { ok: false, status: 400, errorMessage: 'A Youniverse handle is required.' };
  }
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, status: 400, errorMessage: 'A valid email address is required.' };
  }
  if (!password) {
    return { ok: false, status: 400, errorMessage: 'A password is required.' };
  }

  try {
    const res = await fetchFn('/api/auth/enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portals-Request': '1',
      },
      credentials: 'include',
      body: JSON.stringify({ handle: cleanHandle, email: cleanEmail, password }),
    });

    const data = await res.json().catch(() => ({}));

    if ((res.status === 200 || res.status === 201) && data?.success) {
      return {
        ok: true,
        status: res.status,
        humanId: data.humanId,
        enrollmentStatus: data.enrollmentStatus,
      };
    }

    return {
      ok: false,
      status: res.status,
      errorMessage: data?.message || 'Enrollment failed. Please try again.',
    };
  } catch {
    return {
      ok: false,
      status: 500,
      errorMessage: 'Could not connect to enrollment service. Please try again.',
    };
  }
}

/**
 * Sign in using WebAuthn / Passkey.
 * Calls /api/auth/passkey/options then @simplewebauthn/browser startAuthentication,
 * then verifies with /api/auth/passkey/verify.
 */
export async function signInWithPasskey(
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    const { startAuthentication } = await import('@simplewebauthn/browser');

    // 1. Fetch authentication options
    const optRes = await fetchFn('/api/auth/passkey/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portals-Request': '1' },
      body: JSON.stringify({ type: 'authentication' }),
    });
    const optData = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optData.ok) {
      return { ok: false, errorMessage: optData?.message || 'Failed to initiate passkey sign-in.' };
    }

    // 2. Perform WebAuthn ceremony with browser
    const asseResp = await startAuthentication({ optionsJSON: optData.options });

    // 3. Verify response with server
    const verifyRes = await fetchFn('/api/auth/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portals-Request': '1' },
      body: JSON.stringify({
        type: 'authentication',
        challengeId: optData.challengeId,
        response: asseResp,
      }),
      credentials: 'include',
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyData.ok) {
      return { ok: false, errorMessage: verifyData?.message || 'Passkey verification failed.' };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, errorMessage: err.message || 'Passkey authentication failed.' };
  }
}

/**
 * Register a new WebAuthn / Passkey for an authenticated human.
 */
export async function registerPasskey(
  deviceLabel = 'Passkey',
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; credentialId?: string; errorMessage?: string }> {
  try {
    const { startRegistration } = await import('@simplewebauthn/browser');

    const optRes = await fetchFn('/api/auth/passkey/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portals-Request': '1' },
      body: JSON.stringify({ type: 'registration' }),
      credentials: 'include',
    });
    const optData = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optData.ok) {
      return { ok: false, errorMessage: optData?.message || 'Failed to initiate passkey registration.' };
    }

    const attResp = await startRegistration({ optionsJSON: optData.options });

    const verifyRes = await fetchFn('/api/auth/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portals-Request': '1' },
      body: JSON.stringify({
        type: 'registration',
        challengeId: optData.challengeId,
        response: attResp,
        deviceLabel,
      }),
      credentials: 'include',
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyData.ok) {
      return { ok: false, errorMessage: verifyData?.message || 'Passkey registration verification failed.' };
    }

    return { ok: true, credentialId: verifyData.credentialId };
  } catch (err: any) {
    return { ok: false, errorMessage: err.message || 'Passkey registration failed.' };
  }
}

