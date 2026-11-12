/**
 * lib/genesisService.ts
 *
 * Genesis 001 ("FIRST PERSON OF THE YOUNIVERSE" / "GENESIS 001") allocation,
 * registry lookup, and ceremony acknowledgment service.
 *
 * Design guarantees:
 *  - Singleton physical constraint (`award_slot = 'genesis_001'`) permits at most ONE winner.
 *  - Award triggers ONLY inside the atomic email-verification transaction following
 *    activation in `public.genesis_program_state`.
 *  - Non-production runtimes never allocate awards unless explicitly injected in tests.
 *  - Internal (@itsyouonline.com) and synthetic test email addresses are excluded.
 *  - Ceremony acknowledgment updates `ceremony_seen_at` monotonically without altering award history.
 */

export const GENESIS_OFFICIAL_TITLE = "FIRST PERSON OF THE YOUNIVERSE";
export const GENESIS_DESIGNATION = "GENESIS 001";
export const GENESIS_AWARD_SLOT = "genesis_001";
export const GENESIS_ENTITLEMENT_KEY = "genesis_lifetime_access";

export interface GenesisAwardRecord {
  awardSlot: string;
  identityId: string;
  handle: string;
  officialTitle: string;
  designation: string;
  awardedAt: string;
  ceremonySeenAt: string | null;
}

export interface GenesisStatusSummary {
  isWinner: boolean;
  officialTitle: string | null;
  designation: string | null;
  awardedAt: string | null;
  ceremonyPending: boolean;
}

export interface PublicGenesisRegistry {
  officialTitle: string;
  officialDesignation: string;
  isEnabled: boolean;
  eligibleVerifiedAfter: string | null;
  awarded: boolean;
  winner: {
    designation: string;
    officialTitle: string;
    handle: string;
    subdomain: string;
    awardedAt: string;
  } | null;
}

export interface QueryRunner {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

const EXCLUDED_EXACT_DOMAINS = new Set([
  "itsyouonline.com",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "mailinator.com",
  "localhost",
]);

const EXCLUDED_DOMAIN_SUFFIXES = [
  ".itsyouonline.com",
  ".example",
  ".invalid",
  ".local",
  ".test",
];

const EXCLUDED_LOCAL_PART_PATTERNS = [
  /\+(?:test|smoke|e2e|ci|autotest|dev)(?:$|[0-9_-])/i,
  /^(?:smoke[-_.]|e2e[-_.]|autotest[-_.]|ci[-_.])/i,
];

/**
 * Mirrors PostgreSQL `public.is_eligible_genesis_email(TEXT)`.
 * Excludes internal `@itsyouonline.com` and identifiable synthetic/test addresses
 * without rejecting legitimate handle names.
 */
export function isEligibleGenesisEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (!clean) return false;

  const atIndex = clean.indexOf("@");
  if (atIndex <= 0 || atIndex >= clean.length - 1) return false;

  const localPart = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);

  if (!domain.includes(".") && domain !== "localhost") return false;
  if (EXCLUDED_EXACT_DOMAINS.has(domain)) return false;
  if (EXCLUDED_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))) return false;
  if (EXCLUDED_LOCAL_PART_PATTERNS.some((re) => re.test(localPart))) return false;

  return true;
}

/**
 * True only when executing in Production runtime (fail-closed for local/dev/preview).
 */
export function isProductionGenesisRuntime(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

function isUndefinedTableError(err: any): boolean {
  return err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message ?? ""));
}

async function runQuery(
  db: QueryRunner | ((strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>),
  text: string,
  params: any[] = [],
  tagQueryFn?: () => Promise<any[]>
): Promise<any[]> {
  if (typeof (db as QueryRunner)?.query === "function") {
    const res = await (db as QueryRunner).query(text, params);
    if (Array.isArray(res?.rows)) return res.rows;
    if (Array.isArray(res)) return res;
    return [];
  }
  if (tagQueryFn) {
    const rows = await tagQueryFn();
    return Array.isArray(rows) ? rows : [];
  }
  throw new Error("Unsupported SQL client interface");
}

export interface TryAwardGenesisParams {
  identityId: string;
  username: string;
  email: string;
  identityType?: string;
  isLive?: boolean;
  verificationTokenId: string;
  verifiedAt: string | Date;
  isProduction: boolean;
}

export type TryAwardGenesisResult =
  | { awarded: true; award: GenesisAwardRecord }
  | { awarded: false; reason: string };

/**
 * Attempts singleton Genesis 001 award inside an ALREADY-OPEN database transaction.
 *
 * Uses `INSERT ... ON CONFLICT (award_slot) DO NOTHING` so losing concurrent claims
 * never abort the transaction and continue seamlessly through ordinary signup.
 */
export async function tryAwardGenesis001InTransaction(
  client: QueryRunner,
  params: TryAwardGenesisParams
): Promise<TryAwardGenesisResult> {
  if (!params.isProduction) {
    return { awarded: false, reason: "non_production_environment" };
  }
  if (params.isLive === false) {
    return { awarded: false, reason: "identity_not_live" };
  }
  if (params.identityType && params.identityType !== "person") {
    return { awarded: false, reason: "non_person_identity" };
  }
  if (!isEligibleGenesisEmail(params.email)) {
    return { awarded: false, reason: "excluded_email" };
  }

  // 1. Check active program boundary (if Migration 008 applied)
  const programRes = await client.query(
    `SELECT is_enabled, eligible_verified_after
     FROM public.genesis_program_state
     WHERE program_key = $1
     LIMIT 1`,
    [GENESIS_AWARD_SLOT]
  );

  if (!programRes?.rows || programRes.rows.length === 0) {
    return { awarded: false, reason: "program_uninitialized" };
  }

  const program = programRes.rows[0];
  if (program.is_enabled !== true) {
    return { awarded: false, reason: "program_disabled" };
  }

  const verifiedAtMs = new Date(params.verifiedAt).getTime();
  const cutoffMs = new Date(program.eligible_verified_after).getTime();
  if (!Number.isFinite(verifiedAtMs) || !Number.isFinite(cutoffMs) || verifiedAtMs < cutoffMs) {
    return { awarded: false, reason: "before_activation_cutoff" };
  }

  // 2. Singleton atomic insert — ON CONFLICT DO NOTHING guarantees 0 or 1 total winner
  const insertAwardRes = await client.query(
    `INSERT INTO public.genesis_awards (
       award_slot,
       identity_id,
       awarded_username,
       official_title,
       award_label,
       verification_token_id,
       source_environment
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'production')
     ON CONFLICT (award_slot) DO NOTHING
     RETURNING award_slot, identity_id, awarded_username, official_title, award_label, awarded_at, ceremony_seen_at`,
    [
      GENESIS_AWARD_SLOT,
      params.identityId,
      params.username,
      GENESIS_OFFICIAL_TITLE,
      GENESIS_DESIGNATION,
      params.verificationTokenId,
    ]
  );

  if (!insertAwardRes?.rows || insertAwardRes.rows.length === 0) {
    return { awarded: false, reason: "already_awarded" };
  }

  const row = insertAwardRes.rows[0];

  // 3. Grant lifetime entitlement ledger row inside the same transaction
  await client.query(
    `INSERT INTO public.identity_entitlements (
       identity_id,
       entitlement_key,
       source_type,
       source_ref,
       is_lifetime,
       status
     )
     VALUES ($1, $2, 'genesis_001', $3, TRUE, 'active')
     ON CONFLICT (identity_id, entitlement_key, source_type) DO NOTHING`,
    [params.identityId, GENESIS_ENTITLEMENT_KEY, GENESIS_AWARD_SLOT]
  );

  return {
    awarded: true,
    award: {
      awardSlot: String(row.award_slot),
      identityId: String(row.identity_id),
      handle: String(row.awarded_username),
      officialTitle: String(row.official_title),
      designation: String(row.award_label),
      awardedAt: new Date(row.awarded_at).toISOString(),
      ceremonySeenAt: row.ceremony_seen_at ? new Date(row.ceremony_seen_at).toISOString() : null,
    },
  };
}

/**
 * Queries Genesis status for a single authenticated identity (never leaks other users).
 */
export async function getGenesisStatusForIdentity(
  db: any,
  identityId: string
): Promise<GenesisStatusSummary> {
  if (!identityId) {
    return {
      isWinner: false,
      officialTitle: null,
      designation: null,
      awardedAt: null,
      ceremonyPending: false,
    };
  }

  try {
    const rows = await runQuery(
      db,
      `SELECT official_title, award_label, awarded_at, ceremony_seen_at
       FROM public.genesis_awards
       WHERE identity_id = $1 AND award_slot = $2
       LIMIT 1`,
      [identityId, GENESIS_AWARD_SLOT],
      () => db`
        SELECT official_title, award_label, awarded_at, ceremony_seen_at
        FROM public.genesis_awards
        WHERE identity_id = ${identityId} AND award_slot = ${GENESIS_AWARD_SLOT}
        LIMIT 1
      `
    );

    if (rows.length === 0) {
      return {
        isWinner: false,
        officialTitle: null,
        designation: null,
        awardedAt: null,
        ceremonyPending: false,
      };
    }

    const row = rows[0];
    return {
      isWinner: true,
      officialTitle: String(row.official_title ?? GENESIS_OFFICIAL_TITLE),
      designation: String(row.award_label ?? GENESIS_DESIGNATION),
      awardedAt: row.awarded_at ? new Date(row.awarded_at).toISOString() : null,
      ceremonyPending: row.ceremony_seen_at === null || row.ceremony_seen_at === undefined,
    };
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      return {
        isWinner: false,
        officialTitle: null,
        designation: null,
        awardedAt: null,
        ceremonyPending: false,
      };
    }
    throw err;
  }
}

/**
 * Idempotently records first ceremony dismissal (`ceremony_seen_at = COALESCE(ceremony_seen_at, NOW())`).
 * Does NOT mutate historical award identity, timestamps, or entitlements.
 */
export async function acknowledgeGenesisCeremony(
  db: any,
  identityId: string
): Promise<{ acknowledged: boolean; ceremonySeenAt: string | null }> {
  const rows = await runQuery(
    db,
    `UPDATE public.genesis_awards
     SET ceremony_seen_at = COALESCE(ceremony_seen_at, NOW())
     WHERE identity_id = $1 AND award_slot = $2
     RETURNING ceremony_seen_at`,
    [identityId, GENESIS_AWARD_SLOT],
    () => db`
      UPDATE public.genesis_awards
      SET ceremony_seen_at = COALESCE(ceremony_seen_at, NOW())
      WHERE identity_id = ${identityId} AND award_slot = ${GENESIS_AWARD_SLOT}
      RETURNING ceremony_seen_at
    `
  );

  if (rows.length === 0) {
    return { acknowledged: false, ceremonySeenAt: null };
  }

  return {
    acknowledged: true,
    ceremonySeenAt: rows[0].ceremony_seen_at ? new Date(rows[0].ceremony_seen_at).toISOString() : null,
  };
}

/**
 * Public historical registry lookup (never exposes email, tokens, or private metadata).
 */
export async function getPublicGenesisRegistry(db: any): Promise<PublicGenesisRegistry> {
  try {
    const programRows = await runQuery(
      db,
      `SELECT official_title, official_designation, is_enabled, eligible_verified_after
       FROM public.genesis_program_state
       WHERE program_key = $1
       LIMIT 1`,
      [GENESIS_AWARD_SLOT],
      () => db`
        SELECT official_title, official_designation, is_enabled, eligible_verified_after
        FROM public.genesis_program_state
        WHERE program_key = ${GENESIS_AWARD_SLOT}
        LIMIT 1
      `
    );

    const awardRows = await runQuery(
      db,
      `SELECT g.award_label, g.official_title, g.awarded_at,
              COALESCE(i.username, g.awarded_username) AS handle,
              COALESCE(i.subdomain, g.awarded_username || '.itsyouonline.com') AS subdomain
       FROM public.genesis_awards g
       LEFT JOIN public.youniverse_identities i ON i.identity_id = g.identity_id
       WHERE g.award_slot = $1
       LIMIT 1`,
      [GENESIS_AWARD_SLOT],
      () => db`
        SELECT g.award_label, g.official_title, g.awarded_at,
               COALESCE(i.username, g.awarded_username) AS handle,
               COALESCE(i.subdomain, g.awarded_username || '.itsyouonline.com') AS subdomain
        FROM public.genesis_awards g
        LEFT JOIN public.youniverse_identities i ON i.identity_id = g.identity_id
        WHERE g.award_slot = ${GENESIS_AWARD_SLOT}
        LIMIT 1
      `
    );

    const prog = programRows[0];
    const win = awardRows[0];

    return {
      officialTitle: prog?.official_title ? String(prog.official_title) : GENESIS_OFFICIAL_TITLE,
      officialDesignation: prog?.official_designation
        ? String(prog.official_designation)
        : GENESIS_DESIGNATION,
      isEnabled: prog ? Boolean(prog.is_enabled) : false,
      eligibleVerifiedAfter: prog?.eligible_verified_after
        ? new Date(prog.eligible_verified_after).toISOString()
        : null,
      awarded: Boolean(win),
      winner: win
        ? {
            designation: String(win.award_label ?? GENESIS_DESIGNATION),
            officialTitle: String(win.official_title ?? GENESIS_OFFICIAL_TITLE),
            handle: String(win.handle),
            subdomain: String(win.subdomain),
            awardedAt: new Date(win.awarded_at).toISOString(),
          }
        : null,
    };
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      return {
        officialTitle: GENESIS_OFFICIAL_TITLE,
        officialDesignation: GENESIS_DESIGNATION,
        isEnabled: false,
        eligibleVerifiedAfter: null,
        awarded: false,
        winner: null,
      };
    }
    throw err;
  }
}

export interface PublicBadge {
  key: string;
  designation: string;
  officialTitle: string;
  awardedAt: string | null;
}

/**
 * Fetches safe public badges for a live Youniverse profile (zero PII).
 */
export async function getPublicBadgesForIdentity(
  db: any,
  identityId: string
): Promise<PublicBadge[]> {
  if (!identityId) return [];
  const status = await getGenesisStatusForIdentity(db, identityId);
  if (!status.isWinner) return [];
  return [
    {
      key: GENESIS_AWARD_SLOT,
      designation: status.designation ?? GENESIS_DESIGNATION,
      officialTitle: status.officialTitle ?? GENESIS_OFFICIAL_TITLE,
      awardedAt: status.awardedAt,
    },
  ];
}

