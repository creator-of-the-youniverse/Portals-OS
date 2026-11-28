import React, { useRef, type KeyboardEvent } from "react";
import {
  Wand2,
  Loader2,
  Sparkles,
  Braces,
  Globe,
  Inbox,
  Crosshair,
  X,
  AlertTriangle,
  History,
  RotateCcw,
} from "lucide-react";
import { useWeaverStore } from "../../store/weaverStore";
import type { WeaverAiChips } from "../../lib/weaverProject";

interface WeaverPromptPaneProps {
  onGenerate: (overridePrompt?: string) => void;
}

const MAX_PROMPT_LENGTH = 4_000;

const AI_CHIP_META: Array<{
  key: keyof WeaverAiChips;
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { key: "imageGen", label: "Image Gen", hint: "Scaffold visual/SVG asset generator", icon: Sparkles },
  { key: "structuredJson", label: "Structured JSON", hint: "Enforce typed JSON schema inference", icon: Braces },
  { key: "liveGrounding", label: "Live Grounding", hint: "Enable cited live web grounding", icon: Globe },
  { key: "collectionPoint", label: "Collection Point", hint: "Add NotNotes lead/data capture primitive", icon: Inbox },
];

export const WeaverPromptPane: React.FC<WeaverPromptPaneProps> = ({ onGenerate }) => {
  const prompt = useWeaverStore((s) => s.prompt);
  const setPrompt = useWeaverStore((s) => s.setPrompt);
  const generationStatus = useWeaverStore((s) => s.generationStatus);
  const generationError = useWeaverStore((s) => s.generationError);
  const files = useWeaverStore((s) => s.files);
  const sandboxConfig = useWeaverStore((s) => s.sandboxConfig);
  const toggleAiChip = useWeaverStore((s) => s.toggleAiChip);
  const selectedAnnotation = useWeaverStore((s) => s.selectedAnnotation);
  const clearSelectedAnnotation = useWeaverStore((s) => s.clearSelectedAnnotation);
  const runtimeErrors = useWeaverStore((s) => s.runtimeErrors);
  const iterations = useWeaverStore((s) => s.iterations);
  const restoreIteration = useWeaverStore((s) => s.restoreIteration);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileCount = Object.keys(files).length;
  const isLoading = generationStatus === "loading";
  const canSubmit = prompt.trim().length > 0 && !isLoading;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) onGenerate();
    }
  };

  const handleQuickFixError = () => {
    const latestError = runtimeErrors[0];
    if (!latestError || isLoading) return;
    const fixPrompt = `Fix the sandbox runtime error: ${latestError}`;
    setPrompt(fixPrompt);
    onGenerate(fixPrompt);
  };

  return (
    <aside
      className="w-[300px] min-w-[260px] max-w-[360px] shrink-0 h-full flex flex-col border-r border-zinc-800/80 bg-zinc-950/60"
      aria-label="Weaver Prompt and Iteration History"
    >
      {/* Composer */}
      <div className="p-3 border-b border-zinc-800/80 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          <span>Build Prompt</span>
          <span className="text-violet-400/80">Context: {fileCount} files</span>
        </div>

        {/* Selected Element Annotation Chip */}
        {selectedAnnotation && (
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-violet-950/50 border border-violet-500/40 text-[11px] font-mono text-violet-200">
            <div className="flex items-start gap-1.5 min-w-0">
              <Crosshair className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  &lt;{selectedAnnotation.tagName}&gt;{" "}
                  <span className="text-violet-300/70 font-normal">
                    {selectedAnnotation.rect.width}×{selectedAnnotation.rect.height}
                  </span>
                </div>
                <div className="text-[10px] text-violet-300/70 truncate">
                  {selectedAnnotation.domPath}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelectedAnnotation}
              aria-label="Clear selected element"
              className="text-violet-400 hover:text-white p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* One-Click Fix Error Chip */}
        {runtimeErrors.length > 0 && (
          <button
            type="button"
            disabled={isLoading}
            onClick={handleQuickFixError}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/50 border border-rose-600/40 text-rose-200 text-[11px] font-mono transition-colors disabled:opacity-40"
          >
            <span className="flex items-center gap-1.5 truncate">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">Fix runtime error ({runtimeErrors.length})</span>
            </span>
            <span className="text-[10px] text-rose-300 uppercase shrink-0">Auto-Fix</span>
          </button>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            id="weaver-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={4}
            placeholder={
              selectedAnnotation
                ? `Describe changes for <${selectedAnnotation.tagName}>…`
                : 'Describe targeted edits or a new feature… (e.g. "Add a pricing toggle and dark glass stats bar")'
            }
            className="w-full resize-none rounded-xl bg-zinc-900/80 border border-zinc-700/60 text-xs text-zinc-100 placeholder-zinc-500 px-3 py-2 pb-6 focus:outline-none focus:ring-1 focus:ring-violet-500/60 disabled:opacity-50 leading-relaxed"
          />
          <span className="absolute bottom-1.5 right-2.5 text-[10px] font-mono text-zinc-600 pointer-events-none">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>

        {/* AI Chips Toggles */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
            AI Chips
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {AI_CHIP_META.map(({ key, label, hint, icon: Icon }) => {
              const active = sandboxConfig.activeChips[key];
              return (
                <button
                  key={key}
                  type="button"
                  title={hint}
                  aria-pressed={active}
                  onClick={() => toggleAiChip(key)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-mono transition-all ${
                    active
                      ? "bg-violet-600/20 border-violet-500/60 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {generationStatus === "error" && generationError && (
          <div
            role="alert"
            className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-rose-950/50 border border-rose-700/40 text-rose-300 text-[11px] font-mono"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
            <span className="break-words">{generationError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] font-mono text-zinc-500">⌘/Ctrl + Enter</span>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onGenerate()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(139,92,246,0.3)]"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isLoading ? "Synthesizing…" : "Apply Edit"}
          </button>
        </div>
      </div>

      {/* Iteration History */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 text-[10px] font-mono uppercase tracking-wider text-zinc-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <History className="w-3 h-3" />
            Iteration History
          </span>
          <span>{iterations.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {iterations.length === 0 ? (
            <p className="text-[11px] font-mono text-zinc-600 text-center py-6 px-2">
              No iterations yet. Prompt Weaver to make targeted multi-file edits.
            </p>
          ) : (
            [...iterations].reverse().map((iter) => {
              const activeChips = Object.entries(iter.aiChips || {})
                .filter(([, on]) => on)
                .map(([k]) => k);
              return (
                <div
                  key={iter.id}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-zinc-200 leading-snug line-clamp-2">
                      {iter.prompt}
                    </p>
                    {iter.snapshot && (
                      <button
                        type="button"
                        onClick={() => restoreIteration(iter.id)}
                        title="Restore workspace to before this edit"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-violet-900/40 border border-zinc-700 text-[10px] font-mono text-zinc-300 shrink-0"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Restore
                      </button>
                    )}
                  </div>
                  {iter.summary && (
                    <p className="text-[11px] text-zinc-400 leading-snug">{iter.summary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {iter.changedFiles.map((filePath) => (
                      <span
                        key={filePath}
                        className="px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-700/30 text-[10px] font-mono text-emerald-300 truncate max-w-full"
                      >
                        {filePath}
                      </span>
                    ))}
                    {activeChips.map((chip) => (
                      <span
                        key={chip}
                        className="px-1.5 py-0.5 rounded bg-violet-950/50 border border-violet-700/30 text-[10px] font-mono text-violet-300"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-600">
                    {new Date(iter.createdAt).toLocaleTimeString()}
                    {iter.durationMs ? ` · ${iter.durationMs}ms` : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};

export default WeaverPromptPane;
