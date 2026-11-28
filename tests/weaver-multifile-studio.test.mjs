/**
 * tests/weaver-multifile-studio.test.mjs
 *
 * Prompt 1 verification suite for Multi-File Weaver Project Schema,
 * NotNotes JSONB persistence, privacy/ownership isolation, Express parity,
 * and Zustand workspace store (`store/weaverStore.ts`).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb, TEST_FIXTURES } from "../lib/localTestDb.ts";
import { computeFileDiffSummary, computeLineDiff } from "../lib/weaverDiff.ts";
import { validateWeaverSandboxMessage } from "../lib/windowMessageSecurity.ts";
import { exportWeaverProjectZip } from "../lib/weaverExport.ts";
import { MAX_COLLECTION_PAYLOAD_BYTES, formatSubmissionsCsv } from "../lib/collectionPoints.ts";
import {
  WEAVER_MAX_FILES,
  WEAVER_MAX_TREE_BYTES,
  applyWeaverOperations,
  sanitizeFileTree,
  sanitizeVirtualPath,
} from "../lib/weaverProject.ts";
import { parseWidgetContent } from "../lib/widgetLifecycle.ts";
import { saveWeaverArtifactHandler } from "../controllers/notNotesController.js";
import { weaverGenerateHandler as expressWeaverHandler } from "../controllers/weaverController.js";
import weaverApiHandler from "../api/weaver/generate.ts";
import passwordLoginHandler from "../api/auth/password/login.ts";
import notNotesDispatcher from "../api/not-notes/[action].ts";
import youniverseDispatcher from "../api/youniverse/[handle]/[action].ts";
import { useWeaverStore } from "../store/weaverStore.ts";

function createMockReq({
  method = "GET",
  url = "/",
  headers = {
    origin: "https://itsyouonline.com",
    host: "itsyouonline.com",
  },
  body = {},
  params = {},
  query = {},
} = {}) {
  return {
    method,
    url,
    headers: { ...headers },
    body,
    params,
    query,
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
  assert.strictEqual(res.statusCode, 200, `Expected login 200 for ${email}`);
  const cookieHeader = res.getHeader("set-cookie");
  assert.ok(cookieHeader, "Expected Set-Cookie on login");
  return cookieHeader.split(";")[0];
}

test("WMS-01 — sanitizeVirtualPath accepts valid workspace paths and rejects traversal/invalid paths", () => {
  assert.strictEqual(sanitizeVirtualPath("App.tsx"), "App.tsx");
  assert.strictEqual(sanitizeVirtualPath("components/Card.tsx"), "components/Card.tsx");
  assert.strictEqual(sanitizeVirtualPath("./api/collect.ts"), "api/collect.ts");
  assert.strictEqual(sanitizeVirtualPath("components\\X.tsx"), "components/X.tsx");

  for (const badPath of [
    "../x.ts",
    "/App.tsx",
    "components/../../etc.ts",
    "secrets/x.ts",
    "components/a b.tsx",
    "App.exe",
    "a\0.tsx",
    "",
  ]) {
    assert.strictEqual(sanitizeVirtualPath(badPath), null, `Expected rejection for ${badPath}`);
  }
});

test("WMS-02 — sanitizeFileTree enforces file count and byte size caps", () => {
  const tooMany = {};
  for (let i = 0; i <= WEAVER_MAX_FILES; i++) {
    tooMany[`components/Comp${i}.tsx`] = `export function Comp${i}(){ return null; }`;
  }
  const tooManyRes = sanitizeFileTree(tooMany);
  assert.strictEqual(tooManyRes.ok, false);
  assert.strictEqual(tooManyRes.error, "too_many_files");

  const hugeRes = sanitizeFileTree({
    "App.tsx": "x".repeat(WEAVER_MAX_TREE_BYTES + 100),
  });
  assert.strictEqual(hugeRes.ok, false);
  assert.strictEqual(hugeRes.error, "payload_too_large");
});

test("WMS-03 — applyWeaverOperations performs targeted upserts/deletes and protects App.tsx/manifest.json", () => {
  const base = {
    "App.tsx": { path: "App.tsx", content: "export default () => <div />;", language: "tsx" },
    "components/Old.tsx": { path: "components/Old.tsx", content: "export const Old = () => null;", language: "tsx" },
    "styles.css": { path: "styles.css", content: ".a { color: red; }", language: "css" },
    "manifest.json": { path: "manifest.json", content: "{}", language: "json" },
  };

  const applied = applyWeaverOperations(base, [
    { action: "upsert", path: "components/NewCard.tsx", content: "export const NewCard = () => <div />;" },
    { action: "delete", path: "App.tsx" },
    { action: "delete", path: "components/Old.tsx" },
    { action: "upsert", path: "../evil.ts", content: "hack" },
  ]);

  assert.strictEqual(applied.files["App.tsx"].content, base["App.tsx"].content);
  assert.strictEqual(applied.files["styles.css"].content, base["styles.css"].content);
  assert.strictEqual(applied.files["components/Old.tsx"], undefined);
  assert.ok(applied.files["components/NewCard.tsx"]);
  assert.deepStrictEqual(applied.changedPaths, ["components/NewCard.tsx"]);
  assert.deepStrictEqual(applied.deletedPaths, ["components/Old.tsx"]);
  assert.ok(applied.rejected.includes("App.tsx"));
  assert.ok(applied.rejected.includes("../evil.ts"));
});

test("WMS-04 — parseWidgetContent upgrades legacy single-file REACT_WIDGET rows cleanly", () => {
  const legacy = parseWidgetContent({
    type: "REACT_WIDGET",
    code: "export default function Legacy(){ return <div>Hi</div>; }",
    dependencies: ["lucide-react"],
  });

  assert.ok(legacy);
  assert.strictEqual(legacy.schemaVersion, 1);
  assert.strictEqual(legacy.publicationStatus, "draft");
  assert.strictEqual(legacy.entryFile, "App.tsx");
  assert.strictEqual(legacy.files["App.tsx"].content, legacy.code);
});

test("WMS-05 — NotNotes multi-file CRUD, ownership, validation, and public privacy boundary", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);
  const visitorCookie = await loginAs(sql, TEST_FIXTURES.visitor);

  const initialFiles = {
    "App.tsx": 'import { Card } from "./components/Card"; export default function App(){ return <Card />; }',
    "components/Card.tsx": "export function Card(){ return <div>Card v1</div>; }",
    "styles.css": ".card { padding: 8px; }",
    "manifest.json": '{"name":"StudioApp"}',
  };

  let projectId = "";
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      body: {
        title: "MultiFileStudioApp",
        files: initialFiles,
        entryFile: "App.tsx",
        iterations: [
          {
            prompt: "secret prompt xyz",
            summary: "Created multi-file starter",
            changedFiles: ["App.tsx", "components/Card.tsx"],
          },
        ],
        sandboxConfig: { viewport: "mobile", autoRefresh: true },
      },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.widget?.publicationStatus, "draft");
    assert.strictEqual(res.body?.widget?.schemaVersion, 2);
    assert.strictEqual(Object.keys(res.body?.widget?.files ?? {}).length, 4);
    assert.strictEqual(res.body?.widget?.code, initialFiles["App.tsx"]);
    assert.strictEqual(res.body?.widget?.iterations?.length, 1);
    assert.strictEqual(res.body?.widget?.sandboxConfig?.viewport, "mobile");
    projectId = res.body.widget.id;
  }

  // Reload via GET /api/not-notes/widgets
  {
    const req = createMockReq({
      method: "GET",
      url: "/api/not-notes/widgets",
      headers: { host: "itsyouonline.com", cookie: ownerCookie },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.widgets.length, 1);
    assert.strictEqual(res.body.widgets[0].files["components/Card.tsx"].content, initialFiles["components/Card.tsx"]);
    assert.strictEqual(res.body.widgets[0].sandboxConfig.viewport, "mobile");
  }

  // PUT updating only files -> Card updated, App.tsx/code unchanged, iterations preserved
  {
    const updatedFiles = {
      ...initialFiles,
      "components/Card.tsx": "export function Card(){ return <div>Card v2</div>; }",
    };
    const req = createMockReq({
      method: "PUT",
      url: "/api/not-notes/artifact",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: { id: projectId, files: updatedFiles },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.widget.code, initialFiles["App.tsx"]);
    assert.strictEqual(res.body.widget.files["components/Card.tsx"].content, updatedFiles["components/Card.tsx"]);
    assert.strictEqual(res.body.widget.iterations.length, 1);
    assert.strictEqual(res.body.widget.iterations[0].prompt, "secret prompt xyz");
  }

  // Reject invalid path (400) & oversized tree (413)
  {
    const badPathRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "PUT",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: projectId, files: { "../evil.ts": "x" } },
      }),
      badPathRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(badPathRes.statusCode, 400);

    const hugeRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "PUT",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: projectId, files: { "App.tsx": "x".repeat(WEAVER_MAX_TREE_BYTES + 50) } },
      }),
      hugeRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(hugeRes.statusCode, 413);
  }

  // Visitor PUT on owner project -> 403; unauthenticated POST -> 401
  {
    const visRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "PUT",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: visitorCookie },
        body: { id: projectId, files: initialFiles },
      }),
      visRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(visRes.statusCode, 403);
    assert.strictEqual(visRes.body.error, "forbidden_widget_ownership");

    const anonRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
        body: { title: "Anon", files: initialFiles },
      }),
      anonRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(anonRes.statusCode, 401);
  }

  // Publish -> Public Youniverse includes files, strips private iterations & sandboxConfig
  {
    const pubRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/publish",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: projectId },
      }),
      pubRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(pubRes.statusCode, 200);

    const publicRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({
        method: "GET",
        url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
        headers: {},
        query: { handle: TEST_FIXTURES.owner.username, action: "public" },
      }),
      publicRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(publicRes.statusCode, 200);
    assert.strictEqual(publicRes.body.publicWidgets.length, 1);
    const pubWidget = publicRes.body.publicWidgets[0];
    assert.ok(pubWidget.files["components/Card.tsx"]);
    assert.strictEqual(pubWidget.iterations, undefined);
    assert.strictEqual(pubWidget.sandboxConfig, undefined);
    const serialized = JSON.stringify(publicRes.body);
    assert.strictEqual(serialized.includes("secret prompt xyz"), false);
  }
});

test("WMS-06 — Express controller parity saves multi-file schemaVersion 2 projects", async () => {
  const db = createIsolatedTestDb();
  await db.init();

  const res = createMockRes();
  await saveWeaverArtifactHandler(
    {
      user: { youniverseId: TEST_FIXTURES.owner.identityId },
      body: {
        title: "ExpressMultiFile",
        files: {
          "App.tsx": "export default () => <div>Express App</div>;",
          "styles.css": ".root { color: white; }",
          "manifest.json": '{"name":"ExpressMultiFile"}',
        },
      },
    },
    res,
    { sql: db.sql }
  );

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.widget.schemaVersion, 2);
  assert.ok(res.body.widget.files["styles.css"]);
});

test("WMS-07 — Zustand useWeaverStore manages virtual file tree, operations, and iteration snapshots", () => {
  useWeaverStore.getState().initNewProject("AlphaStudio");
  let state = useWeaverStore.getState();

  assert.ok(state.files["App.tsx"]);
  assert.ok(state.files["manifest.json"]);
  assert.strictEqual(state.deleteFile("App.tsx"), false);

  assert.strictEqual(state.createFile("components/New.tsx", "export const New = () => <div />;"), true);
  state = useWeaverStore.getState();
  assert.ok(state.files["components/New.tsx"]);
  assert.strictEqual(state.selectedFilePath, "components/New.tsx");

  const preContent = state.files["components/New.tsx"].content;
  state.applyGenerationResult({
    prompt: "Update New component",
    summary: "Updated New.tsx",
    operations: [
      { action: "upsert", path: "components/New.tsx", content: "export const New = () => <span>v2</span>;" },
    ],
  });

  state = useWeaverStore.getState();
  assert.strictEqual(state.iterations.length, 1);
  assert.strictEqual(state.previousFiles["components/New.tsx"].content, preContent);
  assert.strictEqual(state.files["components/New.tsx"].content, "export const New = () => <span>v2</span>;");

  const iterId = state.iterations[0].id;
  assert.strictEqual(state.restoreIteration(iterId), true);
  state = useWeaverStore.getState();
  assert.strictEqual(state.files["components/New.tsx"].content, preContent);
});

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT 2: MULTI-FILE AI STUDIO BACKEND & PROVIDER SOVEREIGNTY (WMS-08..WMS-13)
// ─────────────────────────────────────────────────────────────────────────────

function createMockProvider({
  id = "mock_sovereign",
  defaultModel = "mock-model-1",
  onGenerate,
  onAsset,
} = {}) {
  const calls = [];
  return {
    calls,
    provider: {
      id,
      defaultModel,
      async generateStructuredOrText(params) {
        calls.push({ kind: "generate", params });
        if (onGenerate) return onGenerate(params);
        return { text: JSON.stringify({ ok: true }), model: defaultModel };
      },
      async generateAsset(params) {
        calls.push({ kind: "asset", params });
        if (onAsset) return onAsset(params);
        return {
          mimeType: "image/svg+xml",
          dataUri: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8"/></svg>').toString("base64")}`,
          model: defaultModel,
          alt: params.prompt,
          width: 512,
          height: 512,
        };
      },
    },
  };
}

test("WMS-08 — Targeted multi-file generate forwards context, AI Chips, history & runtimeError and preserves untouched files", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  const mock = createMockProvider({
    onGenerate: async () => ({
      model: "gemini-2.0-flash-001",
      text: JSON.stringify({
        projectName: "CreatorStudio",
        summary: "Updated Card component and added Collection Point adapter.",
        entryFile: "App.tsx",
        dependencies: ["lucide-react"],
        operations: [
          {
            action: "upsert",
            path: "components/Card.tsx",
            content: "export function Card(){ return <div>Card v2 Fixed</div>; }",
            reason: "Fix runtime error and refresh copy",
          },
          {
            action: "upsert",
            path: "api/collectionPoint.ts",
            content: "export function collectLead(email: string){ return { email }; }",
            reason: "Add Collection Point primitive",
          },
        ],
      }),
    }),
  });

  const existingFiles = {
    "App.tsx": 'import { Card } from "./components/Card"; export default function App(){ return <Card />; }',
    "components/Card.tsx": "export function Card(){ return <div>Card v1</div>; }",
    "styles.css": ".untouched { color: emerald; }",
    "manifest.json": '{"name":"CreatorStudio"}',
  };

  const req = createMockReq({
    method: "POST",
    url: "/api/weaver/generate",
    headers: {
      origin: "https://itsyouonline.com",
      host: "itsyouonline.com",
      cookie: ownerCookie,
    },
    body: {
      prompt: "Fix Card crash and add lead capture",
      projectTitle: "CreatorStudio",
      files: existingFiles,
      entryFile: "App.tsx",
      aiChips: { collectionPoint: true, structuredJson: true },
      history: [{ prompt: "Initial scaffold", summary: "Created App and Card" }],
      runtimeError: "ReferenceError: badge is not defined at components/Card.tsx:4",
      systemInstruction: "Prefer obsidian glassmorphic surfaces.",
      temperature: 0.25,
    },
  });
  const res = createMockRes();
  await weaverApiHandler(req, res, { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.action, "generate");
  assert.strictEqual(mock.calls.length, 1);

  const sentPrompt = mock.calls[0].params.userPrompt;
  assert.match(sentPrompt, /=== FILE: styles\.css ===/);
  assert.match(sentPrompt, /AI CHIP: Collection Point/);
  assert.match(sentPrompt, /AI CHIP: Structured JSON/);
  assert.match(sentPrompt, /ReferenceError: badge is not defined/);
  assert.match(sentPrompt, /Initial scaffold/);
  assert.match(sentPrompt, /obsidian glassmorphic/);
  assert.strictEqual(mock.calls[0].params.temperature, 0.25);

  // Untouched files preserved verbatim; targeted files updated/added
  assert.strictEqual(res.body.project.files["App.tsx"].content, existingFiles["App.tsx"]);
  assert.strictEqual(res.body.project.files["styles.css"].content, existingFiles["styles.css"]);
  assert.strictEqual(
    res.body.project.files["components/Card.tsx"].content,
    "export function Card(){ return <div>Card v2 Fixed</div>; }"
  );
  assert.ok(res.body.project.files["api/collectionPoint.ts"]);
  assert.deepStrictEqual(
    res.body.project.changedPaths.sort(),
    ["api/collectionPoint.ts", "components/Card.tsx"]
  );
  // Backwards-compatible component payload intact
  assert.strictEqual(res.body.component.code, existingFiles["App.tsx"]);
  assert.strictEqual(res.body.meta.provider, "mock_sovereign");
});

test("WMS-09 — Provider sovereignty rejects unknown/unconfigured providers and never leaks keys", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  // Unknown provider -> 400
  {
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { prompt: "Build a card", provider: "rogue_provider" },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local", env: {} }
    );
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, "unsupported_provider");
  }

  // Unconfigured openai_compatible provider -> 500 without leaking secrets
  {
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { prompt: "Build a card", provider: "openai_compatible" },
      }),
      res,
      {
        sql: db.sql,
        databaseUrl: "mock://local",
        env: { GEMINI_API_KEY: "super-secret-server-key-999" },
      }
    );
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error, "server_misconfiguration");
    assert.strictEqual(JSON.stringify(res.body).includes("super-secret-server-key-999"), false);
  }
});

test("WMS-10 — action: generate_asset returns CSP-safe data URI and sanitizes malicious SVG", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  const maliciousSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>fetch("https://evil.test")</script><foreignObject><div>bad</div></foreignObject><a href="javascript:alert(2)"><rect width="100" height="100" fill="#8b5cf6"/></a></svg>';

  const mock = createMockProvider({
    onAsset: async () => ({
      mimeType: "image/svg+xml",
      dataUri: `data:image/svg+xml;base64,${Buffer.from(maliciousSvg, "utf8").toString("base64")}`,
      model: "gemini-2.0-flash-001",
      alt: "Sovereign Crest",
      width: 512,
      height: 512,
    }),
  });

  const res = createMockRes();
  await weaverApiHandler(
    createMockReq({
      method: "POST",
      url: "/api/weaver/generate",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: {
        action: "generate_asset",
        prompt: "Minimalist violet geometric crest",
        kind: "icon",
        aspectRatio: "1:1",
        targetPath: "data/crest.json",
      },
    }),
    res,
    { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
  );

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.action, "generate_asset");
  assert.strictEqual(res.body.asset.mimeType, "image/svg+xml");
  assert.match(res.body.asset.dataUri, /^data:image\/svg\+xml;base64,/);
  assert.strictEqual(res.body.asset.targetPath, "data/crest.json");

  const decodedSvg = Buffer.from(
    res.body.asset.dataUri.replace("data:image/svg+xml;base64,", ""),
    "base64"
  ).toString("utf8");
  assert.doesNotMatch(decodedSvg, /<script/i);
  assert.doesNotMatch(decodedSvg, /<foreignObject/i);
  assert.doesNotMatch(decodedSvg, /\bonload=/i);
  assert.doesNotMatch(decodedSvg, /javascript:/i);
  assert.match(decodedSvg, /<rect /i);
});

test("WMS-11 — action: runtime_infer supports text, structuredJson validation, and liveGrounding citations", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  // 1) structuredJson valid
  {
    const mock = createMockProvider({
      onGenerate: async () => ({
        model: "gemini-2.0-flash-001",
        text: JSON.stringify({ sentiment: "positive", score: 0.92 }),
      }),
    });
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          action: "runtime_infer",
          mode: "structuredJson",
          prompt: "Score this feedback",
          schema: {
            type: "object",
            required: ["sentiment", "score"],
            properties: {
              sentiment: { type: "string" },
              score: { type: "number" },
            },
          },
        },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.result.data, { sentiment: "positive", score: 0.92 });
  }

  // 2) structuredJson missing required field -> 502 schema_mismatch
  {
    const mock = createMockProvider({
      onGenerate: async () => ({
        model: "gemini-2.0-flash-001",
        text: JSON.stringify({ sentiment: "positive" }),
      }),
    });
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          action: "runtime_infer",
          mode: "structuredJson",
          prompt: "Score this feedback",
          schema: {
            type: "object",
            required: ["sentiment", "score"],
            properties: { sentiment: { type: "string" }, score: { type: "number" } },
          },
        },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.error, "schema_mismatch");
  }

  // 3) liveGrounding returns normalized citations
  {
    const mock = createMockProvider({
      onGenerate: async (params) => {
        assert.strictEqual(params.enableGrounding, true);
        return {
          model: "gemini-2.0-flash-001",
          text: "Grounded answer.",
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "ItsYouOnline Docs", uri: "https://itsyouonline.com/docs" } },
              { web: { title: "Duplicate", uri: "https://itsyouonline.com/docs" } },
            ],
          },
        };
      },
    });
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          action: "runtime_infer",
          mode: "liveGrounding",
          prompt: "Latest Portals OS news",
        },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.result.text, "Grounded answer.");
    assert.deepStrictEqual(res.body.result.citations, [
      { title: "ItsYouOnline Docs", uri: "https://itsyouonline.com/docs" },
    ]);
  }

  // 4) invalid mode -> 400
  {
    const mock = createMockProvider();
    const res = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { action: "runtime_infer", mode: "shell_exec", prompt: "hi" },
      }),
      res,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, "invalid_mode");
  }
});

test("WMS-12 — Fail-closed auth (401), cross-tenant (403), CSRF (403), and payload caps (413) across all actions", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);
  const visitorCookie = await loginAs(db.sql, TEST_FIXTURES.visitor);
  const mock = createMockProvider();

  for (const actionBody of [
    { action: "generate", prompt: "hello" },
    { action: "generate_asset", prompt: "logo" },
    { action: "runtime_infer", mode: "text", prompt: "hello" },
  ]) {
    // 401 unauthenticated
    const anonRes = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
        body: actionBody,
      }),
      anonRes,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(anonRes.statusCode, 401);

    // 403 bad-origin CSRF
    const csrfRes = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://evil.example", host: "itsyouonline.com", cookie: ownerCookie },
        body: actionBody,
      }),
      csrfRes,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(csrfRes.statusCode, 403);
    assert.strictEqual(csrfRes.body.error, "csrf_rejected");

    // 403 cross-tenant handle impersonation
    const crossRes = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: {
          origin: "https://itsyouonline.com",
          host: "itsyouonline.com",
          cookie: visitorCookie,
          "x-youniverse-handle": TEST_FIXTURES.owner.username,
        },
        body: actionBody,
      }),
      crossRes,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(crossRes.statusCode, 403);
  }

  // Invalid action -> 400; oversized files -> 413
  {
    const badActRes = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { action: "drop_database", prompt: "nope" },
      }),
      badActRes,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(badActRes.statusCode, 400);
    assert.strictEqual(badActRes.body.error, "invalid_action");

    const hugeFilesRes = createMockRes();
    await weaverApiHandler(
      createMockReq({
        method: "POST",
        url: "/api/weaver/generate",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          action: "generate",
          prompt: "update",
          files: { "App.tsx": "a".repeat(WEAVER_MAX_TREE_BYTES + 10) },
        },
      }),
      hugeFilesRes,
      { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
    );
    assert.strictEqual(hugeFilesRes.statusCode, 413);
  }
});

test("WMS-13 — Express weaverGenerateHandler parity across generate, generate_asset, and runtime_infer", async () => {
  const mock = createMockProvider({
    onGenerate: async () => ({
      model: "gemini-2.0-flash-001",
      text: JSON.stringify({
        projectName: "ExpressApp",
        summary: "Created App.tsx",
        entryFile: "App.tsx",
        dependencies: [],
        operations: [
          { action: "upsert", path: "App.tsx", content: "export default () => <div>Express</div>;", reason: "init" },
        ],
      }),
    }),
  });

  const baseUser = {
    userId: TEST_FIXTURES.owner.identityId,
    youniverseId: TEST_FIXTURES.owner.identityId,
    handle: TEST_FIXTURES.owner.username,
  };

  const genRes = createMockRes();
  await expressWeaverHandler(
    { user: baseUser, headers: {}, body: { action: "generate", prompt: "Build ExpressApp" } },
    genRes,
    { provider: mock.provider }
  );
  assert.strictEqual(genRes.statusCode, 200);
  assert.strictEqual(genRes.body.action, "generate");
  assert.ok(genRes.body.project.files["App.tsx"]);

  const assetRes = createMockRes();
  await expressWeaverHandler(
    { user: baseUser, headers: {}, body: { action: "generate_asset", prompt: "Badge icon" } },
    assetRes,
    { provider: mock.provider }
  );
  assert.strictEqual(assetRes.statusCode, 200);
  assert.strictEqual(assetRes.body.action, "generate_asset");

  const inferRes = createMockRes();
  await expressWeaverHandler(
    { user: baseUser, headers: {}, body: { action: "runtime_infer", mode: "text", prompt: "Ping" } },
    inferRes,
    { provider: mock.provider }
  );
  assert.strictEqual(inferRes.statusCode, 200);
  assert.strictEqual(inferRes.body.action, "runtime_infer");
});

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT 3: DIFF ENGINE, SANDBOX RUNTIME, & POINT & EDIT ANNOTATION (WMS-14..17)
// ─────────────────────────────────────────────────────────────────────────────

test("WMS-14 — lib/weaverDiff.ts computes accurate line diffs and file diff summaries", () => {
  const before = "line 1\nline 2\nline 3";
  const after = "line 1\nline 2 updated\nline 3\nline 4";
  const diff = computeLineDiff(before, after);

  assert.strictEqual(diff.filter((d) => d.type === "unchanged").length, 2);
  assert.strictEqual(diff.filter((d) => d.type === "removed").length, 1);
  assert.strictEqual(diff.filter((d) => d.type === "added").length, 2);

  const summary = computeFileDiffSummary(
    {
      "App.tsx": { path: "App.tsx", content: before, language: "tsx" },
      "components/Old.tsx": { path: "components/Old.tsx", content: "old", language: "tsx" },
    },
    {
      "App.tsx": { path: "App.tsx", content: after, language: "tsx" },
      "components/New.tsx": { path: "components/New.tsx", content: "new\nline", language: "tsx" },
    }
  );

  assert.strictEqual(summary["App.tsx"].status, "modified");
  assert.strictEqual(summary["App.tsx"].addedLines, 2);
  assert.strictEqual(summary["App.tsx"].removedLines, 1);
  assert.strictEqual(summary["components/New.tsx"].status, "added");
  assert.strictEqual(summary["components/Old.tsx"].status, "deleted");
});

test("WMS-15 — validateWeaverSandboxMessage validates ELEMENT_SELECTED and RENDER_ERROR fail-closed", () => {
  const iframeWin = { id: "sandbox-frame" };

  const validAnn = {
    tagName: "section",
    domPath: "main > section.rounded-2xl",
    className: "max-w-md rounded-2xl p-6",
    textSnippet: "Weaver AI Studio",
    rect: { x: 24, y: 40, width: 380, height: 180 },
  };

  const okRes = validateWeaverSandboxMessage(
    { origin: "null", source: iframeWin, data: { type: "ELEMENT_SELECTED", annotation: validAnn } },
    iframeWin
  );
  assert.strictEqual(okRes.ok, true);
  assert.strictEqual(okRes.message.type, "ELEMENT_SELECTED");
  assert.strictEqual(okRes.message.annotation?.tagName, "section");
  assert.strictEqual(okRes.message.annotation?.rect.width, 380);

  // Untrusted origin -> rejected
  assert.strictEqual(
    validateWeaverSandboxMessage(
      { origin: "https://itsyouonline.com", source: iframeWin, data: { type: "ELEMENT_SELECTED", annotation: validAnn } },
      iframeWin
    ).ok,
    false
  );

  // Wrong source -> rejected
  assert.strictEqual(
    validateWeaverSandboxMessage(
      { origin: "null", source: { other: true }, data: { type: "ELEMENT_SELECTED", annotation: validAnn } },
      iframeWin
    ).ok,
    false
  );

  // Malformed/oversized annotation -> rejected
  for (const badAnn of [
    null,
    { ...validAnn, tagName: "<script>" },
    { ...validAnn, domPath: "a".repeat(301) },
    { ...validAnn, rect: { x: NaN, y: 0, width: 10, height: 10 } },
  ]) {
    const res = validateWeaverSandboxMessage(
      { origin: "null", source: iframeWin, data: { type: "ELEMENT_SELECTED", annotation: badAnn } },
      iframeWin
    );
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_payload");
  }

  // RENDER_ERROR payload bounded & accepted
  const errRes = validateWeaverSandboxMessage(
    { origin: "null", source: iframeWin, data: { type: "RENDER_ERROR", payload: "ReferenceError: x is not defined" } },
    iframeWin
  );
  assert.strictEqual(errRes.ok, true);
  assert.strictEqual(errRes.message.type, "RENDER_ERROR");
  assert.match(errRes.message.payload, /ReferenceError/);
});

test("WMS-16 — Point & Edit selectedElement forwards to /api/weaver/generate and updates useWeaverStore", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  const sampleAnn = {
    tagName: "section",
    domPath: "main > section.rounded-2xl",
    className: "max-w-md p-6",
    textSnippet: "Pricing Card",
    rect: { x: 10, y: 20, width: 320, height: 200 },
  };

  // Store annotation actions
  useWeaverStore.getState().initNewProject("PointEditTest");
  useWeaverStore.getState().toggleAnnotationMode();
  assert.strictEqual(useWeaverStore.getState().annotationMode, true);
  useWeaverStore.getState().setSelectedAnnotation(sampleAnn);
  assert.strictEqual(useWeaverStore.getState().annotationMode, false);
  assert.deepStrictEqual(useWeaverStore.getState().selectedAnnotation, sampleAnn);

  const mock = createMockProvider({
    onGenerate: async () => ({
      model: "gemini-2.0-flash-001",
      text: JSON.stringify({
        projectName: "PointEditTest",
        summary: "Tightened section padding",
        entryFile: "App.tsx",
        dependencies: [],
        operations: [
          { action: "upsert", path: "App.tsx", content: "export default () => <section className='p-3'>Tight</section>;", reason: "tighten padding" },
        ],
      }),
    }),
  });

  const res = createMockRes();
  await weaverApiHandler(
    createMockReq({
      method: "POST",
      url: "/api/weaver/generate",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: {
        action: "generate",
        prompt: "Tighten padding on this card",
        selectedElement: sampleAnn,
      },
    }),
    res,
    { sql: db.sql, databaseUrl: "mock://local", provider: mock.provider }
  );

  assert.strictEqual(res.statusCode, 200);
  const sentPrompt = mock.calls[0].params.userPrompt;
  assert.match(sentPrompt, /SELECTED VISUAL ELEMENT/);
  assert.match(sentPrompt, /main > section\.rounded-2xl/);
  assert.match(sentPrompt, /Pricing Card/);

  useWeaverStore.getState().clearSelectedAnnotation();
  assert.strictEqual(useWeaverStore.getState().selectedAnnotation, null);
});

test("WMS-17 — WeaverSandbox preserves strict CSP/SRI/ErrorBoundary and multi-file widget consumers wire files & entryFile", () => {
  const sandboxSrc = fs.readFileSync(
    path.join(process.cwd(), "components", "weaver", "WeaverSandbox.tsx"),
    "utf8"
  );
  assert.match(sandboxSrc, /sandbox="allow-scripts"/);
  assert.doesNotMatch(sandboxSrc, /allow-same-origin/);
  assert.match(sandboxSrc, /validateWeaverSandboxMessage\(/);
  assert.match(sandboxSrc, /WeaverErrorBoundary/);
  assert.match(sandboxSrc, /weaver-virtual-styles/);
  assert.match(sandboxSrc, /SET_ANNOTATION_MODE/);
  assert.match(sandboxSrc, /ELEMENT_SELECTED/);

  const widgetAppSrc = fs.readFileSync(
    path.join(process.cwd(), "apps", "WeavedWidgetApp.tsx"),
    "utf8"
  );
  assert.match(widgetAppSrc, /files=\{metadata\?\.files/);
  assert.match(widgetAppSrc, /entryFile=\{metadata\?\.entryFile\}/);

  const publicSrc = fs.readFileSync(
    path.join(process.cwd(), "components", "PublicYouniverse.tsx"),
    "utf8"
  );
  assert.match(publicSrc, /files=\{widget\.files/);
  assert.match(publicSrc, /entryFile=\{widget\.entryFile\}/);
});

test("WMS-18 — Sovereign ZIP export produces valid PKZIP archive with standalone Vite + React + TS scaffold", () => {
  const exported = exportWeaverProjectZip({
    title: "Sovereign Booking Portal",
    entryFile: "App.tsx",
    dependencies: ["lucide-react", "framer-motion"],
    files: {
      "App.tsx": {
        path: "App.tsx",
        content: 'import { LeadForm } from "./components/LeadForm"; export default function App(){ return <LeadForm />; }',
        language: "tsx",
      },
      "components/LeadForm.tsx": {
        path: "components/LeadForm.tsx",
        content: "export function LeadForm(){ return <form />; }",
        language: "tsx",
      },
      "styles.css": {
        path: "styles.css",
        content: ".form { padding: 16px; }",
        language: "css",
      },
      "api/collect.ts": {
        path: "api/collect.ts",
        content: "export async function submitLead(){ return true; }",
        language: "ts",
      },
      "manifest.json": {
        path: "manifest.json",
        content: '{"name":"Sovereign Booking Portal"}',
        language: "json",
      },
    },
  });

  assert.strictEqual(exported.filename, "sovereign-booking-portal.zip");
  assert.ok(exported.bytes instanceof Uint8Array);
  assert.ok(exported.bytes.length > 200);

  // Verify PKZIP local file header (PK\x03\x04) and EOCD signature (PK\x05\x06)
  const view = new DataView(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength);
  assert.strictEqual(view.getUint32(0, true), 0x04034b50, "Expected PKZIP local file header signature");
  const eocdOffset = exported.bytes.length - 22;
  assert.strictEqual(view.getUint32(eocdOffset, true), 0x06054b50, "Expected PKZIP EOCD signature");
  const entryCount = view.getUint16(eocdOffset + 10, true);
  assert.strictEqual(entryCount, exported.fileCount);

  // Verify expected standalone Vite + React + TS files are packaged
  for (const requiredFile of [
    "package.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "README.md",
    "manifest.json",
    "src/main.tsx",
    "src/App.tsx",
    "src/components/LeadForm.tsx",
    "src/styles.css",
    "src/api/collect.ts",
  ]) {
    assert.ok(exported.filePaths.includes(requiredFile), `Missing expected ZIP file: ${requiredFile}`);
  }

  // Verify raw UTF-8 archive contains package.json dependency & App.tsx content
  const decoded = new TextDecoder().decode(exported.bytes);
  assert.ok(decoded.includes('"framer-motion"'));
  assert.ok(decoded.includes("export function LeadForm()"));
});

test("WMS-19 — Public Collection Point capture & strict Youniverse isolation (401/403/413)", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);
  const visitorCookie = await loginAs(sql, TEST_FIXTURES.visitor);

  // 1. Create and publish an owner widget so widgetId linkage can be tested
  let ownerWidgetId = "";
  {
    const createRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/artifact",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          title: "NewsletterGate",
          code: "export default function NewsletterGate(){ return <form />; }",
        },
      }),
      createRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(createRes.statusCode, 200);
    ownerWidgetId = createRes.body.widget.id;

    const pubRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/publish",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: ownerWidgetId },
      }),
      pubRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(pubRes.statusCode, 200);
  }

  // 2. Public POST to owner's Youniverse captures newsletter & booking submissions (201)
  {
    const newsletterRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({
        method: "POST",
        url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
        headers: { origin: "https://test.itsyouonline.com", host: "test.itsyouonline.com" },
        body: {
          collectionType: "newsletter",
          widgetId: ownerWidgetId,
          email: "  Fan@Example.COM ",
          name: "Ada Lovelace",
          fields: { source: "hero-cta", tier: "early" },
        },
      }),
      newsletterRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(newsletterRes.statusCode, 201);
    assert.strictEqual(newsletterRes.body.success, true);
    assert.strictEqual(newsletterRes.body.submission.collectionType, "newsletter");
    assert.strictEqual(newsletterRes.body.submission.widgetId, ownerWidgetId);
    // Must never leak internal youniverseId in public response
    assert.strictEqual("youniverseId" in newsletterRes.body.submission, false);

    const bookingRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({
        method: "POST",
        url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
        headers: { origin: "https://test.itsyouonline.com", host: "test.itsyouonline.com" },
        body: {
          collectionType: "booking",
          name: "Grace Hopper",
          email: "grace@example.com",
          message: "Strategy call next Tuesday",
          fields: { date: "2026-12-01" },
        },
      }),
      bookingRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(bookingRes.statusCode, 201);
  }

  // 3. Reject oversized payload (413) & invalid email (400)
  {
    const hugeRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({
        method: "POST",
        url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
        body: {
          collectionType: "lead_capture",
          email: "lead@example.com",
          message: "x".repeat(MAX_COLLECTION_PAYLOAD_BYTES + 200),
        },
      }),
      hugeRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(hugeRes.statusCode, 413);
    assert.strictEqual(hugeRes.body.error, "payload_too_large");

    const badEmailRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({
        method: "POST",
        url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
        body: {
          collectionType: "digital_download",
          email: "not-an-email",
        },
      }),
      badEmailRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(badEmailRes.statusCode, 400);
  }

  // 4. Unauthenticated GET /api/not-notes/submissions -> 401
  {
    const unauthRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/submissions",
        headers: { host: "itsyouonline.com" },
      }),
      unauthRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(unauthRes.statusCode, 401);
  }

  // 5. Cross-Youniverse isolation: visitor reading owner's widgetId or youniverseId -> 403
  {
    const crossWidgetRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/submissions",
        headers: { host: "itsyouonline.com", cookie: visitorCookie },
        query: { widgetId: ownerWidgetId },
      }),
      crossWidgetRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(crossWidgetRes.statusCode, 403);
    assert.strictEqual(crossWidgetRes.body.error, "forbidden_widget_ownership");

    const crossTenantRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/submissions",
        headers: { host: "itsyouonline.com", cookie: visitorCookie },
        query: { youniverseId: TEST_FIXTURES.owner.identityId },
      }),
      crossTenantRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(crossTenantRes.statusCode, 403);

    // Visitor listing their own submissions sees 0 (zero cross-tenant leakage)
    const visitorOwnRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/submissions",
        headers: { host: "itsyouonline.com", cookie: visitorCookie },
      }),
      visitorOwnRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(visitorOwnRes.statusCode, 200);
    assert.strictEqual(visitorOwnRes.body.submissions.length, 0);
  }

  // 6. Owner reads their 2 captured submissions (email normalized lowercase)
  {
    const ownerRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/submissions",
        headers: { host: "itsyouonline.com", cookie: ownerCookie },
      }),
      ownerRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(ownerRes.statusCode, 200);
    assert.strictEqual(ownerRes.body.count, 2);
    const newsletter = ownerRes.body.submissions.find((s) => s.collectionType === "newsletter");
    assert.ok(newsletter);
    assert.strictEqual(newsletter.email, "fan@example.com");
    assert.strictEqual(newsletter.payloadJson.source, "hero-cta");
  }
});

test("WMS-20 — Collection Point CSV export neutralizes spreadsheet formula injection", () => {
  const csv = formatSubmissionsCsv([
    {
      id: "cps_1",
      youniverseId: "yid_1",
      widgetId: "wid_1",
      collectionType: "lead_capture",
      email: "safe@example.com",
      name: "=cmd|' /C calc'!A0",
      message: 'Hello, "world"',
      payloadJson: { plan: "pro" },
      sourceOrigin: "https://test.itsyouonline.com",
      createdAt: "2026-11-27T17:00:00.000Z",
    },
  ]);

  assert.ok(csv.includes("'=cmd|' /C calc'!A0"), "Formula cell must be neutralized with leading quote");
  assert.ok(csv.includes('"Hello, ""world"""'), "Embedded quotes must be RFC 4180 escaped");
});

test("WMS-21 — Weaver operates standalone without Oracle and rejects publishing to mismatched handle or agent subdomain (403)", async () => {
  // 1. Standalone Weaver workspace starts clean with zero Oracle dependency
  useWeaverStore.getState().initNewProject("StandaloneApp");
  assert.strictEqual(useWeaverStore.getState().diagnosticSource, null);
  assert.strictEqual(useWeaverStore.getState().publicationStatus, null);

  const db = createIsolatedTestDb();
  await db.init();
  const ownerCookie = await loginAs(db.sql, TEST_FIXTURES.owner);

  // 2. Create private draft in active owner's Youniverse
  const createRes = createMockRes();
  await notNotesDispatcher(
    createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: {
        title: "StandaloneApp",
        code: "export default function StandaloneApp(){ return <div>Private Draft</div>; }",
      },
    }),
    createRes,
    { sql: db.sql, databaseUrl: "mock://local" }
  );
  assert.strictEqual(createRes.statusCode, 200);
  assert.strictEqual(createRes.body.widget.publicationStatus, "draft");
  const widgetId = createRes.body.widget.id;

  // 3. Attempting to publish to another handle or agent subdomain -> 403 forbidden_youniverse_publish_target
  for (const badTarget of ["visitor", "contracts.itsyouonline.com", "https://pricing.itsyouonline.com"]) {
    const badRes = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/publish",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: widgetId, targetHandle: badTarget },
      }),
      badRes,
      { sql: db.sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(badRes.statusCode, 403, `Expected 403 for targetHandle=${badTarget}`);
    assert.strictEqual(badRes.body.error, "forbidden_youniverse_publish_target");
  }

  // 4. Publishing to the active authenticated owner's own handle succeeds (200)
  const okPubRes = createMockRes();
  await notNotesDispatcher(
    createMockReq({
      method: "POST",
      url: "/api/not-notes/publish",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: { id: widgetId, targetHandle: TEST_FIXTURES.owner.username },
    }),
    okPubRes,
    { sql: db.sql, databaseUrl: "mock://local" }
  );
  assert.strictEqual(okPubRes.statusCode, 200);
  assert.strictEqual(okPubRes.body.widget.publicationStatus, "published");
});
