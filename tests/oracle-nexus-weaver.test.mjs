/**
 * tests/oracle-nexus-weaver.test.mjs
 *
 * Automated verification suite for the Oracle -> Real platoon.ts Agent PWAs ->
 * NotNotes -> Weaver pipeline:
 *   - Oracle selects valid agents from `constants/platoon.ts` respecting
 *     `useThisWhen` and `doNotUseWhen`, and strips hallucinated agent IDs.
 *   - Backend `run_agent_duty` impersonation is removed (`400 invalid_action`);
 *     real `https://<role>.itsyouonline.com` Agent PWAs open inside Portals OS
 *     windows via `useKernel.getState().openWindow(...)`.
 *   - Deliverable intake (`POST /api/not-notes/artifact` `action: "save_deliverable"`)
 *     persists real agent PWA outputs to `"NotNote"` scoped strictly to
 *     `youniverseId` and enforces `401`/`403` auth & CSRF boundaries.
 *   - `useWeaverStore.loadDiagnosticSpec(spec)` hydrates Weaver cleanly as an
 *     optional entry point without breaking standalone Weaver workflows.
 *   - Vercel 12-function Hobby cap preserved (zero new top-level `api/` files).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NEXUS_AGENTS } from "../constants/platoon.ts";
import { createIsolatedTestDb, TEST_FIXTURES } from "../lib/localTestDb.ts";
import {
  buildAgentPwaLaunchUrl,
  getPlatoonAgentById,
  matchesDoNotUseCondition,
  rankPlatoonCandidates,
} from "../lib/oracleNexusEngine.ts";
import { formatPublicWidget } from "../lib/widgetLifecycle.ts";
import weaverApiHandler from "../api/weaver/generate.ts";
import notNotesDispatcher from "../api/not-notes/[action].ts";
import passwordLoginHandler from "../api/auth/password/login.ts";
import { useWeaverStore } from "../store/weaverStore.ts";

function createMockReq({
  method = "POST",
  url = "/api/weaver/generate",
  headers = {
    origin: "https://itsyouonline.com",
    host: "itsyouonline.com",
  },
  body = {},
} = {}) {
  return {
    method,
    url,
    headers: { ...headers },
    body,
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function loginAs(sql, { email, password }) {
  const req = createMockReq({
    method: "POST",
    url: "/api/auth/password/login",
    body: { email, password },
  });
  const res = createMockRes();
  await passwordLoginHandler(req, res, { sql });
  assert.strictEqual(res.statusCode, 200);
  const cookieHeader = res.getHeader("set-cookie");
  assert.ok(cookieHeader);
  return cookieHeader.split(";")[0];
}

function createCapturingMockProvider(responseText) {
  const calls = [];
  return {
    calls,
    provider: {
      id: "mock_provider",
      defaultModel: "mock-oracle-1",
      async generateStructuredOrText(params) {
        calls.push(params);
        return {
          text: typeof responseText === "function" ? responseText(params) : responseText,
          model: "mock-oracle-1",
        };
      },
      async generateAsset() {
        throw new Error("Not used in Oracle tests");
      },
    },
  };
}

test("ONW-01 — rankPlatoonCandidates matches useThisWhen and enforces doNotUseWhen guardrails", () => {
  const bulwark = getPlatoonAgentById("BR");
  assert.ok(bulwark, "Expected BR (Bulwark) in constants/platoon.ts");
  assert.strictEqual(
    matchesDoNotUseCondition(bulwark, "We want to reduce churn", ["You have no active customers"]),
    true
  );

  const arbiter = getPlatoonAgentById("AC");
  assert.ok(arbiter, "Expected AC (Arbiter) in constants/platoon.ts");
  assert.strictEqual(
    matchesDoNotUseCondition(arbiter, "Need contract advice but no legal documents exist yet"),
    true
  );

  const churnCandidates = rankPlatoonCandidates(
    "Churn rates are spiking and customer sentiment is low on our retention flow",
    { limit: 10 }
  );
  assert.ok(churnCandidates.some((a) => a.id === "BR"));

  const excludedCandidates = rankPlatoonCandidates("Churn rates are spiking", {
    constraints: ["You have no active customers"],
    limit: 24,
  });
  assert.strictEqual(excludedCandidates.some((a) => a.id === "BR"), false);
});

test("ONW-02 — oracle_diagnose selects valid platoon.ts agents, drops hallucinated/disallowed IDs, and returns weaverHandoffSpec", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  const mock = createCapturingMockProvider(
    JSON.stringify({
      bleedingNeckDiagnosis: {
        headline: "Margin Erosion & Unclear Tier Pricing",
        rootBottleneck: "Pricing tiers do not reflect delivery costs and visitors lack a lead capture flow.",
        whyNow: "Every new signup compresses margin.",
        immediateObjective: "Rebuild pricing matrix and deploy an interactive pricing & lead capture page.",
      },
      agentChain: [
        { agentId: "CP", whySelected: "Margins are eroding across tiers.", inputNeeded: "Delivery costs and comps" },
        { agentId: "BR", whySelected: "Retention check", inputNeeded: "Usage data" },
        { agentId: "FAKE99", whySelected: "Hallucinated agent", inputNeeded: "Nothing" },
      ],
      weaverHandoffSpec: {
        required: true,
        projectTitle: "Sovereign Pricing & Lead Hub",
        prompt: "Build an interactive 3-tier pricing calculator with a Collection Point lead capture form.",
        recommendedChips: {
          collectionPoint: true,
          structuredJson: true,
          imageGen: false,
          liveGrounding: false,
        },
        agentDeliverableSummary: "Uses Centurion pricing tiers inside a live conversion app.",
        sourceAgentIds: ["CP", "FAKE99"],
      },
    })
  );

  const res = createMockRes();
  await weaverApiHandler(
    createMockReq({
      method: "POST",
      url: "/api/weaver/generate",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: {
        action: "oracle_diagnose",
        problem: "Our margins are eroding and we are launching a new pricing tier.",
        constraints: ["You have no active customers"],
      },
    }),
    res,
    { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
  );

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.action, "oracle_diagnose");
  assert.strictEqual(res.body.diagnosis.agentChain.length, 1);
  assert.strictEqual(res.body.diagnosis.agentChain[0].agentId, "CP");
  assert.strictEqual(res.body.diagnosis.agentChain[0].url, "https://pricing.itsyouonline.com");
  assert.deepStrictEqual(res.body.diagnosis.weaverHandoffSpec.sourceAgentIds, ["CP"]);
  assert.strictEqual(res.body.diagnosis.weaverHandoffSpec.recommendedChips.collectionPoint, true);
});

test("ONW-03 — run_agent_duty backend impersonation is removed (400) and real Agent PWAs launch in Portals OS windows with NotNotes intake", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  // 1. Backend run_agent_duty impersonation must be rejected with 400 invalid_action
  {
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { action: "run_agent_duty", agentId: "CP", input: "Cost $10/mo" },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, "invalid_action");
  }

  // 2. buildAgentPwaLaunchUrl produces real https://<role>.itsyouonline.com URL with contextual params
  const launchUrl = buildAgentPwaLaunchUrl("https://contracts.itsyouonline.com", {
    agentId: "AC",
    inputNeeded: "Draft NDA; Counter-party history",
    returnTarget: "not-notes",
  });
  assert.ok(launchUrl.startsWith("https://contracts.itsyouonline.com?"));
  assert.ok(launchUrl.includes("agentId=AC"));
  assert.ok(launchUrl.includes("returnTarget=not-notes"));
  assert.ok(launchUrl.includes("inputNeeded="));

  // 3. VoiceAssistantOverlay opens real Agent PWAs via useKernel.getState().openWindow(...)
  const oracleUiSrc = fs.readFileSync(
    path.join(process.cwd(), "components", "VoiceAssistantOverlay.tsx"),
    "utf8"
  );
  assert.match(oracleUiSrc, /useKernel\.getState\(\)\.openWindow\(/);
  assert.match(oracleUiSrc, /buildAgentPwaLaunchUrl\(/);
  assert.match(oracleUiSrc, /returnTarget:\s*"not-notes"/);
  assert.doesNotMatch(oracleUiSrc, /run_agent_duty/);
  assert.doesNotMatch(oracleUiSrc, /_blank/);

  // 4. Deliverable intake via POST /api/not-notes/artifact (action: "save_deliverable") enforces 401/403 & persists to NotNote
  {
    const unauthRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
        body: { action: "save_deliverable", agentId: "AC", content: "Redlined MSA" },
      }),
      unauthRes,
      { sql: db.sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(unauthRes.statusCode, 401);

    const csrfRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://evil.example.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { action: "save_deliverable", agentId: "AC", content: "Redlined MSA" },
      }),
      csrfRes,
      { sql: db.sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(csrfRes.statusCode, 403);

    const okRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          action: "save_deliverable",
          agentId: "AC",
          agentName: "Arbiter",
          agentRole: "Contracts",
          agentUrl: "https://contracts.itsyouonline.com",
          content: "## Redlined Document\nLiability capped at 12 months fees.",
        },
      }),
      okRes,
      { sql: db.sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(okRes.statusCode, 200);
    assert.strictEqual(okRes.body.success, true);
    assert.strictEqual(okRes.body.deliverable.youniverseId, TEST_FIXTURES.owner.identityId);
    assert.strictEqual(db.tables.not_notes.length, 1);
    assert.strictEqual(db.tables.not_notes[0].content.type, "AGENT_DELIVERABLE");
    assert.strictEqual(formatPublicWidget(db.tables.not_notes[0]), null);
  }
});

test("ONW-04 — useWeaverStore.loadDiagnosticSpec hydrates Weaver cleanly with Oracle badge and deliverables", () => {
  const store = useWeaverStore.getState();
  store.loadDiagnosticSpec({
    projectTitle: "Pricing Conversion Portal",
    prompt: "Build a 3-tier pricing page with a lead capture form.",
    recommendedChips: { collectionPoint: true, structuredJson: true },
    agentDeliverableSummary: "Centurion defined $49/$149/$399 tiers.",
    sourceAgentIds: ["CP", "BV"],
    diagnosisHeadline: "Margin Erosion & Unclear Tier Pricing",
    deliverables: [
      {
        agentId: "CP",
        agentName: "Centurion",
        agentRole: "Pricing",
        content: "## Pricing Matrix\n- Starter: $49/mo\n- Pro: $149/mo",
        notNoteId: "nn_abc123",
      },
    ],
  });

  const next = useWeaverStore.getState();
  assert.strictEqual(next.title, "Pricing Conversion Portal");
  assert.strictEqual(next.sandboxConfig.activeChips.collectionPoint, true);
  assert.strictEqual(next.sandboxConfig.activeChips.structuredJson, true);
  assert.strictEqual(next.sandboxConfig.activeChips.imageGen, false);
  assert.ok(next.prompt.includes("Build a 3-tier pricing page"));
  assert.ok(next.prompt.includes("Centurion (Pricing) [CP]"));
  assert.ok(next.diagnosticSource);
  assert.strictEqual(next.diagnosticSource.deliverableCount, 1);
  assert.deepStrictEqual(next.diagnosticSource.sourceAgentIds, ["CP", "BV"]);
  assert.strictEqual(next.dirty, true);
});

test("ONW-05 — platoon.ts catalog integrity & Vercel 12-function cap preserved", () => {
  assert.ok(NEXUS_AGENTS.length >= 160, "Expected full platoon.ts catalog");
  const syncScript = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sync-vercel-typescript-runtime.mjs"),
    "utf8"
  );
  assert.ok(syncScript.includes("MAX_VERCEL_HOBBY_FUNCTIONS = 12"));
  assert.strictEqual(fs.existsSync(path.join(process.cwd(), "api", "oracle.ts")), false);
});
