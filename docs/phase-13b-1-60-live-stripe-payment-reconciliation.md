# Phase 13B.1.60 — Live Stripe Checkout & Payment Reconciliation

**Date:** 2026-11-11  
**Mode:** Strictly Read-Only Stripe & Neon Inspection (Zero Writes)  
**Repository:** `creator-of-the-youniverse/Portals-OS`  
**Branch / Commit Checked:** `restore/neon-prisma-split` (`6d5fdf06bb5ef92e2dea89d02413e4af79876927`)  
**Target Order:** `600e057c-...-4a78` (`cs_live_[REDACTED]_OXxw`)  
**Stripe Account Context:** `"Portals"` (`acct_1T3u3W6Q96imWgeo`, `livemode: true`)

---

## 1. Exact Order Classification

**Classification:** **`UNPAID_CHECKOUT_OPEN`**

Order `600e057c-...-4a78` is **unpaid in Stripe and legitimately still `open` on Stripe's side** (`status: "open"`, `payment_status: "unpaid"`, `payment_intent: null`), with zero PaymentIntents, zero Refunds, and zero Disputes in the live Stripe account. The apparent conflict reported earlier came solely from the intentional asymmetry between the database hold window (`checkout_expires_at = created_at + 30 minutes`, expired at `2026-11-11T12:44:24.695Z`) and Stripe's default hosted Checkout Session lifetime (`expires_at = created + 24 hours`, expiring at **`2026-11-12T12:14:25.000Z`**).

Zero money was collected, zero webhook fulfillment was missed, and zero Founding Angel membership entitlement is owed.

---

## 2. Stripe Authoritative State (Live Mode)

Observed via read-only `stripe_stripe` MCP queries (`livemode: true`, `stripe_context: "acct_1T3u3W6Q96imWgeo"`) at `2026-11-11T23:24:07–23:26:53Z` (`18:24:07–18:26:53 -05:00`):

### Checkout Session (`GetCheckoutSessionsSession`)

| Field | Authoritative Stripe Value |
| :--- | :--- |
| `id` | `cs_live_[REDACTED]_OXxw` (`len: 66`, matches Neon `stripe_checkout_session_id`) |
| `object` | `"checkout.session"` |
| `livemode` | `true` |
| `status` | `"open"` |
| `payment_status` | `"unpaid"` |
| `mode` | `"payment"` |
| `ui_mode` | `"hosted_page"` |
| `amount_subtotal` | `20000` |
| `amount_total` | `20000` |
| `currency` | `"usd"` |
| `total_details` | `amount_discount: 0`, `amount_shipping: 0`, `amount_tax: 0` |
| `created` | `1794399265` (`2026-11-11T12:14:25.000Z`) |
| `expires_at` | `1794485665` (`2026-11-12T12:14:25.000Z`) |
| `payment_intent` | `null` |
| `customer` | `null` |
| `customer_details` | `null` |
| `invoice` | `null` |
| `client_reference_id` | `null` |
| `payment_method_types` / `allowed_payment_method_types` | `["card"]` / `["card"]` |
| `success_url` | `"https://www.itsyouonline.com/founding-angels/success?session_id={CHECKOUT_SESSION_ID}"` |
| `cancel_url` | `"https://www.itsyouonline.com/founding-angels?canceled=true"` |

### Account-Wide Financial Settlement Lists (Live Mode)

- `GetPaymentIntents`: `data: []`, `has_more: false` (`0` live PaymentIntents exist in the account).
- `GetRefunds`: `count: 0`, `data: []`, `has_more: false` (`0` live Refunds).
- `GetDisputes`: `count: 0`, `data: []`, `has_more: false` (`0` live Disputes).

---

## 3. Neon Stored State (Read-Only)

Observed via strictly read-only transaction (`BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`) against Neon Production (`neondb`, endpoint `ep-aged-dew-av9711nr`) at `db_now = 2026-11-11T23:32:27.847Z`, `wal_lsn = 0/2E0CCB0` (identical to earlier read at `db_now = 2026-11-11T22:21:35.901Z`, `wal_lsn = 0/2DC71E8`):

- `public.founding_angel_orders`: **`1` row total**
  - `id`: `600e057c-...-4a78`
  - `identity_id`: `f_iLGnF9aJ5aL61BuCoFg`
  - `amount_cents`: `20000`, `currency`: `"usd"`, `livemode`: `true`
  - `status`: `"open"`, `fulfillment_disposition`: `null`
  - `stripe_idempotency_key`: `fa_order[REDACTED]_4751`
  - `stripe_checkout_session_id`: `cs_live_[REDACTED]_OXxw` (`len: 66`, confirmed equal to Phase 47 creation output `matches_phase47_cs: true`)
  - `stripe_checkout_url`: `"https://checkout.stripe.com/[REDACTED]"`
  - `stripe_payment_intent_id`: `null`, `stripe_charge_id`: `null`, `stripe_customer_id`: `null`
  - `fulfilled_event_id`, `expired_event_id`, `last_refund_event_id`, `last_dispute_event_id`, `last_efw_event_id`, `last_stripe_event_id`: all `null`
  - `processed_event_ids`: empty (`count = 0`)
  - `charge_amount_refunded_cents`, `refunded_amount_cents`, `pending_refund_amount_cents`, `chargeback_amount_cents`, `refund_obligation_cents`: all `0`; `refunds_json`: `[]`; `obligation_satisfied_by_refund_ids`: `[]`; `refund_execution_status`: `"not_applicable"`; `active_refund_attempt_no`: `0`; `flagged_for_review`: `false`
  - `created_at`: `2026-11-11T12:14:24.695Z`
  - `updated_at`: `2026-11-11T12:14:25.599Z`
  - `checkout_expires_at`: `2026-11-11T12:44:24.695Z` (`is_past_checkout_expiry: true`)
  - `paid_at`: `null`, `expired_at`: `null`
- `public.founding_angel_memberships`: **`0` rows total**

---

## 4. Webhook Endpoint & Event Delivery Findings

1. **Webhook Endpoint ID Typo Clarified (`we_1UaOaB6Q96imWgeohmDCsXkL` vs `...geohd...`):**
   - Direct retrieval of prompt-cited ID `we_1UaOaB6Q96imWgeohdDCsXkL` failed with `No such webhook endpoint: 'we_1UaOaB6Q96imWgeohdDCsXkL'`.
   - `GetWebhookEndpoints` (`limit: default`) and `GetV2CoreEventDestinations` both show the account's single live webhook endpoint differs by one letter (`m` instead of `d`): **`we_1UaOaB6Q96imWgeohmDCsXkL`**.
2. **Active Production Webhook Configuration (`we_1UaOaB6Q96imWgeohmDCsXkL`):**
   - `status`: `"enabled"`, `livemode`: `true`, `api_version` / `snapshot_api_version`: `"2026-01-28.clover"`
   - `name`: `"captivating-excellence"`
   - `url`: `"https://www.itsyouonline.com/api/stripe/webhook"`
   - `created`: `1794353767` (`2026-11-10T23:36:07.166996955Z`), `updated`: `2026-11-11T00:34:27.768547773Z`
   - `enabled_events`:
     - `checkout.session.completed`
     - `checkout.session.async_payment_failed`
     - `checkout.session.async_payment_succeeded`
     - `refund.created`
     - `refund.updated`
     - `charge.refund.updated`
     - `charge.refunded`
   - Notice `checkout.session.expired` is **not** subscribed in `enabled_events` (matching [`handleWebhook`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts#L469-L590), which does not handle `checkout.session.expired`).
3. **Failed Webhooks & Account Event Stream (`GetEvents`):**
   - `GetEvents` with `delivery_success: false` (`limit: 100`): returned `data: []`, `has_more: false` — **zero failed webhook deliveries**.
   - Unfiltered `GetEvents` (`limit: 100`, ordered newest-first by Stripe): the very newest event in the live account is `evt_...ZthbJH` (`type: "capability.updated"`, `created: 1794308557` = `2026-11-10T11:02:37.000Z`, `pending_webhooks: 0`), followed by 99 `capability.updated`, `account.updated`, `tax.settings.updated`, and `account.external_account.*` events down to `2026-11-10T09:57:12.000Z` (`pending_webhooks: 0`).
   - Zero Stripe v1 events exist after `2026-11-10T11:02:37.000Z` (none on `2026-11-11`). Stripe did not fail to deliver a payment webhook; no checkout settlement or expiration event has been generated because the Checkout Session remains `open` and `unpaid`.

---

## 5. Stripe vs Neon Reconciliation Table

| Property | Stripe (Authoritative Live) | Neon (`neondb`) | Result |
| :--- | :--- | :--- | :--- |
| `orderId` | `[REDACTED]` in MCP `metadata` field | `600e057c-...-4a78` | Correlated via exact `cs_live_[REDACTED]_OXxw` (`len: 66`) |
| `stripe_checkout_session_id` | `cs_live_[REDACTED]_OXxw` (`len: 66`) | `cs_live_[REDACTED]_OXxw` (`len: 66`) | **MATCH** |
| `livemode` | `true` | `true` | **MATCH** |
| `status` | `"open"` (`payment_status: "unpaid"`) | `"open"` (`fulfillment_disposition: null`) | **MATCH** |
| `payment_status` | `"unpaid"` (`0` PaymentIntents) | `paid_at: null`, `0` memberships | **CONSISTENT (Unpaid)** |
| `amount_total` / `amount_cents` | `20000` (`usd`) | `20000` (`usd`) | **MATCH (\$200.00 USD)** |
| `payment_intent` | `null` | `null` | **MATCH** |
| `charge` | `null` | `null` | **MATCH** |
| `customer` | `null` | `null` | **MATCH** |
| `created` vs `created_at` | `2026-11-11T12:14:25.000Z` | `2026-11-11T12:14:24.695Z` (`updated_at: 12:14:25.599Z`) | **MATCH (<1s creation sequence)** |
| `expires_at` vs `checkout_expires_at` | `2026-11-12T12:14:25.000Z` (24h default) | `2026-11-11T12:44:24.695Z` (30m DB hold, `is_past_checkout_expiry: true`) | **EXPECTED DIVERGENCE** ([`createFoundingAngelCheckoutSession`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L214-L249) omits Stripe `expires_at`) |
| `refunds` | `0` (`/v1/refunds`) | `0` (`refunded_amount_cents: 0`, `refunds_json: []`) | **MATCH** |
| `disputes` | `0` (`/v1/disputes`) | `0` (`dispute_id: null`) | **MATCH** |
| `memberships` | None owed (`unpaid`) | `0` rows | **CONSISTENT** |
| Webhook endpoint | `we_1UaOaB6Q96imWgeohmDCsXkL` (`enabled`, `0` failed deliveries) | `processed_event_ids_count: 0` | **HEALTHY** (prompt typo `...geohd...` non-existent; `checkout.session.expired` not enabled) |

---

## 6. Redacted Evidence & Timestamps

- **Neon Production Read-Only Snapshots:**
  - Snapshot 1: `db_now = 2026-11-11T22:21:35.901Z`, `wal_lsn = 0/2DC71E8` -> `orders = 1`, `memberships = 0`, `status = 'open'`.
  - Snapshot 2: `db_now = 2026-11-11T23:32:27.847Z`, `wal_lsn = 0/2E0CCB0` -> `orders = 1`, `memberships = 0`, `status = 'open'`, `updated_at = 2026-11-11T12:14:25.599Z` (unchanged).
- **Stripe Live Read Snapshots (`acct_1T3u3W6Q96imWgeo`, `stripe_stripe` MCP):**
  - `2026-11-11T23:24:14Z`: `list_available_accounts_or_orgs` -> `Portals` (`livemode: true`).
  - `2026-11-11T23:26:05Z`: `GetCheckoutSessionsSession(cs_live_[REDACTED]_OXxw)` -> `status: "open"`, `payment_status: "unpaid"`, `amount_total: 20000`, `currency: "usd"`, `created: 1794399265`, `expires_at: 1794485665`, `payment_intent: null`, `customer: null`.
  - `2026-11-11T23:26:18–23:26:53Z`: `GetEvents(delivery_success: false)` -> `[]`; `GetEvents(limit: 100)` -> newest event `2026-11-10T11:02:37.000Z` (`1794308557`), `pending_webhooks: 0`; `GetRefunds` -> `count: 0`; `GetDisputes` -> `count: 0`; `GetPaymentIntents` -> `[]`; `GetWebhookEndpoints` & `GetV2CoreEventDestinations` -> single live endpoint `we_1UaOaB6Q96imWgeohmDCsXkL` (`enabled`, `https://www.itsyouonline.com/api/stripe/webhook`).
- **Source Verification:**
  - [`lib/foundingAngelsService.ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L176-L275): sets DB `checkout_expires_at = NOW() + INTERVAL '30 minutes'`, creates Stripe Checkout Session without explicit `expires_at` (Stripe defaults to 24h), and blocks repeat checkouts for the same identity while `status IN ('creating_session', 'open')` (enforced also by [`founding_angel_orders_one_active_checkout_idx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/007_founding_angels_mvp.sql#L440-L442)). Meanwhile the `activeOpenCount` capacity check filters `checkout_expires_at > NOW()`, so the expired DB hold does **not** reduce public checkout capacity.
  - Strictly redacted: no raw Checkout Session ID, no Checkout URL hash, no `sk_live_`, no `whsec_`, no OAuth tokens, and no DB credentials appear in this report.

---

## 7. Remaining Uncertainty

1. **Redacted Checkout Session `metadata`:** Stripe MCP's `GetCheckoutSessionsSession` masked `"metadata": "[REDACTED]"` and `"customer_email": "[REDACTED]"`, so `metadata.orderId` and `metadata.identityId` were not observed verbatim from Stripe. Binding between order `600e057c-...-4a78` and the live Checkout Session is nonetheless established by exact full 66-character `cs_live_[REDACTED]_OXxw` equality plus matching creation timestamp, amount, currency, and `livemode`.
2. **Older Event History Pagination:** `GetEvents(limit: 100)` returned `has_more: true` for history *older* than `2026-11-10T09:57:12Z`. Because Stripe orders `/v1/events` newest-first and `data[0]` is `2026-11-10T11:02:37Z`, the entire `2026-11-11` window (from `we_1UaOaB6Q96imWgeohmDCsXkL` through test order `600e057c-...-4a78` and inspection time `23:26Z`) is covered completely.
3. **Post-Compaction Stripe MCP Reload Error:** At `2026-11-11T23:28Z`, follow-up MCP verification calls (`GetWebhookEndpointsWebhookEndpoint` on `we_1UaOaB6Q96imWgeohmDCsXkL` and `list_available_accounts_or_orgs`) failed with `server name stripe_stripe failed to load: sending "tools/call": Unprocessable Entity`, while all core read evidence had already been captured at `23:24:07–23:26:53Z` and Neon was re-verified unchanged at `23:32:27.847Z`.
4. **Live Checkout URL Expiration Pending:** Until `2026-11-12T12:14:25.000Z`, `cs_live_[REDACTED]_OXxw` remains open in Stripe and theoretically payable if anyone submits payment against that URL (the URL was generated solely by `scratch/test_live_checkout.mjs` and is not shared publicly).

---

## 8. Recommended Next Actions

1. **Do NOT grant a membership and do NOT modify Neon or Stripe now:** Zero payment was captured (`UNPAID_CHECKOUT_OPEN`), zero entitlement reconciliation is needed, and checkout remains healthy and **LIVE** (`FOUNDING_ANGELS_SALES_ENABLED` remains unset).
2. **Cleanly retire test order `600e057c-...-4a78` after Stripe session expiration (future authorized op):**
   - Wait until **`2026-11-12T12:14:25.000Z`** for natural Stripe Checkout Session expiry (or obtain explicit authorization to expire `cs_live_[REDACTED]_OXxw` earlier in Stripe).
   - Once Stripe confirms `status = 'expired'` / `payment_status = 'unpaid'`, execute an authorized SQL `UPDATE` transitioning `600e057c-...-4a78` to `status = 'expired'`, `expired_at = NOW()`, `updated_at = NOW()` (**never `DELETE`** the row) so test identity `f_iLGnF9aJ5aL61BuCoFg` can open new checkouts past [`founding_angel_orders_one_active_checkout_idx`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/db/migrations/007_founding_angels_mvp.sql#L440-L442).
3. **Post-Launch Operational Follow-Ups (non-blocking):**
   - Reconcile Phase 59 source/Git drift (`lib/foundingAngelsService.ts` and `api/stripe/[action].ts` vs release commit `6d5fdf06bb5ef92e2dea89d02413e4af79876927`).
   - Verify Neon Console PITR configuration directly.
   - Optionally subscribe `checkout.session.expired` on `we_1UaOaB6Q96imWgeohmDCsXkL`, handle `checkout.session.expired` in [`api/stripe/[action].ts`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/api/stripe/%5Baction%5D.ts), and consider aligning Stripe `expires_at` with DB `checkout_expires_at` in [`createFoundingAngelCheckoutSession`](file:///c:/Users/toidi/OneDrive/Desktop/Portals-OS/Portals-OS/lib/foundingAngelsService.ts#L223-L249) (note Stripe requires `>= 30` minutes from request timestamp) so abandoned holds auto-close in Neon without manual SQL intervention.
