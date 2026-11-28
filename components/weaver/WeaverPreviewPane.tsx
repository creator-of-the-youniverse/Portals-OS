import React, { useState } from "react";
import {
  Monitor,
  Smartphone,
  Crosshair,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Wand2,
} from "lucide-react";
import { useWeaverStore } from "../../store/weaverStore";
import WeaverSandbox from "./WeaverSandbox";

interface WeaverPreviewPaneProps {
  onFixRuntimeError: (errorMessage: string) => void;
}

export const WeaverPreviewPane: React.FC<WeaverPreviewPaneProps> = ({
  onFixRuntimeError,
}) => {
  const files = useWeaverStore((s) => s.files);
  const entryFile = useWeaverStore((s) => s.entryFile);
  const title = useWeaverStore((s) => s.title);
  const sandboxConfig = useWeaverStore((s) => s.sandboxConfig);
  const setViewport = useWeaverStore((s) => s.setViewport);
  const annotationMode = useWeaverStore((s) => s.annotationMode);
  const toggleAnnotationMode = useWeaverStore((s) => s.toggleAnnotationMode);
  const setSelectedAnnotation = useWeaverStore((s) => s.setSelectedAnnotation);
  const runtimeErrors = useWeaverStore((s) => s.runtimeErrors);
  const runtimeWarnings = useWeaverStore((s) => s.runtimeWarnings);
  const pushRuntimeError = useWeaverStore((s) => s.pushRuntimeError);
  const clearRuntimeErrors = useWeaverStore((s) => s.clearRuntimeErrors);
  const pushRuntimeWarning = useWeaverStore((s) => s.pushRuntimeWarning);

  const [refreshKey, setRefreshKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const errorCount = runtimeErrors.length;
  const warningCount = runtimeWarnings.length;

  return (
    <section
      className="flex-1 min-w-[300px] h-full flex flex-col bg-zinc-950/60 overflow-hidden"
      aria-label="Live Sandboxed Preview"
    >
      {/* Preview Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              aria-pressed={sandboxConfig.viewport === "desktop"}
              title="Desktop viewport"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                sandboxConfig.viewport === "desktop"
                  ? "bg-violet-600/30 text-violet-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Monitor className="w-3 h-3" />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              aria-pressed={sandboxConfig.viewport === "mobile"}
              title="Mobile viewport (390px)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                sandboxConfig.viewport === "mobile"
                  ? "bg-violet-600/30 text-violet-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Smartphone className="w-3 h-3" />
              Mobile
            </button>
          </div>

          <button
            type="button"
            onClick={toggleAnnotationMode}
            aria-pressed={annotationMode}
            title="Point & Edit: click any element in preview to target it in your prompt"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono transition-all ${
              annotationMode
                ? "bg-violet-600/30 border-violet-400 text-violet-100 shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                : "bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Crosshair className="w-3 h-3" />
            {annotationMode ? "Selecting…" : "Annotate"}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {errorCount > 0 && (
            <button
              type="button"
              onClick={() => setConsoleOpen(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-600/40 text-rose-300 text-[10px] font-mono"
            >
              <AlertTriangle className="w-3 h-3" />
              {errorCount}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Reload preview"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Sandboxed Preview */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <WeaverSandbox
          files={files}
          entryFile={entryFile}
          componentName={title}
          viewport={sandboxConfig.viewport}
          annotationMode={annotationMode}
          refreshKey={refreshKey}
          onRuntimeError={(err) => {
            if (err) {
              pushRuntimeError(err);
              setConsoleOpen(true);
            }
          }}
          onRuntimeWarning={(warn) => {
            if (warn) pushRuntimeWarning(warn);
          }}
          onRenderSuccess={() => {
            clearRuntimeErrors();
          }}
          onElementSelected={(annotation) => {
            setSelectedAnnotation(annotation);
          }}
        />
      </div>

      {/* Collapsible Runtime Console Drawer */}
      <div className="border-t border-zinc-800/80 bg-zinc-950/90 shrink-0">
        <button
          type="button"
          onClick={() => setConsoleOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
        >
          <span className="flex items-center gap-2">
            <span>Runtime Console</span>
            {errorCount > 0 && (
              <span className="text-rose-400">{errorCount} error{errorCount > 1 ? "s" : ""}</span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-400">{warningCount} warn</span>
            )}
          </span>
          {consoleOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {consoleOpen && (
          <div className="max-h-36 overflow-y-auto px-3 pb-2.5 space-y-1.5 border-t border-zinc-900">
            <div className="flex justify-end pt-1">
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={clearRuntimeErrors}
                  className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            {errorCount === 0 && warningCount === 0 ? (
              <p className="text-[11px] font-mono text-zinc-600">No runtime errors captured.</p>
            ) : (
              <>
                {runtimeErrors.map((err, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-2 p-2 rounded bg-rose-950/40 border border-rose-700/30 text-[11px] font-mono text-rose-200"
                  >
                    <span className="break-words">{err}</span>
                    <button
                      type="button"
                      onClick={() => onFixRuntimeError(err)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-700/40 hover:bg-rose-600/50 text-[10px] text-rose-100 shrink-0"
                    >
                      <Wand2 className="w-2.5 h-2.5" />
                      Fix
                    </button>
                  </div>
                ))}
                {runtimeWarnings.map((warn, i) => (
                  <div
                    key={`w-${i}`}
                    className="p-1.5 rounded bg-amber-950/30 border border-amber-700/30 text-[10px] font-mono text-amber-300"
                  >
                    {warn}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default WeaverPreviewPane;
