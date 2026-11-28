/**
 * lib/booksOsBridge.ts
 *
 * Neon-backed Books OS archival bridge for NotNotes and Weaver.
 *
 * Matches the canonical Books OS coordinate taxonomy (`creator-of-the-youniverse/Books-OS`):
 *   - 14 Towers: JAN..DEC (calendar months), NEXUS (Tool Archive), BEFORE (Origin)
 *   - Shelf ID:  `${TOWER}-${YY}` (e.g. NOV-26) or `${TOWER}-${NN}` for NEXUS/BEFORE
 *   - Book ID:   `${SHELF_ID}-${LETTER}` (`A`–`J`):
 *       * Artifact books (`weaver_app_snapshot`, `notnote_artifact`): B, D, F, H (weeks 1–4)
 *       * Daily Volume books (`daily_record`):                        A, C, E, G (weeks 1–4)
 *
 * Security & durability invariants:
 *   - Strictly scoped to the authenticated owner's `youniverseId`.
 *   - Parameterized `@neondatabase/serverless` SQL queries only.
 *   - Deterministic SHA-256 `versionHash` prevents duplicate writes of unchanged content.
 *   - Optional authenticated webhook sync (`BOOKS_OS_WEBHOOK_URL` / `BOOKS_OS_API_SECRET`)
 *     never blocks or rolls back the durable Neon archival write.
 */

import { createHash, createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { assertSafeDatabaseTarget } from "./creatorOwnership.ts";
import {
  extractEntryCode,
  filterPublicFiles,
  type WeaverFileTree,
  type WeaverIteration,
} from "./weaverProject.ts";

export type BooksOsEntryType = "weaver_app_snapshot" | "notnote_artifact" | "daily_record";
export type BooksOsWebhookStatus = "skipped" | "synced" | "failed";

export interface BooksOsCoordinateOverride {
  tower?: string;
  shelf?: string;
  book?: string;
  page?: string;
}

export interface BooksOsCoordinates {
  towerId: string;
  shelfId: string;
  bookId: string;
  bookLetter: string;
  pageId: string | null;
}

export interface BooksOsArchiveBadge {
  recordId: string;
  towerId: string;
  shelfId: string;
  bookId: string;
  pageId: string | null;
  entryType: BooksOsEntryType;
  versionHash: string;
  archivedAt: string;
  webhookSyncStatus?: BooksOsWebhookStatus;
}

export interface BooksOsArchiveRecord {
  id: string;
  youniverseId: string;
  sourceArtifactId: string | null;
  entryType: BooksOsEntryType;
  towerId: string;
  shelfId: string;
  bookId: string;
  pageId: string | null;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  payloadJson: Record<string, unknown>;
  versionHash: string;
  webhookSyncStatus: BooksOsWebhookStatus;
  webhookSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BooksOsArchiveInput {
  youniverseId: string;
  entryType: BooksOsEntryType;
  title: string;
  summary?: string | null;
  bodyMarkdown?: string;
  payloadJson?: Record<string, unknown>;
  sourceArtifactId?: string | null;
  coordinates?: BooksOsCoordinateOverride;
  timestamp?: string;
}

export interface BooksOsArchiveResult {
  deduplicated: boolean;
  record: BooksOsArchiveRecord;
  badge: BooksOsArchiveBadge;
}

export interface BooksOsBridgeDeps {
  sql?: any;
  databaseUrl?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}

const MONTH_KEYS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const VALID_TOWER_KEYS = new Set<string>([...MONTH_KEYS, "NEXUS", "BEFORE"]);
const BOOK_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
const VALID_ENTRY_TYPES = new Set<BooksOsEntryType>([
  "weaver_app_snapshot",
  "notnote_artifact",
  "daily_record",
]);

function normalizeIdToken(raw: unknown, maxLen = 48): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!cleaned || cleaned.length > maxLen) return null;
  return cleaned;
}

/**
 * Resolves canonical Books OS Tower / Shelf / Book / Page coordinates matching
 * `Books-OS/stores/archiveReceiver.ts` & `Books-OS/stores/library.ts`.
 */
export function resolveBooksOsCoordinates(params: {
  entryType: BooksOsEntryType;
  timestamp?: string;
  override?: BooksOsCoordinateOverride;
}): BooksOsCoordinates {
  const parsedDate = params.timestamp ? new Date(params.timestamp) : new Date();
  const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const monthIndex = date.getUTCMonth(); // 0..11
  const year = date.getUTCFullYear();
  const day = date.getUTCDate();
  const weekOfMonth = Math.min(Math.max(Math.ceil(day / 7), 1), 4);

  const rawTower = normalizeIdToken(params.override?.tower, 16);
  const towerId = rawTower && VALID_TOWER_KEYS.has(rawTower) ? rawTower : MONTH_KEYS[monthIndex];

  const defaultShelfId =
    towerId === "NEXUS" || towerId === "BEFORE"
      ? `${towerId}-01`
      : `${towerId}-${String(year).slice(-2)}`;
  const overrideShelf = normalizeIdToken(params.override?.shelf, 32);
  const shelfId = overrideShelf ?? defaultShelfId;

  // Artifact slots: B(1), D(3), F(5), H(7). Daily volume slots: A(0), C(2), E(4), G(6).
  const defaultSlotIndex =
    params.entryType === "daily_record" ? (weekOfMonth - 1) * 2 : weekOfMonth * 2 - 1;
  let bookLetter: string = BOOK_LETTERS[defaultSlotIndex] ?? "B";
  let bookId = `${shelfId}-${bookLetter}`;

  const overrideBook = normalizeIdToken(params.override?.book, 48);
  if (overrideBook) {
    if (overrideBook.length === 1 && (BOOK_LETTERS as readonly string[]).includes(overrideBook)) {
      bookLetter = overrideBook;
      bookId = `${shelfId}-${bookLetter}`;
    } else {
      bookId = overrideBook;
      const suffixMatch = overrideBook.match(/-([A-J])$/);
      if (suffixMatch) {
        bookLetter = suffixMatch[1];
      }
    }
  }

  const overridePage = normalizeIdToken(params.override?.page, 32);
  const pageId = overridePage ?? `DAY-${String(day).padStart(2, "0")}`;

  return {
    towerId,
    shelfId,
    bookId,
    bookLetter,
    pageId,
  };
}

/**
 * Recursively sorts object keys for deterministic canonical JSON serialization.
 */
function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entryVal = (value as Record<string, unknown>)[key];
    if (entryVal !== undefined) {
      sorted[key] = canonicalizeValue(entryVal);
    }
  }
  return sorted;
}

export function computeArchiveVersionHash(params: {
  youniverseId: string;
  sourceArtifactId: string | null;
  entryType: BooksOsEntryType;
  title: string;
  bodyMarkdown: string;
  payloadJson: Record<string, unknown>;
}): string {
  const canonical = JSON.stringify(
    canonicalizeValue({
      youniverseId: params.youniverseId,
      sourceArtifactId: params.sourceArtifactId ?? "",
      entryType: params.entryType,
      title: params.title,
      bodyMarkdown: params.bodyMarkdown,
      payloadJson: params.payloadJson,
    })
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Builds a clean Books OS snapshot payload and Markdown summary for a Weaver
 * multi-file project (`App.tsx`, `components/*`, `manifest.json`, etc.).
 * Raw internal prompt history is excluded by default unless `includePromptHistory: true`.
 */
export function buildWeaverBooksOsSnapshot(params: {
  sourceArtifactId: string;
  title: string;
  files: WeaverFileTree;
  entryFile: string;
  dependencies?: string[];
  iterations?: WeaverIteration[];
  summary?: string | null;
  includePromptHistory?: boolean;
}): {
  summary: string;
  bodyMarkdown: string;
  payloadJson: Record<string, unknown>;
} {
  const publicFiles = filterPublicFiles(params.files);
  const sortedPaths = Object.keys(publicFiles).sort();
  const cleanFilesMap: Record<string, string> = {};
  for (const filePath of sortedPaths) {
    cleanFilesMap[filePath] = publicFiles[filePath].content;
  }

  const iterations = Array.isArray(params.iterations) ? params.iterations : [];
  const latestIteration = iterations.length > 0 ? iterations[iterations.length - 1] : null;
  const resolvedSummary =
    (typeof params.summary === "string" && params.summary.trim().length > 0
      ? params.summary.trim()
      : latestIteration?.summary?.trim()) || "Weaver multi-file application snapshot.";

  const dependencies = Array.isArray(params.dependencies)
    ? params.dependencies.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];

  const entryCode = extractEntryCode(params.files, params.entryFile);

  const mdLines: string[] = [
    `# ${params.title}`,
    "",
    resolvedSummary,
    "",
    `- **Entry File:** \`${params.entryFile}\``,
    `- **Files (${sortedPaths.length}):** ${sortedPaths.map((p) => `\`${p}\``).join(", ")}`,
  ];
  if (dependencies.length > 0) {
    mdLines.push(`- **Dependencies:** ${dependencies.map((d) => `\`${d}\``).join(", ")}`);
  }
  if (entryCode.trim()) {
    mdLines.push("", "## Entry Preview", "```tsx", entryCode.slice(0, 1200), "```");
  }

  const payloadJson: Record<string, unknown> = {
    kind: "weaver_app_snapshot",
    schemaVersion: 2,
    sourceArtifactId: params.sourceArtifactId,
    title: params.title,
    entryFile: params.entryFile,
    dependencies,
    summary: resolvedSummary,
    filePaths: sortedPaths,
    files: cleanFilesMap,
    // Compatible with Books-OS `stores/archiveReceiver.ts` ArchivePayload contract
    booksOsDeck: {
      deckId: `weaver-${params.sourceArtifactId}`,
      who: {
        tool: "Weaver",
        id: params.sourceArtifactId,
        color: "#8B5CF6",
      },
      slides: [
        {
          type: "cover",
          title: params.title,
          subtitle: "Weaver Multi-File Application Snapshot",
          meta: `${sortedPaths.length} file${sortedPaths.length === 1 ? "" : "s"} · Entry: ${params.entryFile}`,
        },
        {
          type: "statement",
          title: "Snapshot Summary",
          body: resolvedSummary,
        },
        {
          type: "bullets",
          title: "Archived Files",
          items: sortedPaths,
        },
      ],
    },
  };

  if (params.includePromptHistory === true && iterations.length > 0) {
    payloadJson.promptHistory = iterations.map((it) => ({
      id: it.id,
      prompt: it.prompt,
      summary: it.summary,
      changedFiles: it.changedFiles,
      createdAt: it.createdAt,
    }));
  }

  return {
    summary: resolvedSummary,
    bodyMarkdown: mdLines.join("\n"),
    payloadJson,
  };
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  const d = new Date(val as any);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function toIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  const d = new Date(val as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseJsonObject(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function mapRowToRecord(row: any): BooksOsArchiveRecord {
  const syncStatus = row.webhook_sync_status;
  const normalizedSync: BooksOsWebhookStatus =
    syncStatus === "synced" || syncStatus === "failed" ? syncStatus : "skipped";

  return {
    id: String(row.id),
    youniverseId: String(row.youniverse_id),
    sourceArtifactId: row.source_artifact_id ? String(row.source_artifact_id) : null,
    entryType: row.entry_type as BooksOsEntryType,
    towerId: String(row.tower_id),
    shelfId: String(row.shelf_id),
    bookId: String(row.book_id),
    pageId: row.page_id ? String(row.page_id) : null,
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    bodyMarkdown: typeof row.body_markdown === "string" ? row.body_markdown : "",
    payloadJson: parseJsonObject(row.payload_json),
    versionHash: String(row.version_hash),
    webhookSyncStatus: normalizedSync,
    webhookSyncedAt: toIsoOrNull(row.webhook_synced_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function recordToArchiveBadge(record: BooksOsArchiveRecord): BooksOsArchiveBadge {
  return {
    recordId: record.id,
    towerId: record.towerId,
    shelfId: record.shelfId,
    bookId: record.bookId,
    pageId: record.pageId,
    entryType: record.entryType,
    versionHash: record.versionHash,
    archivedAt: record.createdAt,
    webhookSyncStatus: record.webhookSyncStatus,
  };
}

export function sanitizeArchiveBadge(raw: unknown): BooksOsArchiveBadge | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const recordId = typeof obj.recordId === "string" ? obj.recordId.trim() : "";
  const towerId = typeof obj.towerId === "string" ? obj.towerId.trim() : "";
  const shelfId = typeof obj.shelfId === "string" ? obj.shelfId.trim() : "";
  const bookId = typeof obj.bookId === "string" ? obj.bookId.trim() : "";
  const versionHash = typeof obj.versionHash === "string" ? obj.versionHash.trim() : "";
  const entryType = obj.entryType as BooksOsEntryType;
  if (!recordId || !towerId || !shelfId || !bookId || !versionHash || !VALID_ENTRY_TYPES.has(entryType)) {
    return null;
  }
  const syncStatus = obj.webhookSyncStatus;
  return {
    recordId,
    towerId,
    shelfId,
    bookId,
    pageId: typeof obj.pageId === "string" && obj.pageId.trim() ? obj.pageId.trim() : null,
    entryType,
    versionHash,
    archivedAt: toIsoString(obj.archivedAt),
    ...(syncStatus === "skipped" || syncStatus === "synced" || syncStatus === "failed"
      ? { webhookSyncStatus: syncStatus }
      : {}),
  };
}

function resolveSql(deps: BooksOsBridgeDeps = {}) {
  if (deps.sql) return deps.sql;
  const env = deps.env ?? process.env;
  const databaseUrl = deps.databaseUrl ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured for Books OS archival.");
  }
  assertSafeDatabaseTarget(databaseUrl, env);
  return neon(databaseUrl);
}

async function dispatchBooksOsWebhook(
  record: BooksOsArchiveRecord,
  deps: BooksOsBridgeDeps
): Promise<{ status: BooksOsWebhookStatus; syncedAt: string | null }> {
  const env = deps.env ?? process.env;
  const webhookUrl = typeof env.BOOKS_OS_WEBHOOK_URL === "string" ? env.BOOKS_OS_WEBHOOK_URL.trim() : "";
  if (!webhookUrl) {
    return { status: "skipped", syncedAt: null };
  }

  const secret = typeof env.BOOKS_OS_API_SECRET === "string" ? env.BOOKS_OS_API_SECRET.trim() : "";
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { status: "failed", syncedAt: null };
  }

  const bodyObj = {
    recordId: record.id,
    youniverseId: record.youniverseId,
    sourceArtifactId: record.sourceArtifactId,
    entryType: record.entryType,
    coordinates: {
      towerId: record.towerId,
      shelfId: record.shelfId,
      bookId: record.bookId,
      pageId: record.pageId,
    },
    title: record.title,
    summary: record.summary,
    bodyMarkdown: record.bodyMarkdown,
    payload: record.payloadJson,
    versionHash: record.versionHash,
    timestamp: record.createdAt,
  };
  const bodyString = JSON.stringify(bodyObj);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Books-OS-Youniverse": record.youniverseId,
    "X-Books-OS-Version-Hash": record.versionHash,
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers["X-Books-OS-Secret"] = secret;
    headers["X-Books-OS-Signature"] = `sha256=${createHmac("sha256", secret).update(bodyString).digest("hex")}`;
  }

  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers,
      body: bodyString,
    });
    if (response && response.ok) {
      return { status: "synced", syncedAt: new Date().toISOString() };
    }
    console.warn(`[BooksOS Bridge] Webhook sync returned non-OK status: ${response?.status}`);
    return { status: "failed", syncedAt: null };
  } catch (err) {
    console.warn("[BooksOS Bridge] Webhook sync failed (Neon record preserved):", err);
    return { status: "failed", syncedAt: null };
  }
}

/**
 * Persists a durable, owner-scoped archival record in Neon PostgreSQL
 * (`books_os_archive_entries`) with deterministic SHA-256 idempotency and
 * optional authenticated Books OS webhook sync.
 */
export async function archiveToBooksOs(
  input: BooksOsArchiveInput,
  deps: BooksOsBridgeDeps = {}
): Promise<BooksOsArchiveResult> {
  const youniverseId = typeof input.youniverseId === "string" ? input.youniverseId.trim() : "";
  if (!youniverseId) {
    throw new Error("youniverseId is required for Books OS archival.");
  }
  if (!VALID_ENTRY_TYPES.has(input.entryType)) {
    throw new Error(`Invalid Books OS entryType: ${String(input.entryType)}`);
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    throw new Error("Archive title is required.");
  }

  const sourceArtifactId =
    typeof input.sourceArtifactId === "string" && input.sourceArtifactId.trim().length > 0
      ? input.sourceArtifactId.trim()
      : null;
  const summary =
    typeof input.summary === "string" && input.summary.trim().length > 0
      ? input.summary.trim()
      : null;
  const bodyMarkdown = typeof input.bodyMarkdown === "string" ? input.bodyMarkdown : "";
  const payloadJson =
    input.payloadJson && typeof input.payloadJson === "object" && !Array.isArray(input.payloadJson)
      ? input.payloadJson
      : {};

  const versionHash = computeArchiveVersionHash({
    youniverseId,
    sourceArtifactId,
    entryType: input.entryType,
    title,
    bodyMarkdown,
    payloadJson,
  });

  const sql = resolveSql(deps);

  // 1. Idempotency check (strictly scoped to owner's youniverse_id)
  const existingRows = sourceArtifactId
    ? await sql`
        SELECT id, youniverse_id, source_artifact_id, entry_type,
               tower_id, shelf_id, book_id, page_id,
               title, summary, body_markdown, payload_json,
               version_hash, webhook_sync_status, webhook_synced_at,
               created_at, updated_at
        FROM books_os_archive_entries
        WHERE youniverse_id = ${youniverseId}
          AND source_artifact_id = ${sourceArtifactId}
          AND version_hash = ${versionHash}
        LIMIT 1
      `
    : await sql`
        SELECT id, youniverse_id, source_artifact_id, entry_type,
               tower_id, shelf_id, book_id, page_id,
               title, summary, body_markdown, payload_json,
               version_hash, webhook_sync_status, webhook_synced_at,
               created_at, updated_at
        FROM books_os_archive_entries
        WHERE youniverse_id = ${youniverseId}
          AND source_artifact_id IS NULL
          AND version_hash = ${versionHash}
        LIMIT 1
      `;

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const record = mapRowToRecord(existingRows[0]);
    return {
      deduplicated: true,
      record,
      badge: recordToArchiveBadge(record),
    };
  }

  // 2. Resolve canonical Books OS Tower/Shelf/Book/Page coordinates
  const nowIso = input.timestamp && !Number.isNaN(new Date(input.timestamp).getTime())
    ? new Date(input.timestamp).toISOString()
    : new Date().toISOString();
  const coords = resolveBooksOsCoordinates({
    entryType: input.entryType,
    timestamp: nowIso,
    override: input.coordinates,
  });

  const id = `bos_${nanoid(16)}`;
  const payloadJsonString = JSON.stringify(payloadJson);

  await sql`
    INSERT INTO books_os_archive_entries (
      id,
      youniverse_id,
      source_artifact_id,
      entry_type,
      tower_id,
      shelf_id,
      book_id,
      page_id,
      title,
      summary,
      body_markdown,
      payload_json,
      version_hash,
      webhook_sync_status,
      webhook_synced_at,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${youniverseId},
      ${sourceArtifactId},
      ${input.entryType},
      ${coords.towerId},
      ${coords.shelfId},
      ${coords.bookId},
      ${coords.pageId},
      ${title},
      ${summary},
      ${bodyMarkdown},
      ${payloadJsonString}::jsonb,
      ${versionHash},
      'skipped',
      NULL,
      NOW(),
      NOW()
    )
  `;

  let record: BooksOsArchiveRecord = {
    id,
    youniverseId,
    sourceArtifactId,
    entryType: input.entryType,
    towerId: coords.towerId,
    shelfId: coords.shelfId,
    bookId: coords.bookId,
    pageId: coords.pageId,
    title,
    summary,
    bodyMarkdown,
    payloadJson,
    versionHash,
    webhookSyncStatus: "skipped",
    webhookSyncedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // 3. Optional authenticated webhook sync
  const webhookOutcome = await dispatchBooksOsWebhook(record, deps);
  if (webhookOutcome.status !== "skipped") {
    await sql`
      UPDATE books_os_archive_entries
      SET webhook_sync_status = ${webhookOutcome.status},
          webhook_synced_at = ${webhookOutcome.syncedAt},
          updated_at = NOW()
      WHERE id = ${id}
        AND youniverse_id = ${youniverseId}
    `;
    record = {
      ...record,
      webhookSyncStatus: webhookOutcome.status,
      webhookSyncedAt: webhookOutcome.syncedAt,
    };
  }

  return {
    deduplicated: false,
    record,
    badge: recordToArchiveBadge(record),
  };
}

/**
 * Lists Books OS archive records strictly scoped to the owner's `youniverseId`.
 */
export async function listBooksOsArchives(
  youniverseId: string,
  options: { sourceArtifactId?: string; limit?: number } = {},
  deps: BooksOsBridgeDeps = {}
): Promise<BooksOsArchiveRecord[]> {
  const cleanOwnerId = typeof youniverseId === "string" ? youniverseId.trim() : "";
  if (!cleanOwnerId) {
    throw new Error("youniverseId is required.");
  }
  const sql = resolveSql(deps);
  const limit = Math.min(Math.max(Number(options.limit ?? 50) || 50, 1), 200);

  const rows = options.sourceArtifactId
    ? await sql`
        SELECT id, youniverse_id, source_artifact_id, entry_type,
               tower_id, shelf_id, book_id, page_id,
               title, summary, body_markdown, payload_json,
               version_hash, webhook_sync_status, webhook_synced_at,
               created_at, updated_at
        FROM books_os_archive_entries
        WHERE youniverse_id = ${cleanOwnerId}
          AND source_artifact_id = ${options.sourceArtifactId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, youniverse_id, source_artifact_id, entry_type,
               tower_id, shelf_id, book_id, page_id,
               title, summary, body_markdown, payload_json,
               version_hash, webhook_sync_status, webhook_synced_at,
               created_at, updated_at
        FROM books_os_archive_entries
        WHERE youniverse_id = ${cleanOwnerId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  return (Array.isArray(rows) ? rows : [])
    .filter((r: any) => String(r.youniverse_id) === cleanOwnerId)
    .map(mapRowToRecord);
}
