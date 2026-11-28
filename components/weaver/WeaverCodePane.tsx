import React, { useMemo, useState } from "react";
import {
  FileCode2,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Check,
  GitCompare,
  Code2,
  RotateCcw,
} from "lucide-react";
import { useWeaverStore } from "../../store/weaverStore";
import { WEAVER_PROTECTED_FILES } from "../../lib/weaverProject";
import { computeFileDiffSummary, computeLineDiff } from "../../lib/weaverDiff";

const PROTECTED_SET = new Set<string>(WEAVER_PROTECTED_FILES);

export const WeaverCodePane: React.FC = () => {
  const files = useWeaverStore((s) => s.files);
  const previousFiles = useWeaverStore((s) => s.previousFiles);
  const selectedFilePath = useWeaverStore((s) => s.selectedFilePath);
  const editorMode = useWeaverStore((s) => s.editorMode);
  const selectFile = useWeaverStore((s) => s.selectFile);
  const updateFileContent = useWeaverStore((s) => s.updateFileContent);
  const createFile = useWeaverStore((s) => s.createFile);
  const deleteFile = useWeaverStore((s) => s.deleteFile);
  const revertFileToPrevious = useWeaverStore((s) => s.revertFileToPrevious);
  const setEditorMode = useWeaverStore((s) => s.setEditorMode);

  const [isAddingFile, setIsAddingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const diffSummary = useMemo(
    () => computeFileDiffSummary(previousFiles, files),
    [previousFiles, files]
  );

  const groupedPaths = useMemo(() => {
    const paths = Object.keys(files).sort((a, b) => {
      const aNested = a.includes("/") ? 1 : 0;
      const bNested = b.includes("/") ? 1 : 0;
      if (aNested !== bNested) return aNested - bNested;
      return a.localeCompare(b);
    });
    const groups: Record<string, string[]> = {};
    for (const p of paths) {
      const folder = p.includes("/") ? p.split("/")[0] : "root";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(p);
    }
    return groups;
  }, [files]);

  const activeFile = files[selectedFilePath] ?? Object.values(files)[0];
  const activeDiff = activeFile ? diffSummary[activeFile.path] : undefined;
  const previousContent = activeFile ? previousFiles[activeFile.path]?.content ?? "" : "";

  const diffLines = useMemo(() => {
    if (!activeFile) return [];
    return computeLineDiff(previousContent, activeFile.content);
  }, [previousContent, activeFile]);

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = createFile(newFilePath.trim(), "");
    if (!ok) {
      setNewFileError("Use valid path (e.g. components/Badge.tsx or api/client.ts)");
      return;
    }
    setNewFilePath("");
    setNewFileError(null);
    setIsAddingFile(false);
  };

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const canRevert =
    Boolean(activeFile) &&
    Boolean(previousFiles[activeFile.path]) &&
    previousFiles[activeFile.path].content !== activeFile.content;

  return (
    <section
      className="flex-1 min-w-[320px] h-full flex border-r border-zinc-800/80 bg-zinc-950/40 overflow-hidden"
      aria-label="File Explorer and Code Editor"
    >
      {/* File Tree Explorer */}
      <div className="w-[175px] shrink-0 h-full flex flex-col border-r border-zinc-800/70 bg-zinc-950/70">
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-zinc-800/70 shrink-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Files
          </span>
          <button
            type="button"
            onClick={() => {
              setIsAddingFile((v) => !v);
              setNewFileError(null);
            }}
            title="New virtual file"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-violet-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {isAddingFile && (
          <form
            onSubmit={handleCreateFile}
            className="p-2 border-b border-zinc-800/70 space-y-1.5 bg-zinc-900/60"
          >
            <input
              type="text"
              value={newFilePath}
              onChange={(e) => {
                setNewFilePath(e.target.value);
                setNewFileError(null);
              }}
              placeholder="components/Card.tsx"
              autoFocus
              className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-[11px] font-mono text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            {newFileError && (
              <p className="text-[10px] text-rose-400 leading-tight">{newFileError}</p>
            )}
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setIsAddingFile(false)}
                className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2 py-0.5 rounded bg-violet-600 text-[10px] font-mono text-white"
              >
                Add
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
          {Object.entries(groupedPaths).map(([folder, paths]) => (
            <div key={folder}>
              {folder !== "root" && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  <FolderOpen className="w-3 h-3 text-violet-400/70" />
                  <span>{folder}/</span>
                </div>
              )}
              <ul className="space-y-0.5">
                {paths.map((filePath) => {
                  const isSelected = activeFile?.path === filePath;
                  const summary = diffSummary[filePath];
                  const isProtected = PROTECTED_SET.has(filePath);
                  const displayName = filePath.includes("/")
                    ? filePath.slice(filePath.indexOf("/") + 1)
                    : filePath;

                  return (
                    <li key={filePath} className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => selectFile(filePath)}
                        className={`flex-1 flex items-center justify-between gap-1.5 px-2 py-1 rounded-md text-left text-[11px] font-mono transition-colors min-w-0 ${
                          isSelected
                            ? "bg-violet-600/20 text-violet-200 border border-violet-500/30"
                            : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <FileCode2 className="w-3 h-3 shrink-0 opacity-70" />
                          <span className="truncate">{displayName}</span>
                        </span>
                        {summary?.status === "added" && (
                          <span className="text-[9px] font-bold text-emerald-400 shrink-0">A</span>
                        )}
                        {summary?.status === "modified" && (
                          <span className="text-[9px] font-bold text-amber-400 shrink-0">M</span>
                        )}
                      </button>
                      {!isProtected && (
                        <button
                          type="button"
                          onClick={() => deleteFile(filePath)}
                          aria-label={`Delete ${filePath}`}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Code / Diff Editor */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {activeFile ? (
          <>
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-800/70 bg-zinc-900/50 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-zinc-200 truncate">{activeFile.path}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                  {activeFile.language}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorMode("code")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      editorMode === "code"
                        ? "bg-violet-600/30 text-violet-200"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode("diff")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      editorMode === "diff"
                        ? "bg-violet-600/30 text-violet-200"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <GitCompare className="w-3 h-3" />
                    Diff
                    {activeDiff && (activeDiff.addedLines > 0 || activeDiff.removedLines > 0) && (
                      <span className="ml-0.5">
                        <span className="text-emerald-400">+{activeDiff.addedLines}</span>{" "}
                        <span className="text-rose-400">-{activeDiff.removedLines}</span>
                      </span>
                    )}
                  </button>
                </div>

                {canRevert && (
                  <button
                    type="button"
                    onClick={() => revertFileToPrevious(activeFile.path)}
                    title="Revert file to previous snapshot"
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy file contents"
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-violet-300"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {editorMode === "diff" ? (
              <div className="flex-1 overflow-auto font-mono text-[11px] leading-5 bg-zinc-950/90">
                {diffLines.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500">Empty file.</div>
                ) : (
                  diffLines.map((line, idx) => {
                    const rowClass =
                      line.type === "added"
                        ? "bg-emerald-950/50 text-emerald-200"
                        : line.type === "removed"
                          ? "bg-rose-950/50 text-rose-200"
                          : "text-zinc-400";
                    const prefix =
                      line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
                    return (
                      <div key={idx} className={`flex px-2 whitespace-pre ${rowClass}`}>
                        <span className="w-8 shrink-0 text-right pr-2 text-zinc-600 select-none">
                          {line.oldLineNumber ?? ""}
                        </span>
                        <span className="w-8 shrink-0 text-right pr-2 text-zinc-600 select-none">
                          {line.newLineNumber ?? ""}
                        </span>
                        <span className="w-4 shrink-0 select-none font-bold opacity-80">
                          {prefix}
                        </span>
                        <span className="flex-1">{line.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex bg-zinc-950/90 overflow-hidden">
                <div
                  aria-hidden="true"
                  className="w-10 py-3 pr-2 text-right font-mono text-[11px] leading-5 text-zinc-600 select-none border-r border-zinc-900 overflow-hidden shrink-0"
                >
                  {activeFile.content.split("\n").map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <textarea
                  value={activeFile.content}
                  onChange={(e) => updateFileContent(activeFile.path, e.target.value)}
                  spellCheck={false}
                  aria-label={`Source editor for ${activeFile.path}`}
                  className="flex-1 w-full h-full resize-none bg-transparent p-3 font-mono text-[11px] leading-5 text-emerald-200/90 focus:outline-none overflow-auto whitespace-pre"
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500">
            Select a file to inspect or edit.
          </div>
        )}
      </div>
    </section>
  );
};

export default WeaverCodePane;
