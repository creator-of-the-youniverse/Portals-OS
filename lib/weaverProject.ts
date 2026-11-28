/**
 * lib/weaverProject.ts
 *
 * Pure, dependency-free multi-file Weaver project domain model, path/tree
 * sanitization, manifest synchronization, and targeted operation helpers.
 *
 * Shared across frontend Zustand state, Vercel serverless functions, and
 * Express controllers. Must contain zero DOM/React/Node-specific imports
 * and use only erasable TypeScript syntax for direct Node `.ts` execution.
 */

export type WeaverFileLanguage = "tsx" | "ts" | "jsx" | "js" | "css" | "json" | "md";

export interface WeaverVirtualFile {
  path: string;
  content: string;
  language: WeaverFileLanguage;
  updatedAt?: string | null;
}

export type WeaverFileTree = Record<string, WeaverVirtualFile>;

export interface WeaverAiChips {
  imageGen: boolean;
  structuredJson: boolean;
  liveGrounding: boolean;
  collectionPoint: boolean;
}

export type WeaverSandboxViewport = "desktop" | "mobile";

export interface WeaverSandboxConfig {
  viewport: WeaverSandboxViewport;
  autoRefresh: boolean;
  activeChips: WeaverAiChips;
}

export interface WeaverFileOperation {
  action: "upsert" | "delete";
  path: string;
  content?: string;
  reason?: string;
}

export interface WeaverIteration {
  id: string;
  prompt: string;
  summary: string;
  aiChips: WeaverAiChips;
  changedFiles: string[];
  createdAt: string;
  model?: string;
  durationMs?: number;
  snapshot?: Record<string, string>;
}

export interface PublicVirtualFile {
  path: string;
  content: string;
  language: WeaverFileLanguage;
}

export const WEAVER_DEFAULT_ENTRY_FILE = "App.tsx";
export const WEAVER_PROTECTED_FILES = ["App.tsx", "manifest.json"] as const;
export const WEAVER_MAX_FILES = 30;
export const WEAVER_MAX_TREE_BYTES = 250_000;
export const WEAVER_MAX_ITERATIONS = 25;
export const WEAVER_MAX_SNAPSHOT_BYTES = 60_000;

export const DEFAULT_AI_CHIPS: WeaverAiChips = {
  imageGen: false,
  structuredJson: false,
  liveGrounding: false,
  collectionPoint: false,
};

export const DEFAULT_SANDBOX_CONFIG: WeaverSandboxConfig = {
  viewport: "desktop",
  autoRefresh: true,
  activeChips: { ...DEFAULT_AI_CHIPS },
};

const ALLOWED_ROOT_FILES = new Set([
  "App.tsx",
  "App.jsx",
  "styles.css",
  "manifest.json",
  "README.md",
]);

const ALLOWED_ROOT_FOLDERS = new Set([
  "components",
  "api",
  "lib",
  "types",
  "data",
  "styles",
  "hooks",
]);

const SEGMENT_REGEX = /^[A-Za-z0-9_.-]+$/;
const textEncoder = new TextEncoder();

export function inferLanguage(filePath: string): WeaverFileLanguage | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "md";
  return null;
}

export function sanitizeVirtualPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let normalized = raw.trim().replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  if (!normalized || normalized.length > 160) return null;
  if (normalized.startsWith("/") || normalized.includes("\0") || normalized.includes(":")) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.length === 0 || segments.length > 4) return null;

  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || !SEGMENT_REGEX.test(seg)) {
      return null;
    }
  }

  if (segments.length === 1) {
    if (!ALLOWED_ROOT_FILES.has(segments[0])) {
      return null;
    }
  } else if (!ALLOWED_ROOT_FOLDERS.has(segments[0])) {
    return null;
  }

  const lang = inferLanguage(normalized);
  if (!lang) return null;

  return normalized;
}

function measureTreeBytes(files: WeaverFileTree): number {
  let total = 0;
  for (const file of Object.values(files)) {
    total += textEncoder.encode(file.path).byteLength;
    total += textEncoder.encode(file.content).byteLength;
  }
  return total;
}

export type SanitizeFileTreeResult =
  | { ok: true; files: WeaverFileTree }
  | {
      ok: false;
      error: "invalid_path" | "too_many_files" | "payload_too_large" | "invalid_files";
      message: string;
    };

export function sanitizeFileTree(raw: unknown): SanitizeFileTreeResult {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: "invalid_files",
      message: "Project files must be an object map or array of file entries.",
    };
  }

  const entries: Array<{ rawPath: unknown; rawValue: unknown }> = Array.isArray(raw)
    ? raw.map((item) => ({
        rawPath: item && typeof item === "object" ? (item as any).path : undefined,
        rawValue: item,
      }))
    : Object.entries(raw as Record<string, unknown>).map(([rawPath, rawValue]) => ({
        rawPath,
        rawValue,
      }));

  const files: WeaverFileTree = {};

  for (const { rawPath, rawValue } of entries) {
    const cleanPath = sanitizeVirtualPath(rawPath);
    if (!cleanPath) {
      return {
        ok: false,
        error: "invalid_path",
        message: `Invalid virtual file path: "${String(rawPath)}".`,
      };
    }

    let content: unknown;
    let updatedAt: string | null | undefined;
    if (typeof rawValue === "string") {
      content = rawValue;
    } else if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      content = (rawValue as any).content;
      const rawUpdatedAt = (rawValue as any).updatedAt;
      if (typeof rawUpdatedAt === "string" && Number.isFinite(Date.parse(rawUpdatedAt))) {
        updatedAt = new Date(rawUpdatedAt).toISOString();
      }
    } else {
      return {
        ok: false,
        error: "invalid_files",
        message: `File "${cleanPath}" has an invalid payload.`,
      };
    }

    if (typeof content !== "string") {
      return {
        ok: false,
        error: "invalid_files",
        message: `File "${cleanPath}" content must be a string.`,
      };
    }

    const language = inferLanguage(cleanPath)!;
    files[cleanPath] = {
      path: cleanPath,
      content,
      language,
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  if (Object.keys(files).length > WEAVER_MAX_FILES) {
    return {
      ok: false,
      error: "too_many_files",
      message: `Project cannot exceed ${WEAVER_MAX_FILES} files.`,
    };
  }

  if (measureTreeBytes(files) > WEAVER_MAX_TREE_BYTES) {
    return {
      ok: false,
      error: "payload_too_large",
      message: `Project virtual file tree exceeds ${WEAVER_MAX_TREE_BYTES} byte limit.`,
    };
  }

  return { ok: true, files };
}

export function sanitizeAiChips(raw: unknown): WeaverAiChips {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    imageGen: obj.imageGen === true,
    structuredJson: obj.structuredJson === true,
    liveGrounding: obj.liveGrounding === true,
    collectionPoint: obj.collectionPoint === true,
  };
}

export function sanitizeSandboxConfig(raw: unknown): WeaverSandboxConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const viewport: WeaverSandboxViewport = obj.viewport === "mobile" ? "mobile" : "desktop";
  const autoRefresh = obj.autoRefresh === false ? false : true;
  return {
    viewport,
    autoRefresh,
    activeChips: sanitizeAiChips(obj.activeChips),
  };
}

function generateFallbackId(): string {
  return `iter_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeIterations(raw: unknown): WeaverIteration[] {
  if (!Array.isArray(raw)) return [];

  const sliced = raw.slice(-WEAVER_MAX_ITERATIONS);
  const result: WeaverIteration[] = [];

  for (const item of sliced) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;

    const id =
      typeof rec.id === "string" && rec.id.trim().length > 0
        ? rec.id.trim().slice(0, 80)
        : generateFallbackId();
    const prompt = typeof rec.prompt === "string" ? rec.prompt.slice(0, 4_000) : "";
    const summary = typeof rec.summary === "string" ? rec.summary.slice(0, 2_000) : "";
    const aiChips = sanitizeAiChips(rec.aiChips);

    const changedFiles = Array.isArray(rec.changedFiles)
      ? Array.from(
          new Set(
            rec.changedFiles
              .map((p) => sanitizeVirtualPath(p))
              .filter((p): p is string => p !== null)
          )
        )
      : [];

    const createdAt =
      typeof rec.createdAt === "string" && Number.isFinite(Date.parse(rec.createdAt))
        ? new Date(rec.createdAt).toISOString()
        : new Date().toISOString();

    const model =
      typeof rec.model === "string" && rec.model.trim().length > 0
        ? rec.model.trim().slice(0, 120)
        : undefined;

    const durationMs =
      typeof rec.durationMs === "number" && Number.isFinite(rec.durationMs) && rec.durationMs >= 0
        ? Math.round(rec.durationMs)
        : undefined;

    let snapshot: Record<string, string> | undefined;
    if (rec.snapshot && typeof rec.snapshot === "object" && !Array.isArray(rec.snapshot)) {
      const candidate: Record<string, string> = {};
      let valid = true;
      for (const [k, v] of Object.entries(rec.snapshot as Record<string, unknown>)) {
        const cleanKey = sanitizeVirtualPath(k);
        if (!cleanKey || typeof v !== "string") {
          valid = false;
          break;
        }
        candidate[cleanKey] = v;
      }
      if (valid) {
        const serializedBytes = textEncoder.encode(JSON.stringify(candidate)).byteLength;
        if (serializedBytes <= WEAVER_MAX_SNAPSHOT_BYTES) {
          snapshot = candidate;
        }
      }
    }

    result.push({
      id,
      prompt,
      summary,
      aiChips,
      changedFiles,
      createdAt,
      ...(model !== undefined ? { model } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
    });
  }

  return result;
}

export function buildManifestContent(
  title: string,
  dependencies: string[] = [],
  aiChips: WeaverAiChips = DEFAULT_AI_CHIPS,
  existingManifestRaw?: string
): string {
  let base: Record<string, unknown> = {};
  if (existingManifestRaw) {
    try {
      const parsed = JSON.parse(existingManifestRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      base = {};
    }
  }

  const capabilities: string[] = [];
  if (aiChips.imageGen) capabilities.push("imageGen");
  if (aiChips.structuredJson) capabilities.push("structuredJson");
  if (aiChips.liveGrounding) capabilities.push("liveGrounding");
  if (aiChips.collectionPoint) capabilities.push("collectionPoint");

  const nextManifest = {
    ...base,
    name: title.trim() || "WeaverProject",
    version: typeof base.version === "string" ? base.version : "0.1.0",
    entry: typeof base.entry === "string" ? base.entry : WEAVER_DEFAULT_ENTRY_FILE,
    dependencies: Array.from(
      new Set(
        dependencies
          .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
          .map((d) => d.trim())
      )
    ),
    capabilities,
  };

  return JSON.stringify(nextManifest, null, 2);
}

export function syncManifestWithProject(
  files: WeaverFileTree,
  meta: { title: string; dependencies?: string[]; aiChips?: WeaverAiChips }
): WeaverFileTree {
  const existing = files["manifest.json"]?.content;
  const manifestContent = buildManifestContent(
    meta.title,
    meta.dependencies ?? [],
    meta.aiChips ?? DEFAULT_AI_CHIPS,
    existing
  );
  return {
    ...files,
    "manifest.json": {
      path: "manifest.json",
      content: manifestContent,
      language: "json",
      updatedAt: new Date().toISOString(),
    },
  };
}

export function createStarterWeaverProject(title = "WeaverProject"): {
  entryFile: string;
  files: WeaverFileTree;
} {
  const cleanTitle = title.trim() || "WeaverProject";
  const now = new Date().toISOString();

  const appCode = `import React from "react";
import { HeroCard } from "./components/HeroCard";

export default function App() {
  return (
    <main className="weaver-shell min-h-full p-6 flex items-center justify-center">
      <HeroCard
        title=${JSON.stringify(cleanTitle)}
        subtitle="Multi-file sovereign workspace ready for synthesis."
      />
    </main>
  );
}
`;

  const heroCardCode = `import React from "react";

interface HeroCardProps {
  title: string;
  subtitle: string;
}

export function HeroCard({ title, subtitle }: HeroCardProps) {
  return (
    <section className="max-w-md w-full rounded-2xl border border-violet-500/30 bg-zinc-900/80 p-6 shadow-xl backdrop-blur-md">
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-mono mb-3">
        Weaver AI Studio
      </div>
      <h1 className="text-xl font-bold text-zinc-100 tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-zinc-400 leading-relaxed">{subtitle}</p>
    </section>
  );
}
`;

  const stylesCss = `.weaver-shell {
  background: radial-gradient(circle at top, rgba(139, 92, 246, 0.14), transparent 60%);
}
`;

  const manifestJson = buildManifestContent(cleanTitle, [], DEFAULT_AI_CHIPS);

  return {
    entryFile: WEAVER_DEFAULT_ENTRY_FILE,
    files: {
      "App.tsx": { path: "App.tsx", content: appCode, language: "tsx", updatedAt: now },
      "components/HeroCard.tsx": {
        path: "components/HeroCard.tsx",
        content: heroCardCode,
        language: "tsx",
        updatedAt: now,
      },
      "styles.css": { path: "styles.css", content: stylesCss, language: "css", updatedAt: now },
      "manifest.json": {
        path: "manifest.json",
        content: manifestJson,
        language: "json",
        updatedAt: now,
      },
    },
  };
}

export function synthesizeFileTreeFromLegacyCode(
  title: string,
  code: string,
  dependencies: string[] = []
): WeaverFileTree {
  const cleanTitle = title.trim() || "Widget";
  return {
    "App.tsx": {
      path: "App.tsx",
      content: String(code ?? ""),
      language: "tsx",
    },
    "styles.css": {
      path: "styles.css",
      content: "",
      language: "css",
    },
    "manifest.json": {
      path: "manifest.json",
      content: buildManifestContent(cleanTitle, dependencies, DEFAULT_AI_CHIPS),
      language: "json",
    },
  };
}

export function applyWeaverOperations(
  base: WeaverFileTree,
  ops: WeaverFileOperation[]
): {
  files: WeaverFileTree;
  changedPaths: string[];
  deletedPaths: string[];
  rejected: string[];
} {
  const next: WeaverFileTree = { ...base };
  const changedPaths = new Set<string>();
  const deletedPaths = new Set<string>();
  const rejected: string[] = [];
  const protectedSet = new Set<string>(WEAVER_PROTECTED_FILES);
  const now = new Date().toISOString();

  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    const cleanPath = sanitizeVirtualPath(op.path);
    if (!cleanPath) {
      rejected.push(String((op as any).path ?? ""));
      continue;
    }

    if (op.action === "delete") {
      if (protectedSet.has(cleanPath)) {
        rejected.push(cleanPath);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(next, cleanPath)) {
        delete next[cleanPath];
        deletedPaths.add(cleanPath);
        changedPaths.delete(cleanPath);
      }
      continue;
    }

    if (op.action === "upsert") {
      if (typeof op.content !== "string") {
        rejected.push(cleanPath);
        continue;
      }
      const existing = next[cleanPath];
      const language = inferLanguage(cleanPath)!;
      if (!existing || existing.content !== op.content) {
        next[cleanPath] = {
          path: cleanPath,
          content: op.content,
          language,
          updatedAt: now,
        };
        changedPaths.add(cleanPath);
        deletedPaths.delete(cleanPath);
      }
    }
  }

  return {
    files: next,
    changedPaths: Array.from(changedPaths),
    deletedPaths: Array.from(deletedPaths),
    rejected,
  };
}

export function extractEntryCode(files: WeaverFileTree, entryFile = WEAVER_DEFAULT_ENTRY_FILE): string {
  return files[entryFile]?.content ?? files[WEAVER_DEFAULT_ENTRY_FILE]?.content ?? "";
}

export function fileTreeToContentMap(files: WeaverFileTree): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [path, file] of Object.entries(files)) {
    map[path] = file.content;
  }
  return map;
}

export function filterPublicFiles(
  files: WeaverFileTree
): Record<string, PublicVirtualFile> {
  const out: Record<string, PublicVirtualFile> = {};
  for (const [rawPath, file] of Object.entries(files)) {
    const cleanPath = sanitizeVirtualPath(rawPath);
    if (!cleanPath || !file || typeof file.content !== "string") continue;
    const lang = inferLanguage(cleanPath);
    if (!lang) continue;
    out[cleanPath] = {
      path: cleanPath,
      content: file.content,
      language: lang,
    };
  }
  return out;
}
