import assert from "node:assert";
import fs from "node:fs";

// Load public/sw.js and extract the fetch listener logic in a simulated worker environment
const swCode = fs.readFileSync("public/sw.js", "utf8");

async function runTests() {
  console.log("Starting Service Worker focused test suite...\n");

  let fetchHandler = null;
  const mockSelf = {
    location: { origin: "https://itsyouonline.com" },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    addEventListener: (type, handler) => {
      if (type === "fetch") fetchHandler = handler;
    },
  };

  // Evaluate sw.js in mock sandbox
  const fn = new Function("self", "Response", swCode);
  fn(mockSelf, Response);

  assert.ok(typeof fetchHandler === "function", "Fetch handler must be registered");

  // Test 1: Cross-origin request must be bypassed (respondWith NOT called)
  {
    let respondWithCalled = false;
    const event = {
      request: {
        method: "GET",
        url: "https://placeholder.supabase.co/rest/v1/broadcasts",
        mode: "cors",
      },
      respondWith: () => { respondWithCalled = true; },
    };
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, "Cross-origin request must NOT be intercepted by service worker");
    console.log("✔ Test 1: Cross-origin request bypassed cleanly");
  }

  // Test 2: WebSocket or non-http protocol must be bypassed
  {
    let respondWithCalled = false;
    const event = {
      request: {
        method: "GET",
        url: "wss://placeholder.supabase.co/realtime/v1/websocket",
      },
      respondWith: () => { respondWithCalled = true; },
    };
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, "WebSocket URL must NOT be intercepted by service worker");
    console.log("✔ Test 2: WebSocket protocol bypassed cleanly");
  }

  // Test 3: Local /api/ proxy endpoints must be bypassed
  {
    let respondWithCalled = false;
    const event = {
      request: {
        method: "GET",
        url: "https://itsyouonline.com/api/claim",
        mode: "cors",
      },
      respondWith: () => { respondWithCalled = true; },
    };
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, "Local /api/ routes must NOT be intercepted by service worker");
    console.log("✔ Test 3: Local /api/ proxy routes bypassed cleanly");
  }

  // Test 4: Same-origin static asset with failed network & no cache returns valid Response (never undefined)
  {
    let promisePassed = null;
    const event = {
      request: {
        method: "GET",
        url: "https://itsyouonline.com/assets/missing.js",
        mode: "no-cors",
      },
      respondWith: (p) => { promisePassed = p; },
    };

    // Global mock for caches and fetch
    globalThis.caches = {
      match: async () => undefined,
      open: async () => ({ put: () => {} }),
    };
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch (network error)"); };

    fetchHandler(event);
    assert.ok(promisePassed, "respondWith must receive a promise for same-origin asset");

    const resolved = await promisePassed;
    assert.ok(resolved instanceof Response, "respondWith must resolve to a valid Response instance");
    assert.strictEqual(resolved.status, 504, "Failed fetch with no cache must resolve to 504 Gateway Timeout Response");
    console.log("✔ Test 4: Failed fetch without cache resolves to 504 Response (never undefined)");
  }

  // Test 5: Same-origin navigation with failed network and no cache returns 503 Response
  {
    let promisePassed = null;
    const event = {
      request: {
        method: "GET",
        url: "https://itsyouonline.com/some/page",
        mode: "navigate",
      },
      respondWith: (p) => { promisePassed = p; },
    };

    globalThis.caches = {
      match: async () => undefined,
    };
    globalThis.fetch = async () => { throw new TypeError("Network down"); };

    fetchHandler(event);
    assert.ok(promisePassed, "respondWith must receive a promise for navigation");

    const resolved = await promisePassed;
    assert.ok(resolved instanceof Response, "Navigation fallback must resolve to a valid Response instance");
    assert.strictEqual(resolved.status, 503, "Offline navigation without cached index.html must return 503 Response");
    console.log("✔ Test 5: Offline navigation without cache resolves to 503 Response");
  }

  console.log("\nAll 5 service worker tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
