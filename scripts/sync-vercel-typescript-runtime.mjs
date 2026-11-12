#!/usr/bin/env node
/**
 * scripts/sync-vercel-typescript-runtime.mjs
 *
 * Deterministic post-build packaging step for Vercel Serverless Functions.
 *
 * Context (Phase 7G.12):
 * - Vercel builds compile API routes via @vercel/node (ts.transpileModule).
 * - @vercel/node transpiles `lib/*.ts` into `lib/*.js` inside function bundles,
 *   but leaves relative import specifiers ending in `.ts` untouched in `api/*.js`.
 * - In Node 24 ESM runtime, Node fails with ERR_MODULE_NOT_FOUND if the literal `.ts`
 *   files are absent from disk in the deployed bundle.
 * - This script inspects generated function bundles, identifies all relative `.ts`
 *   imports required by each handler, copies only those exact source `.ts` files into
 *   the bundle, and validates complete runtime module resolution before deployment.
 *
 * Invariants:
 * - Idempotent
 * - Preserves existing .js bundles (never overwrites .js)
 * - Fails closed if any bundle, source file, or import is missing
 * - Zero external dependencies (uses node:fs and node:path only)
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const OUTPUT_DIR = path.join(REPO_ROOT, ".vercel", "output");
const FUNCTIONS_DIR = path.join(OUTPUT_DIR, "functions");

// Critical handlers that require TypeScript runtime packaging
const REQUIRED_HANDLERS = [
  "api/claim.func",
  "api/genesis/[action].func",
  "api/stripe/[action].func",
  "api/v1/auth/verify.func",
  "api/verify-token.func",
  "api/youniverseIdentity.func",
  "api/youniverse/[handle]/context.func",
  "api/youniverse/[handle]/public.func",
];

// Regex to detect relative imports ending in .ts
const RELATIVE_TS_IMPORT_REGEX = /(?:from\s+|import\s*\(?|import\s+)["'](\.[^"']*\.ts)["']/g;

function fail(message) {
  console.error(`[sync-vercel-ts-runtime] ERROR: ${message}`);
  process.exit(1);
}

function extractTsImports(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const imports = new Set();
  let match;
  while ((match = RELATIVE_TS_IMPORT_REGEX.exec(content)) !== null) {
    imports.add(match[1]);
  }
  return Array.from(imports);
}

function findFuncDirectories(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".func")) {
        list.push(fullPath);
      } else {
        findFuncDirectories(fullPath, list);
      }
    }
  }
  return list;
}

async function main() {
  console.log("[sync-vercel-ts-runtime] Starting TypeScript runtime packaging sync...");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fail(`.vercel/output directory not found at ${OUTPUT_DIR}. Run 'vercel build --yes' first.`);
  }
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    fail(`.vercel/output/functions directory not found at ${FUNCTIONS_DIR}.`);
  }

  // 1. Verify required function bundles exist
  for (const relFunc of REQUIRED_HANDLERS) {
    const targetFunc = path.join(FUNCTIONS_DIR, relFunc);
    if (!fs.existsSync(targetFunc)) {
      fail(`Required function bundle missing: ${relFunc}`);
    }
  }

  // 2. Scan all .func directories in .vercel/output/functions
  const allFuncDirs = findFuncDirectories(FUNCTIONS_DIR);
  let totalCopied = 0;
  const syncSummary = [];

  for (const funcDir of allFuncDirs) {
    const vcConfigPath = path.join(funcDir, ".vc-config.json");
    if (!fs.existsSync(vcConfigPath)) continue;

    let vcConfig;
    try {
      vcConfig = JSON.parse(fs.readFileSync(vcConfigPath, "utf8"));
    } catch (err) {
      fail(`Malformed .vc-config.json in ${funcDir}: ${err.message}`);
    }

    const handlerRel = vcConfig.handler;
    if (!handlerRel || !handlerRel.endsWith(".js")) continue;

    const bundleEntryPath = path.join(funcDir, handlerRel);
    if (!fs.existsSync(bundleEntryPath)) continue;

    // Map compiled handler (.js) back to source (.ts)
    const sourceRel = handlerRel.replace(/\.js$/, ".ts");
    const repoSourcePath = path.join(REPO_ROOT, sourceRel);

    const visitedInBundle = new Set();
    const queue = [];

    // Queue initial handler entrypoint imports
    const initialImports = extractTsImports(bundleEntryPath);
    for (const specifier of initialImports) {
      queue.push({
        specifier,
        bundleImporterDir: path.dirname(bundleEntryPath),
        repoImporterDir: path.dirname(repoSourcePath),
      });
    }

    const copiedForBundle = [];

    while (queue.length > 0) {
      const { specifier, bundleImporterDir, repoImporterDir } = queue.shift();

      const repoResolved = path.resolve(repoImporterDir, specifier);
      const bundleResolved = path.resolve(bundleImporterDir, specifier);

      if (visitedInBundle.has(bundleResolved)) continue;
      visitedInBundle.add(bundleResolved);

      if (!fs.existsSync(repoResolved)) {
        fail(
          `Cannot resolve source .ts import '${specifier}' referenced by ${bundleImporterDir}. File not found in repo: ${repoResolved}`
        );
      }

      // Ensure target directory exists in bundle
      const bundleDestDir = path.dirname(bundleResolved);
      if (!fs.existsSync(bundleDestDir)) {
        fs.mkdirSync(bundleDestDir, { recursive: true });
      }

      // Check if file is already identical (idempotence)
      const srcContent = fs.readFileSync(repoResolved);
      let needsCopy = true;
      if (fs.existsSync(bundleResolved)) {
        const existingContent = fs.readFileSync(bundleResolved);
        if (srcContent.equals(existingContent)) {
          needsCopy = false;
        }
      }

      if (needsCopy) {
        fs.writeFileSync(bundleResolved, srcContent);
        totalCopied++;
      }

      const relFromFunc = path.relative(funcDir, bundleResolved).replace(/\\/g, "/");
      copiedForBundle.push(relFromFunc);

      // Recursively scan copied .ts file for transitive relative .ts imports
      const nestedImports = extractTsImports(repoResolved);
      for (const nested of nestedImports) {
        queue.push({
          specifier: nested,
          bundleImporterDir: path.dirname(bundleResolved),
          repoImporterDir: path.dirname(repoResolved),
        });
      }
    }

    if (copiedForBundle.length > 0) {
      const relFuncName = path.relative(FUNCTIONS_DIR, funcDir).replace(/\\/g, "/");
      syncSummary.push({
        bundle: relFuncName,
        files: copiedForBundle,
      });
    }
  }

  // 3. Validation pass: verify all 5 critical entrypoints resolve cleanly
  console.log("[sync-vercel-ts-runtime] Validating bundled module resolution...");
  for (const relFunc of REQUIRED_HANDLERS) {
    const funcDir = path.join(FUNCTIONS_DIR, relFunc);
    const vcConfig = JSON.parse(fs.readFileSync(path.join(funcDir, ".vc-config.json"), "utf8"));
    const bundleEntry = path.join(funcDir, vcConfig.handler);

    // Dynamic import test in Node 24 runtime
    try {
      const fileUrl = pathToFileURL(bundleEntry).href;
      const mod = await import(fileUrl);
      if (typeof mod.default !== "function") {
        fail(`Bundle ${relFunc} default export is not a function (got ${typeof mod.default})`);
      }
    } catch (err) {
      fail(`Runtime import verification failed for ${relFunc}: ${err.message}`);
    }
  }

  console.log(`[sync-vercel-ts-runtime] Sync completed successfully.`);
  console.log(`[sync-vercel-ts-runtime] Bundles updated: ${syncSummary.length}`);
  for (const s of syncSummary) {
    console.log(`  - ${s.bundle}: [${s.files.join(", ")}]`);
  }
  console.log("[sync-vercel-ts-runtime] All required serverless handlers verified ready for deployment.\n");
}

main().catch((err) => {
  fail(`Unhandled error: ${err.message}`);
});

