/**
 * tests/creator-multi-youniverse.test.mjs
 *
 * End-to-end verification suite for Creator Override — Multi-Youniverse Ownership:
 *   1. Verified Creator can claim multiple available handles via @ Line /api/claim.
 *   2. Creator can access each owned Youniverse with per-Youniverse isolation.
 *   3. Creator cannot claim an already-taken handle.
 *   4. Unverified email cannot exercise or provision Creator privileges.
 *   5. Normal user or unauthenticated caller cannot impersonate the Creator.
 *   6. Normal user remains strictly limited to one free Youniverse.
 *   7. Creator session cannot access a Youniverse owned by someone else.
 *   8. Ownership remains correct after logout, login, and cross-subdomain handoff.
 *   9. Preview deployments and non-production runtimes against Production DB cannot use Creator privileges.
 *  10. Genesis 001 eligibility, activation, and singleton award behavior remain unchanged.
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Ensure clean RS256 keys for test suite
const testKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.HANDOFF_PRIVATE_KEY = testKeyPair.privateKey;
process.env.HANDOFF_PUBLIC_KEY = testKeyPair.publicKey;
process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = "1";

import claimHandler from "../api/claim.ts";
import verifyHandler from "../api/v1/auth/verify.ts";
import verifyTokenHandler from "../api/verify-token.ts";
import contextHandler from "../api/youniverse/[handle]/context.ts";
import publicHandler from "../api/youniverse/[handle]/public.ts";
import artifactHandler from "../api/not-notes/artifact.ts";
import widgetsHandler from "../api/not-notes/widgets.ts";
import geminiHandler from "../api/gemini.ts";
import weaverGenerateHandler from "../api/weaver/generate.ts";
import { verifyJwt } from "../middleware/verifyJwt.js";
import {
  DESIGNATED_CREATOR_EMAIL,
  accountIdForEmail,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  evaluateMigration011RollbackSafety,
  isCreatorRuntimeAllowed,
  listOwnedYouniversesForIdentity,
  normalizeRequestHost,
  provisionCreatorEntitlement,
  syncVerifiedOwnerMembership,
} from "../lib/creatorOwnership.ts";
import { createSession, hashToken, revokeSession } from "../lib/neonSession.ts";
import { GENESIS_AWARD_SLOT, GENESIS_DESIGNATION, GENESIS_OFFICIAL_TITLE } from "../lib/genesisService.ts";

const TEST_PROVISIONING_SECRET = "creator-provisioning-secret-at-least-32-bytes";

function createMockReqRes({
  method = "GET",
  headers = {},
  params = {},
  query = {},
  body = null,
  url = "/",
} = {}) {
  const req = { method, headers, params, query, body, url };
  let statusCode = 200;
  let responseBody = null;
  const responseHeaders = {};

  const res = {
    setHeader(k, v) {
      responseHeaders[k.toLowerCase()] = v;
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
      return res;
    },
    end() {
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return responseBody;
    },
    get headers() {
      return responseHeaders;
    },
  };

  return { req, res };
}

/**
 * In-memory relational + transactional database simulator enforcing the constraints
 * of migrations 001–011 (including owner_accounts, youniverse_owner_memberships,
 * creator_privilege_audit_log, and Genesis 001 singleton triggers).
 */
function createCreatorSimDb({
  genesisEnabled = true,
  foundingAngelsCompleted = true,
} = {}) {
  let state = {
    identities: new Map(), // keyed by identity_id
    verificationTokens: new Map(), // keyed by id
    sessions: new Map(), // keyed by token_hash
    handoffTokens: [],
    ownerAccounts: new Map(), // keyed by primary_email
    memberships: new Map(), // keyed by identity_id
    auditLog: [],
    notNotes: [],
    genesisProgram: {
      program_key: "genesis_001",
      official_title: GENESIS_OFFICIAL_TITLE,
      official_designation: GENESIS_DESIGNATION,
      is_enabled: genesisEnabled,
      activated_at: "2026-11-12T05:00:00.000Z",
      eligible_verified_after: "2026-11-12T05:00:00.000Z",
    },
    foundingAngelsSetup: {
      setup_key: "founding_angels",
      is_completed: foundingAngelsCompleted,
      completed_at: foundingAngelsCompleted ? "2026-11-11T20:00:00.000Z" : null,
    },
    genesisAwards: new Map(),
    identityEntitlements: [],
    foundingMemberships: new Map(),
  };

  function cloneState(s) {
    return {
      ...s,
      identities: new Map(Array.from(s.identities.entries()).map(([k, v]) => [k, { ...v }])),
      verificationTokens: new Map(Array.from(s.verificationTokens.entries()).map(([k, v]) => [k, { ...v }])),
      sessions: new Map(Array.from(s.sessions.entries()).map(([k, v]) => [k, { ...v }])),
      handoffTokens: s.handoffTokens.map((h) => ({ ...h })),
      ownerAccounts: new Map(Array.from(s.ownerAccounts.entries()).map(([k, v]) => [k, { ...v }])),
      memberships: new Map(Array.from(s.memberships.entries()).map(([k, v]) => [k, { ...v }])),
      auditLog: s.auditLog.map((a) => ({ ...a })),
      notNotes: s.notNotes.map((n) => ({ ...n })),
      genesisAwards: new Map(Array.from(s.genesisAwards.entries()).map(([k, v]) => [k, { ...v }])),
      identityEntitlements: s.identityEntitlements.map((e) => ({ ...e })),
      foundingMemberships: new Map(Array.from(s.foundingMemberships.entries()).map(([k, v]) => [k, { ...v }])),
    };
  }

  function execQuery(snap, text, params = []) {
    const q = text.replace(/\s+/g, " ").trim();

    if (q.includes("FROM public.founding_angels_platform_setup")) {
      return { rows: snap.foundingAngelsSetup ? [snap.foundingAngelsSetup] : [] };
    }

    if (q.includes("WITH consumed_token AS") && q.includes("verified_identity AS")) {
      const tokenHash = params[0];
      const now = new Date();
      let foundTok = null;
      for (const tok of snap.verificationTokens.values()) {
        if (tok.token_hash === tokenHash && tok.consumed_at === null && new Date(tok.expires_at) > now) {
          foundTok = tok;
          break;
        }
      }
      if (!foundTok) return { rows: [] };
      const ident = snap.identities.get(foundTok.identity_id);
      if (!ident) return { rows: [] };
      const ts = now.toISOString();
      foundTok.consumed_at = ts;
      ident.email_verified_at = ident.email_verified_at ?? ts;
      return {
        rows: [
          {
            token_id: foundTok.id,
            identity_id: ident.identity_id,
            username: ident.username,
            email: ident.email,
            identity_type: ident.identity_type,
            is_live: ident.is_live,
            email_verified_at: ident.email_verified_at,
          },
        ],
      };
    }

    if (q.includes("FROM public.email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const match = Array.from(snap.verificationTokens.values()).find((t) => t.token_hash === params[0]);
      return { rows: match ? [match] : [] };
    }

    if (q.includes("FROM public.genesis_program_state")) {
      return { rows: [snap.genesisProgram] };
    }

    if (q.startsWith("INSERT INTO public.genesis_awards")) {
      const [awardSlot, identityId, username, officialTitle, awardLabel, tokenId] = params;
      if (snap.genesisAwards.has(awardSlot)) return { rows: [] };
      const ident = snap.identities.get(identityId);
      if (!ident || !ident.is_live || ident.identity_type !== "person" || !ident.email_verified_at) {
        throw new Error("DB trigger rejected Genesis eligibility");
      }
      if (String(ident.email).toLowerCase().endsWith("@itsyouonline.com")) {
        throw new Error("DB trigger rejected excluded internal email");
      }
      const row = {
        award_slot: awardSlot,
        identity_id: identityId,
        awarded_username: username,
        official_title: officialTitle,
        award_label: awardLabel,
        verification_token_id: tokenId,
        source_environment: "production",
        awarded_at: new Date().toISOString(),
        ceremony_seen_at: null,
      };
      snap.genesisAwards.set(awardSlot, row);
      return { rows: [row] };
    }

    if (q.startsWith("INSERT INTO public.identity_entitlements")) {
      const [identityId, entitlementKey, sourceRef] = params;
      snap.identityEntitlements.push({
        identity_id: identityId,
        entitlement_key: entitlementKey,
        source_type: "genesis_001",
        source_ref: sourceRef,
        is_lifetime: true,
        status: "active",
      });
      return { rows: [] };
    }

    return { rows: [] };
  }

  const pool = {
    async connect() {
      let txSnap = null;
      return {
        async query(text, params = []) {
          const upper = text.trim().toUpperCase();
          if (upper === "BEGIN") {
            txSnap = cloneState(state);
            return { rows: [] };
          }
          if (upper === "COMMIT") {
            state = txSnap;
            txSnap = null;
            return { rows: [] };
          }
          if (upper === "ROLLBACK") {
            txSnap = null;
            return { rows: [] };
          }
          return execQuery(txSnap ?? state, text, params);
        },
        release() {},
      };
    },
  };

  async function sqlTag(strings, ...values) {
    const q = strings.join("?").replace(/\s+/g, " ").trim();

    // ── owner_accounts ──────────────────────────────────────────
    if (q.includes("FROM public.owner_accounts") && q.includes("WHERE primary_email =")) {
      const email = values[0];
      const oa = state.ownerAccounts.get(email);
      if (!oa) return [];
      if (q.includes("is_creator = TRUE") && oa.is_creator !== true) return [];
      return [oa];
    }

    if (q.includes("INSERT INTO public.owner_accounts")) {
      if (q.includes("TRUE, NOW(),")) {
        // provisionCreatorEntitlement upsert
        const [accountId, primaryEmail, verifiedIso, provisionedBy] = values;
        if (primaryEmail !== DESIGNATED_CREATOR_EMAIL || !verifiedIso || !provisionedBy) {
          throw new Error("DB constraint owner_accounts_creator_invariant_check violated");
        }
        const existing = state.ownerAccounts.get(primaryEmail);
        const row = {
          account_id: existing?.account_id ?? accountId,
          primary_email: primaryEmail,
          email_verified_at: existing?.email_verified_at ?? verifiedIso,
          is_creator: true,
          creator_provisioned_at: existing?.creator_provisioned_at ?? new Date().toISOString(),
          creator_provisioned_by: provisionedBy,
          status: "active",
          created_at: existing?.created_at ?? new Date().toISOString(),
        };
        state.ownerAccounts.set(primaryEmail, row);
        return [row];
      }

      // syncVerifiedOwnerMembership upsert (is_creator = FALSE on insert)
      const [accountId, primaryEmail, verifiedIso] = values;
      const existing = state.ownerAccounts.get(primaryEmail);
      const row = existing
        ? {
            ...existing,
            email_verified_at: existing.email_verified_at ?? verifiedIso,
          }
        : {
            account_id: accountId,
            primary_email: primaryEmail,
            email_verified_at: verifiedIso,
            is_creator: false,
            creator_provisioned_at: null,
            creator_provisioned_by: null,
            status: "active",
            created_at: new Date().toISOString(),
          };
      state.ownerAccounts.set(primaryEmail, row);
      return [row];
    }

    // ── youniverse_owner_memberships ────────────────────────────
    if (q.includes("INSERT INTO public.youniverse_owner_memberships")) {
      const [accountId, identityId, claimSource, verifiedIso] = values;
      const existing = state.memberships.get(identityId);
      const row = {
        id: existing?.id ?? crypto.randomUUID(),
        account_id: accountId,
        identity_id: identityId,
        role: "owner",
        status: "active",
        claim_source: q.includes("claim_source =") ? claimSource : (existing?.claim_source ?? claimSource),
        verified_at: existing?.verified_at ?? verifiedIso,
        created_at: existing?.created_at ?? new Date().toISOString(),
      };
      state.memberships.set(identityId, row);
      return [row];
    }

    if (
      q.includes("FROM public.youniverse_owner_memberships m_self") &&
      q.includes("JOIN public.youniverse_owner_memberships m_other")
    ) {
      const hasStrictCreatorFilter = q.includes("oa.is_creator = TRUE");
      const creatorEmailFilter = hasStrictCreatorFilter ? values[0] : null;
      const identityId = hasStrictCreatorFilter ? values[1] : values[0];

      const selfM = state.memberships.get(identityId);
      if (!selfM || selfM.status !== "active" || !selfM.verified_at) return [];
      const oa = Array.from(state.ownerAccounts.values()).find((a) => a.account_id === selfM.account_id);
      if (!oa || oa.status !== "active" || !oa.email_verified_at) return [];
      if (hasStrictCreatorFilter) {
        if (
          oa.is_creator !== true ||
          oa.primary_email !== creatorEmailFilter ||
          !oa.creator_provisioned_at
        ) {
          return [];
        }
      }
      const selfIdent = state.identities.get(identityId);
      if (!selfIdent || !selfIdent.is_live || !selfIdent.email_verified_at) return [];

      const results = [];
      for (const m of state.memberships.values()) {
        if (m.account_id === oa.account_id && m.status === "active" && m.verified_at) {
          const yi = state.identities.get(m.identity_id);
          if (yi && yi.is_live && yi.email_verified_at) {
            results.push({
              identity_id: yi.identity_id,
              username: yi.username,
              subdomain: yi.subdomain,
              display_name: yi.display_name,
              plan: yi.plan,
              claim_source: m.claim_source,
              created_at: m.created_at,
            });
          }
        }
      }
      results.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return results;
    }

    // Rollback safety aggregate checks
    if (q.includes("FROM public.creator_privilege_audit_log") && q.includes("GROUP BY event_type")) {
      const grouped = new Map();
      for (const entry of state.auditLog) {
        grouped.set(entry.event_type, (grouped.get(entry.event_type) ?? 0) + 1);
      }
      return Array.from(grouped.entries()).map(([event_type, cnt]) => ({ event_type, cnt }));
    }

    if (q.includes("FROM public.owner_accounts") && q.includes("creator_provisioned_at IS NOT NULL")) {
      const cnt = Array.from(state.ownerAccounts.values()).filter(
        (a) => a.is_creator === true || Boolean(a.creator_provisioned_at)
      ).length;
      return [{ cnt }];
    }

    if (
      q.includes("FROM public.youniverse_owner_memberships m") &&
      q.includes("LEFT JOIN public.owner_accounts oa")
    ) {
      let cnt = 0;
      for (const m of state.memberships.values()) {
        const oa = Array.from(state.ownerAccounts.values()).find((a) => a.account_id === m.account_id);
        if (m.claim_source === "creator_override" || oa?.is_creator === true) {
          cnt++;
        }
      }
      return [{ cnt }];
    }

    if (
      q.includes("FROM public.youniverse_owner_memberships m") &&
      q.includes("JOIN public.owner_accounts oa")
    ) {
      const identityId = values[0];
      const m = state.memberships.get(identityId);
      if (!m) return [];
      const oa = Array.from(state.ownerAccounts.values()).find((a) => a.account_id === m.account_id);
      if (!oa) return [];
      return [
        {
          account_id: oa.account_id,
          identity_id: m.identity_id,
          primary_email: oa.primary_email,
          email_verified_at: oa.email_verified_at,
          account_email_verified_at: oa.email_verified_at,
          is_creator: oa.is_creator,
          creator_provisioned_at: oa.creator_provisioned_at,
          creator_provisioned_by: oa.creator_provisioned_by,
          account_status: oa.status,
          membership_status: m.status,
          claim_source: m.claim_source,
          membership_verified_at: m.verified_at,
        },
      ];
    }

    if (q.includes("FROM public.youniverse_owner_memberships m") && q.includes("WHERE m.identity_id =")) {
      const m = state.memberships.get(values[0]);
      if (!m) return [];
      return [
        {
          account_id: m.account_id,
          identity_id: m.identity_id,
          membership_status: m.status,
          membership_verified_at: m.verified_at,
        },
      ];
    }

    // ── creator_privilege_audit_log ─────────────────────────────
    if (q.includes("INSERT INTO public.creator_privilege_audit_log")) {
      const [
        accountId,
        actorSessionId,
        actorIdentityId,
        targetIdentityId,
        targetHandle,
        targetSubdomain,
        eventType,
        runtimeEnv,
        ipAddress,
        userAgent,
        metadataJson,
      ] = values;
      const entry = {
        event_id: crypto.randomUUID(),
        account_id: accountId,
        actor_session_id: actorSessionId,
        actor_identity_id: actorIdentityId,
        target_identity_id: targetIdentityId,
        target_handle: targetHandle,
        target_subdomain: targetSubdomain,
        event_type: eventType,
        runtime_environment: runtimeEnv,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: JSON.parse(metadataJson),
        created_at: new Date().toISOString(),
      };
      state.auditLog.push(entry);
      return [entry];
    }

    // ── youniverse_identities ───────────────────────────────────
    if (q.includes("FROM youniverse_identities") && q.includes("WHERE lower(btrim(email)) =")) {
      const email = values[0];
      return Array.from(state.identities.values())
        .filter((i) => String(i.email || "").toLowerCase().trim() === email)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE username =")) {
      const match = Array.from(state.identities.values()).find((i) => i.username === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE identity_id =")) {
      const match = state.identities.get(values[0]);
      return match ? [match] : [];
    }

    if (q.includes("FROM youniverse_identities") && q.includes("WHERE email =")) {
      const email = values[0];
      const excludeUsername = values.length > 1 ? values[1] : null;
      const match = Array.from(state.identities.values()).find(
        (i) =>
          i.email === email &&
          (!i.plan || i.plan === "free") &&
          (excludeUsername ? i.username !== excludeUsername : true)
      );
      return match ? [match] : [];
    }

    if (q.includes("INSERT INTO youniverse_identities")) {
      const [
        identity_id,
        username,
        display_name,
        subdomain,
        identity_type,
        email,
        plan,
        email_verified_at,
        created_at,
      ] = values;
      for (const existing of state.identities.values()) {
        if (existing.username === username || existing.subdomain === subdomain) {
          const err = new Error('duplicate key value violates unique constraint "youniverse_identities_username_key"');
          err.code = "23505";
          throw err;
        }
      }
      const record = {
        identity_id,
        username,
        display_name,
        subdomain,
        identity_type,
        email,
        plan,
        is_live: true,
        is_primary: true,
        email_verified_at,
        created_at,
      };
      state.identities.set(identity_id, record);
      return [record];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET display_name =") && q.includes("email_verified_at =")) {
      const [displayName, verifiedIso, identityId] = values;
      const ident = state.identities.get(identityId);
      if (ident && ident.email_verified_at === null) {
        ident.display_name = displayName;
        ident.email_verified_at = verifiedIso;
      }
      return [];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET display_name =")) {
      const [displayName, identityId] = values;
      const ident = state.identities.get(identityId);
      if (ident && ident.email_verified_at === null) {
        ident.display_name = displayName;
      }
      return [];
    }

    if (q.includes("UPDATE youniverse_identities") && q.includes("SET email_verified_at = NOW()")) {
      const ident = state.identities.get(values[0]);
      if (ident) ident.email_verified_at = new Date().toISOString();
      return [];
    }

    // ── email_verification_tokens ───────────────────────────────
    if (q.includes("INSERT INTO email_verification_tokens")) {
      const [identity_id, token_hash, expires_at] = values;
      const record = {
        id: "evt_" + crypto.randomBytes(6).toString("hex"),
        identity_id,
        token_hash,
        expires_at,
        consumed_at: null,
      };
      state.verificationTokens.set(record.id, record);
      return [record];
    }

    if (q.includes("UPDATE email_verification_tokens") && q.includes("WHERE identity_id =")) {
      for (const tok of state.verificationTokens.values()) {
        if (tok.identity_id === values[0] && tok.consumed_at === null) {
          tok.consumed_at = new Date().toISOString();
        }
      }
      return [];
    }

    if (q.includes("FROM email_verification_tokens") && q.includes("WHERE token_hash =")) {
      const match = Array.from(state.verificationTokens.values()).find((t) => t.token_hash === values[0]);
      return match ? [match] : [];
    }

    if (q.includes("UPDATE email_verification_tokens") && q.includes("SET consumed_at = NOW()")) {
      const tok = state.verificationTokens.get(values[0]);
      if (tok && tok.consumed_at === null) {
        tok.consumed_at = new Date().toISOString();
        return [{ id: tok.id }];
      }
      return [];
    }

    // ── handoff_tokens ──────────────────────────────────────────
    if (q.includes("INSERT INTO handoff_tokens")) {
      const [handle, nonce, expires_at] = values;
      const rec = {
        token_id: crypto.randomUUID(),
        handle,
        nonce,
        expires_at,
        consumed: false,
      };
      state.handoffTokens.push(rec);
      return [rec];
    }

    if (q.includes("UPDATE handoff_tokens") && q.includes("SET consumed = TRUE")) {
      const [nonce, handle] = values;
      const rec = state.handoffTokens.find(
        (h) =>
          h.nonce === nonce &&
          h.handle === handle &&
          h.consumed === false &&
          new Date(h.expires_at) > new Date()
      );
      if (!rec) return [];
      rec.consumed = true;
      return [{ token_id: rec.token_id }];
    }

    // ── sessions ────────────────────────────────────────────────
    if (q.includes("INSERT INTO sessions")) {
      const [identity_id, token_hash, expires_at, user_agent, ip_address] = values;
      const rec = {
        id: "sess_" + crypto.randomBytes(6).toString("hex"),
        identity_id,
        token_hash,
        expires_at,
        revoked_at: null,
        user_agent,
        ip_address,
      };
      state.sessions.set(token_hash, rec);
      return [rec];
    }

    if (q.includes("FROM sessions s") && q.includes("JOIN youniverse_identities i")) {
      const s = state.sessions.get(values[0]);
      if (!s) return [];
      const i = state.identities.get(s.identity_id);
      if (!i) return [];
      return [
        {
          session_id: s.id,
          identity_id: s.identity_id,
          expires_at: s.expires_at,
          revoked_at: s.revoked_at,
          username: i.username,
          email: i.email,
          plan: i.plan,
          is_live: i.is_live,
          email_verified_at: i.email_verified_at,
        },
      ];
    }

    if (q.includes("FROM sessions") && q.includes("WHERE token_hash =")) {
      const s = state.sessions.get(values[0]);
      return s ? [s] : [];
    }

    if (q.includes("UPDATE sessions") && q.includes("SET revoked_at = NOW()")) {
      const s = state.sessions.get(values[0]);
      if (s && s.revoked_at === null) {
        s.revoked_at = new Date().toISOString();
      }
      return [];
    }

    // ── NotNote ─────────────────────────────────────────────────
    if (q.includes('INSERT INTO "NotNote"')) {
      const [id, youniverseId, title, contentJson] = values;
      const note = {
        id,
        youniverseId,
        title,
        content: JSON.parse(contentJson),
        status: "APPROVED",
        createdAt: new Date().toISOString(),
      };
      state.notNotes.push(note);
      return [note];
    }

    if (q.includes('FROM "NotNote"') && q.includes('WHERE "youniverseId" =')) {
      return state.notNotes.filter(
        (n) => n.youniverseId === values[0] && n.status === "APPROVED"
      );
    }

    // ── Genesis / Entitlements ──────────────────────────────────
    if (q.includes("FROM public.identity_entitlements")) {
      return state.identityEntitlements.filter(
        (e) => e.identity_id === values[0] && e.status === "active"
      );
    }

    if (q.includes("FROM public.genesis_awards") && q.includes("WHERE identity_id =")) {
      const a = state.genesisAwards.get(GENESIS_AWARD_SLOT);
      return a && a.identity_id === values[0] ? [a] : [];
    }

    if (q.includes("FROM public.founding_angel_memberships")) {
      const fm = state.foundingMemberships.get(values[0]);
      return fm ? [fm] : [];
    }

    return [];
  }

  return {
    get state() {
      return state;
    },
    pool,
    sql: sqlTag,
  };
}

/**
 * Helper to claim, email-verify, and optionally provision the designated Creator account.
 */
async function setupVerifiedCreator(db, { handle = "creatorhq", provision = true } = {}) {
  let rawVerifyToken = null;
  const claimReqRes = createMockReqRes({
    method: "POST",
    headers: { host: "itsyouonline.com" },
    body: { handle, email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimReqRes.req, claimReqRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    sendVerificationEmail: async ({ token }) => {
      rawVerifyToken = token;
      return { sent: true, reason: "delivered" };
    },
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimReqRes.res.statusCode, 201);
  assert.ok(rawVerifyToken);

  const verifyReqRes = createMockReqRes({
    method: "GET",
    headers: { host: "itsyouonline.com" },
    query: { token: rawVerifyToken },
  });
  await verifyHandler(verifyReqRes.req, verifyReqRes.res, {
    sql: db.sql,
    pool: db.pool,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    isProduction: false,
  });
  assert.strictEqual(verifyReqRes.res.statusCode, 200);
  const creatorSessionToken = verifyReqRes.res.body.sessionToken;
  assert.ok(creatorSessionToken);

  if (provision) {
    const prov = await provisionCreatorEntitlement(db.sql, {
      provisioningSecret: TEST_PROVISIONING_SECRET,
      provisionedBy: "test-suite-operator",
      env: {
        VERCEL_ENV: "production",
        CREATOR_PROVISIONING_SECRET: TEST_PROVISIONING_SECRET,
      },
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    });
    assert.strictEqual(prov.ok, true);
  }

  return { creatorSessionToken, verifyBody: verifyReqRes.res.body };
}

async function setupVerifiedNormalUser(db, { handle, email }) {
  let rawVerifyToken = null;
  const claimReqRes = createMockReqRes({
    method: "POST",
    headers: { host: "itsyouonline.com" },
    body: { handle, email },
  });
  await claimHandler(claimReqRes.req, claimReqRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    sendVerificationEmail: async ({ token }) => {
      rawVerifyToken = token;
      return { sent: true, reason: "delivered" };
    },
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimReqRes.res.statusCode, 201);

  const verifyReqRes = createMockReqRes({
    method: "GET",
    headers: { host: "itsyouonline.com" },
    query: { token: rawVerifyToken },
  });
  await verifyHandler(verifyReqRes.req, verifyReqRes.res, {
    sql: db.sql,
    pool: db.pool,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    isProduction: false,
  });
  assert.strictEqual(verifyReqRes.res.statusCode, 200);
  return {
    sessionToken: verifyReqRes.res.body.sessionToken,
    identityId: Array.from(db.state.identities.values()).find((i) => i.username === handle).identity_id,
  };
}

// ============================================================================
// TESTS
// ============================================================================

test("1 & 2. Verified Creator can claim multiple available handles and access each owned Youniverse with isolated data", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });

  // Claim arbitrary available handles via @ Line (no hardcoded allowlist)
  for (const targetHandle of ["foundingangels", "portals", "nebula-lab"]) {
    const { req, res } = createMockReqRes({
      method: "POST",
      headers: {
        host: "itsyouonline.com",
        authorization: `Bearer ${creatorSessionToken}`,
      },
      body: {
        handle: targetHandle,
        email: DESIGNATED_CREATOR_EMAIL,
      },
    });

    await claimHandler(req, res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      isProduction: () => true,
      env: { VERCEL_ENV: "production" },
    });

    assert.strictEqual(res.statusCode, 201, `Expected 201 claiming @${targetHandle}`);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, "verified_creator_claim");
    assert.strictEqual(res.body.username, targetHandle);
    assert.strictEqual(res.body.subdomain, `${targetHandle}.itsyouonline.com`);
    assert.ok(res.body.handoffToken);
    assert.ok(res.body.destinationUrl.startsWith(`https://${targetHandle}.itsyouonline.com/#handoff_token=`));
  }

  // Verify 4 distinct Youniverse identities exist, all linked to the single Creator owner_account
  assert.strictEqual(db.state.identities.size, 4);
  const creatorAccount = db.state.ownerAccounts.get(DESIGNATED_CREATOR_EMAIL);
  assert.ok(creatorAccount);
  assert.strictEqual(creatorAccount.is_creator, true);

  const identityIds = new Set(Array.from(db.state.identities.values()).map((i) => i.identity_id));
  assert.strictEqual(identityIds.size, 4, "Every Youniverse must keep its own distinct identity_id");

  // Verify audit log recorded provisioning + 3 privileged claims
  const claimAuditEvents = db.state.auditLog.filter((e) => e.event_type === "creator_privileged_claim");
  assert.strictEqual(claimAuditEvents.length, 3);
  assert.deepStrictEqual(
    claimAuditEvents.map((e) => e.target_handle),
    ["foundingangels", "portals", "nebula-lab"]
  );

  // Redeem handoff ticket on foundingangels.itsyouonline.com -> Owner OS session
  const foundingClaim = Array.from(db.state.identities.values()).find((i) => i.username === "foundingangels");
  const handoffNonce = db.state.handoffTokens.find((h) => h.handle === "foundingangels");
  const handoffRes = createMockReqRes({
    method: "POST",
    headers: { host: "foundingangels.itsyouonline.com" },
    body: {
      token: (await import("../lib/cryptoHandoff.ts")).signHandoffToken({
        handle: "foundingangels",
        nonce: handoffNonce.nonce,
      }),
    },
  });
  await verifyTokenHandler(handoffRes.req, handoffRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(handoffRes.res.statusCode, 200);
  const foundingSessionToken = handoffRes.res.body.sessionToken;
  assert.ok(handoffRes.res.headers["set-cookie"]?.includes("__youniverse_session="));

  // Creator session can access all owned Youniverses via /context, each strictly scoped
  for (const h of ["creatorhq", "foundingangels", "portals", "nebula-lab"]) {
    const ctx = createMockReqRes({
      method: "GET",
      params: { handle: h },
      headers: { authorization: `Bearer ${foundingSessionToken}` },
    });
    await contextHandler(ctx.req, ctx.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(ctx.res.statusCode, 200);
    assert.strictEqual(ctx.res.body.isOwner, true);
    assert.strictEqual(ctx.res.body.handle, h);
    const expectedId = Array.from(db.state.identities.values()).find((i) => i.username === h).identity_id;
    assert.strictEqual(ctx.res.body.entitlements.identityId, expectedId);
    assert.strictEqual(ctx.res.body.ownedYouniverses.length, 4);
  }

  // Public face stays public/read-only (zero email/secret exposure)
  const pubRes = createMockReqRes({ method: "GET", params: { handle: "foundingangels" } });
  await publicHandler(pubRes.req, pubRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
  });
  assert.strictEqual(pubRes.res.statusCode, 200);
  assert.strictEqual(pubRes.res.body.youniverse.handle, "foundingangels");
  assert.strictEqual(JSON.stringify(pubRes.res.body).includes(DESIGNATED_CREATOR_EMAIL), false);

  // Per-Youniverse NotNotes isolation: save widget on foundingangels, verify portals does NOT see it
  const saveFa = createMockReqRes({
    method: "POST",
    headers: {
      host: "foundingangels.itsyouonline.com",
      authorization: `Bearer ${creatorSessionToken}`,
    },
    body: {
      title: "FoundingAngelsWidget",
      code: "export default () => <div>FA</div>",
    },
  });
  await artifactHandler(saveFa.req, saveFa.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(saveFa.res.statusCode, 200);
  assert.strictEqual(saveFa.res.body.artifact.youniverseId, foundingClaim.identity_id);

  const getFa = createMockReqRes({
    method: "GET",
    headers: {
      host: "foundingangels.itsyouonline.com",
      authorization: `Bearer ${creatorSessionToken}`,
    },
  });
  await widgetsHandler(getFa.req, getFa.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(getFa.res.statusCode, 200);
  assert.strictEqual(getFa.res.body.widgets.length, 1);
  assert.strictEqual(getFa.res.body.widgets[0].title, "FoundingAngelsWidget");

  const getPortals = createMockReqRes({
    method: "GET",
    headers: {
      host: "portals.itsyouonline.com",
      authorization: `Bearer ${creatorSessionToken}`,
    },
  });
  await widgetsHandler(getPortals.req, getPortals.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(getPortals.res.statusCode, 200);
  assert.strictEqual(getPortals.res.body.widgets.length, 0, "Widgets must stay strictly isolated per Youniverse");
});

test("3. Creator cannot claim an already-taken handle (verified or owned by another email)", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });
  await setupVerifiedNormalUser(db, { handle: "taken-brand", email: "alice@proton.me" });

  // Unverified claim by bob
  await claimHandler(
    createMockReqRes({
      method: "POST",
      body: { handle: "pending-bob", email: "bob@proton.me" },
    }).req,
    createMockReqRes().res,
    { sql: db.sql, sendVerificationEmail: async () => ({ sent: true }) }
  );

  for (const blockedHandle of ["taken-brand", "pending-bob"]) {
    const { req, res } = createMockReqRes({
      method: "POST",
      headers: {
        host: "itsyouonline.com",
        authorization: `Bearer ${creatorSessionToken}`,
      },
      body: {
        handle: blockedHandle,
        email: DESIGNATED_CREATOR_EMAIL,
      },
    });

    await claimHandler(req, res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });

    assert.strictEqual(res.statusCode, 409, `Creator must not hijack @${blockedHandle}`);
    assert.strictEqual(res.body.error, "username-taken");
  }
});

test("4. Unverified email cannot provision or exercise Creator privileges", async () => {
  const db = createCreatorSimDb();

  // Claim primary handle for Creator email WITHOUT verifying it
  const claimRes = createMockReqRes({
    method: "POST",
    body: { handle: "unverified-creator", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimRes.req, claimRes.res, {
    sql: db.sql,
    sendVerificationEmail: async () => ({ sent: true }),
  });
  assert.strictEqual(claimRes.res.statusCode, 201);
  assert.strictEqual(claimRes.res.body.status, "pending_verification");

  // Attempt server provisioning before email verification -> MUST FAIL CLOSED
  const prov = await provisionCreatorEntitlement(db.sql, {
    provisioningSecret: TEST_PROVISIONING_SECRET,
    provisionedBy: "operator",
    env: {
      VERCEL_ENV: "production",
      CREATOR_PROVISIONING_SECRET: TEST_PROVISIONING_SECRET,
    },
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
  });
  assert.strictEqual(prov.ok, false);
  assert.strictEqual(prov.error, "creator_email_not_verified");
  assert.strictEqual(db.state.ownerAccounts.size, 0);

  // Even if an unverified identity had a session token row, Creator override & context MUST fail closed
  const unverifiedIdent = Array.from(db.state.identities.values())[0];
  const { rawToken } = await createSession(db.sql, unverifiedIdent.identity_id);

  const ctxRes = createMockReqRes({
    method: "GET",
    params: { handle: "unverified-creator" },
    headers: { authorization: `Bearer ${rawToken}` },
  });
  await contextHandler(ctxRes.req, ctxRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(ctxRes.res.statusCode, 403);
  assert.strictEqual(ctxRes.res.body.error, "email_not_verified");

  const secondClaimRes = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${rawToken}` },
    body: { handle: "second-try", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(secondClaimRes.req, secondClaimRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(secondClaimRes.res.statusCode, 403);
  assert.strictEqual(secondClaimRes.res.body.error, "creator_authorization_denied");
});

test("5. Normal user or unauthenticated browser cannot impersonate Creator via email, role, or headers", async () => {
  const db = createCreatorSimDb();
  await setupVerifiedCreator(db, { handle: "creatorhq" });
  const alice = await setupVerifiedNormalUser(db, { handle: "alice", email: "alice@proton.me" });

  // A. Authenticated normal user submits Creator email + forged client fields -> 403 denied
  const spoofAuth = createMockReqRes({
    method: "POST",
    headers: {
      authorization: `Bearer ${alice.sessionToken}`,
      "x-creator": "true",
      "x-owner-role": "CREATOR",
    },
    body: {
      handle: "spoof-by-alice",
      email: DESIGNATED_CREATOR_EMAIL,
      isCreator: true,
      role: "CREATOR",
      accountId: accountIdForEmail(DESIGNATED_CREATOR_EMAIL),
    },
  });
  await claimHandler(spoofAuth.req, spoofAuth.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(spoofAuth.res.statusCode, 403);
  assert.strictEqual(spoofAuth.res.body.error, "creator_authorization_denied");
  assert.strictEqual(
    Array.from(db.state.identities.values()).some((i) => i.username === "spoof-by-alice"),
    false
  );

  // B. Unauthenticated browser submits Creator email -> blocked by 402 one-free-Youniverse rule
  const unauthClaim = createMockReqRes({
    method: "POST",
    headers: { "x-creator": "true" },
    body: {
      handle: "unauth-creator-spoof",
      email: DESIGNATED_CREATOR_EMAIL,
      isCreator: true,
    },
  });
  await claimHandler(unauthClaim.req, unauthClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(unauthClaim.res.statusCode, 402);
  assert.strictEqual(unauthClaim.res.body.error, "payment_required");

  // C. Wrong provisioning secret cannot grant Creator entitlement
  const badProv = await provisionCreatorEntitlement(db.sql, {
    provisioningSecret: "wrong-secret-0000000000",
    provisionedBy: "attacker",
    env: {
      VERCEL_ENV: "production",
      CREATOR_PROVISIONING_SECRET: TEST_PROVISIONING_SECRET,
    },
  });
  assert.strictEqual(badProv.ok, false);
  assert.strictEqual(badProv.error, "invalid_provisioning_secret");
});

test("6. Normal user remains strictly limited to one free Youniverse even when authenticated", async () => {
  const db = createCreatorSimDb();
  const alice = await setupVerifiedNormalUser(db, { handle: "alice", email: "alice@proton.me" });

  // Alice tries to claim a second free handle while authenticated
  const secondClaim = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${alice.sessionToken}` },
    body: { handle: "alice-second", email: "alice@proton.me" },
  });
  await claimHandler(secondClaim.req, secondClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(secondClaim.res.statusCode, 402);
  assert.strictEqual(secondClaim.res.body.error, "payment_required");
});

test("7. Creator session cannot access a Youniverse owned by someone else", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });
  const bob = await setupVerifiedNormalUser(db, { handle: "bob", email: "bob@proton.me" });

  // Seed a private NotNote widget in Bob's Youniverse
  db.state.notNotes.push({
    id: "nn_bob_secret",
    youniverseId: bob.identityId,
    title: "BobPrivateWidget",
    content: { type: "REACT_WIDGET", code: "export default () => <div>Bob</div>" },
    status: "APPROVED",
    createdAt: new Date().toISOString(),
  });

  // 1. Context endpoint returns isOwner: false (never grants owner OS)
  const ctx = createMockReqRes({
    method: "GET",
    params: { handle: "bob" },
    headers: { authorization: `Bearer ${creatorSessionToken}` },
  });
  await contextHandler(ctx.req, ctx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(ctx.res.statusCode, 200);
  assert.strictEqual(ctx.res.body.isOwner, false);
  assert.strictEqual(ctx.res.body.ownedYouniverses, undefined);

  // 2. Non-[handle] Serverless route (NotNotes widgets) denies 403
  const widgetsRes = createMockReqRes({
    method: "GET",
    headers: {
      host: "bob.itsyouonline.com",
      authorization: `Bearer ${creatorSessionToken}`,
    },
  });
  await widgetsHandler(widgetsRes.req, widgetsRes.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(widgetsRes.res.statusCode, 403);
  assert.strictEqual(widgetsRes.res.body.error, "not_authorized");

  // 3. Express verifyJwt middleware also denies 403 when targeting Bob's handle
  const mwReqRes = createMockReqRes({
    method: "POST",
    headers: {
      "x-youniverse-handle": "bob",
      authorization: `Bearer ${creatorSessionToken}`,
    },
  });
  let nextCalled = false;
  await verifyJwt(
    mwReqRes.req,
    mwReqRes.res,
    () => {
      nextCalled = true;
    },
    {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(mwReqRes.res.statusCode, 403);
  assert.strictEqual(mwReqRes.res.body.error, "not_authorized");
});

test("8. Ownership remains correct after logout, login, and cross-subdomain RS256 handoff", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken: firstToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });

  // Claim foundingangels
  const claimFa = createMockReqRes({
    method: "POST",
    headers: {
      host: "itsyouonline.com",
      authorization: `Bearer ${firstToken}`,
    },
    body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimFa.req, claimFa.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimFa.res.statusCode, 201);

  // Logout: revoke session
  await revokeSession(db.sql, firstToken);

  const afterLogoutCtx = createMockReqRes({
    method: "GET",
    params: { handle: "foundingangels" },
    headers: { authorization: `Bearer ${firstToken}` },
  });
  await contextHandler(afterLogoutCtx.req, afterLogoutCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(afterLogoutCtx.res.statusCode, 401);

  const afterLogoutClaim = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${firstToken}` },
    body: { handle: "after-logout", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(afterLogoutClaim.req, afterLogoutClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(afterLogoutClaim.res.statusCode, 401);

  // Login again (new verified session for Creator identity)
  const creatorHq = Array.from(db.state.identities.values()).find((i) => i.username === "creatorhq");
  const { rawToken: freshLoginToken } = await createSession(db.sql, creatorHq.identity_id);

  // Request cross-subdomain handoff from creatorhq -> foundingangels
  const switchCtx = createMockReqRes({
    method: "GET",
    params: { handle: "foundingangels" },
    query: { handoff: "1" },
    headers: {
      host: "creatorhq.itsyouonline.com",
      authorization: `Bearer ${freshLoginToken}`,
    },
  });
  await contextHandler(switchCtx.req, switchCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(switchCtx.res.statusCode, 200);
  assert.strictEqual(switchCtx.res.body.isOwner, true);
  assert.ok(switchCtx.res.body.handoffToken);
  assert.ok(
    switchCtx.res.body.destinationUrl.startsWith("https://foundingangels.itsyouonline.com/#handoff_token=")
  );

  // Wrong-host handoff redemption fails closed
  const wrongHostRedeem = createMockReqRes({
    method: "POST",
    headers: { host: "other.itsyouonline.com" },
    body: { token: switchCtx.res.body.handoffToken },
  });
  await verifyTokenHandler(wrongHostRedeem.req, wrongHostRedeem.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(wrongHostRedeem.res.statusCode, 401);

  // Correct host redemption succeeds and returns cookie + destination bearer token
  const rightHostRedeem = createMockReqRes({
    method: "POST",
    headers: { host: "foundingangels.itsyouonline.com" },
    body: { token: switchCtx.res.body.handoffToken },
  });
  await verifyTokenHandler(rightHostRedeem.req, rightHostRedeem.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(rightHostRedeem.res.statusCode, 200);
  const destToken = rightHostRedeem.res.body.sessionToken;

  // Replay fails closed
  const replayRedeem = createMockReqRes({
    method: "POST",
    headers: { host: "foundingangels.itsyouonline.com" },
    body: { token: switchCtx.res.body.handoffToken },
  });
  await verifyTokenHandler(replayRedeem.req, replayRedeem.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(replayRedeem.res.statusCode, 401);

  // Cookie-based context request works across subdomains
  const cookieCtx = createMockReqRes({
    method: "GET",
    params: { handle: "creatorhq" },
    headers: { cookie: `__youniverse_session=${destToken}` },
  });
  await contextHandler(cookieCtx.req, cookieCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(cookieCtx.res.statusCode, 200);
  assert.strictEqual(cookieCtx.res.body.isOwner, true);
});

test("9. Preview deployments and non-production runtimes targeting Production DB cannot use Creator privileges", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });

  // Claim a Creator override handle in production first
  const prodClaim = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${creatorSessionToken}` },
    body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(prodClaim.req, prodClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(prodClaim.res.statusCode, 201);

  // Pure runtime check assertions
  assert.strictEqual(
    isCreatorRuntimeAllowed({ VERCEL_ENV: "preview", NODE_ENV: "production" }, "postgresql://x@localhost/db").allowed,
    false
  );
  assert.strictEqual(
    isCreatorRuntimeAllowed(
      { VERCEL_ENV: "development" },
      "postgresql://neondb_owner:pw@ep-aged-dew-av9711nr.us-east-2.aws.neon.tech/neondb"
    ).allowed,
    false
  );

  // A. Preview deployment CANNOT provision Creator entitlement
  const prevProv = await provisionCreatorEntitlement(db.sql, {
    provisioningSecret: TEST_PROVISIONING_SECRET,
    provisionedBy: "preview-attacker",
    env: {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      CREATOR_PROVISIONING_SECRET: TEST_PROVISIONING_SECRET,
    },
    databaseUrl: "postgresql://neondb_owner:pw@ep-aged-dew-av9711nr.us-east-2.aws.neon.tech/neondb",
  });
  assert.strictEqual(prevProv.ok, false);
  assert.strictEqual(prevProv.error, "preview_environment_blocked");

  // B. Preview deployment CANNOT claim via Creator override
  const prevClaim = createMockReqRes({
    method: "POST",
    headers: {
      host: "portals-preview.vercel.app",
      authorization: `Bearer ${creatorSessionToken}`,
    },
    body: { handle: "preview-sneak", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(prevClaim.req, prevClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://neondb_owner:pw@ep-aged-dew-av9711nr.us-east-2.aws.neon.tech/neondb",
    env: { VERCEL_ENV: "preview", NODE_ENV: "production" },
  });
  assert.strictEqual(prevClaim.res.statusCode, 403);
  assert.strictEqual(prevClaim.res.body.error, "creator_privilege_environment_blocked");

  // C. Preview deployment CANNOT access Creator-owned Youniverse context
  const prevCtx = createMockReqRes({
    method: "GET",
    params: { handle: "foundingangels" },
    headers: {
      host: "portals-preview.vercel.app",
      authorization: `Bearer ${creatorSessionToken}`,
    },
  });
  await contextHandler(prevCtx.req, prevCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://neondb_owner:pw@ep-aged-dew-av9711nr.us-east-2.aws.neon.tech/neondb",
    env: { VERCEL_ENV: "preview", NODE_ENV: "production" },
  });
  assert.strictEqual(prevCtx.res.statusCode, 403);
  assert.strictEqual(prevCtx.res.body.error, "creator_privilege_environment_blocked");

  // D. Local/dev runtime pointing at Production Neon endpoint ep-aged-dew-av9711nr ALSO fails closed
  const devAgainstProdClaim = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${creatorSessionToken}` },
    body: { handle: "dev-prod-leak", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(devAgainstProdClaim.req, devAgainstProdClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://neondb_owner:pw@ep-aged-dew-av9711nr.us-east-2.aws.neon.tech/neondb",
    env: { VERCEL_ENV: "development" },
  });
  assert.strictEqual(devAgainstProdClaim.res.statusCode, 403);
  assert.strictEqual(devAgainstProdClaim.res.body.error, "creator_privilege_environment_blocked");
});

test("10. Genesis 001 remains unchanged: Creator is never eligible and first external verifier wins", async () => {
  const prevVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";

  try {
    const db = createCreatorSimDb({ genesisEnabled: true, foundingAngelsCompleted: true });

    // 1. Creator verifies and claims multiple Youniverses while Genesis 001 is active
    const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });
    assert.strictEqual(db.state.genesisAwards.size, 0, "Creator must never win Genesis 001");

    const creatorClaim = createMockReqRes({
      method: "POST",
      headers: { authorization: `Bearer ${creatorSessionToken}` },
      body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
    });
    await claimHandler(creatorClaim.req, creatorClaim.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(creatorClaim.res.statusCode, 201);
    assert.strictEqual(db.state.genesisAwards.size, 0, "Creator privileged claim must never trigger Genesis 001");

    // 2. First external eligible human claims and verifies -> wins Genesis 001
    let externalVerifyToken = null;
    const extClaim = createMockReqRes({
      method: "POST",
      body: { handle: "firsthuman", email: "firsthuman@proton.me" },
    });
    await claimHandler(extClaim.req, extClaim.res, {
      sql: db.sql,
      sendVerificationEmail: async ({ token }) => {
        externalVerifyToken = token;
        return { sent: true };
      },
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(extClaim.res.statusCode, 201);

    const extVerify = createMockReqRes({
      method: "GET",
      query: { token: externalVerifyToken },
    });
    await verifyHandler(extVerify.req, extVerify.res, {
      sql: db.sql,
      pool: db.pool,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      isProduction: true,
    });
    assert.strictEqual(extVerify.res.statusCode, 200);

    const award = db.state.genesisAwards.get(GENESIS_AWARD_SLOT);
    assert.ok(award, "External eligible person must still win Genesis 001");
    assert.strictEqual(award.awarded_username, "firsthuman");
    assert.strictEqual(award.award_label, GENESIS_DESIGNATION);

    // 3. Creator context must remain genesis.isWinner === false
    const creatorCtx = createMockReqRes({
      method: "GET",
      params: { handle: "foundingangels" },
      headers: { authorization: `Bearer ${creatorSessionToken}` },
    });
    await contextHandler(creatorCtx.req, creatorCtx.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(creatorCtx.res.statusCode, 200);
    assert.strictEqual(creatorCtx.res.body.isOwner, true);
    assert.strictEqual(creatorCtx.res.body.entitlements.genesis.isWinner, false);
  } finally {
    if (prevVercelEnv !== undefined) {
      process.env.VERCEL_ENV = prevVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  }
});

test("11. P1-01: Ordinary and free+paid identities sharing an email cannot list or switch across Youniverses; Creator can", async () => {
  const db = createCreatorSimDb();

  // Seed two ordinary verified identities sharing alice@proton.me (free backfill)
  const alice1 = await setupVerifiedNormalUser(db, { handle: "alice-one", email: "alice@proton.me" });
  const alice2Id = "id_alice_two";
  const nowIso = new Date().toISOString();
  db.state.identities.set(alice2Id, {
    identity_id: alice2Id,
    username: "alice-two",
    display_name: "Alice Two",
    subdomain: "alice-two.itsyouonline.com",
    identity_type: "person",
    email: "alice@proton.me",
    plan: "free",
    is_live: true,
    is_primary: true,
    email_verified_at: nowIso,
    created_at: nowIso,
  });
  await syncVerifiedOwnerMembership(db.sql, {
    identityId: alice2Id,
    email: "alice@proton.me",
    claimSource: "backfill",
    verifiedAt: nowIso,
  });
  const { rawToken: alice2Token } = await createSession(db.sql, alice2Id);

  // Seed free identity + paid identity sharing bob@proton.me
  const bobFree = await setupVerifiedNormalUser(db, { handle: "bob-free", email: "bob@proton.me" });
  const bobPaidId = "id_bob_paid";
  db.state.identities.set(bobPaidId, {
    identity_id: bobPaidId,
    username: "bob-pro",
    display_name: "Bob Pro",
    subdomain: "bob-pro.itsyouonline.com",
    identity_type: "person",
    email: "bob@proton.me",
    plan: "pro",
    is_live: true,
    is_primary: true,
    email_verified_at: nowIso,
    created_at: nowIso,
  });
  await syncVerifiedOwnerMembership(db.sql, {
    identityId: bobPaidId,
    email: "bob@proton.me",
    claimSource: "paid",
    verifiedAt: nowIso,
  });
  const { rawToken: bobPaidToken } = await createSession(db.sql, bobPaidId);

  // Direct query listOwnedYouniversesForIdentity must return [] for non-Creator accounts
  assert.deepStrictEqual(await listOwnedYouniversesForIdentity(db.sql, alice1.identityId), []);
  assert.deepStrictEqual(await listOwnedYouniversesForIdentity(db.sql, bobFree.identityId), []);
  assert.deepStrictEqual(await listOwnedYouniversesForIdentity(db.sql, bobPaidId), []);

  // Exact-identity ownership remains valid for all ordinary & paid accounts, with NO ownedYouniverses list
  for (const [handle, token] of [
    ["alice-one", alice1.sessionToken],
    ["alice-two", alice2Token],
    ["bob-free", bobFree.sessionToken],
    ["bob-pro", bobPaidToken],
  ]) {
    const ownCtx = createMockReqRes({
      method: "GET",
      params: { handle },
      headers: { authorization: `Bearer ${token}` },
    });
    await contextHandler(ownCtx.req, ownCtx.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(ownCtx.res.statusCode, 200);
    assert.strictEqual(ownCtx.res.body.isOwner, true);
    assert.strictEqual(ownCtx.res.body.ownedYouniverses, undefined);
  }

  // Ordinary users sharing an email CANNOT switch into each other's Youniverses
  for (const [sourceToken, targetHandle] of [
    [alice1.sessionToken, "alice-two"],
    [alice2Token, "alice-one"],
    [bobFree.sessionToken, "bob-pro"],
    [bobPaidToken, "bob-free"],
  ]) {
    const switchAttempt = createMockReqRes({
      method: "GET",
      params: { handle: targetHandle },
      query: { handoff: "1" },
      headers: { authorization: `Bearer ${sourceToken}` },
    });
    await contextHandler(switchAttempt.req, switchAttempt.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(switchAttempt.res.statusCode, 200);
    assert.strictEqual(switchAttempt.res.body.isOwner, false);
    assert.strictEqual(switchAttempt.res.body.handoffToken, undefined);
    assert.strictEqual(switchAttempt.res.body.ownedYouniverses, undefined);

    const widgetAttempt = createMockReqRes({
      method: "GET",
      headers: {
        host: `${targetHandle}.itsyouonline.com`,
        authorization: `Bearer ${sourceToken}`,
      },
    });
    await widgetsHandler(widgetAttempt.req, widgetAttempt.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(widgetAttempt.res.statusCode, 403);
    assert.strictEqual(widgetAttempt.res.body.error, "not_authorized");
  }

  // Provisioned Creator with multiple memberships CAN list and switch across all owned Youniverses
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });
  const claimSecond = createMockReqRes({
    method: "POST",
    headers: { host: "itsyouonline.com", authorization: `Bearer ${creatorSessionToken}` },
    body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimSecond.req, claimSecond.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimSecond.res.statusCode, 201);

  const creatorCtx = createMockReqRes({
    method: "GET",
    params: { handle: "creatorhq" },
    headers: { authorization: `Bearer ${creatorSessionToken}` },
  });
  await contextHandler(creatorCtx.req, creatorCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(creatorCtx.res.statusCode, 200);
  assert.strictEqual(creatorCtx.res.body.isOwner, true);
  assert.deepStrictEqual(
    creatorCtx.res.body.ownedYouniverses.map((u) => u.handle),
    ["creatorhq", "foundingangels"]
  );
});

test("12. P1-02: Stale/expired/revoked Bearer falls back to valid __youniverse_session cookie across auth, Gemini, and Weaver without weakening isolation", async () => {
  const db = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(db, { handle: "creatorhq" });
  await setupVerifiedNormalUser(db, { handle: "otherowner", email: "other@proton.me" });

  // Claim a second Creator Youniverse
  const claimFa = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${creatorSessionToken}` },
    body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimFa.req, claimFa.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimFa.res.statusCode, 201);

  const creatorHq = Array.from(db.state.identities.values()).find((i) => i.username === "creatorhq");
  const foundingIdent = Array.from(db.state.identities.values()).find((i) => i.username === "foundingangels");

  // Create expired and revoked Bearer tokens alongside a valid session cookie
  const { rawToken: expiredBearer } = await createSession(db.sql, creatorHq.identity_id, { ttlSeconds: 60 });
  db.state.sessions.get(hashToken(expiredBearer)).expires_at = new Date(Date.now() - 60_000).toISOString();

  const { rawToken: revokedBearer } = await createSession(db.sql, creatorHq.identity_id);
  await revokeSession(db.sql, revokedBearer);

  const invalidBearer = "invalid-stale-bearer-token-value";
  const validCookieHeader = `__youniverse_session=${encodeURIComponent(creatorSessionToken)}`;

  const mockGenAiClass = class {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () => JSON.stringify({ name: "CookieWidget", code: "export default () => null", dependencies: [] }),
            candidates: [{ content: { role: "model", parts: [{ text: "Cookie reply" }] }, finishReason: "STOP" }],
          },
        }),
      };
    }
  };

  // A. Valid Bearer, no cookie -> succeeds
  const validBearerCtx = createMockReqRes({
    method: "GET",
    params: { handle: "foundingangels" },
    headers: { authorization: `Bearer ${creatorSessionToken}` },
  });
  await contextHandler(validBearerCtx.req, validBearerCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(validBearerCtx.res.statusCode, 200);
  assert.strictEqual(validBearerCtx.res.body.isOwner, true);

  // B, C, D. Invalid / Expired / Revoked Bearer WITH valid cookie -> falls back to cookie everywhere
  for (const staleHeader of [
    `Bearer ${invalidBearer}`,
    `Bearer ${expiredBearer}`,
    `Bearer ${revokedBearer}`,
    "Basic malformed-header",
  ]) {
    const ctxRes = createMockReqRes({
      method: "GET",
      params: { handle: "foundingangels" },
      headers: { authorization: staleHeader, cookie: validCookieHeader },
    });
    await contextHandler(ctxRes.req, ctxRes.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(ctxRes.res.statusCode, 200);
    assert.strictEqual(ctxRes.res.body.isOwner, true);

    const gemRes = createMockReqRes({
      method: "POST",
      headers: { authorization: staleHeader, cookie: validCookieHeader },
      body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hello" }] }] },
    });
    await geminiHandler(gemRes.req, gemRes.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      apiKey: "mock-gemini-key",
      GoogleGenerativeAI: mockGenAiClass,
    });
    assert.strictEqual(gemRes.res.statusCode, 200);
    assert.strictEqual(gemRes.res.body.candidates[0].content.parts[0].text, "Cookie reply");

    const wvRes = createMockReqRes({
      method: "POST",
      headers: {
        host: "foundingangels.itsyouonline.com",
        authorization: staleHeader,
        cookie: validCookieHeader,
      },
      body: { prompt: "Build a widget" },
    });
    await weaverGenerateHandler(wvRes.req, wvRes.res, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      apiKey: "mock-gemini-key",
      GoogleGenerativeAI: mockGenAiClass,
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(wvRes.res.statusCode, 200);
    assert.strictEqual(wvRes.res.body.youniverseId, foundingIdent.identity_id);

    const mwRes = createMockReqRes({
      method: "POST",
      headers: {
        host: "foundingangels.itsyouonline.com",
        authorization: staleHeader,
        cookie: validCookieHeader,
      },
    });
    let nextCalled = false;
    await verifyJwt(mwRes.req, mwRes.res, () => {
      nextCalled = true;
    }, {
      sql: db.sql,
      databaseUrl: "postgresql://test:test@localhost:5432/testdb",
      env: { VERCEL_ENV: "production" },
    });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(mwRes.req.user.youniverseId, foundingIdent.identity_id);
  }

  // E. Invalid Bearer and invalid cookie -> rejected 401 across all auth endpoints
  const badCookie = `__youniverse_session=${encodeURIComponent(revokedBearer)}`;
  const bothBadCtx = createMockReqRes({
    method: "GET",
    params: { handle: "foundingangels" },
    headers: { authorization: `Bearer ${expiredBearer}`, cookie: badCookie },
  });
  await contextHandler(bothBadCtx.req, bothBadCtx.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(bothBadCtx.res.statusCode, 401);

  const bothBadGem = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${invalidBearer}`, cookie: badCookie },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hello" }] }] },
  });
  await geminiHandler(bothBadGem.req, bothBadGem.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    apiKey: "mock-gemini-key",
    GoogleGenerativeAI: mockGenAiClass,
  });
  assert.strictEqual(bothBadGem.res.statusCode, 401);

  const bothBadWv = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${revokedBearer}`, cookie: badCookie },
    body: { prompt: "Build a widget" },
  });
  await weaverGenerateHandler(bothBadWv.req, bothBadWv.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    apiKey: "mock-gemini-key",
    GoogleGenerativeAI: mockGenAiClass,
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(bothBadWv.res.statusCode, 401);

  // F & G. Cookie-only Gemini, Weaver, NotNotes, and privileged Claim requests (zero Authorization header)
  const cookieOnlyGem = createMockReqRes({
    method: "POST",
    headers: { host: "foundingangels.itsyouonline.com", cookie: validCookieHeader },
    body: { model: "gemini-1.5-flash", contents: [{ role: "user", parts: [{ text: "hello" }] }] },
  });
  await geminiHandler(cookieOnlyGem.req, cookieOnlyGem.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    apiKey: "mock-gemini-key",
    GoogleGenerativeAI: mockGenAiClass,
  });
  assert.strictEqual(cookieOnlyGem.res.statusCode, 200);

  const cookieOnlyWv = createMockReqRes({
    method: "POST",
    headers: { host: "foundingangels.itsyouonline.com", cookie: validCookieHeader },
    body: { prompt: "Synthesize cookie widget" },
  });
  await weaverGenerateHandler(cookieOnlyWv.req, cookieOnlyWv.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    apiKey: "mock-gemini-key",
    GoogleGenerativeAI: mockGenAiClass,
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(cookieOnlyWv.res.statusCode, 200);
  assert.strictEqual(cookieOnlyWv.res.body.youniverseId, foundingIdent.identity_id);

  // Cookie-only privileged @ Line claim with stale Bearer in header also succeeds via valid Creator cookie
  const staleBearerClaim = createMockReqRes({
    method: "POST",
    headers: {
      host: "itsyouonline.com",
      authorization: `Bearer ${expiredBearer}`,
      cookie: validCookieHeader,
    },
    body: { handle: "cookie-claimed", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(staleBearerClaim.req, staleBearerClaim.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(staleBearerClaim.res.statusCode, 201);
  assert.strictEqual(staleBearerClaim.res.body.status, "verified_creator_claim");

  // H. Cross-Youniverse access still denied when membership is absent
  const deniedCookieWv = createMockReqRes({
    method: "POST",
    headers: { host: "otherowner.itsyouonline.com", cookie: validCookieHeader },
    body: { prompt: "Cross-tenant attack" },
  });
  await weaverGenerateHandler(deniedCookieWv.req, deniedCookieWv.res, {
    sql: db.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    apiKey: "mock-gemini-key",
    GoogleGenerativeAI: mockGenAiClass,
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(deniedCookieWv.res.statusCode, 403);
  assert.strictEqual(deniedCookieWv.res.body.error, "not_authorized");

  // Client code check: WeaverStudio & ONE AI helpers send same-origin cookies even without localStorage token
  const weaverSrc = fs.readFileSync(path.resolve("components/weaver/WeaverStudio.tsx"), "utf8");
  assert.ok(weaverSrc.includes('credentials: "same-origin"'));
  assert.strictEqual(weaverSrc.includes("No active session token found"), false);
  const oneAiSrc = fs.readFileSync(path.resolve("lib/oneai.ts"), "utf8");
  assert.ok(oneAiSrc.includes("credentials: 'same-origin'"));
});

test("13. P2-01: normalizeRequestHost and buildSessionCookieHeader only trust valid itsyouonline.com forwarded hosts", () => {
  const prevVercelEnv = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;

  try {
    // Canonical root host
    assert.strictEqual(normalizeRequestHost({ headers: { host: "itsyouonline.com" } }), "itsyouonline.com");
    const rootCookie = buildSessionCookieHeader("tok_1", { headers: { host: "itsyouonline.com" } });
    assert.ok(rootCookie.includes("Domain=.itsyouonline.com"));
    assert.ok(rootCookie.includes("Secure"));
    assert.ok(rootCookie.includes("HttpOnly"));
    assert.ok(rootCookie.includes("SameSite=Lax"));
    assert.ok(rootCookie.includes("Path=/"));

    // Subdomain host
    assert.strictEqual(
      normalizeRequestHost({ headers: { host: "FoundingAngels.itsyouonline.com:443" } }),
      "foundingangels.itsyouonline.com"
    );
    const subCookie = buildSessionCookieHeader("tok_2", { headers: { host: "foundingangels.itsyouonline.com" } });
    assert.ok(subCookie.includes("Domain=.itsyouonline.com"));
    assert.ok(subCookie.includes("Secure"));

    // Valid x-forwarded-host behind internal proxy host
    assert.strictEqual(
      normalizeRequestHost({
        headers: {
          host: "portals-os-internal.vercel.app",
          "x-forwarded-host": "foundingangels.itsyouonline.com",
        },
      }),
      "foundingangels.itsyouonline.com"
    );
    const fwdCookie = buildSessionCookieHeader("tok_3", {
      headers: {
        host: "portals-os-internal.vercel.app",
        "x-forwarded-host": "foundingangels.itsyouonline.com:443",
      },
    });
    assert.ok(fwdCookie.includes("Domain=.itsyouonline.com"));
    assert.ok(fwdCookie.includes("Secure"));
    const clearFwdCookie = buildClearSessionCookieHeader({
      headers: {
        host: "portals-os-internal.vercel.app",
        "x-forwarded-host": "itsyouonline.com",
      },
    });
    assert.ok(clearFwdCookie.includes("Domain=.itsyouonline.com"));
    assert.ok(clearFwdCookie.includes("Max-Age=0"));

    // Malicious / foreign / multi-label x-forwarded-host values are ignored cleanly
    for (const badFwd of [
      "evil.com",
      "itsyouonline.com.evil.com",
      "sub.sub.itsyouonline.com",
      "evil.com, foundingangels.itsyouonline.com",
      "-bad.itsyouonline.com",
    ]) {
      const localReq = {
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": badFwd,
        },
      };
      assert.strictEqual(normalizeRequestHost(localReq), "localhost");
      const localCookie = buildSessionCookieHeader("tok_local", localReq);
      assert.strictEqual(localCookie.includes("Domain="), false);
      assert.strictEqual(localCookie.includes("Secure"), false);
    }
  } finally {
    if (prevVercelEnv !== undefined) {
      process.env.VERCEL_ENV = prevVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  }
});

test("14. P1-01 & P2-02: Rollback guards allow unprovisioned duplicate-email backfill but block any provisioned Creator state", async () => {
  const migrationSql = fs.readFileSync(
    path.resolve("db/migrations/011_creator_multi_youniverse_ownership.sql"),
    "utf8"
  );
  assert.ok(migrationSql.includes("status IN ('active', 'suspended', 'revoked')"));
  assert.strictEqual(migrationSql.includes("status IN ('active', 'suspended', 'revoked') +"), false);

  const rollbackSql = fs.readFileSync(
    path.resolve("db/migrations/011_rollback_creator_multi_youniverse_ownership.sql"),
    "utf8"
  );

  // Verify SQL rollback guard clauses
  assert.ok(rollbackSql.includes("event_type = 'creator_entitlement_provisioned'"));
  assert.ok(rollbackSql.includes("event_type = 'creator_privileged_claim'"));
  assert.ok(rollbackSql.includes("FROM public.owner_accounts"));
  assert.ok(rollbackSql.includes("is_creator = TRUE"));
  assert.ok(rollbackSql.includes("m.claim_source = 'creator_override'"));
  assert.strictEqual(rollbackSql.includes("HAVING COUNT(*) > 1"), false);

  // Scenario A: Unprovisioned DB WITH multiple ordinary + paid identities sharing one email -> rollback safe
  const dbUnprovisioned = createCreatorSimDb();
  const u1 = await setupVerifiedNormalUser(dbUnprovisioned, { handle: "dup-free", email: "shared@proton.me" });
  await syncVerifiedOwnerMembership(dbUnprovisioned.sql, {
    identityId: u1.identityId,
    email: "shared@proton.me",
    claimSource: "backfill",
  });
  const secondSharedId = "id_dup_paid";
  const ts = new Date().toISOString();
  dbUnprovisioned.state.identities.set(secondSharedId, {
    identity_id: secondSharedId,
    username: "dup-paid",
    display_name: "Dup Paid",
    subdomain: "dup-paid.itsyouonline.com",
    identity_type: "person",
    email: "shared@proton.me",
    plan: "pro",
    is_live: true,
    is_primary: true,
    email_verified_at: ts,
    created_at: ts,
  });
  await syncVerifiedOwnerMembership(dbUnprovisioned.sql, {
    identityId: secondSharedId,
    email: "shared@proton.me",
    claimSource: "backfill",
  });
  const unprovSafety = await evaluateMigration011RollbackSafety(dbUnprovisioned.sql);
  assert.strictEqual(unprovSafety.safe, true);
  assert.strictEqual(unprovSafety.blockedBy.length, 0);

  // Scenario B: Provisioned Creator BEFORE any second claim -> rollback BLOCKED
  const dbProvNoClaim = createCreatorSimDb();
  const { creatorSessionToken } = await setupVerifiedCreator(dbProvNoClaim, { handle: "creatorhq" });
  const provNoClaimSafety = await evaluateMigration011RollbackSafety(dbProvNoClaim.sql);
  assert.strictEqual(provNoClaimSafety.safe, false);
  assert.ok(provNoClaimSafety.blockedBy.some((m) => m.includes("Creator provisioning audit event")));
  assert.ok(provNoClaimSafety.blockedBy.some((m) => m.includes("provisioned Creator account")));
  assert.ok(provNoClaimSafety.blockedBy.some((m) => m.includes("Creator-created or Creator-owned membership")));

  // Scenario C: Provisioned Creator WITH privileged claim -> rollback BLOCKED with all reasons
  const claimRes = createMockReqRes({
    method: "POST",
    headers: { authorization: `Bearer ${creatorSessionToken}` },
    body: { handle: "foundingangels", email: DESIGNATED_CREATOR_EMAIL },
  });
  await claimHandler(claimRes.req, claimRes.res, {
    sql: dbProvNoClaim.sql,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    env: { VERCEL_ENV: "production" },
  });
  assert.strictEqual(claimRes.res.statusCode, 201);

  const provWithClaimSafety = await evaluateMigration011RollbackSafety(dbProvNoClaim.sql);
  assert.strictEqual(provWithClaimSafety.safe, false);
  assert.strictEqual(provWithClaimSafety.counts.provisioningAuditEvents, 1);
  assert.strictEqual(provWithClaimSafety.counts.privilegedClaimAuditEvents, 1);
  assert.strictEqual(provWithClaimSafety.counts.creatorAccounts, 1);
  assert.strictEqual(provWithClaimSafety.counts.creatorMemberships, 2);
  assert.ok(provWithClaimSafety.blockedBy.some((m) => m.includes("Creator privileged claim event")));
});
