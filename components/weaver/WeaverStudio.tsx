/**
 * components/weaver/WeaverStudio.tsx
 *
 * The Weaver Multi-File AI Studio — three-pane spatial IDE for Portals OS.
 *
 * Panes:
 *   - Left:   WeaverPromptPane  (Conversational prompt, AI Chips, Point & Edit chip, Iteration History)
 *   - Center: WeaverCodePane    (Virtual File Tree Explorer + Code/Diff Editor)
 *   - Right:  WeaverPreviewPane (Live Multi-File Sandbox, Desktop/Mobile, Annotate, Runtime Console)
 *
 * Architectural boundaries:
 *   - State managed in ephemeral Zustand `useWeaverStore` (zero localStorage persistence).
 *   - All drafts save to NotNotes (`/api/not-notes/artifact`) and require authenticated
 *     ItsYouOnline owner access for the active Youniverse.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import {
  X,
  Minus,
  Paintbrush,
  Loader2,
  BookMarked,
  Save,
  Globe,
  EyeOff,
  Plus,
  Layers,
  Archive,
  Download,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { useKernel } from "../../store/kernel";
import { useWeaverStore, type WeaverPublicationStatus } from "../../store/weaverStore";
import { resolveYouniverseRoute } from "../../lib/youniverseRouting";
import { fileTreeToContentMap } from "../../lib/weaverProject";
import { downloadWeaverProjectZip } from "../../lib/weaverExport";
import type { WeavedWidget } from "../../types";
import WeaverPromptPane from "./WeaverPromptPane";
import WeaverCodePane from "./WeaverCodePane";
import WeaverPreviewPane from "./WeaverPreviewPane";

interface WeaverStudioProps {
  jwtToken?: string;
  onMinimize?: () => void;
  onClose?: () => void;
  zIndex?: number;
  initialPosition?: { x: number; y: number };
  embedded?: boolean;
}

interface CollectionSubmissionItem {
  id: string;
  youniverseId: string;
  widgetId: string | null;
  collectionType: "newsletter" | "lead_capture" | "booking" | "digital_download";
  email: string | null;
  name: string | null;
  message: string | null;
  payloadJson: Record<string, unknown>;
  sourceOrigin: string | null;
  createdAt: string;
}

const COLLECTION_TYPE_BADGE_MAP: Record<
  CollectionSubmissionItem["collectionType"],
  { label: string; className: string }
> = {
  newsletter: {
    label: "Newsletter",
    className: "bg-sky-950/60 border-sky-600/40 text-sky-300",
  },
  lead_capture: {
    label: "Lead",
    className: "bg-violet-950/60 border-violet-600/40 text-violet-300",
  },
  booking: {
    label: "Booking",
    className: "bg-emerald-950/60 border-emerald-600/40 text-emerald-300",
  },
  digital_download: {
    label: "Download",
    className: "bg-amber-950/60 border-amber-600/40 text-amber-300",
  },
};

function escapeCsvField(raw: unknown): string {
  let str = raw == null ? "" : String(raw);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlobFile(filename: string, content: string, mimeType: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const WEAVER_ENDPOINT = "/api/weaver/generate";
const GLOW_COLOR = "rgba(139,92,246,0.35)";

const PUBLICATION_BADGE_MAP: Record<
  WeaverPublicationStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Private Draft",
    className: "bg-amber-950/50 border-amber-600/40 text-amber-300",
  },
  published: {
    label: "Live on Front Lawn",
    className: "bg-emerald-950/50 border-emerald-600/40 text-emerald-300",
  },
  unpublished: {
    label: "Private (Unpublished)",
    className: "bg-zinc-800/80 border-zinc-600/50 text-zinc-300",
  },
};

const PublicationBadge: React.FC<{ status: WeaverPublicationStatus | null }> = ({ status }) => {
  if (!status) {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-700 text-zinc-400">
        Unsaved
      </span>
    );
  }
  const style = PUBLICATION_BADGE_MAP[status] ?? PUBLICATION_BADGE_MAP.draft;
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${style.className}`}>
      {style.label}
    </span>
  );
};

export const WeaverStudio: React.FC<WeaverStudioProps> = ({
  jwtToken,
  onMinimize,
  onClose,
  zIndex = 200,
  initialPosition = { x: 80, y: 40 },
  embedded = false,
}) => {
  const onboarding = useKernel((s) => s.onboarding);
  const setWeavedWidgets = useKernel((s) => s.setWeavedWidgets);

  const activeProjectId = useWeaverStore((s) => s.activeProjectId);
  const title = useWeaverStore((s) => s.title);
  const setTitle = useWeaverStore((s) => s.setTitle);
  const publicationStatus = useWeaverStore((s) => s.publicationStatus);
  const dirty = useWeaverStore((s) => s.dirty);
  const savedProjects = useWeaverStore((s) => s.savedProjects);
  const isLoadingProjects = useWeaverStore((s) => s.isLoadingProjects);
  const actionBusy = useWeaverStore((s) => s.actionBusy);
  const actionBanner = useWeaverStore((s) => s.actionBanner);
  const busyRowId = useWeaverStore((s) => s.busyRowId);
  const lastMeta = useWeaverStore((s) => s.lastMeta);
  const lastArchive = useWeaverStore((s) => s.lastArchive);
  const archiveOnPublish = useWeaverStore((s) => s.archiveOnPublish);
  const diagnosticSource = useWeaverStore((s) => s.diagnosticSource);

  const initNewProject = useWeaverStore((s) => s.initNewProject);
  const hydrateFromNotNote = useWeaverStore((s) => s.hydrateFromNotNote);
  const markSaved = useWeaverStore((s) => s.markSaved);
  const setPublicationStatus = useWeaverStore((s) => s.setPublicationStatus);
  const setLastArchive = useWeaverStore((s) => s.setLastArchive);
  const setArchiveOnPublish = useWeaverStore((s) => s.setArchiveOnPublish);
  const setSavedProjects = useWeaverStore((s) => s.setSavedProjects);
  const setIsLoadingProjects = useWeaverStore((s) => s.setIsLoadingProjects);
  const setActionBusy = useWeaverStore((s) => s.setActionBusy);
  const setActionBanner = useWeaverStore((s) => s.setActionBanner);
  const setBusyRowId = useWeaverStore((s) => s.setBusyRowId);
  const setGenerationStatus = useWeaverStore((s) => s.setGenerationStatus);
  const applyGenerationResult = useWeaverStore((s) => s.applyGenerationResult);
  const clearSelectedAnnotation = useWeaverStore((s) => s.clearSelectedAnnotation);
  const setPrompt = useWeaverStore((s) => s.setPrompt);
  const buildNotNotePayload = useWeaverStore((s) => s.buildNotNotePayload);

  const [projectsDrawerOpen, setProjectsDrawerOpen] = useState(false);
  const [submissionsDrawerOpen, setSubmissionsDrawerOpen] = useState(false);
  const [submissions, setSubmissions] = useState<CollectionSubmissionItem[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [filterByActiveWidget, setFilterByActiveWidget] = useState(false);
  const [pos, setPos] = useState(initialPosition);
  const dragOrigin = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const resolvedJwt =
    jwtToken ??
    (typeof window !== "undefined"
      ? localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt") ||
        sessionStorage.getItem("weaver_jwt")
      : null) ??
    "";

  const targetHandle = useMemo(() => {
    if (typeof window === "undefined") return onboarding.handle || "";
    const route = resolveYouniverseRoute(window.location.host, window.location.search);
    if (route?.kind === "identity" && route.username) {
      return route.username;
    }
    return onboarding.handle || "";
  }, [onboarding.handle]);

  const buildRequestHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (resolvedJwt) {
      headers.Authorization = `Bearer ${resolvedJwt}`;
    }
    if (targetHandle) {
      headers["X-Youniverse-Handle"] = targetHandle;
    }
    return headers;
  }, [resolvedJwt, targetHandle]);

  const loadSavedProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch("/api/not-notes/widgets", {
        method: "GET",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
      });
      const data = await response.json();
      if (response.ok && data?.success && Array.isArray(data.widgets)) {
        setSavedProjects(data.widgets);
        setWeavedWidgets(data.widgets);
      }
    } catch (err) {
      console.error("[WeaverStudio] Failed to load NotNotes projects:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [buildRequestHeaders, setIsLoadingProjects, setSavedProjects, setWeavedWidgets]);

  const loadSubmissions = useCallback(async () => {
    setIsLoadingSubmissions(true);
    try {
      const query =
        filterByActiveWidget && activeProjectId
          ? `?widgetId=${encodeURIComponent(activeProjectId)}`
          : "";
      const response = await fetch(`/api/not-notes/submissions${query}`, {
        method: "GET",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
      });
      const data = await response.json();
      if (response.ok && data?.success && Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
      }
    } catch (err) {
      console.error("[WeaverStudio] Failed to load Collection Point submissions:", err);
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [activeProjectId, buildRequestHeaders, filterByActiveWidget]);

  useEffect(() => {
    loadSavedProjects();
  }, [loadSavedProjects]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleExportZip = useCallback(() => {
    try {
      const state = useWeaverStore.getState();
      const exported = downloadWeaverProjectZip({
        title: state.title,
        files: state.files,
        entryFile: state.entryFile,
        dependencies: state.dependencies,
      });
      setActionBanner({
        kind: "ok",
        text: `Exported sovereign Vite + React project (${exported.filename}, ${exported.fileCount} files).`,
      });
    } catch (err: any) {
      setActionBanner({
        kind: "err",
        text: err?.message ?? "ZIP export failed.",
      });
    }
  }, [setActionBanner]);

  const handleExportSubmissionsCsv = useCallback(() => {
    const headers = [
      "id",
      "createdAt",
      "collectionType",
      "widgetId",
      "email",
      "name",
      "message",
      "fieldsJson",
      "sourceOrigin",
    ];
    const rows = submissions.map((s) =>
      [
        escapeCsvField(s.id),
        escapeCsvField(s.createdAt),
        escapeCsvField(s.collectionType),
        escapeCsvField(s.widgetId ?? ""),
        escapeCsvField(s.email ?? ""),
        escapeCsvField(s.name ?? ""),
        escapeCsvField(s.message ?? ""),
        escapeCsvField(JSON.stringify(s.payloadJson ?? {})),
        escapeCsvField(s.sourceOrigin ?? ""),
      ].join(",")
    );
    downloadBlobFile(
      `collection-submissions-${Date.now()}.csv`,
      [headers.join(","), ...rows].join("\r\n"),
      "text/csv;charset=utf-8"
    );
  }, [submissions]);

  const handleExportSubmissionsJson = useCallback(() => {
    downloadBlobFile(
      `collection-submissions-${Date.now()}.json`,
      JSON.stringify(submissions, null, 2),
      "application/json;charset=utf-8"
    );
  }, [submissions]);

  const handleDragStart = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      dragOrigin.current = { x: info.point.x, y: info.point.y, posX: pos.x, posY: pos.y };
    },
    [pos]
  );

  const handleDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setPos({
        x: dragOrigin.current.posX + info.offset.x,
        y: dragOrigin.current.posY + info.offset.y,
      });
    },
    []
  );

  const handleGenerate = useCallback(
    async (overridePrompt?: string) => {
      const state = useWeaverStore.getState();
      const effectivePrompt = (overridePrompt ?? state.prompt).trim();
      if (!effectivePrompt || state.generationStatus === "loading") return;

      setGenerationStatus("loading", null);
      setActionBanner(null);

      try {
        const response = await fetch(WEAVER_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify({
            action: "generate",
            prompt: effectivePrompt,
            projectTitle: state.title,
            files: fileTreeToContentMap(state.files),
            entryFile: state.entryFile,
            aiChips: state.sandboxConfig.activeChips,
            history: state.iterations.slice(-6).map((it) => ({
              prompt: it.prompt,
              summary: it.summary,
            })),
            runtimeError: state.runtimeErrors[0] ?? null,
            selectedElement: state.selectedAnnotation ?? null,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
        }

        if (data.project) {
          applyGenerationResult({
            prompt: effectivePrompt,
            summary: data.project.summary,
            title: data.project.name,
            entryFile: data.project.entryFile,
            files: data.project.files,
            operations: data.project.operations,
            changedPaths: data.project.changedPaths,
            dependencies: data.project.dependencies,
            meta: data.meta ?? null,
          });
        } else if (data.component) {
          applyGenerationResult({
            prompt: effectivePrompt,
            summary: `Generated ${data.component.name}`,
            title: data.component.name,
            operations: [
              {
                action: "upsert",
                path: state.entryFile,
                content: data.component.code,
                reason: "Generated primary component",
              },
            ],
            dependencies: data.component.dependencies,
            meta: data.meta ?? null,
          });
        }

        setPrompt("");
        clearSelectedAnnotation();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown synthesis error.";
        setGenerationStatus("error", message);
      }
    },
    [
      applyGenerationResult,
      buildRequestHeaders,
      clearSelectedAnnotation,
      setActionBanner,
      setGenerationStatus,
      setPrompt,
    ]
  );

  const handleSaveDraft = useCallback(async () => {
    if (actionBusy !== "idle") return;
    const payload = buildNotNotePayload();
    if (!payload.title.trim() || !payload.code.trim()) return;

    setActionBusy("saving");
    setActionBanner(null);

    try {
      const isExisting = Boolean(activeProjectId);
      const response = await fetch("/api/not-notes/artifact", {
        method: isExisting ? "PUT" : "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.artifact) {
        throw new Error(data?.message || data?.error || "Failed to save project draft.");
      }

      const saved: WeavedWidget = data.widget ?? data.artifact;
      markSaved(saved);
      setActionBanner({
        kind: "ok",
        text: isExisting ? "Saved changes to NotNotes." : "Saved private multi-file draft to NotNotes.",
      });
      await loadSavedProjects();
    } catch (err: any) {
      setActionBanner({ kind: "err", text: err?.message ?? "Save failed." });
    } finally {
      setActionBusy("idle");
    }
  }, [
    actionBusy,
    activeProjectId,
    buildNotNotePayload,
    buildRequestHeaders,
    loadSavedProjects,
    markSaved,
    setActionBanner,
    setActionBusy,
  ]);

  const handlePublish = useCallback(async () => {
    if (actionBusy !== "idle") return;
    const payload = buildNotNotePayload();
    if (!payload.title.trim() || !payload.code.trim()) return;

    setActionBusy("publishing");
    setActionBanner(null);

    try {
      let targetId = activeProjectId;
      if (!targetId) {
        const createRes = await fetch("/api/not-notes/artifact", {
          method: "POST",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify(payload),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData?.success || !createData?.artifact?.id) {
          throw new Error(createData?.message || createData?.error || "Failed to create draft.");
        }
        targetId = String(createData.artifact.id);
      }

      const pubRes = await fetch("/api/not-notes/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({
          ...payload,
          id: targetId,
          archiveToBooksOs: archiveOnPublish,
        }),
      });
      const pubData = await pubRes.json();
      if (!pubRes.ok || !pubData?.success) {
        throw new Error(pubData?.message || pubData?.error || "Publish failed.");
      }

      const updated: WeavedWidget = pubData.widget ?? pubData.artifact;
      const badge = pubData.badge ?? updated?.booksOsArchive ?? null;
      if (badge) {
        setLastArchive(badge);
      }
      markSaved({ ...updated, publicationStatus: "published" });
      setPublicationStatus("published");
      const frontLawnHost = targetHandle
        ? `${targetHandle}.itsyouonline.com`
        : "your Youniverse";
      setActionBanner({
        kind: "ok",
        text: badge
          ? `Published to ${frontLawnHost}'s public Front Lawn & archived to Books OS (${badge.towerId} / ${badge.shelfId} / ${badge.bookId}).`
          : `Published to ${frontLawnHost}'s public Front Lawn.`,
      });
      await loadSavedProjects();
    } catch (err: any) {
      setActionBanner({ kind: "err", text: err?.message ?? "Publish failed." });
    } finally {
      setActionBusy("idle");
    }
  }, [
    actionBusy,
    activeProjectId,
    archiveOnPublish,
    buildNotNotePayload,
    buildRequestHeaders,
    loadSavedProjects,
    markSaved,
    setActionBanner,
    setActionBusy,
    setLastArchive,
    setPublicationStatus,
  ]);

  const handleCommitToBooksOs = useCallback(async () => {
    if (actionBusy !== "idle") return;
    const payload = buildNotNotePayload();
    if (!payload.title.trim() || !payload.code.trim()) return;

    setActionBusy("archiving");
    setActionBanner(null);

    try {
      let targetId = activeProjectId;
      if (!targetId) {
        const createRes = await fetch("/api/not-notes/artifact", {
          method: "POST",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify(payload),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData?.success || !createData?.artifact?.id) {
          throw new Error(createData?.message || createData?.error || "Failed to save draft before archival.");
        }
        targetId = String(createData.artifact.id);
      } else if (dirty) {
        const updateRes = await fetch("/api/not-notes/artifact", {
          method: "PUT",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify({ ...payload, id: targetId }),
        });
        const updateData = await updateRes.json();
        if (!updateRes.ok || !updateData?.success) {
          throw new Error(updateData?.message || updateData?.error || "Failed to sync changes before archival.");
        }
      }

      const archiveRes = await fetch("/api/not-notes/archive", {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({
          id: targetId,
          title: payload.title,
          files: payload.files,
          entryFile: payload.entryFile,
          dependencies: payload.dependencies,
          includePromptHistory: false,
        }),
      });
      const archiveData = await archiveRes.json();
      if (!archiveRes.ok || !archiveData?.success) {
        throw new Error(archiveData?.message || archiveData?.error || "Books OS archival failed.");
      }

      const updated: WeavedWidget | undefined = archiveData.widget ?? archiveData.artifact;
      const badge = archiveData.badge ?? updated?.booksOsArchive ?? null;
      if (updated) {
        markSaved(updated);
      }
      if (badge) {
        setLastArchive(badge);
      }
      const coordLabel = badge
        ? `${badge.towerId} / ${badge.shelfId} / ${badge.bookId}`
        : "Books OS";
      setActionBanner({
        kind: "ok",
        text: archiveData.deduplicated
          ? `Already archived (unchanged version) at ${coordLabel}.`
          : `Committed snapshot to Books OS (${coordLabel}).`,
      });
      await loadSavedProjects();
    } catch (err: any) {
      setActionBanner({ kind: "err", text: err?.message ?? "Books OS archival failed." });
    } finally {
      setActionBusy("idle");
    }
  }, [
    actionBusy,
    activeProjectId,
    buildNotNotePayload,
    buildRequestHeaders,
    dirty,
    loadSavedProjects,
    markSaved,
    setActionBanner,
    setActionBusy,
    setLastArchive,
  ]);

  const handleUnpublish = useCallback(async () => {
    if (!activeProjectId || actionBusy !== "idle") return;
    setActionBusy("unpublishing");
    setActionBanner(null);

    try {
      const response = await fetch("/api/not-notes/unpublish", {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({ id: activeProjectId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Unpublish failed.");
      }
      setPublicationStatus("unpublished");
      setActionBanner({ kind: "ok", text: "Unpublished and retained privately in NotNotes." });
      await loadSavedProjects();
    } catch (err: any) {
      setActionBanner({ kind: "err", text: err?.message ?? "Unpublish failed." });
    } finally {
      setActionBusy("idle");
    }
  }, [
    actionBusy,
    activeProjectId,
    buildRequestHeaders,
    loadSavedProjects,
    setActionBanner,
    setActionBusy,
    setPublicationStatus,
  ]);

  const handleToggleRowPublish = useCallback(
    async (widget: WeavedWidget) => {
      if (busyRowId) return;
      setBusyRowId(widget.id);
      try {
        const isPub = widget.publicationStatus === "published";
        const endpoint = isPub ? "/api/not-notes/unpublish" : "/api/not-notes/publish";
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify({ id: widget.id }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || data?.error || "Toggle publish failed.");
        }
        if (widget.id === activeProjectId) {
          setPublicationStatus(isPub ? "unpublished" : "published");
        }
        await loadSavedProjects();
      } catch (err: any) {
        setActionBanner({ kind: "err", text: err?.message ?? "Publication update failed." });
      } finally {
        setBusyRowId(null);
      }
    },
    [
      activeProjectId,
      buildRequestHeaders,
      busyRowId,
      loadSavedProjects,
      setActionBanner,
      setBusyRowId,
      setPublicationStatus,
    ]
  );

  const shellContent = (
    <div
      className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-zinc-700/50 bg-zinc-900/90 backdrop-blur-md shadow-2xl relative"
      style={{
        boxShadow: `0 0 0 1px rgba(139,92,246,0.14), 0 24px 64px -12px rgba(0,0,0,0.7), 0 0 60px -20px ${GLOW_COLOR}`,
      }}
    >
      {/* Top Studio Toolbar */}
      <motion.header
        onPanStart={embedded ? undefined : handleDragStart}
        onPan={embedded ? undefined : handleDrag}
        className={`flex items-center justify-between gap-2 h-11 px-3 shrink-0 select-none border-b border-zinc-800 bg-zinc-950/80 ${
          embedded ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{ touchAction: "none" }}
        aria-label="Weaver Studio header"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-950/70 border border-violet-600/40 shrink-0">
            <Paintbrush className="w-3 h-3 text-violet-300" />
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Project title"
            className="w-44 bg-transparent border border-transparent hover:border-zinc-700 focus:border-violet-500/60 focus:bg-zinc-900 rounded px-1.5 py-0.5 text-xs font-semibold font-mono text-zinc-100 focus:outline-none truncate"
          />
          <PublicationBadge status={publicationStatus} />
          {diagnosticSource && (
            <span
              className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border bg-violet-950/60 border-violet-500/40 text-violet-200"
              title={
                diagnosticSource.headline ||
                `Oracle diagnostic handoff (${diagnosticSource.sourceAgentIds.join(", ")})`
              }
            >
              Diagnosed by Oracle · {diagnosticSource.deliverableCount} Agent Deliverable
              {diagnosticSource.deliverableCount === 1 ? "" : "s"}
            </span>
          )}
          {lastArchive && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border bg-amber-950/50 border-amber-500/40 text-amber-200"
              title={`Books OS Archive: ${lastArchive.towerId} → ${lastArchive.shelfId} → ${lastArchive.bookId}${lastArchive.pageId ? ` → ${lastArchive.pageId}` : ""} (Record: ${lastArchive.recordId}, Hash: ${lastArchive.versionHash.slice(0, 10)})`}
            >
              <Archive className="w-2.5 h-2.5 text-amber-400" />
              {lastArchive.towerId} · {lastArchive.shelfId} · {lastArchive.bookId}
            </span>
          )}
          {dirty && (
            <span className="text-[10px] font-mono text-amber-400/90" title="Unsaved changes">
              ●
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {lastMeta?.model && (
            <span className="hidden lg:inline text-[10px] font-mono text-zinc-500 mr-1">
              {lastMeta.model}
              {lastMeta.durationMs ? ` · ${lastMeta.durationMs}ms` : ""}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setSubmissionsDrawerOpen(false);
              setProjectsDrawerOpen((v) => !v);
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
              projectsDrawerOpen
                ? "bg-violet-600/20 border-violet-500/50 text-violet-200"
                : "bg-zinc-900 border-zinc-700/70 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Layers className="w-3 h-3" />
            NotNotes ({savedProjects.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setProjectsDrawerOpen(false);
              setSubmissionsDrawerOpen((v) => !v);
              if (!submissionsDrawerOpen) {
                loadSubmissions();
              }
            }}
            title="View Collection Point submissions captured by your published Weaver apps"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
              submissionsDrawerOpen
                ? "bg-sky-600/20 border-sky-500/50 text-sky-200"
                : "bg-zinc-900 border-zinc-700/70 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Inbox className="w-3 h-3" />
            Submissions ({submissions.length})
          </button>

          <button
            type="button"
            onClick={handleExportZip}
            title="Download standalone Vite + React + TypeScript ZIP archive"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900 hover:bg-zinc-800 hover:border-sky-500/50 text-[11px] font-mono text-zinc-200 transition-colors"
          >
            <Download className="w-3 h-3 text-sky-400" />
            Export ZIP
          </button>

          <button
            type="button"
            onClick={() => {
              initNewProject();
              setProjectsDrawerOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={actionBusy !== "idle"}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-violet-900/40 hover:border-violet-500/50 text-[11px] font-semibold text-zinc-100 disabled:opacity-40 transition-colors"
          >
            {actionBusy === "saving" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : activeProjectId ? (
              <Save className="w-3 h-3" />
            ) : (
              <BookMarked className="w-3 h-3" />
            )}
            {actionBusy === "saving" ? "Saving…" : activeProjectId ? "Save" : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={handleCommitToBooksOs}
            disabled={actionBusy !== "idle"}
            title="Commit multi-file snapshot to Books OS"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-600/40 bg-amber-950/50 hover:bg-amber-900/50 text-[11px] font-semibold text-amber-200 disabled:opacity-40 transition-colors"
          >
            {actionBusy === "archiving" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Archive className="w-3 h-3" />
            )}
            {actionBusy === "archiving" ? "Archiving…" : "Commit to Books OS"}
          </button>

          {publicationStatus === "published" ? (
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={actionBusy !== "idle"}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 disabled:opacity-40 transition-colors"
            >
              <EyeOff className="w-3 h-3" />
              Unpublish
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <label
                className="hidden xl:flex items-center gap-1 px-1.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/80 text-[10px] font-mono text-zinc-400 hover:text-amber-200 cursor-pointer select-none"
                title="Also commit snapshot to Books OS when publishing"
              >
                <input
                  type="checkbox"
                  checked={archiveOnPublish}
                  onChange={(e) => setArchiveOnPublish(e.target.checked)}
                  className="accent-amber-500 w-3 h-3 cursor-pointer"
                />
                +Books OS
              </label>
              <button
                type="button"
                onClick={handlePublish}
                disabled={actionBusy !== "idle"}
                title={
                  targetHandle
                    ? `Promote private draft to ${targetHandle}.itsyouonline.com's public Front Lawn`
                    : "Promote private draft to your Youniverse's public Front Lawn"
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-950/60 hover:bg-emerald-900/60 text-[11px] font-semibold text-emerald-300 disabled:opacity-40 transition-colors"
              >
                <Globe className="w-3 h-3" />
                {actionBusy === "publishing" ? "Publishing…" : "Publish to Front Lawn"}
              </button>
            </div>
          )}

          {!embedded && onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize Weaver Studio"
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}
          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Weaver Studio"
              className="p-1.5 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.header>

      {/* Action Banner */}
      <AnimatePresence>
        {actionBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div
              className={`flex items-center justify-between px-3 py-1.5 border-b text-xs font-mono ${
                actionBanner.kind === "ok"
                  ? "bg-emerald-950/40 border-emerald-700/40 text-emerald-300"
                  : "bg-rose-950/40 border-rose-700/40 text-rose-300"
              }`}
            >
              <span>{actionBanner.text}</span>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                className="text-zinc-400 hover:text-zinc-200 ml-2"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NotNotes Saved Projects Popover Drawer */}
      <AnimatePresence>
        {projectsDrawerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-12 right-3 z-30 w-96 max-h-[70%] rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur-lg flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                NotNotes Working Memory
              </span>
              <button
                type="button"
                onClick={() => setProjectsDrawerOpen(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {isLoadingProjects ? (
                <div className="flex items-center justify-center py-6 text-xs font-mono text-zinc-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  Loading drafts…
                </div>
              ) : savedProjects.length === 0 ? (
                <p className="text-xs font-mono text-zinc-500 text-center py-6">
                  No NotNotes projects saved yet.
                </p>
              ) : (
                savedProjects.map((widget) => {
                  const status: WeaverPublicationStatus = widget.publicationStatus ?? "draft";
                  const isSelected = widget.id === activeProjectId;
                  const fileCount = widget.files ? Object.keys(widget.files).length : 1;
                  return (
                    <div
                      key={widget.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                        isSelected
                          ? "border-violet-500/50 bg-violet-950/30"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          hydrateFromNotNote(widget);
                          setProjectsDrawerOpen(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-semibold text-zinc-100 truncate">
                            {widget.title}
                          </span>
                          <PublicationBadge status={status} />
                        </div>
                        <p className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                          {fileCount} file{fileCount > 1 ? "s" : ""} · {widget.id.slice(0, 8)}
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={busyRowId === widget.id}
                        onClick={() => handleToggleRowPublish(widget)}
                        className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-200 disabled:opacity-40 shrink-0"
                      >
                        {status === "published" ? "Unpublish" : "Publish"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collection Point Submissions Popover Drawer */}
      <AnimatePresence>
        {submissionsDrawerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-12 right-3 z-30 w-[440px] max-h-[72%] rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur-lg flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5 text-sky-400" />
                Collection Point Submissions ({submissions.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={loadSubmissions}
                  disabled={isLoadingSubmissions}
                  title="Refresh submissions"
                  className="p-1 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingSubmissions ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={handleExportSubmissionsCsv}
                  disabled={submissions.length === 0}
                  className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-200 disabled:opacity-40"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportSubmissionsJson}
                  disabled={submissions.length === 0}
                  className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-200 disabled:opacity-40"
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionsDrawerOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {activeProjectId && (
              <div className="px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterByActiveWidget}
                    onChange={(e) => setFilterByActiveWidget(e.target.checked)}
                    className="accent-sky-500 w-3 h-3"
                  />
                  Filter to active project ({activeProjectId.slice(0, 8)})
                </label>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {isLoadingSubmissions ? (
                <div className="flex items-center justify-center py-6 text-xs font-mono text-zinc-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  Loading submissions…
                </div>
              ) : submissions.length === 0 ? (
                <p className="text-xs font-mono text-zinc-500 text-center py-6">
                  No Collection Point submissions captured yet.
                </p>
              ) : (
                submissions.map((sub) => {
                  const typeStyle =
                    COLLECTION_TYPE_BADGE_MAP[sub.collectionType] ??
                    COLLECTION_TYPE_BADGE_MAP.lead_capture;
                  const extraFieldEntries = Object.entries(sub.payloadJson ?? {});
                  return (
                    <div
                      key={sub.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${typeStyle.className}`}
                        >
                          {typeStyle.label}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(sub.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {(sub.name || sub.email) && (
                        <div className="text-xs font-mono text-zinc-100 truncate">
                          {sub.name ? `${sub.name}` : ""}
                          {sub.name && sub.email ? " · " : ""}
                          {sub.email ? <span className="text-sky-300">{sub.email}</span> : null}
                        </div>
                      )}
                      {sub.message && (
                        <p className="text-[11px] text-zinc-300 leading-snug break-words">
                          {sub.message}
                        </p>
                      )}
                      {extraFieldEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {extraFieldEntries.map(([k, v]) => (
                            <span
                              key={k}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400"
                            >
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Three-Pane AI Studio Workspace */}
      <div className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden">
        <WeaverPromptPane onGenerate={handleGenerate} />
        <WeaverCodePane />
        <WeaverPreviewPane
          onFixRuntimeError={(errMsg) => {
            const fixPrompt = `Fix the sandbox runtime error: ${errMsg}`;
            setPrompt(fixPrompt);
            handleGenerate(fixPrompt);
          }}
        />
      </div>
    </div>
  );

  if (embedded) {
    return shellContent;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 6 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="absolute flex flex-col"
      style={{
        zIndex,
        left: pos.x,
        top: pos.y,
        width: 1180,
        height: 740,
        minWidth: 880,
        minHeight: 520,
      }}
      role="dialog"
      aria-label="Weaver Studio"
      aria-modal="false"
    >
      {shellContent}
    </motion.div>
  );
};

export default WeaverStudio;
