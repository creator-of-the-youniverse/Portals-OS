# Phase 13B.1.59 — Production Release Recovery & Source Reconciliation

**Status:** COMPLETE (`RECOVERED WITH BLOCKERS` — Locally Validated; Clean Git Commit/Deploy & Phase 60 Stripe Check Pending Authorization)  
**Execution Mode:** Production-Preserving Forensics, Classification, and Local Build/Test Validation (Zero Git, Vercel, Stripe, or Neon Mutations)  
**Repository:** `creator-of-the-youniverse/Portals-OS`  
**Branch:** `restore/neon-prisma-split`  
**`HEAD` & Remote `origin/restore/neon-prisma-split`:** `6d5fdf06bb5ef92e2dea89d02413e4af79876927` (`feat: add Founding Angels MVP`, 19 files)  
**Target Production Deployment:** `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC` (`portals-o7do3gc7y-the-youniverse.vercel.app`, aliased to `itsyouonline.com` / `www.itsyouonline.com`)  
**Production Neon DB State:** Preserved untouched (`0` Neon connections opened in Phase 59; Phase 58 read-only state at `LSN 0/2DA4FF0`: `1` `'open'` order `600e057c-...-4a78`, `0` memberships, checkout sales remain LIVE)

---

## 1. Executive Recovery Summary

The Production Founding Angels implementation and active Vercel deployment (`dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`) have been forensically reconstructed and validated locally without disturbing live checkout availability or existing Production records:

1. **Why `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC` Reported `gitDirty = "1"`:** Production was deployed prebuilt (`vercel build --prod` + [`scripts/sync-vercel-typescript-runtime.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/scripts/sync-vercel-typescript-runtime.mjs) + `vercel deploy --prebuilt --prod`) from a dirty working tree containing **both** uncommitted Founding Angels fixes **and** pre-existing uncommitted backend/security/frontend/PWA work already running in Production.
2. **Exact Founding Angels Delta Over `HEAD` Recovered:**
   - All Founding Angels UI components (`App.tsx`, `components/founding-angels/*`), auth helpers ([`lib/serverlessAuth.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/serverlessAuth.ts), [`lib/neonSession.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/neonSession.ts) LF-identical, [`lib/e2eDatabaseConfig.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/e2eDatabaseConfig.ts)), and [`db/migrations/007_founding_angels_mvp.sql`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/007_founding_angels_mvp.sql) (`2E4395EF...D27C`) match `HEAD` (`6d5fdf06...`).
   - Only **two tracked runtime files** differ on Founding Angels paths:
     - [`lib/foundingAngelsService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts) (`+36/-0` lines): adds [`FoundingAngelSalesPausedError`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L120-L126), [`isFoundingAngelsSalesEnabled`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L128-L147), and the sales-enablement check inside [`createFoundingAngelCheckoutSession`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L165-L168).
     - [`api/stripe/[action].ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts) (`+23/-1` lines): adds `www.${CANONICAL_APEX_DOMAIN}` canonical host acceptance in [`resolveTrustedOrigin`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts#L271-L275) and the HTTP `503` `SALES_PAUSED` gate in [`handleFoundingAngelCheckout`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts#L345-L357) (plus catch guard `#L383-L393`) while leaving webhooks and status unaffected.
   - **Why Re-Deploying `HEAD` Raw Would Break Production Checkout:** `HEAD` (`6d5fdf06...`) rejects `https://www.itsyouonline.com` origin in `resolveTrustedOrigin` and lacks the `FOUNDING_ANGELS_SALES_ENABLED` kill-switch.
3. **Critical Parity Boundary Discovery (Non-Founding-Angels Dirty Code Live in `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`):**
   - Forensic inspection of `.vercel/output/functions/` (`11` compiled lambdas) and `.vercel/output/static/` proves that `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC` **also** includes uncommitted changes in `api/claim.ts`, `api/gemini.ts`, `api/v1/auth/verify.ts`, `lib/emailService.ts`, `lib/emailVerification.ts`, untracked `api/not-notes/*`, `api/weaver/*`, `.vercelignore`, `public/sw.js`, and 13 modified frontend/Club files.
   - Deploying from a commit containing **only** the Founding Angels delta (leaving the rest of the dirty tree uncommitted/unpushed) would **revert** those live auth/email/Gemini/NotNotes/Weaver/PWA fixes or risk exceeding Vercel's 12-function limit (`13` API `.ts` files on disk vs `.vercelignore` keeping `11` functions).
4. **Full Local Validation Passed (`exit 0`):** TypeScript check (`tsc --noEmit`), all targeted Founding Angels, Security, Auth, Handoff, Session, Public Profile, Dispatcher, Sales-Freeze, and Service Worker test commands (`9` suites / `213` reported Node test/assert items + `5` sales-freeze sections, `0` failures, `0` skipped), and an isolated Vite production build (`2,382` modules) all passed cleanly.

---

## 2. Three-Way Comparison: `HEAD` vs. Working Tree vs. Live Vercel Production

### 2.1 Production Deployment Identity (`dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`)

- **URL:** `https://portals-o7do3gc7y-the-youniverse.vercel.app`
- **State / Target:** `READY` / `production` (created `2026-11-11T12:13:17.390Z`, ready `12:13:26.489Z`)
- **Aliases:** `itsyouonline.com`, `www.itsyouonline.com`, `*.itsyouonline.com`, `creator-of-the-youniverse.itsyouonline.com`, `portals-os-the-youniverse.vercel.app`
- **Metadata:** `meta.githubCommitSha = "6d5fdf06bb5ef92e2dea89d02413e4af79876927"`, `meta.githubCommitRef = "restore/neon-prisma-split"`, **`meta.gitDirty = "1"`**, `gitSource = null`, `lambdaRuntimeStats = {"nodejs": 11}`
- **Prior Nov 6 Production Deployment:** `dpl_HagfvXcsKXavyaj81di1DrtKvYNv` (`portals-pfav97shq-the-youniverse.vercel.app`, `2026-11-06T02:40:35.685Z`, `9add36ce...`, also `meta.gitDirty = "1"`, `11` nodejs lambdas)

### 2.2 Equivalence Matrix Across Artifacts

| Component / Artifact | In `HEAD` (`6d5fdf06`) | In Local Working Tree | In `.vercel/output` (`dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`) | Parity Status |
|---|---|---|---|---|
| `App.tsx` | Founding Angels routes | Matches `HEAD` (`0` diff) | Compiled in `assets/index-*.js` (`founding-angels-checkout`, `Founding Angels`) | **100% Aligned** |
| `components/founding-angels/*` (`4` files) | Offer, Success, Cancel, index | Matches `HEAD` (`matchesHeadRaw=true`) | Compiled in static assets | **100% Aligned** |
| `lib/serverlessAuth.ts`, `lib/e2eDatabaseConfig.ts` | Present | Matches `HEAD` (`0` diff) | Copied into 4 `.func` bundles (`matchesHead=true`) | **100% Aligned** |
| `lib/neonSession.ts` | Present | `sameLF=true` (`CRLF` in WT only) | Copied into 9 `.func` bundles (LF WT copy) | **100% Equivalent (LF)** |
| `db/migrations/007_founding_angels_mvp.sql` | Present (`2E4395EF...`) | Matches `HEAD` (`0` diff) | N/A (live Neon schema 100% parity per Phase 58) | **100% Aligned** |
| `scripts/sync-vercel-typescript-runtime.mjs` | Present | Matches `HEAD` (`0` diff) | Executed during prebuilt packaging (`5` required routes) | **100% Aligned** |
| `lib/foundingAngelsService.ts` | Pre-freeze (`F96E7714...`) | **Dirty (`+36/-0`, `33E13ADC...`)** | `.vercel/output/functions/api/stripe/[action].func/lib/foundingAngelsService.ts` **matches WT** | **WT Live / Missing in `HEAD`** |
| `api/stripe/[action].ts` | Apex-only (`96F25B79...`) | **Dirty (`+23/-1`, `90756E91...`)** | `.vercel/output/functions/api/stripe/[action].func/api/stripe/[action].js` contains `www.` & `SALES_PAUSED` | **WT Live / Missing in `HEAD`** |
| `.vercelignore` | **Absent** | **Untracked (`api/lmstudio.ts`, `api/migrate-db.ts`)** | `api/lmstudio.func` & `api/migrate-db.func` absent; exactly `11` lambdas built | **WT Live / Missing in `HEAD`** |
| `api/claim.ts`, `api/gemini.ts`, `api/v1/auth/verify.ts` | Older versions | **Dirty** (`-16`, `+370/-28`, `+6/-0`) | `.func/*.js` bundles verified with `validateGeminiInput`, Prisma sync removed, `assertHandoffSigningConfigured` | **WT Live / Missing in `HEAD`** |
| `lib/emailService.ts`, `lib/emailVerification.ts` | Older versions | **Dirty** (`+32/-2`, `-19`) | Copied into `api/claim.func` & `api/v1/auth/verify.func` **matching WT** | **WT Live / Missing in `HEAD`** |
| `api/not-notes/{artifact,widgets}.ts`, `api/weaver/generate.ts` | **Absent** | **Untracked (`3` routes)** | Compiled into `.func` lambdas (`3` of `11`) | **WT Live / Missing in `HEAD`** |
| `public/sw.js` | `00C2BD88...9F16` | **Dirty (`+29/-7`, `4240ED04...7AB9`)** | `.vercel/output/static/sw.js` **byte-identical to WT** (`outMatchesWT=true`) | **WT Live / Missing in `HEAD`** |
| Frontend/Radio `M` files (`apps/*`, `components/*`, `contexts/*`, `lib/{audioUtils,oneai}.ts`) | Older versions | **Dirty (`9`+ files)** | Compiled markers verified in `.vercel/output/static/assets/*.js`; Vite clean build `index-*.js` (`665.91 kB`) matches `.vercel/output/static/assets/index-DLsuVvbM.js` (`665,913 B`) | **WT Live / Missing in `HEAD`** |

> [!IMPORTANT]
> **Why `www.` canonical trust + `.vercelignore` are non-optional:**
> - Without [`api/stripe/[action].ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts#L271-L275) (`host !== CANONICAL_APEX_DOMAIN && host !== www.${CANONICAL_APEX_DOMAIN}`), `resolveTrustedOrigin` in `HEAD` throws on requests arriving via `https://www.itsyouonline.com` (the `APP_URL` and primary alias tested in Phase 47).
> - Without [`.vercelignore`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/.vercelignore) excluding `api/lmstudio.ts` and `api/migrate-db.ts`, adding `api/not-notes/*` (`2`) and `api/weaver/generate.ts` (`1`) yields `13` Vercel serverless functions, exceeding Vercel's `12`-function cap (`lambdaRuntimeStats: {"nodejs": 11}`).

---

## 3. Complete Classification of All Working-Tree & Untracked Files (`28 M` + `26 ??` Entries)

At Phase 59 inspection (`git status --porcelain=v1 -z -uall` prior to writing this report), the staging index was empty (`0` staged), with `28` modified tracked files (`27` real content diffs + `1` CRLF-only `package-lock.json`) and `43` individual untracked files (`26` entries in `git status --short`).

### Group 1 — Founding Angels Uncommitted Application & Freeze Fixes (Required for Release Recovery)

| Path | Git State | Change Summary | Bytes | Full SHA-256 Digest |
|---|---|---|---:|---|
| [`api/stripe/[action].ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts) | ` M` (`+23/-1`) | Trust `www.itsyouonline.com` in `resolveTrustedOrigin`; fail closed HTTP `503` `SALES_PAUSED` when `FOUNDING_ANGELS_SALES_ENABLED` disabled; webhook & status unaffected | `24,826` | `90756E91ED4EE3F8F2418D5FAB5E51354A31C2B4C4D72F6AE27571BCB1FA6725` |
| [`lib/foundingAngelsService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts) | ` M` (`+36/-0`) | Export `FoundingAngelSalesPausedError` & `isFoundingAngelsSalesEnabled` (fails open on `undefined`/`null`/`""`/`"true"`, closed on `"false"` or invalid); guard checkout creation | `35,657` | `33E13ADC9DC116EE55B6F1677D31CEB6C7E625931E2366E203A5190AB3F1DCA5` |
| [`tests/founding-angels-sales-freeze.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/founding-angels-sales-freeze.test.mjs) | `??` | Targeted test suite proving `FOUNDING_ANGELS_SALES_ENABLED` fail-open/fail-closed rules and webhook/status independence | `14,425` | `ECBAA1CAF2ABD68D9BCE13164482171882701CDCBC2D2187124BCD779E9D5F4A` |

*Already Committed in `HEAD` (`6d5fdf06`) — Reproducible Founding Angels Baseline Digests:*
- [`App.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/App.tsx): `29,936` bytes | `93D6137EE31E9A9D68DB16CB7A7A35D37EC0BC383376F05404698920BB4196F1`
- [`components/founding-angels/FoundingAngelsOffer.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/founding-angels/FoundingAngelsOffer.tsx): `13,151` bytes | `2CE9CF1860441B540F242F24C033D88D61587627A50A630EE46281A003E9694E`
- [`components/founding-angels/FoundingAngelsSuccess.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/founding-angels/FoundingAngelsSuccess.tsx): `15,127` bytes | `21C75AE16CBA14B9F0A3919921F1F3AD0397BEDC23AA4E1F56C852A22813874A`
- [`components/founding-angels/FoundingAngelsCancel.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/founding-angels/FoundingAngelsCancel.tsx): `2,851` bytes | `803316158A9A7C197A9B07F461D4D635E86DACD60285BF010049BABBAD705AA4`
- [`components/founding-angels/index.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/founding-angels/index.ts): `190` bytes | `671DDCB00D8FE82977342AE88C29A917A47185B7FD59EC20908AEBA72E54550E`
- [`lib/serverlessAuth.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/serverlessAuth.ts): `5,147` bytes | `03ADB549DD9BB58D2FCA6EE97CECBB0B34ABBD017AC5059F429CEB36E4236867`
- [`lib/e2eDatabaseConfig.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/e2eDatabaseConfig.ts): `2,723` bytes | `64EDC73C57E19658216620730A270BDCDBE67AB22EFD2F21FBEF748A3B8C6F22`
- [`lib/neonSession.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/neonSession.ts): `6,026` bytes | `1CF7514F85ACCDA70A726910F800AF3D90E566CA51378DCFCD4768A05576CEBC` (WT CRLF; `sameLF=true` vs `HEAD`)
- [`db/migrations/007_founding_angels_mvp.sql`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/007_founding_angels_mvp.sql): `38,253` bytes | `2E4395EF75CC8720E03149DE917BEA7AD438F1F7C644FCFF94C92F9CADE8D27C`
- [`scripts/sync-vercel-typescript-runtime.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/scripts/sync-vercel-typescript-runtime.mjs): `7,753` bytes | `B87356C97AD0F53C10D89EBFF308488D17AB3CB33C8E166549F2B46D912E1AE5`
- [`package.json`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/package.json): `1,890` bytes | `664D9D7DAAB3154FDEE8EC66AF8CEFC3EE25CC29050184CDA6CA60CBBBD37D8C`

### Group 2 — Migration 007 Tooling, Rollback & Certification Tests (Track B — Commit Alongside Group 1 or Ops Commit)

| Path | Git State | Purpose | Bytes | Full SHA-256 Digest |
|---|---|---|---:|---|
| [`db/migrations/007_rollback_founding_angels_mvp.sql`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/007_rollback_founding_angels_mvp.sql) | `??` | Guarded pre-traffic rollback SQL (aborts if `founding_angel_orders > 0`) | `6,137` | `DBFCE01C592BA484223BD9C9928354E040EF6A49510F9BACE73898738285D7AE` |
| [`scripts/execute-migration-007.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/scripts/execute-migration-007.mjs) | `??` | Certified Migration 007 executor (SHA-256 pre-connect verify, timeouts, watchdog) | `6,630` | `E69472D4A6164D8869531F92CC24E2B5AD92F2D1E76AF736ADAA9CA244CB8B06` |
| [`scripts/verify-migration-007.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/scripts/verify-migration-007.mjs) | `??` | Catalog & baseline verification script | `23,265` | `FE47F8C2EDF118064E9C69BBED7A42DD10F1634193C1C6653583FF79D1011D0A` |
| [`scripts/rollback-migration-007.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/scripts/rollback-migration-007.mjs) | `??` | Rollback executor script | `6,133` | `0302C37AD3A956C4508AC45DCA37BB337028823869A44ADD7851430C35CACD10` |
| [`tests/migration-007-certification.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/migration-007-certification.test.mjs) | `??` | 14-test certification suite (incl. Phase 56 CLI exit-code subprocess proofs) | `24,178` | `25110BA03643806516841929E7914CF8EFA95431BBD58718C7BB6C29EC19AC12` |
| [`tests/migration-007-executor.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/migration-007-executor.test.mjs) | `??` | Executor PG test suite | `7,379` | `3942EF594244B423705B7572A6F09841EC5EAA33D2A7ADD44C65BAD592A67058` |
| [`tests/migration-007-rollback.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/migration-007-rollback.test.mjs) | `??` | Rollback test suite | `10,964` | `5694C4A32458EF0FD721B0C6E6D251AB83E6B25C9142464151C613186BC76316` |
| [`tests/catalog-verifier.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/catalog-verifier.test.mjs) | `??` | Catalog verifier test suite | `7,278` | `513135FE5A4B3B8A889FEA6EF864FF1C9D98700FCB025F77497464446D4C2386` |

### Group 3 — Pre-Existing Live Parity Work (Must Be Accounted For Before Clean Git-Triggered Deploy)

1. **Vercel Build Config & Serverless Auth/AI/NotNotes/Weaver Routes (`12` entries, all live in `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`):**
   - [`.vercelignore`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/.vercelignore) (`??`, `34 B`, `BDF83D16...AC04`) — excludes `api/lmstudio.ts` & `api/migrate-db.ts` (`11` functions <= `12` limit)
   - [`api/claim.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/claim.ts) (` M`, `0/16`, `D7F605A5...BA93`) — removes legacy Prisma shadow-table sync
   - [`api/gemini.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/gemini.ts) (` M`, `+370/-28`, `E073C652...CFCA`) — Neon session auth + strict model/input/token bounds
   - [`api/migrate-db.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/migrate-db.ts) (` M`, `+8/-57`, `0BF7614D...0AEE`) — disabled endpoint (`410 Gone`)
   - [`api/v1/auth/verify.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/v1/auth/verify.ts) (` M`, `+6/-0`, `BA220FB5...9A6F`) — `assertHandoffSigningConfigured()` pre-consume guard
   - [`api/not-notes/artifact.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/not-notes/artifact.ts) (`??`, `2,023 B`, `E5F4D2FA...EA7E`), [`api/not-notes/widgets.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/not-notes/widgets.ts) (`??`, `1,678 B`, `5D525C49...CB68`), [`api/weaver/generate.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/weaver/generate.ts) (`??`, `2,711 B`, `3F50C59A...44FD`)
   - [`lib/emailService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/emailService.ts) (` M`, `+32/-2`, `785C8B32...D3AC`), [`lib/emailVerification.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/emailVerification.ts) (` M`, `0/19`, `7C46DD79...5186`)
   - Tests validating these routes: [`tests/phase3-r6a-auth.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/phase3-r6a-auth.test.mjs) (` M`, `+239/-1`), [`tests/phase3-r15-verify-redirect.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/phase3-r15-verify-redirect.test.mjs) (` M`, `+84/-0`)
2. **Express / Local Migration Parity (`4` entries — keep consistent with Vercel serverless):**
   - [`controllers/notNotesController.js`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/controllers/notNotesController.js) (` M`, `+85/-28`), [`middleware/verifyJwt.js`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/middleware/verifyJwt.js) (` M`, `+147/-66`), [`server.js`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/server.js) (` M`, `+29/-147`), [`db/migrations/006_neon_first_decoupling.sql`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/006_neon_first_decoupling.sql) (`??`, `10,000 B`)
3. **Frontend / Service Worker / Club Radio UI (`15` entries — live in `.vercel/output/static/`):**
   - [`public/sw.js`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/public/sw.js) (` M`, `+29/-7`, `4240ED04...7AB9`), [`tests/service-worker.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/service-worker.test.mjs) (`??`, `4,584 B`)
   - [`apps/AgentPWA/index.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/apps/AgentPWA/index.tsx) (` M`, `+2/-1`), [`apps/ClubYouniverse/index.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/apps/ClubYouniverse/index.tsx) (` M`, `+1/-1`), [`components/Desktop.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/Desktop.tsx) (` M`, `+27/-24`), [`components/FlowingLight.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/FlowingLight.tsx) (` M`, `+100/-32`), [`components/GlowCard.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/GlowCard.tsx) (` M`, `+2/-1`), [`components/SphereImageGrid.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/SphereImageGrid.tsx) (` M`, `+6/-0`), [`components/YouuniverseRadioBar.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/components/YouuniverseRadioBar.tsx) (` M`, `+4/-2`), [`contexts/ClubRadioContext.tsx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/contexts/ClubRadioContext.tsx) (` M`, `+13/-2`), [`lib/audioUtils.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/audioUtils.ts) (` M`, `+15/-2`), [`lib/oneai.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/oneai.ts) (` M`, `+10/-0`), [`services/club/PersistentRadioService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/services/club/PersistentRadioService.ts) (` M`, `+16/-1`), [`services/club/globalBroadcastManager.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/services/club/globalBroadcastManager.ts) (` M`, `+20/-7`), [`services/club/supabaseClient.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/services/club/supabaseClient.ts) (` M`, `+31/-10`)

### Group 4 — Phase Reports (`docs/`)

- `docs/phase-13b-1-55-final-migration-certification-corrections.md` (`??`)
- `docs/phase-13b-1-56-final-cli-exit-code-closure.md` (`??`)
- `docs/phase-13b-1-57-production-recovery-and-baseline-readiness.md` (`??`)
- `docs/phase-13b-1-58-production-founding-angels-deployment-reconciliation.md` (`??`)
- `docs/phase-13b-1-59-production-release-recovery.md` (this report)

### Group 5 — Exclude / Never Commit

| Path(s) | Classification | Reason to Exclude |
|---|---|---|
| `package-lock.json` | ` M` (`sameLF=true`, `wt=8908125F5A89` == `head=8908125F5A89`) | Zero content diff vs `HEAD`; clean `M` status noise without altering lockfile contents |
| `tests/action.built.cjs`, `tests/service.built.cjs` | `??` Generated `esbuild` bundles | Overwritten whenever `stripe-dispatcher.test.mjs` / `founding-angels-sales-freeze.test.mjs` run |
| `scratch/*` (`14` files incl. `scratch/env.prod`) | `??` Ad-hoc operational/forensic scripts & env dump | **`scratch/env.prod` holds pulled Vercel Production secrets** — must never enter Git |
| `hell` (`2,064 B`), `"on\357\200\242"` (`17,517 B`) | `??` Accidental shell-redirect junk | `hell` = Git CRLF stderr capture; `on` (`U+F022`) = `less` help page capture |
| `scripts/{execute_003,004,005,preflight_003,verify_tables}.js`, `tests/proxy-e2e.mjs` | `??` Legacy pre-007 scripts/smoke test | Historical pre-Founding-Angels utilities unrelated to Migration 007 |

---

## 4. Validation & Build Verification Results (Executed After Recovery Inspection)

All validations ran cleanly against the intact working tree without altering `.vercel/output`, Git commits/index, Stripe, or Production Neon:

| Check | Exact Command | Outcome & Observed Result | Exit Code |
|---|---|---|---:|
| **TypeScript Typecheck** | `npm.cmd run typecheck` (`tsc --noEmit`) | Zero type errors across workspace | **`0`** |
| **Founding Angels Contracts & Webhooks** | `node --test tests/founding-angels-local.test.mjs` | `64` passed, `0` failed, `0` skipped (`BT01`–`BT31`, `AH01`–`AH28`, static invariants) | **`0`** |
| **Purchase UX + Auth + Verify Redirect** | `node --test tests/founding-angels-purchase-experience.test.mjs tests/phase3-r6a-auth.test.mjs tests/phase3-r15-verify-redirect.test.mjs` | `48` passed, `0` failed, `0` skipped | **`0`** |
| **Handoff, Session & Public Profile** | `node --test tests/handoff-verification.test.mjs tests/phase1-session.test.mjs tests/phase2-owner-context.test.mjs tests/phase3-r10-handoff.test.mjs tests/youniverse-public.test.mjs` | `45` passed across `5` files, `0` failed, `0` skipped | **`0`** |
| **Claim Flow Verification** | `node --test tests/claim-flow-verification.test.mjs` | `17` passed, `0` failed, `0` skipped | **`0`** |
| **Stripe Action Dispatcher** | `node tests/stripe-dispatcher.test.mjs` | `8` / `8` targeted tests passed | **`0`** |
| **Sales-Freeze Kill-Switch & Independence** | `node tests/founding-angels-sales-freeze.test.mjs` | All `5` test sections passed (`isFoundingAngelsSalesEnabled`, `503 SALES_PAUSED`, webhook & status unaffected) | **`0`** |
| **Group 1 API & Auth Security** | `node tests/group1-security.test.mjs` | `26` passed (`C01`–`C03`, `A01`–`A17`, `B01`–`B06`), `0` failed | **`0`** |
| **Service Worker Fetch Rules** | `node tests/service-worker.test.mjs` | `5` / `5` passed (`api/` bypass, cross-origin bypass, `504`/`503` Response fallbacks) | **`0`** |
| **Isolated Vite Production Build** | `npx.cmd vite build --outDir "C:/Users/toidi/.gemini/antigravity/brain/aa4d2842-ffaa-423a-9c4e-ed6d8951ed29/scratch/dist-phase59"` | `✓ 2382 modules transformed.` Built in `2m 49s`; `index-*.js` (`665.91 kB`), `three-BNaZiHTl.js` (`185.00 kB`), `ui-I8BzyLwU.js` (`171.63 kB`), `vendor-CHK4TEPM.js` (`3.89 kB`) match `.vercel/output/static/` chunk sizes; `.vercel/output` preserved untouched | **`0`** |

> [!NOTE]
> **Explicit Scope Disclosure for Database-Bound Suites:** Local disposable PostgreSQL 18 on `127.0.0.1:5433` was stopped during Phase 59 (`pg_ctl: no server running`). Consequently, live-DB tests targeting `127.0.0.1:5433` (`tests/catalog-verifier.test.mjs`, `tests/migration-007-certification.test.mjs`, `tests/migration-007-executor.test.mjs`, `tests/migration-007-rollback.test.mjs`, and `tests/e2e-database-isolation.test.mjs` tests `7–8`) and `.env.local` Neon integration suites (`tests/phase3-r13-atomic-verification.test.mjs`, `tests/e2e-live-db.mjs`, `tests/http-contracts.mjs`, `tests/proxy-e2e.mjs`, `tests/phase3-r12-smoke.test.mjs`) were **not executed** in Phase 59. All Migration 007 SQL/script/test SHA-256 digests remain byte-identical to Phase 13B.1.56 certification. Running `stripe-dispatcher.test.mjs` + `founding-angels-sales-freeze.test.mjs` regenerated untracked `tests/action.built.cjs` (`190,376` bytes, `2919755C...7B31`) and `tests/service.built.cjs` (identical `33,978` bytes, `86841B93...DE37`).

---

## 5. Production Preservation Verification

- **Founding Angels Sales Status:** No Vercel environment variables or deployments were modified; `FOUNDING_ANGELS_SALES_ENABLED` remains unset (`salesEnabled = true`), keeping checkout live on `itsyouonline.com` and `www.itsyouonline.com`.
- **Order `600e057c-...-4a78` Preservation:** Zero Neon SQL connections, Stripe API requests, or HTTP checkout calls were made; the existing `'open'` order (`f_iLGnF9aJ5aL61BuCoFg`, `cs_live_[REDACTED]_OXxw`, `0` memberships per Phase 58 at `LSN 0/2DA4FF0`) remains untouched for Phase 60 external verification.
- **`.vercel/output` & Git Preservation:** `.vercel/output` remains untouched as the exact built image of `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`; `HEAD` (`6d5fdf06...`), staging index (`0` staged), and all `28` `M` files remain unmutated.

---

## 6. Recommended Clean Release Synchronization Strategy (Authorized Next Steps, Do Not Execute Without Sign-Off)

To achieve a **100% clean, reproducible, Git-backed Vercel Production deploy (`gitDirty` absent)** without regressing any live Production feature currently running in `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`:

1. **Commit 1 — Pre-Existing Live Parity Runtime + Frontend/SW + `.vercelignore` (Group 3):**
   - Stage & commit the non-Founding-Angels files already deployed live in `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`: `.vercelignore`, `api/claim.ts`, `api/gemini.ts`, `api/migrate-db.ts`, `api/v1/auth/verify.ts`, `api/not-notes/*`, `api/weaver/*`, `lib/emailService.ts`, `lib/emailVerification.ts`, `public/sw.js`, `tests/service-worker.test.mjs`, `tests/phase3-r6a-auth.test.mjs`, `tests/phase3-r15-verify-redirect.test.mjs`, `controllers/notNotesController.js`, `middleware/verifyJwt.js`, `server.js`, `db/migrations/006_neon_first_decoupling.sql`, and the 13 modified frontend/Club files (after confirming `git checkout -- package-lock.json` clears CRLF-only noise cleanly).
2. **Commit 2 — Founding Angels Fixes, Freeze Switch & Migration 007 Tooling (Groups 1 & 2 + Docs):**
   - Stage & commit [`api/stripe/[action].ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts), [`lib/foundingAngelsService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts), [`tests/founding-angels-sales-freeze.test.mjs`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/tests/founding-angels-sales-freeze.test.mjs), the 8 Migration 007 executor/verifier/rollback scripts & certification suites, and `docs/phase-13b-1-55..59-*.md`.
3. **Exclude Group 5 Artifacts:** Ensure `scratch/` (especially `scratch/env.prod`), `tests/*.built.cjs`, `hell`, `on`, and legacy `scripts/*_003..005.js` are never committed.
4. **Authorized Push & Clean Redeploy:** Push `restore/neon-prisma-split` to `origin` and trigger a clean Production deployment from Committed Git (verifying `lambdaRuntimeStats = {"nodejs": 11}`, clean `gitDirty` absent, and `https://www.itsyouonline.com` + `https://itsyouonline.com` health).
5. **Phase 60 Immediate Gate:** Run read-only Stripe verification on `cs_live_[REDACTED]_OXxw` (`stripe.checkout.sessions.retrieve` + recent webhook events) and Neon Console PITR/restore-quota confirmation (`old-firefly-76827305`) before any live purchase acceptance sign-off.

---

## 7. Final Phase 13B.1.59 Verdict

- **Final Classification:** **`RECOVERED WITH BLOCKERS`**
- **Rationale:** The exact Production codebase (`HEAD` + Founding Angels fixes + live non-Founding-Angels parity delta inside `dpl_GbSXg6HZtxLjePLPm9GL6c9LWUuC`) is **100% recovered, classified, SHA-256 inventoried, typechecked, unit-tested, and Vite-built cleanly** while preserving live sales and order `600e057c-...-4a78`. Clean Git-backed Production reproducibility remains blocked only on (1) authorized Git synchronization of the recovered two-track commit manifest + clean redeploy to eliminate `gitDirty = "1"`, (2) Phase 60 external Stripe verification of `cs_live_[REDACTED]_OXxw`, and (3) operator confirmation of Neon PITR retention/branching quotas in Neon Console.
