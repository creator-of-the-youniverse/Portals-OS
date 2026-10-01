/**
 * components/weaver/WeaverStudio.tsx
 *
 * The Weaver Studio — spatial UI architect interface for Portals OS.
 *
 * Architecture:
 *   ┌─ WeaverStudio (root, draggable window container)
 *   ├─ WindowHeader      — title bar, status indicator, minimize/close
 *   ├─ PromptPanel       — textarea + Synthesize button + keyboard shortcut
 *   ├─ ViewToggle        — Preview ↔ Code/Meta tab switcher
 *   ├─ PreviewPane       — live sandboxed React component via iframe srcdoc
 *   └─ CodeMetaPane      — name, dependencies, JSON schema, raw JSX
 *
 * Security:
 *   - JWT token is read from sessionStorage ("weaver_jwt") or a prop.
 *   - The API key never touches the client — the endpoint handles it.
 *   - Raw generated code is rendered in an isolated <iframe> sandbox;
 *     it cannot access parent window, cookies, or localStorage.
 *
 * NotNotes integration:
 *   - "Save to NotNotes" calls addDeliverable() on the Zustand kernel store,
 *     consistent with how other agents deliver payloads.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
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
} from "lucide-react";
import { nanoid } from "nanoid";
import { useKernel } from "../../store/kernel";
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
  meta: {
    model: string;
    generatedAt: string;
    durationMs: number;
  };
  error?: string;
  message?: string;
}

type ViewMode = "preview" | "code";
type GenerationStatus = "idle" | "loading" | "success" | "error";

interface WeaverStudioProps {
  /** JWT from the active session. Falls back to sessionStorage["weaver_jwt"]. */
  jwtToken?: string;
  /** Called when the user clicks the minimize button. */
  onMinimize?: () => void;
  /** Called when the user clicks the close button. */
  onClose?: () => void;
  /** Initial z-index for stacking. */
  zIndex?: number;
  /** Initial position on the desktop. */
  initialPosition?: { x: number; y: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEAVER_ENDPOINT = "/api/weaver/generate";
const NOTNOTES_ENDPOINT = "/api/notnotes/deliverable"; // future endpoint
const MAX_PROMPT_LENGTH = 4_000;

// Violet-themed glow matching the WEAVER speaker pill colour in SpeakerPills.tsx
const GLOW_COLOR = "rgba(139,92,246,0.35)"; // violet-500/35

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated pulsating status dot */
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

/** Spinning Gemini-violet loader used during generation */
const WeaverSpinner: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="flex flex-col items-center justify-center gap-4 py-10"
    aria-label="Generating component"
    role="status"
  >
    {/* Outer glow ring */}
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

/** Copy-to-clipboard button with transient ✓ feedback */
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

/** Preview pane — renders generated JSX via WeaverSandbox */
const PreviewPane: React.FC<{ component: WeaverComponent | null }> = ({
  component,
}) => {
  if (!component) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 select-none">
        <Sparkles className="w-8 h-8 opacity-30" />
        <p className="text-xs font-mono tracking-widest uppercase opacity-40">
          Awaiting synthesis
        </p>
      </div>
    );
  }

  return (
    <WeaverSandbox code={component.code} componentName={component.name} />
  );
};

/** Code + Meta pane — structured component metadata and raw JSX */
const CodeMetaPane: React.FC<{ component: WeaverComponent | null; meta?: WeaverApiResponse["meta"] }> = ({
  component,
  meta,
}) => {
  if (!component) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 select-none">
        <Code2 className="w-8 h-8 opacity-30" />
        <p className="text-xs font-mono tracking-widest uppercase opacity-40">
          No component generated yet
        </p>
      </div>
    );
  }

  // Build the JSON schema fingerprint for display
  const schemaDisplay = JSON.stringify(
    {
      name: component.name,
      dependencies: component.dependencies,
      codeLength: `${component.code.length} chars`,
      ...(meta ? { model: meta.model, generatedAt: meta.generatedAt, durationMs: `${meta.durationMs}ms` } : {}),
    },
    null,
    2
  );

  return (
    <div className="flex flex-col h-full overflow-auto divide-y divide-zinc-800/60">
      {/* Component identity */}
      <section className="px-4 py-3 shrink-0" aria-label="Component identity">
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
          Component Name
        </p>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-violet-300 font-mono">
            {component.name}
          </h3>
          <CopyButton text={component.name} label="Copy name" />
        </div>
      </section>

      {/* Dependencies */}
      <section className="px-4 py-3 shrink-0" aria-label="Dependencies">
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
          Dependencies
        </p>
        {component.dependencies.length === 0 ? (
          <p className="text-xs text-zinc-600 font-mono italic">
            None — uses only React &amp; Tailwind
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {component.dependencies.map((dep) => (
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

      {/* JSON schema / meta */}
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

      {/* Raw JSX source */}
      <section className="px-4 py-3 flex-1 min-h-0 flex flex-col" aria-label="Raw JSX source">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            JSX Source
          </p>
          <CopyButton text={component.code} label="Copy JSX" />
        </div>
        <pre className="flex-1 text-[11px] font-mono text-emerald-300/80 bg-zinc-950/60 rounded-lg p-3 overflow-auto leading-relaxed border border-zinc-800/50 whitespace-pre">
          {component.code}
        </pre>
      </section>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const WeaverStudio: React.FC<WeaverStudioProps> = ({
  jwtToken,
  onMinimize,
  onClose,
  zIndex = 200,
  initialPosition = { x: 120, y: 60 },
}) => {
  // ── Kernel store ─────────────────────────────────────────────────────────
  const addDeliverable = useKernel((s) => s.addDeliverable);
  const onboarding    = useKernel((s) => s.onboarding);

  // ── Local state ───────────────────────────────────────────────────────────
  const [prompt, setPrompt]           = useState("");
  const [viewMode, setViewMode]       = useState<ViewMode>("preview");
  const [status, setStatus]           = useState<GenerationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult]           = useState<WeaverApiResponse | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Drag position — self-managed (not through Kernel) since Weaver Studio
  // can be used as a standalone overlay outside the Window system too.
  const [pos, setPos] = useState(initialPosition);
  const dragOrigin    = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resolve JWT: prop > sessionStorage fallback
  const resolvedJwt = jwtToken ?? sessionStorage.getItem("weaver_jwt") ?? "";

  // ── Drag handlers ─────────────────────────────────────────────────────────
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

  // ── Keyboard shortcut (Cmd/Ctrl + Enter) ──────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prompt, resolvedJwt]
  );

  // ── Generation ────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || status === "loading") return;

    if (!resolvedJwt) {
      setStatus("error");
      setErrorMessage("No active session token found. Please log in first.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch(WEAVER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedJwt}`,
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data: WeaverApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? `Request failed with status ${response.status}`);
      }

      setResult(data);
      setStatus("success");
      setViewMode("preview");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error occurred.";
      setStatus("error");
      setErrorMessage(message);
    }
  }, [prompt, resolvedJwt, status]);

  // ── Save to NotNotes ──────────────────────────────────────────────────────
  const handleSaveToNotNotes = useCallback(async () => {
    if (!result?.component || saveFeedback === "saving") return;

    setSaveFeedback("saving");

    try {
      const response = await fetch('/api/not-notes/artifact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolvedJwt}`,
        },
        body: JSON.stringify({
          title: result.component.name,
          code: result.component.code,
          dependencies: result.component.dependencies,
        })
      });

      const data = await response.json();
      if (data.success) {
        setSaveFeedback("saved");
        setTimeout(() => setSaveFeedback("idle"), 2500);
      } else {
        console.error("Save to NotNotes failed:", data.error);
        setSaveFeedback("error");
        setTimeout(() => setSaveFeedback("idle"), 2500);
      }
    } catch (err) {
      console.error("Network error saving to NotNotes:", err);
      setSaveFeedback("error");
      setTimeout(() => setSaveFeedback("idle"), 2500);
    }
  }, [result, resolvedJwt, saveFeedback]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canGenerate = prompt.trim().length > 0 && status !== "loading";
  const hasResult   = status === "success" && result?.component != null;

  // ── Render ────────────────────────────────────────────────────────────────
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
      {/* ── Frosted glass shell ───────────────────────────────────────────── */}
      <div
        className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-zinc-700/50 bg-zinc-900/80 backdrop-blur-md shadow-2xl"
        style={{ boxShadow: `0 0 0 1px rgba(139,92,246,0.12), 0 24px 64px -12px rgba(0,0,0,0.7), 0 0 60px -20px ${GLOW_COLOR}` }}
      >

        {/* ── Window Header ────────────────────────────────────────────────── */}
        <motion.header
          onPanStart={handleDragStart}
          onPan={handleDrag}
          className="flex items-center justify-between h-10 px-3 shrink-0 select-none border-b border-zinc-700/40 bg-zinc-900/60 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
          aria-label="Weaver Studio window header"
        >
          {/* Left: identity */}
          <div className="flex items-center gap-2.5 pointer-events-none">
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
            <span className="hidden sm:block text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              · Spatial UI Architect
            </span>
          </div>

          {/* Centre: status */}
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
            <StatusDot status={status} />
          </div>

          {/* Right: window controls */}
          <div className="flex items-center gap-0.5 pointer-events-auto">
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize Weaver Studio"
              className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Weaver Studio"
              className="p-1.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.header>

        {/* ── Prompt Panel ─────────────────────────────────────────────────── */}
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
              placeholder='Describe a component… e.g. "A spatial dock with floating app icons that glow on hover"'
              rows={3}
              aria-describedby="weaver-prompt-hint"
              disabled={status === "loading"}
              className="w-full resize-none rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-200 placeholder-zinc-600 px-3.5 py-2.5 pr-24 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
            />
            {/* Character count */}
            <span
              id="weaver-prompt-hint"
              aria-label={`${prompt.length} of ${MAX_PROMPT_LENGTH} characters`}
              className="absolute bottom-2.5 right-3 text-[10px] font-mono text-zinc-600 pointer-events-none"
            >
              {prompt.length}/{MAX_PROMPT_LENGTH}
            </span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] font-mono text-zinc-600 select-none">
              <kbd className="px-1 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-500">
                ⌘ Enter
              </kbd>
              {" "}to synthesize
            </span>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              aria-label={status === "loading" ? "Synthesizing…" : "Synthesize component"}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
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

        {/* ── Error banner ──────────────────────────────────────────────────── */}
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
                className="flex items-start gap-2.5 mx-4 my-2 px-3.5 py-2.5 rounded-lg bg-rose-950/40 border border-rose-700/40 text-rose-300 text-xs font-mono leading-relaxed"
              >
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── View Toggle ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-4 pt-2 pb-1 shrink-0" role="tablist" aria-label="View mode">
          {(["preview", "code"] as ViewMode[]).map((mode) => {
            const Icon = mode === "preview" ? Eye : Code2;
            const label = mode === "preview" ? "Preview" : "Code & Meta";
            const isActive = viewMode === mode;

            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`weaver-panel-${mode}`}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 select-none
                  ${isActive
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent"
                  }`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {label}
              </button>
            );
          })}

          {/* Generation duration badge */}
          {hasResult && result?.meta && (
            <span className="ml-auto text-[10px] font-mono text-zinc-600">
              {result.meta.model} · {result.meta.durationMs}ms
            </span>
          )}
        </div>

        {/* ── Content area ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {status === "loading" ? (
              <motion.div
                key="spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex items-center justify-center"
                role="status"
              >
                <WeaverSpinner />
              </motion.div>
            ) : viewMode === "preview" ? (
              <motion.div
                key="preview"
                id="weaver-panel-preview"
                role="tabpanel"
                aria-label="Component preview"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                className="w-full h-full"
              >
                <PreviewPane component={result?.component ?? null} />
              </motion.div>
            ) : (
              <motion.div
                key="code"
                id="weaver-panel-code"
                role="tabpanel"
                aria-label="Component code and metadata"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="w-full h-full overflow-auto"
              >
                <CodeMetaPane component={result?.component ?? null} meta={result?.meta} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Action Bar ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {hasResult && (
            <motion.footer
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-4 py-2.5 shrink-0 border-t border-zinc-800/50 bg-zinc-900/40"
              aria-label="Component actions"
            >
              {/* Component name badge */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <ChevronRight className="w-3 h-3 text-violet-500" aria-hidden="true" />
                <span className="text-violet-300">{result?.component?.name}</span>
                {result?.component && result.component.dependencies.length > 0 && (
                  <span className="text-zinc-600">
                    · {result.component.dependencies.length} dep{result.component.dependencies.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Save to NotNotes */}
              <button
                type="button"
                onClick={handleSaveToNotNotes}
                disabled={saveFeedback === "saving" || saveFeedback === "saved"}
                aria-label={
                  saveFeedback === "saved"
                    ? "Saved to Not Notes"
                    : saveFeedback === "saving"
                    ? "Saving…"
                    : "Save component to Not Notes"
                }
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border
                  ${saveFeedback === "saved"
                    ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-300 cursor-default"
                    : saveFeedback === "error"
                    ? "bg-rose-950/40 border-rose-600/40 text-rose-300"
                    : "bg-zinc-800/60 border-zinc-700/50 text-zinc-300 hover:bg-violet-900/30 hover:border-violet-600/40 hover:text-violet-200 hover:shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                  }`}
              >
                {saveFeedback === "saved" ? (
                  <Check className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <BookMarked className="w-3 h-3" aria-hidden="true" />
                )}
                {saveFeedback === "saved"
                  ? "Saved to Not Notes"
                  : saveFeedback === "saving"
                  ? "Saving…"
                  : saveFeedback === "error"
                  ? "Save failed — retry"
                  : "Save to Not Notes"}
              </button>
            </motion.footer>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default WeaverStudio;
