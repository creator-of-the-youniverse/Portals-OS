/**
 * tests/books-os-integration.test.mjs
 *
 * Automated verification suite for Neon-backed Books OS archival integration:
 *   - Canonical Books OS Tower / Shelf / Book / Page coordinate mapping
 *   - Real parameterized SQL writes on archive & publish (`archiveToBooksOs: true`)
 *   - Weaver multi-file snapshot sanitization (prompt noise excluded by default)
 *   - Idempotent versioning (prevents duplicate rows for unchanged content)
 *   - Optional authenticated webhook sync (`BOOKS_OS_WEBHOOK_URL` / `BOOKS_OS_API_SECRET`)
 *   - Strict `youniverseId` owner isolation (`401` / `403`) & CSRF enforcement
 *   - Public widget DTO privacy boundary (archive metadata never exposed publicly)
 *   - Vercel 12-function Hobby cap preservation (zero new top-level `api/` files)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb, TEST_FIXTURES } from "../lib/localTestDb.ts";
import {
  archiveToBooksOs,
  buildWeaverBooksOsSnapshot,
  listBooksOsArchives,
  resolveBooksOsCoordinates,
} from "../lib/booksOsBridge.ts";
import { formatPublicWidget } from "../lib/widgetLifecycle.ts";
import {
  archiveWeaverArtifactHandler,
  publishWeaverWidgetHandler,
  saveWeaverArtifactHandler,
} from "../controllers/notNotesController.js";
import passwordLoginHandler from "../api/auth/password/login.ts";
import notNotesDispatcher from "../api/not-notes/[action].ts";
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
  user = undefined,
} = {}) {
  return {
    method,
    url,
    headers: { ...headers },
    body,
    params,
    query,
    ...(user ? { user } : {}),
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

test("BOS-01 — resolveBooksOsCoordinates matches canonical Books OS Tower/Shelf/Book slots", () => {
  // Week 4 of Nov 2026 (day 27 -> week 4 -> artifact slot H, daily slot G)
  const weaverCoords = resolveBooksOsCoordinates({
    entryType: "weaver_app_snapshot",
    timestamp: "2026-11-27T16:00:00Z",
  });
  assert.strictEqual(weaverCoords.towerId, "NOV");
  assert.strictEqual(weaverCoords.shelfId, "NOV-26");
  assert.strictEqual(weaverCoords.bookLetter, "H");
  assert.strictEqual(weaverCoords.bookId, "NOV-26-H");
  assert.strictEqual(weaverCoords.pageId, "DAY-27");

  const dailyCoords = resolveBooksOsCoordinates({
    entryType: "daily_record",
    timestamp: "2026-11-27T16:00:00Z",
  });
  assert.strictEqual(dailyCoords.towerId, "NOV");
  assert.strictEqual(dailyCoords.shelfId, "NOV-26");
  assert.strictEqual(dailyCoords.bookLetter, "G");
  assert.strictEqual(dailyCoords.bookId, "NOV-26-G");

  // Special NEXUS tower override
  const nexusCoords = resolveBooksOsCoordinates({
    entryType: "notnote_artifact",
    timestamp: "2026-02-03T10:00:00Z",
    override: { tower: "nexus", book: "b", page: "p-01" },
  });
  assert.strictEqual(nexusCoords.towerId, "NEXUS");
  assert.strictEqual(nexusCoords.shelfId, "NEXUS-01");
  assert.strictEqual(nexusCoords.bookId, "NEXUS-01-B");
  assert.strictEqual(nexusCoords.pageId, "P-01");
});

test("BOS-02 — buildWeaverBooksOsSnapshot packages multi-file project and strips raw prompts by default", () => {
  const files = {
    "App.tsx": { path: "App.tsx", content: "export default function App(){ return <div />; }", language: "tsx" },
    "components/Hero.tsx": { path: "components/Hero.tsx", content: "export const Hero = () => <h1 />;", language: "tsx" },
    "manifest.json": { path: "manifest.json", content: '{"name":"Alpha"}', language: "json" },
  };
  const iterations = [
    {
      id: "iter_1",
      prompt: "TOP_SECRET_INTERNAL_PROMPT_NOISE",
      summary: "Built Hero component and wired manifest.",
      aiChips: { webSearch: false, imageGen: false, deepReasoning: false, uiPolish: true },
      changedFiles: ["App.tsx", "components/Hero.tsx"],
      createdAt: "2026-11-27T12:00:00Z",
    },
  ];

  const clean = buildWeaverBooksOsSnapshot({
    sourceArtifactId: "wid_123",
    title: "AlphaApp",
    files,
    entryFile: "App.tsx",
    dependencies: ["lucide-react"],
    iterations,
  });

  assert.strictEqual(clean.summary, "Built Hero component and wired manifest.");
  assert.ok(!JSON.stringify(clean.payloadJson).includes("TOP_SECRET_INTERNAL_PROMPT_NOISE"));
  assert.ok(!clean.bodyMarkdown.includes("TOP_SECRET_INTERNAL_PROMPT_NOISE"));
  assert.deepStrictEqual(clean.payloadJson.filePaths, [
    "App.tsx",
    "components/Hero.tsx",
    "manifest.json",
  ]);
  assert.strictEqual(clean.payloadJson.booksOsDeck.who.tool, "Weaver");

  const withPrompts = buildWeaverBooksOsSnapshot({
    sourceArtifactId: "wid_123",
    title: "AlphaApp",
    files,
    entryFile: "App.tsx",
    iterations,
    includePromptHistory: true,
  });
  assert.ok(JSON.stringify(withPrompts.payloadJson).includes("TOP_SECRET_INTERNAL_PROMPT_NOISE"));
});

test("BOS-03 — NotNotes /api/not-notes/archive & publish(archiveToBooksOs) persist to Neon with idempotency and strict owner isolation", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);
  const visitorCookie = await loginAs(sql, TEST_FIXTURES.visitor);

  const projectFiles = {
    "App.tsx": 'import { Badge } from "./components/Badge"; export default function App(){ return <Badge />; }',
    "components/Badge.tsx": "export function Badge(){ return <span>v1</span>; }",
    "manifest.json": '{"name":"ArchiveDemo"}',
  };

  // 1. Create private Weaver draft in NotNotes
  let widgetId = "";
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: {
        title: "ArchiveDemo",
        files: projectFiles,
        entryFile: "App.tsx",
        iterations: [
          {
            prompt: "private internal prompt should not archive",
            summary: "Initial multi-file build",
            changedFiles: ["App.tsx", "components/Badge.tsx"],
          },
        ],
      },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    widgetId = res.body.widget.id;
  }

  // 2. Unauthenticated archive -> 401
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/archive",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
        body: { id: widgetId },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 401);
  }

  // 3. Cross-tenant (visitor) archive attempt -> 403 forbidden_widget_ownership
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/archive",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: visitorCookie },
        body: { id: widgetId },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "forbidden_widget_ownership");
    assert.strictEqual(db.tables.books_os_archive_entries.length, 0);
  }

  // 4. Cross-origin CSRF archive attempt -> 403 csrf_rejected
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/archive",
        headers: { origin: "https://evil.example.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: widgetId },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "csrf_rejected");
  }

  // 5. Authenticated owner archive -> 200, writes 1 Neon row, returns coordinates + badge
  let firstRecordId = "";
  let firstVersionHash = "";
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/archive",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: widgetId, timestamp: "2026-11-27T16:00:00Z" },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deduplicated, false);
    assert.strictEqual(res.body.archive.youniverseId, TEST_FIXTURES.owner.identityId);
    assert.strictEqual(res.body.archive.towerId, "NOV");
    assert.strictEqual(res.body.archive.shelfId, "NOV-26");
    assert.strictEqual(res.body.archive.bookId, "NOV-26-H");
    assert.strictEqual(res.body.badge.recordId, res.body.archive.id);
    assert.strictEqual(res.body.widget.booksOsArchive.bookId, "NOV-26-H");
    assert.strictEqual(db.tables.books_os_archive_entries.length, 1);
    assert.ok(!JSON.stringify(res.body.archive.payloadJson).includes("private internal prompt"));

    firstRecordId = res.body.archive.id;
    firstVersionHash = res.body.archive.versionHash;
  }

  // 6. Idempotent re-archive of unchanged content -> deduplicated: true, zero new rows
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/archive",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: { id: widgetId, timestamp: "2026-11-27T16:05:00Z" },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.deduplicated, true);
    assert.strictEqual(res.body.archive.id, firstRecordId);
    assert.strictEqual(res.body.archive.versionHash, firstVersionHash);
    assert.strictEqual(db.tables.books_os_archive_entries.length, 1);
  }

  // 7. Publish with archiveToBooksOs: true after code change -> creates new versioned archive row
  {
    const res = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "POST",
        url: "/api/not-notes/publish",
        headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
        body: {
          id: widgetId,
          files: {
            ...projectFiles,
            "components/Badge.tsx": "export function Badge(){ return <span>v2</span>; }",
          },
          archiveToBooksOs: true,
          timestamp: "2026-11-27T17:00:00Z",
        },
      }),
      res,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.widget.publicationStatus, "published");
    assert.strictEqual(res.body.deduplicated, false);
    assert.notStrictEqual(res.body.archive.id, firstRecordId);
    assert.notStrictEqual(res.body.archive.versionHash, firstVersionHash);
    assert.strictEqual(db.tables.books_os_archive_entries.length, 2);
  }

  // 8. Public DTO privacy: formatPublicWidget never leaks booksOsArchive metadata
  {
    const row = db.tables.not_notes.find((n) => n.id === widgetId);
    const publicDto = formatPublicWidget(row);
    assert.ok(publicDto);
    assert.strictEqual("booksOsArchive" in publicDto, false);
  }

  // 9. Owner isolation on listBooksOsArchives
  {
    const ownerArchives = await listBooksOsArchives(TEST_FIXTURES.owner.identityId, {}, { sql });
    const visitorArchives = await listBooksOsArchives(TEST_FIXTURES.visitor.identityId, {}, { sql });
    assert.strictEqual(ownerArchives.length, 2);
    assert.strictEqual(visitorArchives.length, 0);
  }
});

test("BOS-04 — Optional authenticated webhook sync dispatches HMAC-signed POST and degrades gracefully on failure", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };

  const resOk = await archiveToBooksOs(
    {
      youniverseId: TEST_FIXTURES.owner.identityId,
      entryType: "daily_record",
      title: "Daily Synthesis 2026-11-27",
      bodyMarkdown: "# Daily Log\nAll systems green.",
      timestamp: "2026-11-27T18:00:00Z",
    },
    {
      sql,
      env: {
        BOOKS_OS_WEBHOOK_URL: "https://books.example.com/api/archive",
        BOOKS_OS_API_SECRET: "super-secret-books-token",
      },
      fetch: okFetch,
    }
  );

  assert.strictEqual(resOk.deduplicated, false);
  assert.strictEqual(resOk.record.webhookSyncStatus, "synced");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://books.example.com/api/archive");
  assert.strictEqual(calls[0].init.headers.Authorization, "Bearer super-secret-books-token");
  assert.ok(calls[0].init.headers["X-Books-OS-Signature"].startsWith("sha256="));

  // Graceful degradation when webhook throws
  const resFail = await archiveToBooksOs(
    {
      youniverseId: TEST_FIXTURES.owner.identityId,
      entryType: "notnote_artifact",
      title: "Offline Resilient Artifact",
      bodyMarkdown: "Persists in Neon even if webhook is down.",
      timestamp: "2026-11-27T18:05:00Z",
    },
    {
      sql,
      env: {
        BOOKS_OS_WEBHOOK_URL: "https://books.example.com/api/archive",
        BOOKS_OS_API_SECRET: "super-secret-books-token",
      },
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    }
  );
  assert.strictEqual(resFail.record.webhookSyncStatus, "failed");
  assert.strictEqual(db.tables.books_os_archive_entries.length, 2);
});

test("BOS-05 — Express controller parity (archiveWeaverArtifactHandler & publishWeaverWidgetHandler)", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const saveRes = createMockRes();
  await saveWeaverArtifactHandler(
    createMockReq({
      method: "POST",
      user: { youniverseId: TEST_FIXTURES.owner.identityId },
      body: {
        title: "ExpressWidget",
        code: "export default function ExpressWidget(){ return <div>OK</div>; }",
      },
    }),
    saveRes,
    { sql }
  );
  assert.strictEqual(saveRes.statusCode, 200);
  const wid = saveRes.body.widget.id;

  // Cross-tenant archive rejected with 403
  const crossRes = createMockRes();
  await archiveWeaverArtifactHandler(
    createMockReq({
      method: "POST",
      user: { youniverseId: TEST_FIXTURES.visitor.identityId },
      body: { id: wid },
    }),
    crossRes,
    { sql }
  );
  assert.strictEqual(crossRes.statusCode, 403);

  // Owner archive succeeds
  const archRes = createMockRes();
  await archiveWeaverArtifactHandler(
    createMockReq({
      method: "POST",
      user: { youniverseId: TEST_FIXTURES.owner.identityId },
      body: { id: wid, timestamp: "2026-11-27T19:00:00Z" },
    }),
    archRes,
    { sql }
  );
  assert.strictEqual(archRes.statusCode, 200);
  assert.strictEqual(archRes.body.archive.bookId, "NOV-26-H");

  // Publish with archiveToBooksOs: true on unchanged content -> deduplicated: true
  const pubRes = createMockRes();
  await publishWeaverWidgetHandler(
    createMockReq({
      method: "POST",
      user: { youniverseId: TEST_FIXTURES.owner.identityId },
      body: { id: wid, archiveToBooksOs: true },
    }),
    pubRes,
    { sql }
  );
  assert.strictEqual(pubRes.statusCode, 200);
  assert.strictEqual(pubRes.body.widget.publicationStatus, "published");
  assert.strictEqual(pubRes.body.deduplicated, true);
});

test("BOS-06 — Zustand weaverStore tracks lastArchive badge and archiveOnPublish toggle", () => {
  const store = useWeaverStore.getState();
  store.initNewProject("StoreArchiveTest");
  assert.strictEqual(useWeaverStore.getState().lastArchive, null);
  assert.strictEqual(useWeaverStore.getState().archiveOnPublish, false);

  store.setArchiveOnPublish(true);
  assert.strictEqual(useWeaverStore.getState().archiveOnPublish, true);

  const badge = {
    recordId: "bos_abc123",
    towerId: "NOV",
    shelfId: "NOV-26",
    bookId: "NOV-26-H",
    pageId: "DAY-27",
    entryType: "weaver_app_snapshot",
    versionHash: "deadbeef1234",
    archivedAt: "2026-11-27T16:00:00Z",
  };
  store.hydrateFromNotNote({
    id: "wid_store_1",
    title: "HydratedApp",
    code: "export default () => <div />;",
    dependencies: [],
    publicationStatus: "draft",
    booksOsArchive: badge,
  });
  assert.deepStrictEqual(useWeaverStore.getState().lastArchive, badge);
});

test("BOS-07 — Vercel 12-function Hobby cap preserved (zero new top-level api/ files)", () => {
  const syncScript = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sync-vercel-typescript-runtime.mjs"),
    "utf8"
  );
  assert.ok(syncScript.includes("MAX_VERCEL_HOBBY_FUNCTIONS = 12"));
  assert.ok(syncScript.includes('"api/not-notes/[action].func"'));
  assert.strictEqual(
    fs.existsSync(path.join(process.cwd(), "api", "books-os.ts")),
    false,
    "Must not add a new top-level api/ function file"
  );
});
