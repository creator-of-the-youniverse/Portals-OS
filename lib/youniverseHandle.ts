/**
 * ItsYouOnline @ Line handle contract.
 *
 * The @ Line is the identity discovery interface.
 *
 * It does NOT:
 * - authenticate the visitor
 * - prove ownership
 * - determine whether an identity exists
 * - reserve a username
 * - create an account
 *
 * Those responsibilities belong to later identity/backend layers.
 */

export interface YouniverseHandle {
  raw: string;
  username: string;
}

export function normalizeYouniverseHandle(
  value: string
): YouniverseHandle {
  const raw = value.trim();

  const username = raw
    .replace(/^@+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  return {
    raw,
    username,
  };
}
