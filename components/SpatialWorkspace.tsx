/**
 * @file SpatialWorkspace
 *
 * Renders the synthesized Spatial Geometry and Core Primaries tailored to
 * the user's Foundation Laws. Modulates:
 *   - Layout (single-focus, split-grid, spatial-board, encrypted-vault, etc.)
 *   - Active Primaries Toolbar / Dock
 *   - Environmental notice bar & chromodynamic styles
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { WorkspaceConfig, CorePrimaryTool } from "../lib/foundationSynthesis";
import { useKernel } from "../store/kernel";
import {
  Code2,
  Terminal as TerminalIcon,
  Eye,
  Sliders,
  Shield,
  Layers,
  Sparkles,
  Search,
  BookOpen,
  Volume2,
  VolumeX,
  Compass,
  Radio,
  Clock,
  Key,
  Maximize2,
  Minimize2,
  FolderTree,
} from "lucide-react";

interface SpatialWorkspaceProps {
  config: WorkspaceConfig;
  children: React.ReactNode;
}

export const SpatialWorkspace: React.FC<SpatialWorkspaceProps> = ({ config, children }) => {
  const openWindow = useKernel((state) => state.openWindow);
  const [activeTab, setActiveTab] = useState<"canvas" | "code" | "preview">("canvas");
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(config.themeVariables["--suppress-badges"]);

  const { layoutType, primaryLaw, activeTools, attributes, themeVariables } = config;

  const handleToolClick = (tool: CorePrimaryTool) => {
    if (tool.appId) {
      openWindow(tool.appId);
    } else if (tool.id === "focus-timer" || tool.id === "scratchpad") {
      openWindow("markdownEditor");
    } else if (tool.id === "command-palette") {
      const e = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true });
      window.dispatchEvent(e);
    } else {
      openWindow("oracle");
    }
  };

  return (
    <div
      className={`spatial-viewport spatial--${layoutType} ${isZenMode ? "spatial--zen" : ""}`}
      style={{
        ...Object.fromEntries(
          Object.entries(themeVariables).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "1" : "0") : v])
        ),
      }}
    >
      {/* ── 1. Top Environmental Bar & Status ── */}
      <header className="spatial-env-bar">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-color)] animate-pulse" />
          <span className="text-xs font-mono font-medium tracking-wider text-white/90">
            @{config.seed.handle}
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/60">
            {primaryLaw} Architecture · {layoutType}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-white/40">
          <span>{attributes.environmentNotice}</span>
        </div>

        <div className="flex items-center gap-2">
          {config.seed.laws.includes("Quiet") && (
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white transition-colors"
              title={isMuted ? "Audio muted" : "Audio unmuted"}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {config.seed.laws.includes("Minimal") && (
            <button
              onClick={() => setIsZenMode(!isZenMode)}
              className="p-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white transition-colors"
              title="Toggle Pure Viewport"
            >
              {isZenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </header>

      {/* ── 2. Primary Layout Container (Modulated by Spatial Geometry) ── */}
      <div className="spatial-main-body">
        {/* Single-focus (Minimal) Viewport */}
        {layoutType === "single-focus" && (
          <div className="spatial-container single-focus-container">
            <div className="relative w-full h-full flex items-center justify-center">
              {children}
            </div>
          </div>
        )}

        {/* Split Grid (Builder) Container */}
        {layoutType === "split-grid" && (
          <div className="spatial-container split-grid-container grid grid-cols-12 h-full w-full">
            <div className="col-span-12 lg:col-span-8 h-full relative border-r border-white/10 bg-black/40">
              {children}
            </div>
            <aside className="col-span-12 lg:col-span-4 h-full p-4 flex flex-col justify-between bg-zinc-950/80 backdrop-blur-md border-l border-white/10 font-mono">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <span className="text-xs text-white/80 uppercase tracking-widest flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-[var(--accent-color)]" />
                    Builder Primaries
                  </span>
                  <span className="text-[10px] text-emerald-400">● LIVE COMPILER</span>
                </div>
                <div className="space-y-2">
                  {activeTools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => handleToolClick(tool)}
                      className="w-full text-left p-3 rounded-xl border border-white/10 bg-white/5 hover:border-[var(--accent-color)] hover:bg-white/10 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-xs text-white font-medium group-hover:text-[var(--accent-color)] transition-colors">
                          {tool.name}
                        </div>
                        <div className="text-[10px] text-white/40">{tool.description}</div>
                      </div>
                      <span className="text-[10px] text-white/30 group-hover:translate-x-1 transition-transform">
                        Launch →
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-950/20 text-[11px] text-cyan-300">
                <span>Neon Database & Live Sandbox uplinked to sovereign node.</span>
              </div>
            </aside>
          </div>
        )}

        {/* Spatial Board (Creative) */}
        {layoutType === "spatial-board" && (
          <div className="spatial-container spatial-board-container relative w-full h-full">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--accent-color-glow)_0%,transparent_60%)] pointer-events-none" />
            <div className="absolute top-16 left-6 z-40 p-3 rounded-2xl border border-white/15 bg-black/60 backdrop-blur-xl flex flex-col gap-2 shadow-2xl">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/50 px-2 py-1">
                Creative Palette
              </span>
              {activeTools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolClick(tool)}
                  className="px-3 py-2 rounded-xl text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 flex items-center gap-2.5 transition-all text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>{tool.name}</span>
                </button>
              ))}
            </div>
            {children}
          </div>
        )}

        {/* Encrypted Vault (Private) */}
        {layoutType === "encrypted-vault" && (
          <div className="spatial-container encrypted-vault-container relative w-full h-full bg-[#080b10]">
            <div className="absolute top-14 right-6 z-40 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-[10px] font-mono text-emerald-400 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              <span>Zero-Knowledge Node Active</span>
            </div>
            {children}
          </div>
        )}

        {/* Default / Fallback for Open, Curious, Playful, Quiet */}
        {["multi-pane-feed", "graph-matrix", "fluid-physics", "zen-reader"].includes(layoutType) && (
          <div className={`spatial-container ${layoutType}-container relative w-full h-full`}>
            {children}
          </div>
        )}
      </div>

      {/* ── 3. Core Primaries Floating Quick Bar ── */}
      {!isZenMode && (
        <aside className="spatial-primaries-dock">
          <div className="flex items-center gap-1.5 p-1.5 rounded-full border border-white/15 bg-black/70 backdrop-blur-2xl shadow-2xl">
            {activeTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool)}
                className="px-3 py-1.5 rounded-full text-[11px] font-mono text-white/70 hover:text-white hover:bg-white/15 border border-transparent hover:border-white/20 transition-all flex items-center gap-1.5"
                title={tool.description}
              >
                <span>{tool.name}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Chromodynamics Injected Stylesheet */}
      <style>{`
        .spatial-viewport {
          position: fixed;
          inset: 0;
          overflow: hidden;
          background-color: var(--bg-chroma, #050508);
          color: #f4f4f6;
          display: flex;
          flex-direction: column;
        }
        .spatial-env-bar {
          position: relative;
          z-index: 50;
          height: 38px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(10, 10, 15, 0.7);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
        }
        .spatial-main-body {
          flex: 1;
          position: relative;
          overflow: hidden;
        }
        .spatial-container {
          width: 100%;
          height: 100%;
        }
        .spatial-primaries-dock {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
          pointer-events: auto;
        }
        .spatial--zen .spatial-env-bar {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.4s;
        }
        .spatial--zen:hover .spatial-env-bar {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
};

export default SpatialWorkspace;
