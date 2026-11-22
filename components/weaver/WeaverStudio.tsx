/**
 * components/weaver/WeaverStudio.tsx
 *
 * The Weaver Studio — spatial UI architect interface for Portals OS.
 *
 * Supports the complete NotNotes widget lifecycle:
 *   - AI generation via `/api/weaver/generate` or manual authoring
 *   - Live sandboxed preview via `<WeaverSandbox>`
 *   - Reopening & editing saved widgets
 *   - Saving private drafts (`POST /api/not-notes/artifact`)
 *   - Updating drafts or published widgets (`PUT /api/not-notes/artifact`)
 *   - Explicit Publish (`POST /api/not-notes/publish`) & Unpublish (`POST /api/not-notes/unpublish`)
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import {
  X,
  Minus,
  Paintbrush,
  Wand2,
  Code2,
  Eye,
  Loader2,
  Copy,
  Check,
  BookMarked,
  ChevronRight,
  PackageOpen,
  AlertTriangle,
  Sparkles,
  Globe,
  EyeOff,
  Plus,
  Layers,
  Save,
} from "lucide-react";
import { useKernel } from "../../store/kernel";
import { resolveYouniverseRoute } from "../../lib/youniverseRouting";
import type { WeavedWidget } from "../../types";
import WeaverSandbox from "./WeaverSandbox";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeaverComponent {
  name: string;
  code: string;
  dependencies: string[];
}

interface WeaverApiResponse {
  success: boolean;
  youniverseId: string;
  component: WeaverComponent;
  meta?: {
    model: string;
    generatedAt: string;
    durationMs: number;
  };
  error?: string;
  message?: string;
}

type ViewMode = "preview" | "code" | "widgets";
type GenerationStatus = "idle" | "loading" | "success" | "error";
type PublicationStatus = "draft" | "published" | "unpublished";

interface WeaverStudioProps {
  jwtToken?: string;
  onMinimize?: () => void;
  onClose?: () => void;
  zIndex?: number;
  initialPosition?: { x: number; y: number };
  embedded?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEAVER_ENDPOINT = "/api/weaver/generate";
const MAX_PROMPT_LENGTH = 4_000;
const GLOW_COLOR = "rgba(139,92,246,0.35)";

const PUBLICATION_BADGE_MAP: Record<
  PublicationStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-amber-950/50 border-amber-600/40 text-amber-300",
  },
  published: {
    label: "Published",
    className: "bg-emerald-950/50 border-emerald-600/40 text-emerald-300",
  },
  unpublished: {
    label: "Unpublished",
    className: "bg-zinc-800/80 border-zinc-600/50 text-zinc-300",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: GenerationStatus }> = ({ status }) => {
  const colourMap: Record<GenerationStatus, string> = {
    idle: "bg-zinc-500",
    loading: "bg-violet-400",
    success: "bg-emerald-400",
    error: "bg-rose-400",
  };
  const labelMap: Record<GenerationStatus, string> = {
    idle: "Ready",
    loading: "Synthesizing…",
    success: "Component ready",
    error: "Generation failed",
  };

  return (
    <div className="flex items-center gap-1.5" aria-live="polite" aria-label={labelMap[status]}>
      <span className="relative flex h-2 w-2">
        {status === "loading" && (
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"
            aria-hidden="true"
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${colourMap[status]}`} />
      </span>
      <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase select-none">
        {labelMap[status]}
      </span>
    </div>
  );
};

const PublicationBadge: React.FC<{ status: PublicationStatus | null }> = ({ status }) => {
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

const WeaverSpinner: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="flex flex-col items-center justify-center gap-4 py-10"
    aria-label="Generating component"
    role="status"
  >
    <div className="relative">
      <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl animate-pulse" />
      <Loader2
        className="relative w-10 h-10 text-violet-400 animate-spin"
        strokeWidth={1.5}
      />
    </div>
    <p className="text-xs font-mono text-violet-300/70 tracking-[0.15em] uppercase">
      Weaver is synthesizing…
    </p>
  </motion.div>
);

const CopyButton: React.FC<{ text: string; label?: string }> = ({
  text,
  label = "Copy",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : label}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all duration-200"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
};

const PreviewPane: React.FC<{ component: WeaverComponent | null }> = ({
  component,
}) => {
  if (!component || !component.code.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 select-none">
        <Sparkles className="w-8 h-8 opacity-30" />
        <p className="text-xs font-mono tracking-widest uppercase opacity-40">
          Awaiting synthesis or draft selection
        </p>
      </div>
    );
  }

  return (
    <WeaverSandbox code={component.code} componentName={component.name} />
  );
};

interface CodeMetaPaneProps {
  title: string;
  code: string;
  dependencies: string[];
  meta?: WeaverApiResponse["meta"];
  onTitleChange: (nextTitle: string) => void;
  onCodeChange: (nextCode: string) => void;
}

const CodeMetaPane: React.FC<CodeMetaPaneProps> = ({
  title,
  code,
  dependencies,
  meta,
  onTitleChange,
  onCodeChange,
}) => {
  const schemaDisplay = JSON.stringify(
    {
      name: title,
      dependencies,
      codeLength: `${code.length} chars`,
      ...(meta ? { model: meta.model, generatedAt: meta.generatedAt, durationMs: `${meta.durationMs}ms` } : {}),
    },
    null,
    2
  );

  return (
    <div className="flex flex-col h-full overflow-auto divide-y divide-zinc-800/60">
      <section className="px-4 py-3 shrink-0" aria-label="Component identity">
        <label
          htmlFor="weaver-widget-title"
          className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5"
        >
          Widget Title
        </label>
        <div className="flex items-center gap-2">
          <input
            id="weaver-widget-title"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. SovereignClockWidget"
            className="flex-1 rounded-lg bg-zinc-950/70 border border-zinc-700/60 px-3 py-1.5 text-sm font-mono text-violet-200 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
          {title && <CopyButton text={title} label="Copy name" />}
        </div>
      </section>

      <section className="px-4 py-3 shrink-0" aria-label="Dependencies">
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
          Dependencies
        </p>
        {dependencies.length === 0 ? (
          <p className="text-xs text-zinc-600 font-mono italic">
            None — uses only React &amp; Tailwind
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {dependencies.map((dep) => (
              <li
                key={dep}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-950/50 border border-violet-700/30 text-[11px] font-mono text-violet-300"
              >
                <PackageOpen className="w-2.5 h-2.5 opacity-60" />
                {dep}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 py-3 flex-1 min-h-[180px] flex flex-col" aria-label="Editable JSX source">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="weaver-widget-code"
            className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest"
          >
            JSX Source (Editable Draft)
          </label>
          {code && <CopyButton text={code} label="Copy JSX" />}
        </div>
        <textarea
          id="weaver-widget-code"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="export default function MyWidget() { return <div className='p-4 text-white'>Hello</div>; }"
          rows={8}
          className="flex-1 w-full resize-none text-[11px] font-mono text-emerald-300/90 bg-zinc-950/70 rounded-lg p-3 leading-relaxed border border-zinc-800/70 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
        />
      </section>

      <section className="px-4 py-3 shrink-0" aria-label="Response metadata">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Schema &amp; Meta
          </p>
          <CopyButton text={schemaDisplay} label="Copy JSON" />
        </div>
        <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-950/60 rounded-lg p-3 overflow-x-auto leading-relaxed border border-zinc-800/50">
          {schemaDisplay}
        </pre>
      </section>
    </div>
  );
};

interface SavedWidgetsPaneProps {
  widgets: WeavedWidget[];
  activeWidgetId: string | null;
  isLoading: boolean;
  busyWidgetId: string | null;
  onSelectWidget: (widget: WeavedWidget) => void;
  onTogglePublish: (widget: WeavedWidget) => void;
}

const SavedWidgetsPane: React.FC<SavedWidgetsPaneProps> = ({
  widgets,
  activeWidgetId,
  isLoading,
  busyWidgetId,
  onSelectWidget,
  onTogglePublish,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs font-mono text-zinc-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
        Loading NotNotes widgets…
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-500 px-6 text-center">
        <Layers className="w-8 h-8 opacity-40" />
        <p className="text-xs font-mono">No NotNotes widgets saved yet.</p>
        <p className="text-[11px] text-zinc-600">
          Synthesize a widget or author code in Code &amp; Meta, then save it as a private draft.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-2.5">
      {widgets.map((widget) => {
        const pubStatus: PublicationStatus = widget.publicationStatus ?? "draft";
        const isSelected = widget.id === activeWidgetId;
        const isBusy = busyWidgetId === widget.id;
        return (
          <div
            key={widget.id}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-all ${isSelected
              ? "border-violet-500/50 bg-violet-950/25"
              : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-700"
              }`
            }
          >
            <button
              type="button"
              onClick={() => onSelectWidget(widget)}
              className="flex-1 text-left min-w-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-100 truncate font-mono">
                  {widget.title}
                </span>
                <PublicationBadge status={pubStatus} />
              </div>
              <p className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                ID: {widget.id}
                {widget.updatedAt ? ` · Updated ${new Date(widget.updatedAt).toLocaleString()}` : ""}
              </p>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSelectWidget(widget)}
                className="px-2.5 py-1 rounded-lg border border-zinc-700/70 bg-zinc-800/60 hover:bg-zinc-700/70 text-[11px] font-mono text-zinc-200 transition-colors"
              >
                Open
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onTogglePublish(widget)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors disabled:opacity-40 ${pubStatus === "published"
                  ? "border-zinc-600/60 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  : "border-emerald-600/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
                  }`}
              >
                {pubStatus === "published" ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    Unpublish
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    Publish
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div >
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const WeaverStudio: React.FC<WeaverStudioProps> = ({
  jwtToken,
  onMinimize,
  onClose,
  zIndex = 200,
  initialPosition = { x: 120, y: 60 },
  embedded = false,
}) => {
  const onboarding = useKernel((s) => s.onboarding);
  const setWeavedWidgets = useKernel((s) => s.setWeavedWidgets);

  const [prompt, setPrompt] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<WeaverApiResponse | null>(null);

  const [savedWidgets, setSavedWidgets] = useState<WeavedWidget[]>([]);
  const [isLoadingWidgets, setIsLoadingWidgets] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [activePublicationStatus, setActivePublicationStatus] =
    useState<PublicationStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [draftDeps, setDraftDeps] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState<"idle" | "saving" | "publishing" | "unpublishing">("idle");
  const [actionBanner, setActionBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const [pos, setPos] = useState(initialPosition);
  const dragOrigin = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const loadSavedWidgets = useCallback(async () => {
    setIsLoadingWidgets(true);
    try {
      const headers = buildRequestHeaders();
      const response = await fetch("/api/not-notes/widgets", {
        method: "GET",
        credentials: "same-origin",
        headers,
      });
      const data = await response.json();
      if (response.ok && data?.success && Array.isArray(data.widgets)) {
        setSavedWidgets(data.widgets);
        setWeavedWidgets(data.widgets);
      }
    } catch (err) {
      console.error("[WeaverStudio] Failed to load saved widgets:", err);
    } finally {
      setIsLoadingWidgets(false);
    }
  }, [buildRequestHeaders, setWeavedWidgets]);

  useEffect(() => {
    loadSavedWidgets();
    textareaRef.current?.focus();
  }, [loadSavedWidgets]);

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

  const handleNewDraft = useCallback(() => {
    setActiveWidgetId(null);
    setActivePublicationStatus(null);
    setDraftTitle("");
    setDraftCode("");
    setDraftDeps([]);
    setResult(null);
    setStatus("idle");
    setErrorMessage(null);
    setActionBanner(null);
    setViewMode("preview");
    textareaRef.current?.focus();
  }, []);

  const applySelectedWidget = useCallback((widget: WeavedWidget) => {
    setActiveWidgetId(widget.id);
    setActivePublicationStatus(widget.publicationStatus ?? "draft");
    setDraftTitle(widget.title);
    setDraftCode(widget.code);
    setDraftDeps(Array.isArray(widget.dependencies) ? widget.dependencies : []);
    setResult(null);
    setStatus("success");
    setErrorMessage(null);
    setActionBanner(null);
    setViewMode("preview");
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || status === "loading") return;

    setStatus("loading");
    setErrorMessage(null);
    setActionBanner(null);

    try {
      const response = await fetch(WEAVER_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data: WeaverApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? `Request failed with status ${response.status}`);
      }

      setResult(data);
      setActiveWidgetId(null);
      setActivePublicationStatus(null);
      setDraftTitle(data.component.name);
      setDraftCode(data.component.code);
      setDraftDeps(Array.isArray(data.component.dependencies) ? data.component.dependencies : []);
      setStatus("success");
      setViewMode("preview");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error occurred.";
      setStatus("error");
      setErrorMessage(message);
    }
  }, [buildRequestHeaders, prompt, status]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  const handleSaveDraftOrUpdate = useCallback(async () => {
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle || !draftCode.trim() || actionBusy !== "idle") return;

    setActionBusy("saving");
    setActionBanner(null);

    try {
      const isExisting = Boolean(activeWidgetId);
      const response = await fetch("/api/not-notes/artifact", {
        method: isExisting ? "PUT" : "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify(
          isExisting
            ? {
              id: activeWidgetId,
              title: cleanTitle,
              code: draftCode,
              dependencies: draftDeps,
            }
            : {
              title: cleanTitle,
              code: draftCode,
              dependencies: draftDeps,
            }
        ),
      });

      const data = await response.json();
      if (!response.ok || !data?.success || !data?.artifact) {
        throw new Error(data?.message || data?.error || "Failed to save widget.");
      }

      const saved: WeavedWidget = data.widget ?? data.artifact;
      setActiveWidgetId(saved.id);
      setActivePublicationStatus(saved.publicationStatus ?? "draft");
      setActionBanner({
        kind: "ok",
        text: isExisting ? "Widget updated." : "Saved as private NotNotes draft.",
      });
      await loadSavedWidgets();
    } catch (err: any) {
      setActionBanner({
        kind: "err",
        text: err?.message ?? "Save failed.",
      });
    } finally {
      setActionBusy("idle");
    }
  }, [actionBusy, activeWidgetId, buildRequestHeaders, draftCode, draftDeps, draftTitle, loadSavedWidgets]);

  const handlePublish = useCallback(async () => {
    const cleanTitle = draftTitle.trim();
    if (!cleanTitle || !draftCode.trim() || actionBusy !== "idle") return;

    setActionBusy("publishing");
    setActionBanner(null);

    try {
      let targetId = activeWidgetId;
      if (!targetId) {
        const createRes = await fetch("/api/not-notes/artifact", {
          method: "POST",
          credentials: "same-origin",
          headers: buildRequestHeaders(),
          body: JSON.stringify({
            title: cleanTitle,
            code: draftCode,
            dependencies: draftDeps,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData?.success || !createData?.artifact?.id) {
          throw new Error(createData?.message || createData?.error || "Failed to save draft before publishing.");
        }
        targetId = String(createData.artifact.id);
      }

      const pubRes = await fetch("/api/not-notes/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({
          id: targetId,
          title: cleanTitle,
          code: draftCode,
          dependencies: draftDeps,
        }),
      });
      const pubData = await pubRes.json();
      if (!pubRes.ok || !pubData?.success) {
        throw new Error(pubData?.message || pubData?.error || "Publish failed.");
      }

      const updated: WeavedWidget = pubData.widget ?? pubData.artifact;
      setActiveWidgetId(updated.id);
      setActivePublicationStatus("published");
      setActionBanner({
        kind: "ok",
        text: "Widget published to your public Youniverse.",
      });
      await loadSavedWidgets();
    } catch (err: any) {
      setActionBanner({
        kind: "err",
        text: err?.message ?? "Publish failed.",
      });
    } finally {
      setActionBusy("idle");
    }
  }, [actionBusy, activeWidgetId, buildRequestHeaders, draftCode, draftDeps, draftTitle, loadSavedWidgets]);

  const handleUnpublish = useCallback(async () => {
    if (!activeWidgetId || actionBusy !== "idle") return;

    setActionBusy("unpublishing");
    setActionBanner(null);

    try {
      const response = await fetch("/api/not-notes/unpublish", {
        method: "POST",
        credentials: "same-origin",
        headers: buildRequestHeaders(),
        body: JSON.stringify({ id: activeWidgetId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Unpublish failed.");
      }

      setActivePublicationStatus("unpublished");
      setActionBanner({
        kind: "ok",
        text: "Widget unpublished and kept privately in NotNotes.",
      });
      await loadSavedWidgets();
    } catch (err: any) {
      setActionBanner({
        kind: "err",
        text: err?.message ?? "Unpublish failed.",
      });
    } finally {
      setActionBusy("idle");
    }
  }, [actionBusy, activeWidgetId, buildRequestHeaders, loadSavedWidgets]);

  const handleToggleRowPublish = useCallback(
    async (widget: WeavedWidget) => {
      if (busyRowId) return;
      setBusyRowId(widget.id);
      setActionBanner(null);

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
          throw new Error(data?.message || data?.error || "Publication toggle failed.");
        }
        if (widget.id === activeWidgetId) {
          setActivePublicationStatus(isPub ? "unpublished" : "published");
        }
        setActionBanner({
          kind: "ok",
          text: isPub
            ? `"${widget.title}" unpublished.`
            : `"${widget.title}" published to public Youniverse.`,
        });
        await loadSavedWidgets();
      } catch (err: any) {
        setActionBanner({
          kind: "err",
          text: err?.message ?? "Publication update failed.",
        });
      } finally {
        setBusyRowId(null);
      }
    },
    [activeWidgetId, buildRequestHeaders, busyRowId, loadSavedWidgets]
  );

  const canGenerate = prompt.trim().length > 0 && status !== "loading";
  const hasDraftContent = draftTitle.trim().length > 0 && draftCode.trim().length > 0;
  const activePreviewComponent: WeaverComponent | null = hasDraftContent
    ? {
      name: draftTitle.trim(),
      code: draftCode,
      dependencies: draftDeps,
    }
    : null;

  const shellContent = (
    <div
      className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-zinc-700/50 bg-zinc-900/80 backdrop-blur-md shadow-2xl"
      style={{
        boxShadow: `0 0 0 1px rgba(139,92,246,0.12), 0 24px 64px -12px rgba(0,0,0,0.7), 0 0 60px -20px ${GLOW_COLOR}`,
      }}
    >
      {/* ── Window Header ──────────────────────────────────────────────── */}
      <motion.header
        onPanStart={embedded ? undefined : handleDragStart}
        onPan={embedded ? undefined : handleDrag}
        className={`flex items-center justify-between h-10 px-3 shrink-0 select-none border-b border-zinc-700/40 bg-zinc-900/60 ${embedded ? "" : "cursor-grab active:cursor-grabbing"
          }`}
        style={{ touchAction: "none" }}
        aria-label="Weaver Studio window header"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-950/60 border border-violet-600/40"
            style={{ boxShadow: "0 0 8px rgba(139,92,246,0.4)" }}
            aria-hidden="true"
          >
            <Paintbrush className="w-2.5 h-2.5 text-violet-300" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold text-zinc-200 tracking-tight">
            Weaver Studio
          </span>
          <PublicationBadge status={activePublicationStatus} />
        </div>

        <div className="hidden sm:block pointer-events-none">
          <StatusDot status={status} />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleNewDraft}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 border border-zinc-700/50 transition-colors"
            title="Start new widget draft"
          >
            <Plus className="w-3 h-3" />
            New Draft
          </button>
          {!embedded && onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize Weaver Studio"
              className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}
          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Weaver Studio"
              className="p-1.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.header>

      {/* ── Prompt Panel ───────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-zinc-800/50">
        <label htmlFor="weaver-prompt" className="sr-only">
          Describe the component you want Weaver to generate
        </label>
        <div className="relative">
          <textarea
            id="weaver-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder='Describe a widget… e.g. "A live sovereign clock card with glowing border"'
            rows={2}
            aria-describedby="weaver-prompt-hint"
            disabled={status === "loading"}
            className="w-full resize-none rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-200 placeholder-zinc-600 px-3.5 py-2 pr-20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          />
          <span
            id="weaver-prompt-hint"
            className="absolute bottom-2 right-3 text-[10px] font-mono text-zinc-600 pointer-events-none"
          >
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-mono text-zinc-600 select-none">
            <kbd className="px-1 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-500">
              ⌘ Enter
            </kbd>{" "}
            to synthesize · or edit directly in Code &amp; Meta
          </span>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
              bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white
              shadow-[0_0_16px_rgba(139,92,246,0.3)] hover:shadow-[0_0_24px_rgba(139,92,246,0.5)]
              disabled:shadow-none"
          >
            {status === "loading" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {status === "loading" ? "Synthesizing…" : "Synthesize"}
          </button>
        </div>
      </div>

      {/* ── Error & Action Banners ─────────────────────────────────────── */}
      <AnimatePresence>
        {status === "error" && errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div
              role="alert"
              className="flex items-start gap-2.5 mx-4 my-1.5 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-700/40 text-rose-300 text-xs font-mono"
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          </motion.div>
        )}
        {actionBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div
              className={`flex items-center justify-between mx-4 my-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono ${actionBanner.kind === "ok"
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

      {/* ── View Toggle ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 pt-2 pb-1 shrink-0" role="tablist" aria-label="View mode">
        {(
          [
            { mode: "preview" as ViewMode, icon: Eye, label: "Preview" },
            { mode: "code" as ViewMode, icon: Code2, label: "Code & Meta" },
            {
              mode: "widgets" as ViewMode,
              icon: Layers,
              label: `Saved Widgets (${savedWidgets.length})`,
            },
          ]
        ).map(({ mode, icon: Icon, label }) => {
          const isActive = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 select-none ${isActive
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent"
                }`}
            >
              <Icon className="w-3 h-3" aria-hidden="true" />
              {label}
            </button>
          );
        })}

        {result?.meta && (
          <span className="ml-auto text-[10px] font-mono text-zinc-600">
            {result.meta.model} · {result.meta.durationMs}ms
          </span>
        )}
      </div>

      {/* ── Content Area ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {status === "loading" ? (
          <div className="w-full h-full flex items-center justify-center" role="status">
            <WeaverSpinner />
          </div>
        ) : viewMode === "preview" ? (
          <div className="w-full h-full">
            <PreviewPane component={activePreviewComponent} />
          </div>
        ) : viewMode === "code" ? (
          <div className="w-full h-full overflow-auto">
            <CodeMetaPane
              title={draftTitle}
              code={draftCode}
              dependencies={draftDeps}
              meta={result?.meta}
              onTitleChange={setDraftTitle}
              onCodeChange={setDraftCode}
            />
          </div>
        ) : (
          <div className="w-full h-full overflow-hidden">
            <SavedWidgetsPane
              widgets={savedWidgets}
              activeWidgetId={activeWidgetId}
              isLoading={isLoadingWidgets}
              busyWidgetId={busyRowId}
              onSelectWidget={applySelectedWidget}
              onTogglePublish={handleToggleRowPublish}
            />
          </div>
        )}
      </div>

      {/* ── Lifecycle Action Bar ───────────────────────────────────────── */}
      {hasDraftContent && (
        <footer
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 shrink-0 border-t border-zinc-800/50 bg-zinc-900/50"
          aria-label="Component lifecycle actions"
        >
          <div className="flex items-center gap-2 text-xs font-mono min-w-0">
            <ChevronRight className="w-3 h-3 text-violet-500 shrink-0" />
            <span className="text-violet-300 truncate">{draftTitle.trim()}</span>
            <PublicationBadge status={activePublicationStatus} />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraftOrUpdate}
              disabled={actionBusy !== "idle"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-700/60 bg-zinc-800/70 text-zinc-200 hover:bg-violet-900/30 hover:border-violet-600/40 disabled:opacity-40 transition-colors"
            >
              {activeWidgetId ? <Save className="w-3 h-3" /> : <BookMarked className="w-3 h-3" />}
              {actionBusy === "saving"
                ? "Saving…"
                : activeWidgetId
                  ? "Save Changes"
                  : "Save Private Draft"}
            </button>

            {activePublicationStatus === "published" ? (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={actionBusy !== "idle"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-600/60 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                <EyeOff className="w-3 h-3" />
                {actionBusy === "unpublishing" ? "Unpublishing…" : "Unpublish"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={actionBusy !== "idle"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-600/40 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-40 transition-colors"
              >
                <Globe className="w-3 h-3" />
                {actionBusy === "publishing" ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );

  if (embedded) {
    return shellContent;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 6 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="absolute flex flex-col"
      style={{
        zIndex,
        left: pos.x,
        top: pos.y,
        width: 740,
        height: 680,
        minWidth: 540,
        minHeight: 480,
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
