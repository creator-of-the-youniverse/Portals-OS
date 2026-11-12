# Phase 13B.1.57 — Production Recovery & Baseline Readiness

**Status:** COMPLETE (`NOT READY`)  
**Execution Mode:** Strictly Read-Only Inspection (`BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`)  
**Repository:** `creator-of-the-youniverse/Portals-OS`  
**Branch:** `restore/neon-prisma-split`  
**HEAD:** `6d5fdf06bb5ef92e2dea89d02413e4af79876927`  
**Neon Project:** `old-firefly-76827305`  
**Expected Endpoint:** `ep-aged-dew-av9711nr`  
**Database / Schema:** `neondb` / `public`  
**Target Migration:** `db/migrations/007_founding_angels_mvp.sql`  
**Expected Migration SHA-256:** `2E4395EF75CC8720E03149DE917BEA7AD438F1F7C644FCFF94C92F9CADE8D27C`  
**Inspection Timestamps (UTC):** Pass 1 `2026-11-11T20:56:29.403Z` (`NOW()` `2026-11-11 20:56:30.434026+00`) | Pass 2 `2026-11-11T20:57:54.076Z`

---

## Executive Readiness Summary

**Overall Verdict: `NOT READY`**

Two blocking conditions prevent classifying Production as `READY` for Migration 007 execution:

1. **Neon Control-Plane Recovery & Capacity Metadata `UNVERIFIED`:** Available read-only tools have no authenticated `NEON_API_KEY`, `neonctl` CLI, or Neon plugin session, and `vercel integration` inspection timed out after 10 seconds. Runtime SQL settings cannot establish PITR retention duration, earliest/latest recovery timestamps, restore-branch authorization, or account branch quota headroom.
2. **Migration 007 Target Objects Already Present in Production (`FAILED` Phase 5 Check):** Live read-only inspection of `neondb.public` confirmed that `public.founding_angel_orders` (`1` row), `public.founding_angel_memberships` (`0` rows), `14` associated indexes, `74` constraints, `4` PL/pgSQL functions, and `3` active triggers (`tgenabled = O`) **already exist**. In accordance with the Phase 5 stop rule, inspection halted without running `execute-migration-007.mjs`, `rollback-migration-007.mjs`, or any schema repair.

---

## 1. Repository and Git Attestation

- **Branch:** `restore/neon-prisma-split` (matches expected `restore/neon-prisma-split`)
- **HEAD:** `6d5fdf06bb5ef92e2dea89d02413e4af79876927` (matches expected commit)
- **Staging Index (`git diff --cached --name-status`):** `0` staged files (clean staging index)
- **Phase 13B.1.56 Report (`docs/phase-13b-1-56-final-cli-exit-code-closure.md`):** Present (`Test-Path = True`)
- **Working Tree Preservation:** All pre-existing modifications and untracked paths preserved untouched during this phase (`28` modified tracked files; `26` pre-existing untracked entries prior to adding this report under `docs/`, zero Git stage/commit/reset/clean/stash operations executed):
  - **Modified (`M`, 28):** `api/claim.ts`, `api/gemini.ts`, `api/migrate-db.ts`, `api/stripe/[action].ts`, `api/v1/auth/verify.ts`, `apps/AgentPWA/index.tsx`, `apps/ClubYouniverse/index.tsx`, `components/Desktop.tsx`, `components/FlowingLight.tsx`, `components/GlowCard.tsx`, `components/SphereImageGrid.tsx`, `components/YouuniverseRadioBar.tsx`, `contexts/ClubRadioContext.tsx`, `controllers/notNotesController.js`, `lib/audioUtils.ts`, `lib/emailService.ts`, `lib/emailVerification.ts`, `lib/foundingAngelsService.ts`, `lib/oneai.ts`, `middleware/verifyJwt.js`, `package-lock.json`, `public/sw.js`, `server.js`, `services/club/PersistentRadioService.ts`, `services/club/globalBroadcastManager.ts`, `services/club/supabaseClient.ts`, `tests/phase3-r15-verify-redirect.test.mjs`, `tests/phase3-r6a-auth.test.mjs`
  - **Untracked (`??`, 26 pre-existing):** `.vercelignore`, `api/not-notes/`, `api/weaver/`, `db/migrations/006_neon_first_decoupling.sql`, `db/migrations/007_rollback_founding_angels_mvp.sql`, `docs/`, `hell`, `"on\357\200\242"`, `scratch/`, `scripts/execute-migration-007.mjs`, `scripts/execute_003.js`, `scripts/execute_004.js`, `scripts/execute_005.js`, `scripts/preflight_003.js`, `scripts/rollback-migration-007.mjs`, `scripts/verify-migration-007.mjs`, `scripts/verify_tables.js`, `tests/action.built.cjs`, `tests/catalog-verifier.test.mjs`, `tests/founding-angels-sales-freeze.test.mjs`, `tests/migration-007-certification.test.mjs`, `tests/migration-007-executor.test.mjs`, `tests/migration-007-rollback.test.mjs`, `tests/proxy-e2e.mjs`, `tests/service-worker.test.mjs`, `tests/service.built.cjs`

---

## 2. Migration, Executor, and Verifier Integrity (SHA-256)

| File | SHA-256 Digest | Verification Status |
|---|---|---|
| `db/migrations/007_founding_angels_mvp.sql` | `2E4395EF75CC8720E03149DE917BEA7AD438F1F7C644FCFF94C92F9CADE8D27C` | Matches expected release digest exactly |
| `scripts/execute-migration-007.mjs` | `E69472D4A6164D8869531F92CC24E2B5AD92F2D1E76AF736ADA9CA244CB8B06` | Unchanged since Phase 13B.1.56 (`6630` bytes) |
| `scripts/verify-migration-007.mjs` | `FE478C2EDF118064E9C69BBED7A42DD10F1634193C1C6653583FF79D1011D0A` | Unchanged since Phase 13B.1.56 (`23265` bytes) |

---

## 3. Verified Neon Project and Endpoint Identity

All identity attributes below were verified from environment URL metadata (`hostname`, `pathname`, `searchParams`, `NEON_PROJECT_ID` — no credentials printed) and live SQL `pg_catalog.pg_settings` inside a `BEGIN TRANSACTION READ ONLY` session on the unpooled endpoint:

| Attribute | Verified Value | Source |
|---|---|---|
| Neon Project ID (`NEON_PROJECT_ID` / `.env` & `.env.local`) | `old-firefly-76827305` | Local env metadata & live `neon.project_id` |
| Endpoint ID | `ep-aged-dew-av9711nr` | Host prefix & live `neon.endpoint_id` |
| Unpooled Host | `ep-aged-dew-av9711nr.c-11.us-east-1.aws.neon.tech` (`port 5432`, `sslmode=require`) | `DATABASE_URL_UNPOOLED` metadata |
| Pooled Host | `ep-aged-dew-av9711nr-pooler.c-11.us-east-1.aws.neon.tech` | `DATABASE_URL` metadata |
| Region | AWS `us-east-1` (`c-11.us-east-1.aws.neon.tech`) | Authoritative endpoint hostname |
| Database / Schema / Connected User | `neondb` / `public` / `neondb_owner` | `current_database()`, `current_schema()`, `current_user` |
| PostgreSQL Engine Version | `18.6 (ac70818)` (`aarch64-unknown-linux-gnu`, Neon `18.6.15949.aa7ab252f7aef148dd9b23aee5f6b66ce2346a18.ac70818`) | `version()` / `neon.server_version_verbose` |
| Neon Branch ID | `br-dawn-cake-avinkic7` | `pg_settings` (`neon.branch_id`) |
| Neon Compute ID & Mode | `compute-blue-tooth-avtlvqnn` (`primary`) | `pg_settings` (`neon.compute_id`, `neon.compute_mode`) |
| Neon Tenant ID | `1591766cf91631fb6a72b7c2e8c823e2` | `pg_settings` (`neon.tenant_id`) |
| Neon Timeline ID | `9d10a00405e4f2f920d57b8bd360fbf9` | `pg_settings` (`neon.timeline_id`) |
| Observed Live WAL LSN (`2026-11-11 20:56:30.434026+00`) | `0/2D831C0` | `pg_current_wal_lsn()::text` |
| Transaction Enforcement Verified | `transaction_read_only = on` | `SHOW transaction_read_only;` |

**Region & Branch Relationship Resolution:**  
- Live endpoint metadata and runtime `pg_settings` unambiguously resolve to AWS **`us-east-1`** (`ep-aged-dew-av9711nr.c-11.us-east-1.aws.neon.tech`) on branch **`br-dawn-cake-avinkic7`** served by active `primary` compute **`compute-blue-tooth-avtlvqnn`** (superseding any earlier narrative reference to `us-east-2`).
- Note on endpoint control-plane state: Active read-only TLS SQL connectivity confirms the compute is up and serving queries in `primary` mode, whereas Neon Console/Control-Plane fields (autoscaling CU limits, suspend timeout, control-plane branch tree hierarchy) are not exposed via `pg_settings` SQL.

---

## 4. PITR Retention Evidence and Timestamps

| Sub-Dimension | Status | Evidence & Notes |
|---|---|---|
| **PITR retention verified** | **UNVERIFIED** | Authoritative Neon project recovery settings (retention hours/days, enabled tier features) are not exposed in `pg_settings` and no Neon Control-Plane API / CLI access is available. |
| **Target timestamp inside retention window** | **UNVERIFIED** | Prior historical reference (`2026-11-11T07:53:58.029Z`, LSN `0/2C9EAA0`, timeline `9d10a00405e4f2f920d57b8bd360fbf9`) shares the same live timeline `9d10a00405e4f2f920d57b8bd360fbf9`, and WAL LSN advanced to `0/2D831C0` at `2026-11-11T20:56:30.434Z`. Matching timeline and WAL progression do **not** verify earliest/latest selectable PITR window bounds. |

---

## 5. Recovery Branch Capability and Capacity Evidence

| Sub-Dimension | Status | Evidence & Notes |
|---|---|---|
| **Recovery branch capability verified** | **UNVERIFIED** | Cannot verify via read-only tools whether branching from a selected timestamp is currently enabled on project `old-firefly-76827305` without control-plane API/Console confirmation. |
| **Account capacity verified** | **UNVERIFIED** | Cannot verify active branch count vs. branch quota, compute/storage caps, or plan/billing holds (`neonctl` absent, no `NEON_API_KEY`, `list_plugin_accounts` returned none, `vercel integration` command timed out). |

---

## 6. Statement on Restore Testing

**No restore was performed or tested.**  
Zero branch creation, point-in-time restore, snapshot creation, deletion, or DDL/DML test actions were executed against Neon Production during Phase 13B.1.57.

---

## 7. Exact Four Production Identity IDs

Verified read-only from `public.youniverse_identities` (`ORDER BY identity_id`), zero unrelated identity profile attributes (`username`, `display_name`, `subdomain`, `email`, `stripe_session_id`) extracted:

- **Total Row Count:** `4`
- **Exact `identity_id` Values:**
  1. `0XYhTLe2eQoOb40kF7ayX`
  2. `f_iLGnF9aJ5aL61BuCoFg`
  3. `iF6hqzhNHjAD7AJ_DBYkq`
  4. `osrwu_ueKHulDCB50Anmw`

---

## 8. Identity Schema and Primary Key Baseline (`public.youniverse_identities`)

- **Row Count:** `4`
- **Primary Key (`conname` / definition):** `youniverse_identities_pkey` — `PRIMARY KEY (identity_id)`
- **Columns (`12`):**

| Ordinal | Column | Type (`data_type` / `udt_name`) | Nullable | Default |
|---:|---|---|:-:|:---|
| 1 | `identity_id` | `text` (`text`) | `NO` | `null` |
| 2 | `username` | `text` (`text`) | `NO` | `null` |
| 3 | `display_name` | `text` (`text`) | `NO` | `null` |
| 4 | `subdomain` | `text` (`text`) | `NO` | `null` |
| 5 | `identity_type` | `text` (`text`) | `NO` | `null` |
| 6 | `created_at` | `timestamp with time zone` (`timestamptz`) | `NO` | `null` |
| 7 | `email` | `text` (`text`) | `YES` | `null` |
| 8 | `plan` | `text` (`text`) | `YES` | `'free'::text` |
| 9 | `stripe_session_id` | `text` (`text`) | `YES` | `null` |
| 10 | `is_live` | `boolean` (`bool`) | `NO` | `true` |
| 11 | `is_primary` | `boolean` (`bool`) | `NO` | `true` |
| 12 | `email_verified_at` | `timestamp with time zone` (`timestamptz`) | `YES` | `null` |

- **Constraints (`12`):**
  - `youniverse_identities_pkey` (`p`): `PRIMARY KEY (identity_id)`
  - `youniverse_identities_subdomain_key` (`u`): `UNIQUE (subdomain)`
  - `youniverse_identities_username_key` (`u`): `UNIQUE (username)`
  - `youniverse_identities_identity_type_check` (`c`): `CHECK (identity_type = ANY (ARRAY['person'::text, 'agent'::text]))`
  - `8` NOT NULL constraints (`contype = n`): `youniverse_identities_created_at_not_null`, `youniverse_identities_display_name_not_null`, `youniverse_identities_identity_id_not_null`, `youniverse_identities_identity_type_not_null`, `youniverse_identities_is_live_not_null`, `youniverse_identities_is_primary_not_null`, `youniverse_identities_subdomain_not_null`, `youniverse_identities_username_not_null`
- **Indexes (`5`, all `indisvalid = true`):**
  - `youniverse_identities_pkey`: `CREATE UNIQUE INDEX youniverse_identities_pkey ON public.youniverse_identities USING btree (identity_id)`
  - `youniverse_identities_subdomain_key`: `CREATE UNIQUE INDEX youniverse_identities_subdomain_key ON public.youniverse_identities USING btree (subdomain)`
  - `youniverse_identities_username_key`: `CREATE UNIQUE INDEX youniverse_identities_username_key ON public.youniverse_identities USING btree (username)`
  - `youniverse_identities_username_idx`: `CREATE INDEX youniverse_identities_username_idx ON public.youniverse_identities USING btree (username)`
  - `youniverse_identities_email_idx`: `CREATE INDEX youniverse_identities_email_idx ON public.youniverse_identities USING btree (email) WHERE (email IS NOT NULL)`
- **Triggers:** `0`

---

## 9. Nine-Table Baseline Inventory and Row Counts

All `9` required baseline tables exist in `neondb.public` with `0` triggers (`trg = 0`) across all nine:

| # | Table | Exists | Row Count | Columns | Constraints (`Total / NOT NULL / PK / FK / UQ / CK`) | Indexes (all `indisvalid = true`) | Triggers |
|---:|---|:-:|---:|---:|---|---|---:|
| 1 | `DeviceTrust` | `true` | `0` | `8` | `9` (`7 n`, `1 p`: `DeviceTrust_pkey`, `1 f`: `DeviceTrust_userId_fkey`) | `3` | `0` |
| 2 | `NotNote` | `true` | `1` | `7` | `9` (`7 n`, `1 p`: `NotNote_pkey`, `1 f`: `NotNote_youniverseId_identity_fkey`) | `2` | `0` |
| 3 | `Session` | `true` | `0` | `9` | `7` (`5 n`, `1 p`: `Session_pkey`, `1 f`: `Session_userId_fkey`) | `5` | `0` |
| 4 | `User` | `true` | `1` | `6` | `5` (`4 n`, `1 p`: `User_pkey`) | `3` | `0` |
| 5 | `Youniverse` | `true` | `1` | `9` | `11` (`9 n`, `1 p`: `Youniverse_pkey`, `1 f`: `Youniverse_ownerId_fkey`) | `4` | `0` |
| 6 | `email_verification_tokens` | `true` | `7` | `6` | `8` (`5 n`, `1 p`: `email_verification_tokens_pkey`, `1 f`: `email_verification_tokens_identity_id_fkey`, `1 u`: `email_verification_tokens_token_hash_key`) | `4` | `0` |
| 7 | `handoff_tokens` | `true` | `5` | `6` | `8` (`6 n`, `1 p`: `handoff_tokens_pkey`, `1 u`: `handoff_tokens_nonce_key`) | `4` | `0` |
| 8 | `sessions` | `true` | `9` | `8` | `8` (`5 n`, `1 p`: `sessions_pkey`, `1 f`: `sessions_identity_id_fkey`, `1 u`: `sessions_token_hash_key`) | `4` | `0` |
| 9 | `youniverse_identities` | `true` | `4` | `12` | `12` (`8 n`, `1 p`: `youniverse_identities_pkey`, `2 u`, `1 c`) | `5` | `0` |

### Safe Structural Details for Tables 1–8 (`youniverse_identities` in Section 8)

1. **`DeviceTrust`** (`0` rows):
   - **Columns:** `id` (`text`, NO), `userId` (`text`, NO), `deviceId` (`text`, NO), `deviceType` (`text`, NO), `publicKey` (`text`, NO), `revokedAt` (`timestamp`, YES), `lastSyncAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`), `createdAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`).
   - **Constraints:** `DeviceTrust_pkey` (`PRIMARY KEY (id)`), `DeviceTrust_userId_fkey` (`FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE`), 7 NOT NULL constraints.
   - **Indexes:** `DeviceTrust_pkey` (PK unique), `DeviceTrust_deviceId_key` (`UNIQUE` on `"deviceId"`), `DeviceTrust_userId_deviceId_idx` (btree on `"userId", "deviceId"`).
2. **`NotNote`** (`1` row):
   - **Columns:** `id` (`text`, NO), `youniverseId` (`text`, NO), `title` (`text`, NO), `content` (`jsonb`, NO), `status` (`USER-DEFINED` `ArtifactState`, NO, default `'PENDING'::"ArtifactState"`), `createdAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`), `updatedAt` (`timestamp`, NO).
   - **Constraints:** `NotNote_pkey` (`PRIMARY KEY (id)`), `NotNote_youniverseId_identity_fkey` (`FOREIGN KEY ("youniverseId") REFERENCES youniverse_identities(identity_id) ON UPDATE CASCADE ON DELETE CASCADE`), 7 NOT NULL constraints.
   - **Indexes:** `NotNote_pkey` (PK unique), `NotNote_youniverseId_idx` (btree on `"youniverseId"`).
3. **`Session`** (`0` rows):
   - **Columns:** `id` (`text`, NO), `userId` (`text`, NO), `refreshToken` (`text`, NO), `userAgent` (`text`, YES), `ipAddress` (`text`, YES), `expiresAt` (`timestamp`, NO), `revokedAt` (`timestamp`, YES), `createdAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`), `token_hash` (`text`, YES).
   - **Constraints:** `Session_pkey` (`PRIMARY KEY (id)`), `Session_userId_fkey` (`FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE`), 5 NOT NULL constraints.
   - **Indexes:** `Session_pkey` (PK unique), `Session_refreshToken_key` (`UNIQUE` on `"refreshToken"`), `Session_token_hash_key` (`UNIQUE` partial on `token_hash WHERE (token_hash IS NOT NULL)`), `Session_refreshToken_idx` (btree on `"refreshToken"`), `Session_userId_idx` (btree on `"userId"`).
4. **`User`** (`1` row):
   - **Columns:** `id` (`text`, NO), `email` (`text`, NO), `emailVerified` (`timestamp`, YES), `createdAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`), `updatedAt` (`timestamp`, NO), `email_verified_at` (`timestamptz`, YES).
   - **Constraints:** `User_pkey` (`PRIMARY KEY (id)`), 4 NOT NULL constraints.
   - **Indexes:** `User_pkey` (PK unique), `User_email_key` (`UNIQUE` on `email`), `User_email_idx` (btree on `email`).
5. **`Youniverse`** (`1` row):
   - **Columns:** `id` (`text`, NO), `handle` (`text`, NO), `type` (`USER-DEFINED` `YouniverseType`, NO, default `'PERSON'::"YouniverseType"`), `tier` (`USER-DEFINED` `YouniverseTier`, NO, default `'FREE'::"YouniverseTier"`), `ownerId` (`text`, NO), `isPrimary` (`bool`, NO, default `true`), `isLive` (`bool`, NO, default `true`), `createdAt` (`timestamp`, NO, default `CURRENT_TIMESTAMP`), `updatedAt` (`timestamp`, NO).
   - **Constraints:** `Youniverse_pkey` (`PRIMARY KEY (id)`), `Youniverse_ownerId_fkey` (`FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE`), 9 NOT NULL constraints.
   - **Indexes:** `Youniverse_pkey` (PK unique), `Youniverse_handle_key` (`UNIQUE` on `handle`), `Youniverse_handle_idx` (btree on `handle`), `Youniverse_ownerId_idx` (btree on `"ownerId"`).
6. **`email_verification_tokens`** (`7` rows):
   - **Columns:** `id` (`text`, NO, default `(gen_random_uuid())::text`), `identity_id` (`text`, NO), `token_hash` (`text`, NO), `expires_at` (`timestamptz`, NO), `consumed_at` (`timestamptz`, YES), `created_at` (`timestamptz`, NO, default `now()`).
   - **Constraints:** `email_verification_tokens_pkey` (`PRIMARY KEY (id)`), `email_verification_tokens_token_hash_key` (`UNIQUE (token_hash)`), `email_verification_tokens_identity_id_fkey` (`FOREIGN KEY (identity_id) REFERENCES youniverse_identities(identity_id) ON DELETE CASCADE`, update rule `NO ACTION`), 5 NOT NULL constraints.
   - **Indexes:** `email_verification_tokens_pkey` (PK unique), `email_verification_tokens_token_hash_key` (`UNIQUE` on `token_hash`), `email_verification_tokens_token_hash_idx` (btree on `token_hash`), `email_verification_tokens_identity_id_idx` (btree on `identity_id`).
7. **`handoff_tokens`** (`5` rows):
   - **Columns:** `token_id` (`uuid`, NO, default `gen_random_uuid()`), `handle` (`varchar`, NO), `nonce` (`varchar`, NO), `consumed` (`bool`, NO, default `false`), `expires_at` (`timestamptz`, NO), `created_at` (`timestamptz`, NO, default `now()`).
   - **Constraints:** `handoff_tokens_pkey` (`PRIMARY KEY (token_id)`), `handoff_tokens_nonce_key` (`UNIQUE (nonce)`), 6 NOT NULL constraints.
   - **Indexes:** `handoff_tokens_pkey` (PK unique), `handoff_tokens_nonce_key` (`UNIQUE` on `nonce`), `idx_handoff_active` (btree on `nonce, consumed, expires_at`), `idx_handoff_handle` (btree on `handle`).
8. **`sessions`** (`9` rows):
   - **Columns:** `id` (`text`, NO, default `(gen_random_uuid())::text`), `identity_id` (`text`, NO), `token_hash` (`text`, NO), `expires_at` (`timestamptz`, NO), `revoked_at` (`timestamptz`, YES), `user_agent` (`text`, YES), `ip_address` (`text`, YES), `created_at` (`timestamptz`, NO, default `now()`).
   - **Constraints:** `sessions_pkey` (`PRIMARY KEY (id)`), `sessions_token_hash_key` (`UNIQUE (token_hash)`), `sessions_identity_id_fkey` (`FOREIGN KEY (identity_id) REFERENCES youniverse_identities(identity_id) ON DELETE CASCADE`, update rule `NO ACTION`), 5 NOT NULL constraints.
   - **Indexes:** `sessions_pkey` (PK unique), `sessions_token_hash_key` (`UNIQUE` on `token_hash`), `sessions_token_hash_idx` (btree on `token_hash`), `sessions_identity_id_idx` (btree on `identity_id`).

---

## 10. Safe Record-Preservation Identifiers (Non-Sensitive Only)

All tokens (`token_hash`, `nonce`), secrets, `email` addresses, `handle`/`username` strings, `user_agent`, `ip_address`, and `NotNote.title`/`content` were excluded.

### `sessions` (`9` rows)

| `id` | `identity_id` | `created_at` (UTC) | `expires_at` (UTC) | `is_revoked` |
|---|---|---|---|:-:|
| `d3f4328d-b629-43ad-a772-9ca073d7ddc1` | `0XYhTLe2eQoOb40kF7ayX` | `2026-10-27T11:17:49.090Z` | `2026-11-03T11:17:49.087Z` | `false` |
| `07bba925-4ed4-4a23-bb7c-00f1af6e828c` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:10:53.033Z` | `2026-11-13T04:10:53.000Z` | `false` |
| `754f304d-b485-4fe6-acbc-358db2492d23` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:10:54.660Z` | `2026-11-13T04:10:54.657Z` | `false` |
| `fda465ce-dd9c-4762-8c64-363163d4bec6` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:16:33.275Z` | `2026-11-13T04:16:33.265Z` | `false` |
| `13c0b241-ba1f-42b2-8d76-95b8e0efc492` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:16:33.824Z` | `2026-11-13T04:16:33.818Z` | `false` |
| `b243326d-d50f-404c-abdc-3473e44fa8c8` | `osrwu_ueKHulDCB50Anmw` | `2026-11-09T20:59:00.225Z` | `2026-11-16T20:59:00.202Z` | `false` |
| `1abb3643-1d34-4724-aed9-cb697cf5514f` | `osrwu_ueKHulDCB50Anmw` | `2026-11-09T20:59:04.622Z` | `2026-11-16T20:59:04.619Z` | `false` |
| `589ee3e6-38cc-48ae-bfea-fd2fe654d8c4` | `f_iLGnF9aJ5aL61BuCoFg` | `2026-11-10T01:33:02.372Z` | `2026-11-17T01:33:02.359Z` | `false` |
| `95cc8e68-a421-42dc-af66-472f2b53902f` | `f_iLGnF9aJ5aL61BuCoFg` | `2026-11-10T01:33:06.451Z` | `2026-11-17T01:33:06.449Z` | `false` |

### `handoff_tokens` (`5` rows)

| `token_id` | `consumed` | `expires_at` (UTC) | `created_at` (UTC) |
|---|:-:|:--|:--|
| `0d3d2f90-fc38-4d0e-ab06-4f270fa9d420` | `false` | `2026-10-27T11:19:19.118Z` | `2026-10-27T11:17:49.120Z` |
| `50150d43-1777-4234-825d-ce8de6b75a7d` | `true` | `2026-11-06T04:12:23.043Z` | `2026-11-06T04:10:53.046Z` |
| `40509ea4-86cc-4fb2-ba74-2ad4f136bf3d` | `true` | `2026-11-06T04:18:03.279Z` | `2026-11-06T04:16:33.281Z` |
| `e93db7f0-4b45-4509-a5f3-db2b3a1a4712` | `true` | `2026-11-09T21:00:30.252Z` | `2026-11-09T20:59:00.254Z` |
| `b5dcd2aa-653c-4548-b8c3-f0700ab90c75` | `true` | `2026-11-10T01:34:32.380Z` | `2026-11-10T01:33:02.383Z` |

### `email_verification_tokens` (`7` rows)

| `id` | `identity_id` | `created_at` (UTC) | `expires_at` (UTC) | `is_consumed` |
|---|---|---|---|:-:|
| `4189feb1-cc21-471d-9f97-e1249382a89a` | `0XYhTLe2eQoOb40kF7ayX` | `2026-10-27T11:11:46.272Z` | `2026-10-28T11:11:46.270Z` | `true` |
| `6f6d6b38-464f-4ff8-b795-0d836df9d385` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:08:20.327Z` | `2026-11-07T04:08:20.325Z` | `true` |
| `1ce60453-a61c-4c1b-9405-ffc6743972a5` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:16:33.013Z` | `2026-11-06T04:21:32.968Z` | `true` |
| `a59e9007-cc61-4ae0-9887-a74c3143dd52` | `iF6hqzhNHjAD7AJ_DBYkq` | `2026-11-06T04:16:33.519Z` | `2026-11-06T04:15:34.077Z` | `false` |
| `1b596164-131f-48ad-b135-d61aa4552cb1` | `osrwu_ueKHulDCB50Anmw` | `2026-11-06T09:14:14.217Z` | `2026-11-07T09:14:14.215Z` | `true` |
| `86ac6061-12b0-424d-9dc3-6636fa2479eb` | `osrwu_ueKHulDCB50Anmw` | `2026-11-09T20:58:08.977Z` | `2026-11-10T20:58:08.975Z` | `true` |
| `e7bb70bd-3d87-49f5-9c52-696fc9a8d3f7` | `f_iLGnF9aJ5aL61BuCoFg` | `2026-11-10T01:31:09.282Z` | `2026-11-11T01:31:09.280Z` | `true` |

### `User`, `Youniverse`, `NotNote`, `DeviceTrust`, `Session`

- **`User` (`1` row):** `id = 0XYhTLe2eQoOb40kF7ayX`, `createdAt = 2026-10-27T15:11:46.183Z`, `updatedAt = 2026-10-27T15:11:46.183Z`, `has_verified_at = false`
- **`Youniverse` (`1` row):** `id = 0XYhTLe2eQoOb40kF7ayX`, `type = PERSON`, `tier = FREE`, `ownerId = 0XYhTLe2eQoOb40kF7ayX`, `isPrimary = true`, `isLive = true`, `createdAt = 2026-10-27T15:11:46.230Z`, `updatedAt = 2026-10-27T15:11:46.230Z`
- **`NotNote` (`1` row):** `id = TOYG_qD_6TIk1UkUfXayd`, `youniverseId = iF6hqzhNHjAD7AJ_DBYkq`, `status = APPROVED`, `createdAt = 2026-11-06T09:16:36.337Z`, `updatedAt = 2026-11-06T09:16:36.337Z`
- **`DeviceTrust` / `Session`:** `0` rows each (empty baseline verified).

---

## 11. Existing Public Catalog Fingerprints

Live `public` schema currently contains **`11` tables** (`DeviceTrust`, `NotNote`, `Session`, `User`, `Youniverse`, `email_verification_tokens`, `founding_angel_memberships`, `founding_angel_orders`, `handoff_tokens`, `sessions`, `youniverse_identities`) and **`3` enum types**:
- `ArtifactState`: `{PENDING,APPROVED,REJECTED,ARCHIVED_TO_BOOKS}`
- `YouniverseTier`: `{FREE,PAID,ENTERPRISE}`
- `YouniverseType`: `{PERSON,AGENT}`

Fingerprints were computed deterministically (canonical sorted `JSON.stringify` UTF-8 -> SHA-256 uppercase) for both the **non-007 baseline** (excluding `founding_angel_orders`, `founding_angel_memberships`, and the `4` Migration 007 functions) and the **currently present Migration 007 objects**:

| Catalog Bucket | Non-007 Baseline Count & SHA-256 | Live Present Migration 007 Count & SHA-256 | Live `public` Schema Total |
|---|---|---|---|
| Constraints (`pg_constraint`) | **`77`** — `12AE2337C43858B5246DDB14ABF1133C1D66F41FB628A323AB2CC26F45680EB1` | **`74`** — `2336DA4990F57B81A713CD0CE7768BB7C1D2B8F6DDBF3946F15D0B8168745801` | **`151`** (`77 + 74`) |
| Indexes (`pg_index`) | **`34`** — `A09440E8E1F229593BCAF0DE664FCFE56E353C8247AE836F28ADBA2CCD9677EF` | **`14`** — `02DD057F835A2960F513C0300CEF47FF29A92F13AE4D43428A1D4037A865D77C` | **`48`** (`34 + 14`) |
| Triggers (`pg_trigger`, non-internal) | **`0`** — `4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945` | **`3`** — `BAE10D1B352343514EAB03EB37DB51BB64804214B30741D43289AC19872062BD` | **`3`** (`0 + 3`) |
| Functions (`pg_proc`) | **`0`** — `4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945` | **`4`** — `7F7981B224E947A41F4D3C5769561FB1FD5D1A79D0180842CD8B78E490EB35B3` | **`4`** (`0 + 4`) |
| Public Enums (`pg_enum`) | **`3`** — `CB3FDBF3E91FBD073C63D7424AFAFA4F8D88909B1D9378D6F0CB2F367D660A30` | `0` | **`3`** |

*(Note: `4F53CDA18C2BAA0C0354BB5F9A3ECBE5ED12AB4D8E11BA873C2F11161202B945` is the deterministic SHA-256 of `[]`, confirming zero pre-existing triggers or functions in `public` outside Migration 007.)*

---

## 12. Migration 007 Target-Object Absence Check (**FAILED — ALREADY PRESENT**)

Read-only `pg_catalog` and `to_regclass` inspection revealed that **Migration 007 target objects already exist in `neondb.public`**:

- `to_regclass('public.founding_angel_orders') IS NOT NULL` -> **`true`** (**row count: `1`**)
- `to_regclass('public.founding_angel_memberships') IS NOT NULL` -> **`true`** (**row count: `0`**)
- **Relations (`pg_class` matching `%founding_angel%`, `16` total):**
  - Tables (`kind = r`, `2`): `founding_angel_memberships`, `founding_angel_orders`
  - Indexes (`kind = i`, `14`): `founding_angel_memberships_identity_id_key`, `founding_angel_memberships_order_id_key`, `founding_angel_memberships_pkey`, `founding_angel_orders_active_capacity_idx`, `founding_angel_orders_active_refund_idempotency_key_key`, `founding_angel_orders_dispute_id_key`, `founding_angel_orders_id_identity_uq`, `founding_angel_orders_one_active_checkout_idx`, `founding_angel_orders_pkey`, `founding_angel_orders_refund_queue_idx`, `founding_angel_orders_stripe_charge_id_key`, `founding_angel_orders_stripe_checkout_session_id_key`, `founding_angel_orders_stripe_idempotency_key_key`, `founding_angel_orders_stripe_payment_intent_id_key`
- **Functions (`4`):**
  1. `assign_and_verify_founding_angel_member_number()`
  2. `enforce_founding_angel_membership_immutability()`
  3. `enforce_founding_angel_order_immutability()`
  4. `transition_founding_angel_membership(p_order_id uuid, p_new_status text, p_reason text, p_dispute_id text)`
- **Triggers (`3`, all `tgenabled = 'O'`):**
  1. `trg_assign_founding_angel_member_number` on `founding_angel_memberships`
  2. `trg_enforce_founding_angel_membership_immutability` on `founding_angel_memberships`
  3. `trg_enforce_founding_angel_order_immutability` on `founding_angel_orders`
- **Composite / Array Types (`4`):** `founding_angel_orders`, `_founding_angel_orders`, `founding_angel_memberships`, `_founding_angel_memberships`

Per Phase 5 stop rules, inspection halted immediately without executing any rollback, DDL, or repair.

---

## 13. Exact Commands and Read-Only Operations Used

1. **Repository & Digest Attestation (Read-Only):**
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git diff --cached --name-status`
   - `git status --short`
   - `certutil -hashfile db/migrations/007_founding_angels_mvp.sql SHA256`
   - `certutil -hashfile scripts/execute-migration-007.mjs SHA256`
   - `certutil -hashfile scripts/verify-migration-007.mjs SHA256`
   - `Test-Path docs/phase-13b-1-56-final-cli-exit-code-closure.md`
2. **Control-Plane Tool Discovery (Read-Only):**
   - `list_plugin_accounts` (returned zero plugin accounts)
   - Env/CLI availability checks (`neonctl`, `NEON_API_KEY`, `%USERPROFILE%\.neon`, `%APPDATA%\neonctl`) and `vercel integration list` / `installations` (timed out at 10s, cancelled).
3. **Production Database Read-Only Pass 1 & Pass 2 (`@neondatabase/serverless` over `DATABASE_URL_UNPOOLED`):**
   - Both passes opened with `BEGIN TRANSACTION READ ONLY;`, asserted `SHOW transaction_read_only;` == `'on'`, queried only `pg_catalog`, `information_schema`, row `COUNT(*)`, `identity_id` values, safe PK/timestamp columns, and ended with `ROLLBACK;`.
   - Scratch artifacts stored outside the Git commit tree in the conversation scratch directory (`phase57_inspect_prod.mjs`, `phase57_prod_pass1.json`, `phase57_inspect_pass2.mjs`, `phase57_prod_pass2.json`).

---

## 14. Unverified Items and Reasons

| Item | Reason Unverified / Failed | Exact Operator Action Required |
|---|---|---|
| **PITR retention duration** | No `NEON_API_KEY`, `neonctl`, or Neon plugin session; SQL `pg_settings` does not expose account retention period. | In **Neon Console -> Project `old-firefly-76827305` -> Settings -> Restore / Storage**, confirm configured PITR history retention window (days/hours) and plan entitlement. |
| **Recovery target inside retention window** | Earliest/latest recoverable timestamps are control-plane metadata, not SQL `pg_catalog` metadata. | In **Neon Console -> Project `old-firefly-76827305` -> Branches -> Restore** preview on `br-dawn-cake-avinkic7` (without submitting), confirm earliest/latest PITR timestamps cover both `2026-11-11T07:53:58.029Z` (LSN `0/2C9EAA0`) and a fresh pre-operation timestamp. |
| **Recovery branch capability** | No control-plane API/CLI session to verify branching permissions/plan feature flag. | Confirm in **Neon Console -> Project `old-firefly-76827305` -> Branches** that point-in-time branch creation from `br-dawn-cake-avinkic7` is available. |
| **Account capacity & quotas** | Active branch count vs. project quota, storage limit, and billing/account state are not visible from SQL. | Check **Neon Console -> Organization/Project Billing & Usage -> Branches / Storage / Compute** to confirm branch quota headroom and absence of holds/caps. |
| **Migration target objects absent** | **FAILED check (objects already present):** `founding_angel_orders` (`1` row), `founding_angel_memberships` (`0` rows), `14` indexes, `74` constraints, `4` functions, and `3` triggers already exist in `neondb.public`. | Under a separately authorized read-only audit, inspect the deployed catalog via `scripts/verify-migration-007.mjs` and safely inspect the single existing `founding_angel_orders` row (status/origin) before taking any schema or rollback action. |

---

## 15. Phase 7 Final Decision Matrix & Operational Recommendation

| Readiness dimension | Required status |
|---|---|
| Repository identity | **VERIFIED** |
| Migration checksum | **VERIFIED** |
| Neon endpoint identity | **VERIFIED** |
| PITR retention | **UNVERIFIED** |
| Recovery target inside retention | **UNVERIFIED** |
| Recovery branch capability | **UNVERIFIED** |
| Account capacity | **UNVERIFIED** |
| Identity record baseline | **VERIFIED** |
| Nine-table baseline | **VERIFIED** |
| Existing catalog fingerprint | **VERIFIED** |
| Migration target objects absent | **UNVERIFIED** *(FAILED — already present, `founding_angel_orders` has `1` row)* |
| **Production migration readiness** | **NOT READY** |

### Final Operational Recommendation

1. **Halt forward migration execution (`scripts/execute-migration-007.mjs`) and do not run `rollback-migration-007.mjs`.** Production already holds all Migration 007 tables/functions/triggers **plus `1` row in `founding_angel_orders`**; blind execution or rollback could error or destroy existing order state.
2. **Obtain operator confirmation of the four Neon Console PITR & quota checks** listed in Section 14 (without pasting credentials or keys).
3. **Authorize a targeted read-only reconciliation phase** to run `scripts/verify-migration-007.mjs` against `neondb.public` and audit the `1` row in `public.founding_angel_orders` so the team can verify exact Migration 007 catalog parity with zero data loss rather than re-running initial migration DDL.

