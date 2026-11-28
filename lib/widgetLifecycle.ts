/**
 * lib/widgetLifecycle.ts
 *
 * Shared, dependency-light widget content & publication lifecycle helpers for
 * NotNotes, Weaver, and Youniverse public retrieval.
 *
 * Security invariants:
 *  - Legacy widgets without an explicit `publicationStatus` default to `"draft"`
 *    so previously saved private widgets never expose publicly by accident.
 *  - Public serialization strips internal timestamps/metadata and private
 *    prompt/iteration history except safe display fields (`id`, `title`,
 *    `content`, `code`, `dependencies`, `files`, `entryFile`, `publishedAt`,
 *    `updatedAt`).
 */

import {
  DEFAULT_SANDBOX_CONFIG,
  WEAVER_DEFAULT_ENTRY_FILE,
  extractEntryCode,
  filterPublicFiles,
  sanitizeFileTree,
  sanitizeIterations,
  sanitizeSandboxConfig,
  sanitizeVirtualPath,
  synthesizeFileTreeFromLegacyCode,
  type PublicVirtualFile,
  type WeaverFileTree,
  type WeaverIteration,
  type WeaverSandboxConfig,
} from "./weaverProject.ts";
import { sanitizeArchiveBadge, type BooksOsArchiveBadge } from "./booksOsBridge.ts";

export type WidgetPublicationStatus = "draft" | "published" | "unpublished";

export interface ParsedWidgetContent {
  type: string;
  schemaVersion: 1 | 2;
  code: string;
  dependencies: string[];
  entryFile: string;
  files: WeaverFileTree;
  iterations: WeaverIteration[];
  sandboxConfig: WeaverSandboxConfig;
  publicationStatus: WidgetPublicationStatus;
  publishedAt: string | null;
  unpublishedAt: string | null;
  booksOsArchive: BooksOsArchiveBadge | null;
}

export interface OwnerWidgetDTO {
  id: string;
  youniverseId: string;
  title: string;
  schemaVersion: 1 | 2;
  code: string;
  dependencies: string[];
  entryFile: string;
  files: WeaverFileTree;
  iterations: WeaverIteration[];
  sandboxConfig: WeaverSandboxConfig;
  content: ParsedWidgetContent;
  status: string;
  publicationStatus: WidgetPublicationStatus;
  isPublished: boolean;
  publishedAt: string | null;
  unpublishedAt: string | null;
  booksOsArchive: BooksOsArchiveBadge | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PublicWidgetDTO {
  id: string;
  title: string;
  schemaVersion: 1 | 2;
  entryFile: string;
  files: Record<string, PublicVirtualFile>;
  content: {
    type: "REACT_WIDGET";
    code: string;
    dependencies: string[];
  };
  code: string;
  dependencies: string[];
  publishedAt: string | null;
  updatedAt: string;
}

function toIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  const d = new Date(val as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function sanitizeWidgetDependencies(rawDeps: unknown): string[] {
  if (!Array.isArray(rawDeps)) return [];
  return rawDeps
    .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    .map((d) => d.trim());
}

export function normalizeWidgetPublicationStatus(content: any): WidgetPublicationStatus {
  const status = typeof content?.publicationStatus === "string"
    ? content.publicationStatus.trim().toLowerCase()
    : "";
  if (status === "published") return "published";
  if (status === "unpublished") return "unpublished";
  return "draft";
}

function resolveEntryFileForTree(files: WeaverFileTree, rawEntryFile: unknown): string {
  const candidate = sanitizeVirtualPath(rawEntryFile);
  if (candidate && files[candidate]) return candidate;
  if (files[WEAVER_DEFAULT_ENTRY_FILE]) return WEAVER_DEFAULT_ENTRY_FILE;
  const firstKey = Object.keys(files)[0];
  return firstKey ?? WEAVER_DEFAULT_ENTRY_FILE;
}

export function parseWidgetContent(rawContent: unknown): ParsedWidgetContent | null {
  let obj: any = rawContent;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const dependencies = sanitizeWidgetDependencies(obj.dependencies);
  const publicationStatus = normalizeWidgetPublicationStatus(obj);
  const iterations = sanitizeIterations(obj.iterations);
  const sandboxConfig = sanitizeSandboxConfig(obj.sandboxConfig);

  let schemaVersion: 1 | 2 = 1;
  let entryFile = WEAVER_DEFAULT_ENTRY_FILE;
  let files: WeaverFileTree;
  let code = typeof obj.code === "string" ? obj.code : "";

  if (obj.files !== undefined && obj.files !== null) {
    const filesRes = sanitizeFileTree(obj.files);
    if (filesRes.ok && Object.keys(filesRes.files).length > 0) {
      schemaVersion = 2;
      files = filesRes.files;
      entryFile = resolveEntryFileForTree(files, obj.entryFile);
      if (!code) {
        code = extractEntryCode(files, entryFile);
      }
    } else {
      files = synthesizeFileTreeFromLegacyCode("Widget", code, dependencies);
    }
  } else {
    files = synthesizeFileTreeFromLegacyCode("Widget", code, dependencies);
  }

  return {
    type: typeof obj.type === "string" ? obj.type : "",
    schemaVersion,
    code,
    dependencies,
    entryFile,
    files,
    iterations,
    sandboxConfig,
    publicationStatus,
    publishedAt: toIsoOrNull(obj.publishedAt),
    unpublishedAt: toIsoOrNull(obj.unpublishedAt),
    booksOsArchive: sanitizeArchiveBadge(obj.booksOsArchive),
  };
}

export function buildWidgetContentPayload(params: {
  code?: string;
  dependencies?: unknown;
  files?: WeaverFileTree;
  entryFile?: string;
  iterations?: WeaverIteration[];
  sandboxConfig?: WeaverSandboxConfig;
  publicationStatus: WidgetPublicationStatus;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  booksOsArchive?: BooksOsArchiveBadge | null;
}): ParsedWidgetContent {
  const dependencies = sanitizeWidgetDependencies(params.dependencies);
  const iterations = sanitizeIterations(params.iterations);
  const sandboxConfig = params.sandboxConfig
    ? sanitizeSandboxConfig(params.sandboxConfig)
    : { ...DEFAULT_SANDBOX_CONFIG, activeChips: { ...DEFAULT_SANDBOX_CONFIG.activeChips } };
  const publishedAt = params.publishedAt ? toIsoOrNull(params.publishedAt) : null;
  const unpublishedAt = params.unpublishedAt ? toIsoOrNull(params.unpublishedAt) : null;
  const booksOsArchive = sanitizeArchiveBadge(params.booksOsArchive);

  if (params.files && Object.keys(params.files).length > 0) {
    const entryFile = resolveEntryFileForTree(params.files, params.entryFile);
    const code = extractEntryCode(params.files, entryFile);
    return {
      type: "REACT_WIDGET",
      schemaVersion: 2,
      code,
      dependencies,
      entryFile,
      files: params.files,
      iterations,
      sandboxConfig,
      publicationStatus: params.publicationStatus,
      publishedAt,
      unpublishedAt,
      booksOsArchive,
    };
  }

  const code = String(params.code ?? "");
  return {
    type: "REACT_WIDGET",
    schemaVersion: 1,
    code,
    dependencies,
    entryFile: WEAVER_DEFAULT_ENTRY_FILE,
    files: synthesizeFileTreeFromLegacyCode("Widget", code, dependencies),
    iterations,
    sandboxConfig,
    publicationStatus: params.publicationStatus,
    publishedAt,
    unpublishedAt,
    booksOsArchive,
  };
}

export type ResolveProjectFieldsResult =
  | {
      ok: true;
      files?: WeaverFileTree;
      entryFile?: string;
      iterations?: WeaverIteration[];
      sandboxConfig?: WeaverSandboxConfig;
    }
  | {
      ok: false;
      status: 400 | 413;
      error: string;
      message: string;
    };

export function resolveProjectFieldsFromBody(
  body: any,
  existing?: ParsedWidgetContent | null
): ResolveProjectFieldsResult {
  let files: WeaverFileTree | undefined;
  let entryFile: string | undefined;

  if (body?.files !== undefined) {
    const sanitized = sanitizeFileTree(body.files);
    if (!sanitized.ok) {
      const isTooLarge =
        sanitized.error === "payload_too_large" || sanitized.error === "too_many_files";
      return {
        ok: false,
        status: isTooLarge ? 413 : 400,
        error: isTooLarge ? "payload_too_large" : "bad_request",
        message: sanitized.message,
      };
    }

    if (Object.keys(sanitized.files).length === 0) {
      return {
        ok: false,
        status: 400,
        error: "bad_request",
        message: "Project files cannot be empty.",
      };
    }

    if (body.entryFile !== undefined) {
      const cleanEntry = sanitizeVirtualPath(body.entryFile);
      if (!cleanEntry || !sanitized.files[cleanEntry]) {
        return {
          ok: false,
          status: 400,
          error: "bad_request",
          message: "entryFile must reference an existing file in files.",
        };
      }
      entryFile = cleanEntry;
    } else if (existing?.entryFile && sanitized.files[existing.entryFile]) {
      entryFile = existing.entryFile;
    } else if (sanitized.files[WEAVER_DEFAULT_ENTRY_FILE]) {
      entryFile = WEAVER_DEFAULT_ENTRY_FILE;
    } else {
      return {
        ok: false,
        status: 400,
        error: "bad_request",
        message: "entryFile missing: App.tsx or explicit entryFile is required.",
      };
    }

    files = sanitized.files;
  } else if (existing && existing.schemaVersion === 2) {
    entryFile = existing.entryFile;
    files = { ...existing.files };

    if (body?.entryFile !== undefined) {
      const cleanEntry = sanitizeVirtualPath(body.entryFile);
      if (!cleanEntry || !files[cleanEntry]) {
        return {
          ok: false,
          status: 400,
          error: "bad_request",
          message: "entryFile must reference an existing file in files.",
        };
      }
      entryFile = cleanEntry;
    }

    if (typeof body?.code === "string" && body.code.trim().length > 0 && files[entryFile]) {
      files[entryFile] = {
        ...files[entryFile],
        content: body.code,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  let iterations: WeaverIteration[] | undefined;
  if (body?.iterations !== undefined) {
    if (!Array.isArray(body.iterations)) {
      return {
        ok: false,
        status: 400,
        error: "bad_request",
        message: "iterations must be an array.",
      };
    }
    iterations = sanitizeIterations(body.iterations);
  } else {
    iterations = existing?.iterations;
  }

  const sandboxConfig =
    body?.sandboxConfig !== undefined
      ? sanitizeSandboxConfig(body.sandboxConfig)
      : existing?.sandboxConfig;

  return {
    ok: true,
    files,
    entryFile,
    iterations,
    sandboxConfig,
  };
}

export function formatOwnerWidget(row: any, fallbackYouniverseId?: string): OwnerWidgetDTO | null {
  const parsed = parseWidgetContent(row?.content);
  if (!parsed || parsed.type !== "REACT_WIDGET") {
    return null;
  }

  const publicationStatus = parsed.publicationStatus;
  const createdAt = toIsoOrNull(row?.createdAt);
  const updatedAt = toIsoOrNull(row?.updatedAt) ?? createdAt;

  return {
    id: String(row.id),
    youniverseId: String(row.youniverseId ?? fallbackYouniverseId ?? ""),
    title: String(row.title ?? ""),
    schemaVersion: parsed.schemaVersion,
    code: parsed.code,
    dependencies: parsed.dependencies,
    entryFile: parsed.entryFile,
    files: parsed.files,
    iterations: parsed.iterations,
    sandboxConfig: parsed.sandboxConfig,
    content: parsed,
    status: String(row.status ?? "APPROVED"),
    publicationStatus,
    isPublished: publicationStatus === "published",
    publishedAt: parsed.publishedAt,
    unpublishedAt: parsed.unpublishedAt,
    booksOsArchive: parsed.booksOsArchive,
    createdAt,
    updatedAt,
  };
}

export function formatPublicWidget(row: any): PublicWidgetDTO | null {
  if (String(row?.status ?? "APPROVED") !== "APPROVED") {
    return null;
  }
  const parsed = parseWidgetContent(row?.content);
  if (!parsed || parsed.type !== "REACT_WIDGET") {
    return null;
  }
  if (parsed.publicationStatus !== "published") {
    return null;
  }
  if (!parsed.code.trim()) {
    return null;
  }

  const updatedAt =
    toIsoOrNull(row?.updatedAt) ??
    toIsoOrNull(row?.createdAt) ??
    parsed.publishedAt ??
    new Date().toISOString();

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    schemaVersion: parsed.schemaVersion,
    entryFile: parsed.entryFile,
    files: filterPublicFiles(parsed.files),
    content: {
      type: "REACT_WIDGET",
      code: parsed.code,
      dependencies: parsed.dependencies,
    },
    code: parsed.code,
    dependencies: parsed.dependencies,
    publishedAt: parsed.publishedAt,
    updatedAt,
  };
}
