/**
 * store/weaverStore.ts
 *
 * Ephemeral Zustand workspace store for the Weaver Multi-File AI Studio.
 * Intentionally NOT persisted to localStorage — NotNotes (Neon PostgreSQL)
 * is the authoritative working-memory persistence layer for the active Youniverse.
 */

import { create } from "zustand";
import type { WeavedWidget, BooksOsArchiveBadge } from "../types.ts";
import type { WeaverElementAnnotation } from "../lib/windowMessageSecurity.ts";
import {
  DEFAULT_SANDBOX_CONFIG,
  WEAVER_DEFAULT_ENTRY_FILE,
  WEAVER_MAX_SNAPSHOT_BYTES,
  WEAVER_PROTECTED_FILES,
  applyWeaverOperations,
  createStarterWeaverProject,
  extractEntryCode,
  fileTreeToContentMap,
  inferLanguage,
  sanitizeAiChips,
  sanitizeFileTree,
  sanitizeIterations,
  sanitizeSandboxConfig,
  sanitizeVirtualPath,
  syncManifestWithProject,
  synthesizeFileTreeFromLegacyCode,
  type WeaverAiChips,
  type WeaverFileOperation,
  type WeaverFileTree,
  type WeaverIteration,
  type WeaverSandboxConfig,
  type WeaverSandboxViewport,
} from "../lib/weaverProject.ts";

export type WeaverPublicationStatus = "draft" | "published" | "unpublished";
export type WeaverGenerationStatus = "idle" | "loading" | "success" | "error";
export type WeaverEditorMode = "code" | "diff";
export type WeaverActionBusy = "idle" | "saving" | "publishing" | "unpublishing" | "archiving";

export interface WeaverGenerationMeta {
  model?: string;
  generatedAt?: string;
  durationMs?: number;
}

export interface WeaverActionBanner {
  kind: "ok" | "err";
  text: string;
}

export interface WeaverDiagnosticDeliverable {
  agentId: string;
  agentName: string;
  agentRole?: string;
  content: string;
  notNoteId?: string;
}

export interface WeaverDiagnosticSpec {
  projectTitle: string;
  prompt: string;
  recommendedChips?: Partial<WeaverAiChips>;
  agentDeliverableSummary?: string;
  sourceAgentIds: string[];
  deliverables?: WeaverDiagnosticDeliverable[];
  diagnosisHeadline?: string;
}

export interface WeaverDiagnosticSource {
  headline: string | null;
  sourceAgentIds: string[];
  deliverableCount: number;
  summary: string | null;
}

export interface WeaverNotNotePayload {
  id?: string;
  title: string;
  code: string;
  dependencies: string[];
  files: Record<string, string>;
  entryFile: string;
  iterations: WeaverIteration[];
  sandboxConfig: WeaverSandboxConfig;
}

export interface ApplyGenerationResultInput {
  prompt: string;
  summary?: string;
  title?: string;
  entryFile?: string;
  files?: unknown;
  operations?: WeaverFileOperation[];
  changedPaths?: string[];
  dependencies?: string[];
  meta?: WeaverGenerationMeta | null;
}

export interface WeaverStoreState {
  activeProjectId: string | null;
  title: string;
  publicationStatus: WeaverPublicationStatus | null;
  entryFile: string;
  files: WeaverFileTree;
  previousFiles: WeaverFileTree;
  selectedFilePath: string;
  dependencies: string[];
  iterations: WeaverIteration[];
  sandboxConfig: WeaverSandboxConfig;
  dirty: boolean;
  prompt: string;
  generationStatus: WeaverGenerationStatus;
  generationError: string | null;
  runtimeErrors: string[];
  runtimeWarnings: string[];
  editorMode: WeaverEditorMode;
  annotationMode: boolean;
  selectedAnnotation: WeaverElementAnnotation | null;
  savedProjects: WeavedWidget[];
  isLoadingProjects: boolean;
  actionBusy: WeaverActionBusy;
  actionBanner: WeaverActionBanner | null;
  busyRowId: string | null;
  lastMeta: WeaverGenerationMeta | null;
  lastArchive: BooksOsArchiveBadge | null;
  archiveOnPublish: boolean;
  diagnosticSource: WeaverDiagnosticSource | null;

  initNewProject: (title?: string) => void;
  loadDiagnosticSpec: (spec: WeaverDiagnosticSpec) => void;
  hydrateFromNotNote: (widget: WeavedWidget) => void;
  markSaved: (widget: WeavedWidget) => void;
  setPublicationStatus: (status: WeaverPublicationStatus | null) => void;
  setLastArchive: (badge: BooksOsArchiveBadge | null) => void;
  setArchiveOnPublish: (enabled: boolean) => void;
  setTitle: (title: string) => void;
  setPrompt: (prompt: string) => void;
  selectFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  createFile: (path: string, content?: string) => boolean;
  deleteFile: (path: string) => boolean;
  revertFileToPrevious: (path: string) => void;
  setEditorMode: (mode: WeaverEditorMode) => void;
  toggleAnnotationMode: () => void;
  setAnnotationMode: (enabled: boolean) => void;
  setSelectedAnnotation: (annotation: WeaverElementAnnotation | null) => void;
  clearSelectedAnnotation: () => void;
  toggleAiChip: (key: keyof WeaverAiChips) => void;
  setViewport: (viewport: WeaverSandboxViewport) => void;
  toggleAutoRefresh: () => void;
  pushRuntimeError: (msg: string) => void;
  clearRuntimeErrors: () => void;
  pushRuntimeWarning: (msg: string) => void;
  setGenerationStatus: (status: WeaverGenerationStatus, error?: string | null) => void;
  applyGenerationResult: (result: ApplyGenerationResultInput) => void;
  restoreIteration: (id: string) => boolean;
  setSavedProjects: (projects: WeavedWidget[]) => void;
  setIsLoadingProjects: (loading: boolean) => void;
  setActionBusy: (busy: WeaverActionBusy) => void;
  setActionBanner: (banner: WeaverActionBanner | null) => void;
  setBusyRowId: (id: string | null) => void;
  resetForYouniverseSwitch: () => void;
  buildNotNotePayload: () => WeaverNotNotePayload;
}

const textEncoder = new TextEncoder();
const PROTECTED_FILE_SET = new Set<string>(WEAVER_PROTECTED_FILES);

function cloneFileTree(files: WeaverFileTree): WeaverFileTree {
  const out: WeaverFileTree = {};
  for (const [k, v] of Object.entries(files)) {
    out[k] = { ...v };
  }
  return out;
}

function createInitialWorkspaceFields(title = "WeaverProject") {
  const starter = createStarterWeaverProject(title);
  return {
    activeProjectId: null as string | null,
    title: title.trim() || "WeaverProject",
    publicationStatus: null as WeaverPublicationStatus | null,
    entryFile: starter.entryFile,
    files: starter.files,
    previousFiles: cloneFileTree(starter.files),
    selectedFilePath: starter.entryFile,
    dependencies: [] as string[],
    iterations: [] as WeaverIteration[],
    sandboxConfig: sanitizeSandboxConfig(DEFAULT_SANDBOX_CONFIG),
    dirty: false,
    prompt: "",
    generationStatus: "idle" as WeaverGenerationStatus,
    generationError: null as string | null,
    runtimeErrors: [] as string[],
    runtimeWarnings: [] as string[],
    editorMode: "code" as WeaverEditorMode,
    annotationMode: false,
    selectedAnnotation: null as WeaverElementAnnotation | null,
    actionBusy: "idle" as WeaverActionBusy,
    actionBanner: null as WeaverActionBanner | null,
    lastMeta: null as WeaverGenerationMeta | null,
    lastArchive: null as BooksOsArchiveBadge | null,
    archiveOnPublish: false,
    diagnosticSource: null as WeaverDiagnosticSource | null,
  };
}

export const useWeaverStore = create<WeaverStoreState>((set, get) => ({
  ...createInitialWorkspaceFields(),
  savedProjects: [],
  isLoadingProjects: false,
  busyRowId: null,

  initNewProject: (title = "WeaverProject") =>
    set(() => ({
      ...createInitialWorkspaceFields(title),
    })),

  loadDiagnosticSpec: (spec) =>
    set(() => {
      const cleanTitle =
        typeof spec.projectTitle === "string" && spec.projectTitle.trim().length > 0
          ? spec.projectTitle.trim().slice(0, 80)
          : "OracleBuild";
      const base = createInitialWorkspaceFields(cleanTitle);
      const activeChips = sanitizeAiChips(spec.recommendedChips);
      const syncedFiles = syncManifestWithProject(base.files, {
        title: cleanTitle,
        dependencies: [],
        aiChips: activeChips,
      });

      const deliverables = Array.isArray(spec.deliverables) ? spec.deliverables : [];
      const sourceAgentIds = Array.isArray(spec.sourceAgentIds)
        ? Array.from(
            new Set(
              spec.sourceAgentIds
                .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
                .map((id) => id.trim().toUpperCase())
            )
          )
        : [];

      const promptParts: string[] = [];
      if (typeof spec.prompt === "string" && spec.prompt.trim()) {
        promptParts.push(spec.prompt.trim());
      }
      if (typeof spec.agentDeliverableSummary === "string" && spec.agentDeliverableSummary.trim()) {
        promptParts.push(`\nOracle Synthesis:\n${spec.agentDeliverableSummary.trim()}`);
      }
      if (deliverables.length > 0) {
        const formattedDeliverables = deliverables
          .map(
            (d) =>
              `### ${d.agentName}${d.agentRole ? ` (${d.agentRole})` : ""} [${d.agentId}]\n${d.content.trim().slice(0, 800)}`
          )
          .join("\n\n");
        promptParts.push(`\nNotNotes Agent Deliverables:\n${formattedDeliverables}`);
      }

      const fullPrompt = promptParts.join("\n").slice(0, 3_900);
      const deliverableCount = deliverables.length > 0 ? deliverables.length : sourceAgentIds.length;

      return {
        ...base,
        files: syncedFiles,
        previousFiles: cloneFileTree(syncedFiles),
        sandboxConfig: {
          ...base.sandboxConfig,
          activeChips,
        },
        prompt: fullPrompt,
        dirty: true,
        diagnosticSource: {
          headline: spec.diagnosisHeadline?.trim() || null,
          sourceAgentIds,
          deliverableCount,
          summary: spec.agentDeliverableSummary?.trim() || null,
        },
        actionBanner: {
          kind: "ok",
          text: `Loaded Oracle diagnostic build spec (${deliverableCount} agent deliverable${deliverableCount === 1 ? "" : "s"}).`,
        },
      };
    }),

  hydrateFromNotNote: (widget) =>
    set(() => {
      const hasMultiFile =
        widget.files &&
        typeof widget.files === "object" &&
        Object.keys(widget.files).length > 0;

      let resolvedFiles: WeaverFileTree;
      if (hasMultiFile) {
        const sanitized = sanitizeFileTree(widget.files);
        resolvedFiles =
          sanitized.ok && Object.keys(sanitized.files).length > 0
            ? sanitized.files
            : synthesizeFileTreeFromLegacyCode(widget.title, widget.code, widget.dependencies);
      } else {
        resolvedFiles = synthesizeFileTreeFromLegacyCode(
          widget.title,
          widget.code,
          widget.dependencies
        );
      }

      const candidateEntry = sanitizeVirtualPath(widget.entryFile);
      const entryFile =
        candidateEntry && resolvedFiles[candidateEntry]
          ? candidateEntry
          : resolvedFiles[WEAVER_DEFAULT_ENTRY_FILE]
            ? WEAVER_DEFAULT_ENTRY_FILE
            : Object.keys(resolvedFiles)[0] ?? WEAVER_DEFAULT_ENTRY_FILE;

      return {
        activeProjectId: widget.id,
        title: widget.title,
        publicationStatus: widget.publicationStatus ?? "draft",
        entryFile,
        files: resolvedFiles,
        previousFiles: cloneFileTree(resolvedFiles),
        selectedFilePath: entryFile,
        dependencies: Array.isArray(widget.dependencies) ? [...widget.dependencies] : [],
        iterations: sanitizeIterations(widget.iterations),
        sandboxConfig: sanitizeSandboxConfig(widget.sandboxConfig),
        dirty: false,
        generationStatus: "success",
        generationError: null,
        runtimeErrors: [],
        runtimeWarnings: [],
        actionBanner: null,
        lastArchive: widget.booksOsArchive ?? null,
      };
    }),

  markSaved: (widget) =>
    set((state) => ({
      activeProjectId: widget.id,
      title: widget.title || state.title,
      publicationStatus: widget.publicationStatus ?? state.publicationStatus ?? "draft",
      previousFiles: cloneFileTree(state.files),
      dirty: false,
      lastArchive: widget.booksOsArchive ?? state.lastArchive,
    })),

  setPublicationStatus: (publicationStatus) => set({ publicationStatus }),
  setLastArchive: (lastArchive) => set({ lastArchive }),
  setArchiveOnPublish: (archiveOnPublish) => set({ archiveOnPublish }),

  setTitle: (title) => set({ title, dirty: true }),

  setPrompt: (prompt) => set({ prompt }),

  selectFile: (path) =>
    set((state) => {
      const cleanPath = sanitizeVirtualPath(path);
      if (!cleanPath || !state.files[cleanPath]) return state;
      return { selectedFilePath: cleanPath };
    }),

  updateFileContent: (path, content) =>
    set((state) => {
      const cleanPath = sanitizeVirtualPath(path);
      if (!cleanPath || !state.files[cleanPath]) return state;
      if (state.files[cleanPath].content === content) return state;
      return {
        files: {
          ...state.files,
          [cleanPath]: {
            ...state.files[cleanPath],
            content,
            updatedAt: new Date().toISOString(),
          },
        },
        dirty: true,
      };
    }),

  createFile: (path, content = "") => {
    const cleanPath = sanitizeVirtualPath(path);
    if (!cleanPath) return false;
    const state = get();
    if (state.files[cleanPath]) return false;
    const language = inferLanguage(cleanPath);
    if (!language) return false;

    set({
      files: {
        ...state.files,
        [cleanPath]: {
          path: cleanPath,
          content,
          language,
          updatedAt: new Date().toISOString(),
        },
      },
      selectedFilePath: cleanPath,
      dirty: true,
    });
    return true;
  },

  deleteFile: (path) => {
    const cleanPath = sanitizeVirtualPath(path);
    if (!cleanPath || PROTECTED_FILE_SET.has(cleanPath)) return false;
    const state = get();
    if (!state.files[cleanPath]) return false;

    const nextFiles = { ...state.files };
    delete nextFiles[cleanPath];

    const nextSelected =
      state.selectedFilePath === cleanPath
        ? nextFiles[state.entryFile]
          ? state.entryFile
          : Object.keys(nextFiles)[0] ?? WEAVER_DEFAULT_ENTRY_FILE
        : state.selectedFilePath;

    set({
      files: nextFiles,
      selectedFilePath: nextSelected,
      dirty: true,
    });
    return true;
  },

  revertFileToPrevious: (path) =>
    set((state) => {
      const cleanPath = sanitizeVirtualPath(path);
      if (!cleanPath) return state;
      const prevFile = state.previousFiles[cleanPath];
      if (!prevFile) return state;
      return {
        files: {
          ...state.files,
          [cleanPath]: { ...prevFile },
        },
        dirty: true,
      };
    }),

  setEditorMode: (editorMode) => set({ editorMode }),

  toggleAnnotationMode: () =>
    set((state) => ({ annotationMode: !state.annotationMode })),

  setAnnotationMode: (annotationMode) => set({ annotationMode }),

  setSelectedAnnotation: (selectedAnnotation) =>
    set({ selectedAnnotation, annotationMode: false }),

  clearSelectedAnnotation: () => set({ selectedAnnotation: null }),

  toggleAiChip: (key) =>
    set((state) => ({
      sandboxConfig: {
        ...state.sandboxConfig,
        activeChips: {
          ...state.sandboxConfig.activeChips,
          [key]: !state.sandboxConfig.activeChips[key],
        },
      },
      dirty: true,
    })),

  setViewport: (viewport) =>
    set((state) => ({
      sandboxConfig: {
        ...state.sandboxConfig,
        viewport,
      },
      dirty: true,
    })),

  toggleAutoRefresh: () =>
    set((state) => ({
      sandboxConfig: {
        ...state.sandboxConfig,
        autoRefresh: !state.sandboxConfig.autoRefresh,
      },
      dirty: true,
    })),

  pushRuntimeError: (msg) =>
    set((state) => {
      const clean = String(msg ?? "").trim();
      if (!clean) return state;
      const deduped = [clean, ...state.runtimeErrors.filter((e) => e !== clean)].slice(0, 20);
      return { runtimeErrors: deduped };
    }),

  clearRuntimeErrors: () => set({ runtimeErrors: [] }),

  pushRuntimeWarning: (msg) =>
    set((state) => {
      const clean = String(msg ?? "").trim();
      if (!clean) return state;
      const deduped = [clean, ...state.runtimeWarnings.filter((w) => w !== clean)].slice(0, 20);
      return { runtimeWarnings: deduped };
    }),

  setGenerationStatus: (generationStatus, error = null) =>
    set({
      generationStatus,
      generationError: error ?? null,
    }),

  applyGenerationResult: (result) =>
    set((state) => {
      const previousFiles = cloneFileTree(state.files);
      let nextFiles: WeaverFileTree = state.files;
      let changedFiles: string[] = [];

      if (Array.isArray(result.operations)) {
        const applied = applyWeaverOperations(state.files, result.operations);
        nextFiles = applied.files;
        changedFiles =
          result.changedPaths && result.changedPaths.length > 0
            ? result.changedPaths
            : Array.from(new Set([...applied.changedPaths, ...applied.deletedPaths]));
      } else if (result.files !== undefined) {
        const sanitized = sanitizeFileTree(result.files);
        if (sanitized.ok && Object.keys(sanitized.files).length > 0) {
          nextFiles = sanitized.files;
          changedFiles =
            result.changedPaths && result.changedPaths.length > 0
              ? result.changedPaths
              : Object.keys(nextFiles);
        }
      }

      const nextTitle =
        typeof result.title === "string" && result.title.trim().length > 0
          ? result.title.trim()
          : state.title;
      const nextDeps = Array.isArray(result.dependencies)
        ? result.dependencies
        : state.dependencies;

      nextFiles = syncManifestWithProject(nextFiles, {
        title: nextTitle,
        dependencies: nextDeps,
        aiChips: state.sandboxConfig.activeChips,
      });

      const candidateEntry = sanitizeVirtualPath(result.entryFile);
      const nextEntryFile =
        candidateEntry && nextFiles[candidateEntry]
          ? candidateEntry
          : nextFiles[state.entryFile]
            ? state.entryFile
            : nextFiles[WEAVER_DEFAULT_ENTRY_FILE]
              ? WEAVER_DEFAULT_ENTRY_FILE
              : Object.keys(nextFiles)[0] ?? WEAVER_DEFAULT_ENTRY_FILE;

      const snapshotMap = fileTreeToContentMap(previousFiles);
      const snapshotBytes = textEncoder.encode(JSON.stringify(snapshotMap)).byteLength;

      const iteration: WeaverIteration = {
        id: `iter_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: result.prompt,
        summary: result.summary ?? "Applied workspace changes.",
        aiChips: sanitizeAiChips(state.sandboxConfig.activeChips),
        changedFiles,
        createdAt: new Date().toISOString(),
        ...(result.meta?.model ? { model: result.meta.model } : {}),
        ...(typeof result.meta?.durationMs === "number"
          ? { durationMs: result.meta.durationMs }
          : {}),
        ...(snapshotBytes <= WEAVER_MAX_SNAPSHOT_BYTES ? { snapshot: snapshotMap } : {}),
      };

      const nextIterations = sanitizeIterations([...state.iterations, iteration]);
      const firstChanged = changedFiles.find((p) => Boolean(nextFiles[p]));
      const nextSelected =
        firstChanged ??
        (nextFiles[state.selectedFilePath] ? state.selectedFilePath : nextEntryFile);

      return {
        title: nextTitle,
        entryFile: nextEntryFile,
        files: nextFiles,
        previousFiles,
        selectedFilePath: nextSelected,
        dependencies: nextDeps,
        iterations: nextIterations,
        dirty: true,
        runtimeErrors: [],
        generationStatus: "success",
        generationError: null,
        lastMeta: result.meta ?? state.lastMeta,
      };
    }),

  restoreIteration: (id) => {
    const state = get();
    const target = state.iterations.find((it) => it.id === id);
    if (!target || !target.snapshot) return false;

    const sanitized = sanitizeFileTree(target.snapshot);
    if (!sanitized.ok || Object.keys(sanitized.files).length === 0) return false;

    const previousFiles = cloneFileTree(state.files);
    const nextEntryFile = sanitized.files[state.entryFile]
      ? state.entryFile
      : sanitized.files[WEAVER_DEFAULT_ENTRY_FILE]
        ? WEAVER_DEFAULT_ENTRY_FILE
        : Object.keys(sanitized.files)[0] ?? WEAVER_DEFAULT_ENTRY_FILE;

    set({
      previousFiles,
      files: sanitized.files,
      entryFile: nextEntryFile,
      selectedFilePath: sanitized.files[state.selectedFilePath]
        ? state.selectedFilePath
        : nextEntryFile,
      dirty: true,
      runtimeErrors: [],
    });
    return true;
  },

  setSavedProjects: (savedProjects) => set({ savedProjects }),
  setIsLoadingProjects: (isLoadingProjects) => set({ isLoadingProjects }),
  setActionBusy: (actionBusy) => set({ actionBusy }),
  setActionBanner: (actionBanner) => set({ actionBanner }),
  setBusyRowId: (busyRowId) => set({ busyRowId }),

  resetForYouniverseSwitch: () =>
    set(() => ({
      ...createInitialWorkspaceFields(),
      savedProjects: [],
      isLoadingProjects: false,
      busyRowId: null,
    })),

  buildNotNotePayload: () => {
    const state = get();
    return {
      ...(state.activeProjectId ? { id: state.activeProjectId } : {}),
      title: state.title.trim() || "WeaverProject",
      code: extractEntryCode(state.files, state.entryFile),
      dependencies: [...state.dependencies],
      files: fileTreeToContentMap(state.files),
      entryFile: state.entryFile,
      iterations: state.iterations,
      sandboxConfig: state.sandboxConfig,
    };
  },
}));
