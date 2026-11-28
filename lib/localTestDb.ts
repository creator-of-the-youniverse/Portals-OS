/**
 * lib/localTestDb.ts
 *
 * Isolated Local Test Database Provider for Portals OS.
 *
 * GOVERNANCE:
 *  - Strictly isolated in-memory test database.
 *  - ZERO database writes or DDL executions against Neon (Primary or Local Test Neon).
 *  - Provides the full schema required by Migrations 001 through 014.
 *  - Pre-provisions isolated test owner and test visitor principals.
 */

import { hashPassword } from "./passwordAuth.ts";

export interface LocalDbTables {
  human_continuity_identities: any[];
  human_auth_subjects: any[];
  human_passwords: any[];
  human_youniverse_associations: any[];
  human_password_resets: any[];
  human_passkeys: any[];
  human_recovery_codes: any[];
  manual_recovery_cases: any[];
  homeverse_relinquishments: any[];
  youniverse_identities: any[];
  sessions: any[];
  handoff_tokens: any[];
  email_verification_tokens: any[];
  identity_entitlements: any[];
  not_notes: any[];
  books_os_archive_entries: any[];
  collection_point_submissions: any[];
}

export interface IsolatedTestDatabase {
  tables: LocalDbTables;
  sql: any;
  init: () => Promise<void>;
  reset: () => Promise<void>;
}

// Fixed test UUIDs for deterministic testing
export const TEST_FIXTURES = {
  owner: {
    humanId: "11111111-1111-4111-8111-111111111111",
    authSubjectId: "22222222-2222-4222-8222-222222222222",
    identityId: "test-owner-identity-uuid-1",
    username: "test",
    email: "testowner@itsyouonline.com",
    password: "ValidOwnerPassword123!",
  },
  visitor: {
    humanId: "44444444-4444-4444-8444-444444444444",
    authSubjectId: "55555555-5555-4555-8555-555555555555",
    identityId: "visitor-identity-uuid-2",
    username: "visitor",
    email: "visitor@itsyouonline.com",
    password: "ValidVisitorPassword123!",
  },
};

export function createIsolatedTestDb(): IsolatedTestDatabase {
  const tables: LocalDbTables = {
    human_continuity_identities: [],
    human_auth_subjects: [],
    human_passwords: [],
    human_youniverse_associations: [],
    human_password_resets: [],
    human_passkeys: [],
    human_recovery_codes: [],
    manual_recovery_cases: [],
    homeverse_relinquishments: [],
    youniverse_identities: [],
    sessions: [],
    handoff_tokens: [],
    email_verification_tokens: [],
    identity_entitlements: [],
    not_notes: [],
    books_os_archive_entries: [],
    collection_point_submissions: [],
  };

  const sql: any = function (strings: TemplateStringsArray | string[], ...values: any[]) {
    const rawQuery = Array.isArray((strings as any).raw)
      ? (strings as any).raw.join("?")
      : Array.isArray(strings)
      ? strings.join("?")
      : String(strings);

    const query = rawQuery.replace(/\s+/g, " ").trim();

    // ── 1. SELECT joined human + auth_subject + password by email ───────────
    if (
      query.includes("FROM human_continuity_identities h") &&
      query.includes("s.subject_identifier = ?")
    ) {
      const email = String(values[0]).toLowerCase().trim();
      const subject = tables.human_auth_subjects.find(
        (s) =>
          s.provider_type === "password" &&
          s.subject_identifier.toLowerCase() === email &&
          s.status === "active"
      );
      if (!subject) return Promise.resolve([]);
      const human = tables.human_continuity_identities.find(
        (h) => h.human_id === subject.human_id && h.status === "active"
      );
      if (!human) return Promise.resolve([]);
      const password = tables.human_passwords.find(
        (p) => p.auth_subject_id === subject.id
      );
      if (!password) return Promise.resolve([]);

      return Promise.resolve([
        {
          human_id: human.human_id,
          human_status: human.status,
          human_created_at: human.created_at,
          human_updated_at: human.updated_at,
          subject_id: subject.id,
          provider_type: subject.provider_type,
          subject_identifier: subject.subject_identifier,
          subject_status: subject.status,
          verified_at: subject.verified_at,
          revoked_at: subject.revoked_at,
          subject_created_at: subject.created_at,
          password_hash: password.password_hash,
          salt: password.salt,
          algorithm: password.algorithm,
          password_created_at: password.created_at,
          password_updated_at: password.updated_at,
        },
      ]);
    }

    // ── 2. SELECT youniverse_identities by username ─────────────────────────
    if (
      query.includes("FROM youniverse_identities") &&
      query.includes("WHERE username = ?")
    ) {
      const username = String(values[0]).toLowerCase().replace(/^@/, "").trim();
      const matched = tables.youniverse_identities.filter(
        (y) => y.username.toLowerCase() === username
      );
      return Promise.resolve(matched.map((m) => ({ ...m })));
    }

    // ── 3. SELECT youniverse_identities by email ────────────────────────────
    if (
      query.includes("FROM youniverse_identities") &&
      query.includes("WHERE email = ?")
    ) {
      const email = String(values[0]).toLowerCase().trim();
      const matched = tables.youniverse_identities.filter(
        (y) => (y.email || "").toLowerCase() === email
      );
      return Promise.resolve(matched.map((m) => ({ ...m })));
    }

    // ── 4. SELECT human_continuity_identities by human_id ───────────────────
    if (
      query.includes("FROM human_continuity_identities") &&
      query.includes("WHERE human_id = ?")
    ) {
      const humanId = values[0];
      const matched = tables.human_continuity_identities.filter(
        (h) => h.human_id === humanId
      );
      return Promise.resolve(matched.map((m) => ({ ...m })));
    }

    // ── 5. SELECT human_youniverse_associations by human_id + identity_id ───
    if (
      query.includes("FROM human_youniverse_associations") &&
      query.includes("WHERE human_id = ?") &&
      query.includes("identity_id = ?")
    ) {
      const [humanId, identityId] = values;
      const matched = tables.human_youniverse_associations.filter(
        (a) => a.human_id === humanId && a.identity_id === identityId
      );
      return Promise.resolve(matched.map((m) => ({ ...m })));
    }

    // ── 6. SELECT human_youniverse_associations ordered for session target ──
    if (
      query.includes("FROM human_youniverse_associations") &&
      query.includes("WHERE human_id = ?") &&
      query.includes("ORDER BY is_homeverse DESC")
    ) {
      const humanId = values[0];
      const matched = tables.human_youniverse_associations
        .filter(
          (a) =>
            a.human_id === humanId &&
            a.verification_status === "verified" &&
            a.revoked_at === null
        )
        .sort((a, b) => (b.is_homeverse ? 1 : 0) - (a.is_homeverse ? 1 : 0));
      return Promise.resolve(matched.map((m) => ({ ...m })));
    }

    // ── 7. INSERT INTO sessions ─────────────────────────────────────────────
    if (query.includes("INSERT INTO sessions")) {
      let identity_id: string;
      let human_id: string | null = null;
      let auth_subject_id: string | null = null;
      let token_hash: string;
      let expires_at: string;
      let user_agent: string | null = null;
      let ip_address: string | null = null;

      if (values.length === 7) {
        [
          identity_id,
          human_id,
          auth_subject_id,
          token_hash,
          expires_at,
          user_agent,
          ip_address,
        ] = values;
      } else {
        [identity_id, token_hash, expires_at, user_agent, ip_address] = values;
      }

      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      tables.sessions.push({
        id,
        identity_id,
        human_id,
        auth_subject_id,
        token_hash,
        expires_at: new Date(expires_at),
        revoked_at: null,
        user_agent,
        ip_address,
        created_at: new Date(),
      });
      return Promise.resolve([]);
    }

    // ── 8. SELECT sessions by token_hash (with or without JOIN) ─────────────
    if (
      query.includes("FROM sessions") &&
      query.includes("JOIN youniverse_identities") &&
      query.includes("WHERE s.token_hash = ?")
    ) {
      const hash = values[0];
      const sess = tables.sessions.find((s) => s.token_hash === hash);
      if (!sess) return Promise.resolve([]);
      const ident = tables.youniverse_identities.find((y) => y.identity_id === sess.identity_id);
      if (!ident) return Promise.resolve([]);
      return Promise.resolve([
        {
          session_id: sess.id,
          identity_id: sess.identity_id,
          human_id: sess.human_id ?? null,
          expires_at: sess.expires_at,
          revoked_at: sess.revoked_at,
          username: ident.username,
          email: ident.email,
          plan: ident.plan,
          is_live: ident.is_live,
          email_verified_at: ident.email_verified_at,
        },
      ]);
    }

    if (
      query.includes("FROM sessions") &&
      query.includes("WHERE token_hash = ?")
    ) {
      const hash = values[0];
      const row = tables.sessions.find((s) => s.token_hash === hash);
      return Promise.resolve(row ? [{ ...row }] : []);
    }

    // ── 8b. NotNote widget artifact persistence ──────────────────────────────
    if (query.includes('INSERT INTO "NotNote"')) {
      const [id, youniverseId, title, contentJson] = values;
      const content = typeof contentJson === "string" ? JSON.parse(contentJson) : contentJson;
      const now = new Date();
      tables.not_notes.push({
        id,
        youniverseId,
        title,
        content,
        status: "APPROVED",
        createdAt: now,
        updatedAt: now,
      });
      return Promise.resolve([]);
    }

    if (query.includes('SELECT id, "youniverseId", title, content') && query.includes('FROM "NotNote"')) {
      if (query.includes('WHERE id = ?')) {
        const id = values[0];
        return Promise.resolve(tables.not_notes.filter((n) => n.id === id).map((n) => ({ ...n })));
      }
      if (query.includes('WHERE "youniverseId" = ?')) {
        const youniverseId = values[0];
        return Promise.resolve(
          tables.not_notes
            .filter((n) => n.youniverseId === youniverseId && n.status === "APPROVED")
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((n) => ({ ...n }))
        );
      }
    }

    if (query.includes('UPDATE "NotNote" SET title = ?')) {
      const [title, contentJson, id, youniverseId] = values;
      const content = typeof contentJson === "string" ? JSON.parse(contentJson) : contentJson;
      const row = tables.not_notes.find((n) => n.id === id && n.youniverseId === youniverseId);
      if (row) {
        row.title = title;
        row.content = content;
        row.updatedAt = new Date();
      }
      return Promise.resolve([]);
    }

    // ── 8b-2. Books OS archive entries persistence ──────────────────────────
    if (query.includes("INSERT INTO books_os_archive_entries")) {
      const [
        id,
        youniverse_id,
        source_artifact_id,
        entry_type,
        tower_id,
        shelf_id,
        book_id,
        page_id,
        title,
        summary,
        body_markdown,
        payloadJsonRaw,
        version_hash,
      ] = values;
      const payload_json =
        typeof payloadJsonRaw === "string" ? JSON.parse(payloadJsonRaw) : payloadJsonRaw ?? {};
      const now = new Date();
      tables.books_os_archive_entries.push({
        id,
        youniverse_id,
        source_artifact_id: source_artifact_id ?? null,
        entry_type,
        tower_id,
        shelf_id,
        book_id,
        page_id: page_id ?? null,
        title,
        summary: summary ?? null,
        body_markdown: body_markdown ?? "",
        payload_json,
        version_hash,
        webhook_sync_status: "skipped",
        webhook_synced_at: null,
        created_at: now,
        updated_at: now,
      });
      return Promise.resolve([]);
    }

    if (query.includes("FROM books_os_archive_entries")) {
      if (
        query.includes("WHERE youniverse_id = ?") &&
        query.includes("AND source_artifact_id = ?") &&
        query.includes("AND version_hash = ?")
      ) {
        const [youniverse_id, source_artifact_id, version_hash] = values;
        const matched = tables.books_os_archive_entries.filter(
          (r) =>
            r.youniverse_id === youniverse_id &&
            r.source_artifact_id === source_artifact_id &&
            r.version_hash === version_hash
        );
        return Promise.resolve(matched.slice(0, 1).map((r) => ({ ...r })));
      }
      if (
        query.includes("WHERE youniverse_id = ?") &&
        query.includes("AND source_artifact_id IS NULL") &&
        query.includes("AND version_hash = ?")
      ) {
        const [youniverse_id, version_hash] = values;
        const matched = tables.books_os_archive_entries.filter(
          (r) =>
            r.youniverse_id === youniverse_id &&
            r.source_artifact_id === null &&
            r.version_hash === version_hash
        );
        return Promise.resolve(matched.slice(0, 1).map((r) => ({ ...r })));
      }
      if (query.includes("WHERE youniverse_id = ?") && query.includes("AND source_artifact_id = ?")) {
        const [youniverse_id, source_artifact_id, limit] = values;
        const matched = tables.books_os_archive_entries
          .filter(
            (r) => r.youniverse_id === youniverse_id && r.source_artifact_id === source_artifact_id
          )
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 50);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
      if (query.includes("WHERE youniverse_id = ?")) {
        const [youniverse_id, limit] = values;
        const matched = tables.books_os_archive_entries
          .filter((r) => r.youniverse_id === youniverse_id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 50);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
    }

    if (query.includes("UPDATE books_os_archive_entries")) {
      const [webhook_sync_status, webhook_synced_at, id, youniverse_id] = values;
      const row = tables.books_os_archive_entries.find(
        (r) => r.id === id && r.youniverse_id === youniverse_id
      );
      if (row) {
        row.webhook_sync_status = webhook_sync_status;
        row.webhook_synced_at = webhook_synced_at ? new Date(webhook_synced_at) : null;
        row.updated_at = new Date();
      }
      return Promise.resolve([]);
    }

    // ── 8b-3. Collection Point submissions persistence ──────────────────────
    if (query.includes("INSERT INTO collection_point_submissions")) {
      const [
        id,
        youniverse_id,
        widget_id,
        collection_type,
        email,
        name,
        message,
        payloadJsonRaw,
        source_origin,
      ] = values;
      const payload_json =
        typeof payloadJsonRaw === "string" ? JSON.parse(payloadJsonRaw) : payloadJsonRaw ?? {};
      tables.collection_point_submissions.push({
        id,
        youniverse_id,
        widget_id: widget_id ?? null,
        collection_type,
        email: email ?? null,
        name: name ?? null,
        message: message ?? null,
        payload_json,
        source_origin: source_origin ?? null,
        created_at: new Date(),
      });
      return Promise.resolve([]);
    }

    if (query.includes("FROM collection_point_submissions")) {
      if (
        query.includes("WHERE youniverse_id = ?") &&
        query.includes("AND widget_id = ?") &&
        query.includes("AND collection_type = ?")
      ) {
        const [youniverse_id, widget_id, collection_type, limit] = values;
        const matched = tables.collection_point_submissions
          .filter(
            (r) =>
              r.youniverse_id === youniverse_id &&
              r.widget_id === widget_id &&
              r.collection_type === collection_type
          )
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 100);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
      if (query.includes("WHERE youniverse_id = ?") && query.includes("AND widget_id = ?")) {
        const [youniverse_id, widget_id, limit] = values;
        const matched = tables.collection_point_submissions
          .filter((r) => r.youniverse_id === youniverse_id && r.widget_id === widget_id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 100);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
      if (query.includes("WHERE youniverse_id = ?") && query.includes("AND collection_type = ?")) {
        const [youniverse_id, collection_type, limit] = values;
        const matched = tables.collection_point_submissions
          .filter(
            (r) => r.youniverse_id === youniverse_id && r.collection_type === collection_type
          )
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 100);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
      if (query.includes("WHERE youniverse_id = ?")) {
        const [youniverse_id, limit] = values;
        const matched = tables.collection_point_submissions
          .filter((r) => r.youniverse_id === youniverse_id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, Number(limit) || 100);
        return Promise.resolve(matched.map((r) => ({ ...r })));
      }
    }

    // ── 8c. youniverse_identities plan lookup ───────────────────────────────
    if (query.includes("SELECT plan FROM youniverse_identities WHERE identity_id = ?")) {
      const id = values[0];
      return Promise.resolve(tables.youniverse_identities.filter((y) => y.identity_id === id).map((y) => ({ plan: y.plan })));
    }

    // ── 9. UPDATE sessions SET revoked_at ───────────────────────────────────
    if (query.includes("UPDATE sessions") && query.includes("SET revoked_at")) {
      if (query.includes("WHERE id = ?")) {
        const id = values[0];
        const s = tables.sessions.find(
          (x) => String(x.id) === String(id) && !x.revoked_at
        );
        if (s) s.revoked_at = new Date();
      } else if (query.includes("WHERE token_hash = ?")) {
        const hash = values[0];
        const s = tables.sessions.find(
          (x) => x.token_hash === hash && !x.revoked_at
        );
        if (s) s.revoked_at = new Date();
      } else if (query.includes("WHERE human_id = ?")) {
        const humanId = values[0];
        tables.sessions
          .filter((s) => s.human_id === humanId && !s.revoked_at)
          .forEach((s) => {
            s.revoked_at = new Date();
          });
      }
      return Promise.resolve([]);
    }

    // ── 10. INSERT INTO handoff_tokens ──────────────────────────────────────
    if (query.includes("INSERT INTO handoff_tokens")) {
      const [handle, nonce, expires_at] = values;
      tables.handoff_tokens.push({
        id: `ht-${Date.now()}`,
        handle,
        nonce,
        expires_at: new Date(expires_at),
        created_at: new Date(),
      });
      return Promise.resolve([]);
    }

    // ── 11. Entitlements query ──────────────────────────────────────────────
    if (query.includes("FROM public.identity_entitlements")) {
      return Promise.resolve([]);
    }

    // ── 12. Generic fallback ────────────────────────────────────────────────
    return Promise.resolve([]);
  };

  sql.transaction = async function (fn: (txSql: any) => Promise<any[]> | any[]) {
    if (typeof fn === "function") {
      const queries = fn(sql);
      if (Array.isArray(queries)) {
        const results = [];
        for (const q of queries) results.push(await q);
        return results;
      }
      return await queries;
    }
    return [];
  };

  sql.query = function (queryText: string, params: any[] = []) {
    return sql([queryText] as any, ...params);
  };

  const seed = async () => {
    // 1. Owner credentials
    const ownerHashResult = await hashPassword(TEST_FIXTURES.owner.password);
    tables.human_continuity_identities.push({
      human_id: TEST_FIXTURES.owner.humanId,
      status: "active",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_auth_subjects.push({
      id: TEST_FIXTURES.owner.authSubjectId,
      human_id: TEST_FIXTURES.owner.humanId,
      provider_type: "password",
      subject_identifier: TEST_FIXTURES.owner.email,
      status: "active",
      verified_at: new Date("2026-01-01T00:00:00Z"),
      revoked_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_passwords.push({
      auth_subject_id: TEST_FIXTURES.owner.authSubjectId,
      password_hash: ownerHashResult.passwordHash,
      salt: ownerHashResult.salt,
      algorithm: ownerHashResult.algorithm,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.youniverse_identities.push({
      identity_id: TEST_FIXTURES.owner.identityId,
      username: TEST_FIXTURES.owner.username,
      email: TEST_FIXTURES.owner.email,
      subdomain: TEST_FIXTURES.owner.username,
      display_name: "Test Youniverse",
      identity_type: "person",
      plan: "free",
      is_live: true,
      email_verified_at: new Date("2026-01-01T00:00:00Z"),
      created_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_youniverse_associations.push({
      id: "assoc-test-owner-001",
      human_id: TEST_FIXTURES.owner.humanId,
      identity_id: TEST_FIXTURES.owner.identityId,
      role: "owner",
      verification_status: "verified",
      is_homeverse: true,
      requires_reverification: false,
      reverification_required_at: null,
      verified_at: new Date("2026-01-01T00:00:00Z"),
      revoked_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });

    // 2. Visitor (Non-Owner) credentials
    const visitorHashResult = await hashPassword(TEST_FIXTURES.visitor.password);
    tables.human_continuity_identities.push({
      human_id: TEST_FIXTURES.visitor.humanId,
      status: "active",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_auth_subjects.push({
      id: TEST_FIXTURES.visitor.authSubjectId,
      human_id: TEST_FIXTURES.visitor.humanId,
      provider_type: "password",
      subject_identifier: TEST_FIXTURES.visitor.email,
      status: "active",
      verified_at: new Date("2026-01-01T00:00:00Z"),
      revoked_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_passwords.push({
      auth_subject_id: TEST_FIXTURES.visitor.authSubjectId,
      password_hash: visitorHashResult.passwordHash,
      salt: visitorHashResult.salt,
      algorithm: visitorHashResult.algorithm,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.youniverse_identities.push({
      identity_id: TEST_FIXTURES.visitor.identityId,
      username: TEST_FIXTURES.visitor.username,
      email: TEST_FIXTURES.visitor.email,
      subdomain: TEST_FIXTURES.visitor.username,
      display_name: "Visitor Space",
      identity_type: "person",
      plan: "free",
      is_live: true,
      email_verified_at: new Date("2026-01-01T00:00:00Z"),
      created_at: new Date("2026-01-01T00:00:00Z"),
    });

    tables.human_youniverse_associations.push({
      id: "assoc-visitor-002",
      human_id: TEST_FIXTURES.visitor.humanId,
      identity_id: TEST_FIXTURES.visitor.identityId,
      role: "owner",
      verification_status: "verified",
      is_homeverse: true,
      requires_reverification: false,
      reverification_required_at: null,
      verified_at: new Date("2026-01-01T00:00:00Z"),
      revoked_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
  };

  return {
    tables,
    sql,
    init: seed,
    reset: async () => {
      for (const k of Object.keys(tables) as (keyof LocalDbTables)[]) {
        tables[k] = [];
      }
      await seed();
    },
  };
}

// Global singleton instance for local dev server
export const isolatedLocalDb = createIsolatedTestDb();
await isolatedLocalDb.init();
