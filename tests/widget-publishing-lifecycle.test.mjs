/**
 * tests/widget-publishing-lifecycle.test.mjs
 *
 * Comprehensive automated tests verifying the NotNotes Widget Draft-to-Public
 * Publishing Lifecycle (`WPL-01` through `WPL-14`):
 *   - Private draft creation (ignoring client-supplied isPublished)
 *   - Persistence across reload & private editing
 *   - Explicit publish -> unauthenticated public retrieval -> live update -> unpublish
 *   - Unpublished widget private retention & republishing
 *   - Fail-closed ownership, human-continuity target Youniverse authz, CSRF & cross-tenant isolation
 *   - Compatibility with legacy NotNotes artifacts and Express handlers
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb, TEST_FIXTURES } from "../lib/localTestDb.ts";
import { linkYouniverseToHuman } from "../lib/humanContinuity.ts";
import { verifyJwt } from "../middleware/verifyJwt.js";
import {
  saveWeaverArtifactHandler,
  getWeavedWidgetsHandler,
  updateWeaverArtifactHandler,
  publishWeaverWidgetHandler,
  unpublishWeaverWidgetHandler,
} from "../controllers/notNotesController.js";
import passwordLoginHandler from "../api/auth/password/login.ts";
import notNotesDispatcher from "../api/not-notes/[action].ts";
import youniverseDispatcher from "../api/youniverse/[handle]/[action].ts";

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

test("WPL-01 through WPL-10 — Complete owner draft, reload, edit, publish, public visitor view, update & unpublish lifecycle", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);

  // WPL-01: Create widget -> defaults strictly to private draft (ignores client isPublished: true)
  let widgetId = "";
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
        "x-youniverse-handle": TEST_FIXTURES.owner.username,
      },
      body: {
        title: "SolarClockWidget",
        code: "export default function SolarClockWidget(){ return <div>Draft v1</div>; }",
        dependencies: ["lucide-react"],
        isPublished: true,
        publicationStatus: "published",
      },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.artifact?.publicationStatus, "draft");
    assert.strictEqual(res.body?.artifact?.isPublished, false);
    assert.strictEqual(res.body?.artifact?.status, "APPROVED");
    widgetId = res.body.artifact.id;
    assert.ok(widgetId);
  }

  // WPL-07 (part 1): Private draft NEVER appears in public response
  {
    const req = createMockReq({
      method: "GET",
      url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
      headers: {},
      query: { handle: TEST_FIXTURES.owner.username, action: "public" },
    });
    const res = createMockRes();
    await youniverseDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body?.publicWidgets, []);
  }

  // WPL-02: Draft persists across reload (fresh GET /api/not-notes/widgets)
  {
    const req = createMockReq({
      method: "GET",
      url: "/api/not-notes/widgets",
      headers: {
        host: "itsyouonline.com",
        cookie: ownerCookie,
        "x-youniverse-handle": TEST_FIXTURES.owner.username,
      },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.widgets?.length, 1);
    assert.strictEqual(res.body.widgets[0].id, widgetId);
    assert.strictEqual(res.body.widgets[0].publicationStatus, "draft");
    assert.strictEqual(res.body.widgets[0].isPublished, false);
  }

  // WPL-03: Owner retrieves & edits own draft (remains private draft even if spoofing isPublished)
  {
    const getOneReq = createMockReq({
      method: "GET",
      url: `/api/not-notes/widgets?id=${widgetId}`,
      headers: {
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      query: { action: "widgets", id: widgetId },
    });
    const getOneRes = createMockRes();
    await notNotesDispatcher(getOneReq, getOneRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(getOneRes.statusCode, 200);
    assert.strictEqual(getOneRes.body?.widget?.id, widgetId);

    const updReq = createMockReq({
      method: "PUT",
      url: "/api/not-notes/artifact",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      body: {
        id: widgetId,
        title: "SolarClockWidget v2",
        code: "export default function SolarClockWidget(){ return <div>Draft v2</div>; }",
        dependencies: ["framer-motion"],
        isPublished: true,
      },
    });
    const updRes = createMockRes();
    await notNotesDispatcher(updReq, updRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(updRes.statusCode, 200);
    assert.strictEqual(updRes.body?.widget?.title, "SolarClockWidget v2");
    assert.strictEqual(updRes.body?.widget?.publicationStatus, "draft");
    assert.strictEqual(updRes.body?.widget?.isPublished, false);
  }

  // Still excluded from public after draft edit
  {
    const req = createMockReq({
      method: "GET",
      url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
      headers: {},
      query: { handle: TEST_FIXTURES.owner.username, action: "public" },
    });
    const res = createMockRes();
    await youniverseDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body?.publicWidgets, []);
  }

  // WPL-04: Explicit publish
  {
    const pubReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/publish",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      body: { id: widgetId },
    });
    const pubRes = createMockRes();
    await notNotesDispatcher(pubReq, pubRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(pubRes.statusCode, 200);
    assert.strictEqual(pubRes.body?.widget?.publicationStatus, "published");
    assert.strictEqual(pubRes.body?.widget?.isPublished, true);
    assert.ok(pubRes.body?.widget?.publishedAt);
  }

  // WPL-05 & WPL-06: Published widget appears to unauthenticated visitors
  {
    const pubFaceReq = createMockReq({
      method: "GET",
      url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
      headers: {}, // zero cookies, zero auth headers
      query: { handle: TEST_FIXTURES.owner.username, action: "public" },
    });
    const pubFaceRes = createMockRes();
    await youniverseDispatcher(pubFaceReq, pubFaceRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(pubFaceRes.statusCode, 200);
    assert.strictEqual(pubFaceRes.body?.publicWidgets?.length, 1);
    assert.strictEqual(pubFaceRes.body.publicWidgets[0].id, widgetId);
    assert.strictEqual(pubFaceRes.body.publicWidgets[0].title, "SolarClockWidget v2");
    assert.match(pubFaceRes.body.publicWidgets[0].code, /Draft v2/);
    assert.strictEqual(pubFaceRes.body.publicWidgets[0].youniverseId, undefined);
  }

  // WPL-08: Owner updates published widget -> live public content updates while remaining published
  {
    const updPubReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/update",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      body: {
        id: widgetId,
        title: "SolarClockWidget Live",
        code: "export default function SolarClockWidget(){ return <div>Live v3</div>; }",
      },
    });
    const updPubRes = createMockRes();
    await notNotesDispatcher(updPubReq, updPubRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(updPubRes.statusCode, 200);
    assert.strictEqual(updPubRes.body?.widget?.publicationStatus, "published");

    const pubFaceReq = createMockReq({
      method: "GET",
      url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
      headers: {},
      query: { handle: TEST_FIXTURES.owner.username, action: "public" },
    });
    const pubFaceRes = createMockRes();
    await youniverseDispatcher(pubFaceReq, pubFaceRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(pubFaceRes.statusCode, 200);
    assert.strictEqual(pubFaceRes.body?.publicWidgets?.length, 1);
    assert.strictEqual(pubFaceRes.body.publicWidgets[0].title, "SolarClockWidget Live");
    assert.match(pubFaceRes.body.publicWidgets[0].code, /Live v3/);
  }

  // WPL-09: Unpublishing immediately removes widget from public face
  {
    const unpubReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/unpublish",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
      body: { id: widgetId },
    });
    const unpubRes = createMockRes();
    await notNotesDispatcher(unpubReq, unpubRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(unpubRes.statusCode, 200);
    assert.strictEqual(unpubRes.body?.widget?.publicationStatus, "unpublished");
    assert.strictEqual(unpubRes.body?.widget?.isPublished, false);
    assert.ok(unpubRes.body?.widget?.unpublishedAt);

    const pubFaceReq = createMockReq({
      method: "GET",
      url: `/api/youniverse/${TEST_FIXTURES.owner.username}/public`,
      headers: {},
      query: { handle: TEST_FIXTURES.owner.username, action: "public" },
    });
    const pubFaceRes = createMockRes();
    await youniverseDispatcher(pubFaceReq, pubFaceRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(pubFaceRes.statusCode, 200);
    assert.deepStrictEqual(pubFaceRes.body?.publicWidgets, []);
  }

  // WPL-10: Unpublished widget stays privately available to owner
  {
    const privReq = createMockReq({
      method: "GET",
      url: "/api/not-notes/widgets",
      headers: {
        host: "itsyouonline.com",
        cookie: ownerCookie,
      },
    });
    const privRes = createMockRes();
    await notNotesDispatcher(privReq, privRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(privRes.statusCode, 200);
    assert.strictEqual(privRes.body?.widgets?.length, 1);
    assert.strictEqual(privRes.body.widgets[0].id, widgetId);
    assert.strictEqual(privRes.body.widgets[0].publicationStatus, "unpublished");
  }
});

test("WPL-11 through WPL-13 — Authorization, cross-owner denial, CSRF, email-equality guard & tenant isolation", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);
  const visitorCookie = await loginAs(sql, TEST_FIXTURES.visitor);

  // Create & publish widget in Owner A (@test)
  let ownerWidgetId = "";
  {
    const cReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: { title: "OwnerWidget", code: "export default () => <div>Owner</div>;" },
    });
    const cRes = createMockRes();
    await notNotesDispatcher(cReq, cRes, { sql, databaseUrl: "mock://local" });
    ownerWidgetId = cRes.body.artifact.id;

    const pReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/publish",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: ownerCookie },
      body: { id: ownerWidgetId },
    });
    const pRes = createMockRes();
    await notNotesDispatcher(pReq, pRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(pRes.statusCode, 200);
  }

  // Create draft & published widget in Owner B (@visitor)
  let visitorWidgetId = "";
  {
    const cReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/artifact",
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: visitorCookie },
      body: { title: "VisitorSecretDraft", code: "export default () => <div>Secret</div>;" },
    });
    const cRes = createMockRes();
    await notNotesDispatcher(cReq, cRes, { sql, databaseUrl: "mock://local" });
    visitorWidgetId = cRes.body.artifact.id;
  }

  // WPL-11a: Owner B cannot edit, publish, or unpublish Owner A's widget (using Owner B's own handle)
  for (const op of [
    { method: "PUT", url: "/api/not-notes/artifact", body: { id: ownerWidgetId, code: "export default () => <div>Hacked</div>;" } },
    { method: "POST", url: "/api/not-notes/publish", body: { id: ownerWidgetId } },
    { method: "POST", url: "/api/not-notes/unpublish", body: { id: ownerWidgetId } },
  ]) {
    const req = createMockReq({
      method: op.method,
      url: op.url,
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com", cookie: visitorCookie },
      body: op.body,
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body?.error, "forbidden_widget_ownership");
  }

  // WPL-11b: Owner B cannot impersonate Owner A via X-Youniverse-Handle: test
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/not-notes/unpublish",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: visitorCookie,
        "x-youniverse-handle": TEST_FIXTURES.owner.username,
      },
      body: { id: ownerWidgetId },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 403);
  }

  // WPL-11c: Owner B cannot read Owner A's widget by ID
  {
    const req = createMockReq({
      method: "GET",
      url: `/api/not-notes/widgets?id=${ownerWidgetId}`,
      headers: { host: "itsyouonline.com", cookie: visitorCookie },
      query: { action: "widgets", id: ownerWidgetId },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 403);
  }

  // WPL-12a: Unauthenticated visitor cannot create, update, publish, unpublish, or list private widgets
  for (const tc of [
    { method: "POST", url: "/api/not-notes/artifact", body: { title: "X", code: "x" }, expected: 401 },
    { method: "PUT", url: "/api/not-notes/artifact", body: { id: ownerWidgetId, code: "x" }, expected: 401 },
    { method: "POST", url: "/api/not-notes/publish", body: { id: ownerWidgetId }, expected: 401 },
    { method: "POST", url: "/api/not-notes/unpublish", body: { id: ownerWidgetId }, expected: 401 },
    { method: "GET", url: "/api/not-notes/widgets", expected: 401 },
  ]) {
    const req = createMockReq({
      method: tc.method,
      url: tc.url,
      headers: { origin: "https://itsyouonline.com", host: "itsyouonline.com" },
      body: tc.body,
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, tc.expected);
  }

  // WPL-12b: Cookie-authenticated mutation with untrusted Origin blocked by CSRF
  {
    const req = createMockReq({
      method: "POST",
      url: "/api/not-notes/publish",
      headers: { origin: "https://evil.example", host: "itsyouonline.com", cookie: ownerCookie },
      body: { id: ownerWidgetId },
    });
    const res = createMockRes();
    await notNotesDispatcher(req, res, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body?.error, "csrf_rejected");
  }

  // WPL-12c: Email equality NEVER grants cross-Youniverse widget access (human_id association required)
  {
    db.tables.youniverse_identities.push({
      identity_id: "same-email-other-human-yi",
      username: "sameemail",
      email: TEST_FIXTURES.owner.email, // collides on email intentionally!
      subdomain: "sameemail",
      display_name: "Same Email Unowned",
      identity_type: "person",
      plan: "free",
      is_live: true,
      email_verified_at: new Date(),
      created_at: new Date(),
    });
    const crossReq = createMockReq({
      method: "GET",
      url: "/api/not-notes/widgets",
      headers: {
        host: "itsyouonline.com",
        cookie: ownerCookie,
        "x-youniverse-handle": "sameemail",
      },
    });
    const crossRes = createMockRes();
    await notNotesDispatcher(crossReq, crossRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(crossRes.statusCode, 403);
  }

  // WPL-12d: Operator role association (non-owner) is denied widget ownership mutations
  {
    await linkYouniverseToHuman(sql, {
      humanId: TEST_FIXTURES.visitor.humanId,
      identityId: TEST_FIXTURES.owner.identityId,
      role: "operator",
      isHomeverse: false,
      verificationStatus: "verified",
    });
    const opReq = createMockReq({
      method: "POST",
      url: "/api/not-notes/unpublish",
      headers: {
        origin: "https://itsyouonline.com",
        host: "itsyouonline.com",
        cookie: visitorCookie,
        "x-youniverse-handle": TEST_FIXTURES.owner.username,
      },
      body: { id: ownerWidgetId },
    });
    const opRes = createMockRes();
    await notNotesDispatcher(opReq, opRes, { sql, databaseUrl: "mock://local" });
    assert.strictEqual(opRes.statusCode, 403);
  }

  // WPL-13: Strict cross-tenant isolation across both public and owner views
  {
    const pubOwner = createMockRes();
    await youniverseDispatcher(
      createMockReq({ method: "GET", headers: {}, query: { handle: TEST_FIXTURES.owner.username, action: "public" } }),
      pubOwner,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(pubOwner.body.publicWidgets.length, 1);
    assert.strictEqual(pubOwner.body.publicWidgets[0].id, ownerWidgetId);

    const pubVisitor = createMockRes();
    await youniverseDispatcher(
      createMockReq({ method: "GET", headers: {}, query: { handle: TEST_FIXTURES.visitor.username, action: "public" } }),
      pubVisitor,
      { sql, databaseUrl: "mock://local" }
    );
    assert.deepStrictEqual(pubVisitor.body.publicWidgets, []);

    const privVisitor = createMockRes();
    await notNotesDispatcher(
      createMockReq({
        method: "GET",
        url: "/api/not-notes/widgets",
        headers: { host: "itsyouonline.com", cookie: visitorCookie },
      }),
      privVisitor,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(privVisitor.statusCode, 200);
    assert.strictEqual(privVisitor.body.widgets.length, 1);
    assert.strictEqual(privVisitor.body.widgets[0].id, visitorWidgetId);
  }
});

test("WPL-14 — Legacy NotNotes artifacts compatibility & Express controller parity", async () => {
  const db = createIsolatedTestDb();
  await db.init();
  const sql = db.sql;

  // Insert legacy NotNotes rows directly:
  // 1) Pre-publishing REACT_WIDGET lacking publicationStatus -> must default to "draft" & NOT leak publicly
  // 2) TEXT_NOTE approved artifact -> must not appear in widget lists or publicWidgets
  // 3) PENDING / REJECTED widget rows -> ignored
  db.tables.not_notes.push(
    {
      id: "legacy_widget_1",
      youniverseId: TEST_FIXTURES.owner.identityId,
      title: "LegacyPrivateWidget",
      content: { type: "REACT_WIDGET", code: "export default () => <div>Legacy</div>;", dependencies: [] },
      status: "APPROVED",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      id: "legacy_note_1",
      youniverseId: TEST_FIXTURES.owner.identityId,
      title: "PrivateJournalNote",
      content: { type: "TEXT_NOTE", body: "Confidential journal entry" },
      status: "APPROVED",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      id: "legacy_pending_widget",
      youniverseId: TEST_FIXTURES.owner.identityId,
      title: "PendingArtifactWidget",
      content: { type: "REACT_WIDGET", code: "export default () => <div>Pending</div>;", publicationStatus: "published" },
      status: "PENDING",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    }
  );

  // Public face sees 0 widgets (legacy REACT_WIDGET defaults private, TEXT_NOTE excluded, PENDING excluded)
  {
    const pubRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({ method: "GET", headers: {}, query: { handle: TEST_FIXTURES.owner.username, action: "public" } }),
      pubRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(pubRes.statusCode, 200);
    assert.deepStrictEqual(pubRes.body.publicWidgets, []);
  }

  // Express verifyJwt + controllers handle the full lifecycle cleanly
  const ownerCookie = await loginAs(sql, TEST_FIXTURES.owner);
  const rawToken = ownerCookie.replace("__youniverse_session=", "");
  const mwReq = {
    headers: { authorization: `Bearer ${rawToken}`, host: "itsyouonline.com" },
    body: {},
  };
  let verifiedNext = false;
  await verifyJwt(mwReq, createMockRes(), () => { verifiedNext = true; }, { sql, databaseUrl: "mock://local" });
  assert.strictEqual(verifiedNext, true);

  // Express GET widgets sees LegacyPrivateWidget as draft, ignores TEXT_NOTE & PENDING
  {
    const getRes = createMockRes();
    await getWeavedWidgetsHandler({ user: mwReq.user }, getRes, { sql });
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.body.widgets.length, 1);
    assert.strictEqual(getRes.body.widgets[0].id, "legacy_widget_1");
    assert.strictEqual(getRes.body.widgets[0].publicationStatus, "draft");
  }

  // Express save -> update -> publish -> unpublish
  {
    const saveRes = createMockRes();
    await saveWeaverArtifactHandler(
      { user: mwReq.user, body: { title: "ExpressWidget", code: "export default () => <div>E1</div>;" } },
      saveRes,
      { sql }
    );
    assert.strictEqual(saveRes.statusCode, 200);
    const exId = saveRes.body.artifact.id;
    assert.strictEqual(saveRes.body.artifact.publicationStatus, "draft");

    const updRes = createMockRes();
    await updateWeaverArtifactHandler(
      { user: mwReq.user, body: { id: exId, title: "ExpressWidget v2", code: "export default () => <div>E2</div>;" } },
      updRes,
      { sql }
    );
    assert.strictEqual(updRes.statusCode, 200);
    assert.strictEqual(updRes.body.widget.title, "ExpressWidget v2");

    const pubRes = createMockRes();
    await publishWeaverWidgetHandler(
      { user: mwReq.user, body: { id: exId } },
      pubRes,
      { sql }
    );
    assert.strictEqual(pubRes.statusCode, 200);
    assert.strictEqual(pubRes.body.widget.publicationStatus, "published");

    const pubFaceRes = createMockRes();
    await youniverseDispatcher(
      createMockReq({ method: "GET", headers: {}, query: { handle: TEST_FIXTURES.owner.username, action: "public" } }),
      pubFaceRes,
      { sql, databaseUrl: "mock://local" }
    );
    assert.strictEqual(pubFaceRes.body.publicWidgets.length, 1);
    assert.strictEqual(pubFaceRes.body.publicWidgets[0].id, exId);

    const unpubRes = createMockRes();
    await unpublishWeaverWidgetHandler(
      { user: mwReq.user, body: { id: exId } },
      unpubRes,
      { sql }
    );
    assert.strictEqual(unpubRes.statusCode, 200);
    assert.strictEqual(unpubRes.body.widget.publicationStatus, "unpublished");
  }
});
