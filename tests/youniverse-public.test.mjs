import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const entryPoint = fileURLToPath(
  new URL("../api/youniverse/[handle]/public.ts", import.meta.url)
);

const bundled = await build({
  entryPoints: [entryPoint],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{
    name: "mock-neon",
    setup(build) {
      build.onResolve(
        { filter: /^@neondatabase\/serverless$/ },
        () => ({ path: "neon-mock", namespace: "test-mock" })
      );
      build.onLoad(
        { filter: /.*/, namespace: "test-mock" },
        () => ({
          loader: "js",
          contents: `
            export function neon() {
              return async (strings, ...values) => {
                const state = globalThis.__publicProfileMock;
                state.calls++;
                state.values = values;
                if (state.error) throw state.error;
                return state.rows;
              };
            }
          `,
        })
      );
    },
  }],
});

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(bundled.outputFiles[0].text).toString("base64");

const { default: handler } = await import(moduleUrl);

function setup({ method = "GET", handle, rows = [], error = null } = {}) {
  globalThis.__publicProfileMock = {
    calls: 0,
    values: [],
    rows,
    error,
  };
  process.env.DATABASE_URL = "postgresql://mock.invalid/test";

  const req = {
    method,
    query: handle === undefined ? {} : { handle },
  };

  const headers = {};
  let statusCode;
  let body;

  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    },
  };

  return {
    req,
    res,
    headers,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

test("GET returns a live public profile and parameterizes the handle", async () => {
  const response = setup({
    handle: "@CREATOR-OF-THE-YOUNIVERSE",
    rows: [{
      username: "creator-of-the-youniverse",
      display_name: "Creator of the Youniverse",
      subdomain: "creator-of-the-youniverse",
      identity_type: "person",
      plan: "free",
      is_live: true,
    }],
  });

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(
    response.body.youniverse.handle,
    "creator-of-the-youniverse"
  );
  assert.equal(
    response.body.youniverse.displayName,
    "Creator of the Youniverse"
  );
  assert.deepEqual(response.body.publicWidgets, []);
  assert.deepEqual(
    globalThis.__publicProfileMock.values,
    ["creator-of-the-youniverse"]
  );
});

test("unknown profile returns 404", async () => {
  const response = setup({ handle: "unknown-person", rows: [] });

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "youniverse_not_found");
});

test("non-live profile returns 404", async () => {
  const response = setup({
    handle: "inactive-person",
    rows: [{
      username: "inactive-person",
      display_name: "Inactive Person",
      subdomain: "inactive-person",
      identity_type: "person",
      plan: "free",
      is_live: false,
    }],
  });

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "youniverse_not_found");
});

test("invalid handles return 400 without querying Neon", async (t) => {
  for (const handle of [
    undefined, [], "a", "-abc", "abc-", "abc_def",
    "a".repeat(51),
  ]) {
    await t.test(String(handle), async () => {
      const response = setup({ handle });

      await handler(response.req, response.res);

      assert.equal(response.statusCode, 400);
      assert.equal(response.body.error, "invalid_handle");
      assert.equal(globalThis.__publicProfileMock.calls, 0);
    });
  }
});

test("non-GET requests return 405 and advertise GET", async () => {
  const response = setup({ method: "POST", handle: "some-person" });

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "GET");
  assert.equal(globalThis.__publicProfileMock.calls, 0);
});

test("missing database configuration returns controlled 500", async () => {
  const response = setup({ handle: "some-person" });
  delete process.env.DATABASE_URL;

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "server_misconfiguration");
  assert.equal(globalThis.__publicProfileMock.calls, 0);
});

test("database errors return controlled 500", async () => {
  const response = setup({
    handle: "some-person",
    error: new Error("mock database failure"),
  });
  const originalError = console.error;
  console.error = () => {};

  try {
    await handler(response.req, response.res);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "public_profile_unavailable");
});

test("missing plan defaults to free", async () => {
  const response = setup({
    handle: "sample-person",
    rows: [{
      username: "sample-person",
      display_name: "Sample Person",
      subdomain: "sample-person",
      identity_type: "person",
      plan: null,
      is_live: true,
    }],
  });

  await handler(response.req, response.res);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.youniverse.plan, "free");
});
