/**
 * Client-side storage epoch marker for Big Bang clean launch.
 *
 * Clears legacy/test-era browser tokens, cached OS state, and ONEAI session caches
 * once per browser when transitioning to the Big Bang epoch, preventing stale tokens
 * or handle-scoped UI state from confusing newly registered owners.
 */

export const BIG_BANG_STORAGE_EPOCH_KEY = "youniverse_storage_epoch";
export const BIG_BANG_STORAGE_EPOCH = "big-bang-2026-11";

export interface MinimalStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STATIC_RESET_KEYS = [
  "win11-portfolio-storage",
  "youniverse_session_token",
  "weaver_jwt",
  "active_youniverse_handle",
  "youniverse_owner_email",
  "active_youniverse_subdomain",
  "calendar-events",
  "markdown-editor-text",
];

const HANDLE_PREFIX_RE = /^youniverse_(?:os_active|foundation|arrived)_/i;

export function ensureBigBangStorageEpoch(storage?: MinimalStorageLike | null): boolean {
  const target: MinimalStorageLike | null =
    storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!target) return false;

  try {
    if (target.getItem(BIG_BANG_STORAGE_EPOCH_KEY) === BIG_BANG_STORAGE_EPOCH) {
      return false;
    }

    for (const key of STATIC_RESET_KEYS) {
      target.removeItem(key);
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < target.length; i += 1) {
      const k = target.key(i);
      if (k && HANDLE_PREFIX_RE.test(k)) {
        keysToRemove.push(k);
      }
    }
    for (const key of keysToRemove) {
      target.removeItem(key);
    }

    if (!storage && typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem("weaver_jwt");
      } catch {
        // ignore storage quota / privacy mode failures
      }
    }

    target.setItem(BIG_BANG_STORAGE_EPOCH_KEY, BIG_BANG_STORAGE_EPOCH);
    return true;
  } catch {
    return false;
  }
}
