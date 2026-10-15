/**
 * @file FoundationSynthesisPreview
 *
 * Interactive preview widget for the Procedural Foundation Synthesis Engine.
 * Allows testing how selecting combinations of 1 to 3 Foundation Laws and adjusting
 * the energy hue immediately modulates:
 *   1. Spatial Geometry (Master viewport layout)
 *   2. Core Primaries (Tool dock modules)
 *   3. Chromodynamics (Theme, density, lighting, particles, badge suppression)
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  resolveYouniverseConfiguration,
  type FoundationLaw,
  type PersonalYouniverseSeed,
} from "../lib/foundationSynthesis";
import { FOUNDATION_LAWS } from "../lib/welcomeWorld";
import {
  Layers,
  Sparkles,
  Sliders,
  Eye,
  Check,
  Shield,
  Code2,
  Terminal,
  Volume2,
  VolumeX,
  Palette,
  Maximize2,
  RotateCcw,
} from "lucide-react";

interface FoundationSynthesisPreviewProps {
  initialHandle?: string;
  initialHue?: number;
  initialLaws?: FoundationLaw[];
  onApplyConfig?: (seed: PersonalYouniverseSeed) => void;
  className?: string;
}

const ALL_LAWS: FoundationLaw[] = [
  "Minimal",
  "Creative",
  "Private",
  "Open",
  "Builder",
  "Curious",
  "Playful",
  "Quiet",
];

export const FoundationSynthesisPreview: React.FC<FoundationSynthesisPreviewProps> = ({
  initialHandle = "alex",
  initialHue = 198,
  initialLaws = ["Builder", "Quiet", "Creative"],
  onApplyConfig,
  className = "",
}) => {
  const [handle, setHandle] = useState<string>(initialHandle);
  const [energyHue, setEnergyHue] = useState<number>(initialHue);
  const [selectedLaws, setSelectedLaws] = useState<FoundationLaw[]>(initialLaws);
  const [activeTab, setActiveTab] = useState<"viewport" | "primaries" | "chroma">("viewport");

  const toggleLaw = (law: FoundationLaw) => {
    setSelectedLaws((prev) => {
      if (prev.includes(law)) {
        return prev.filter((l) => l !== law);
      }
      if (prev.length >= 3) {
        // Shift out the oldest secondary law, keep primary or max 3
        return [...prev.slice(1), law];
      }
      return [...prev, law];
    });
  };

  const seed: PersonalYouniverseSeed = useMemo(
    () => ({
      handle: handle.trim() || "alex",
      energyHue,
      laws: selectedLaws,
    }),
    [handle, energyHue, selectedLaws]
  );

  const config = useMemo(() => resolveYouniverseConfiguration(seed), [seed]);

  const { layoutType, primaryLaw, activeTools, themeVariables, attributes } = config;

  return (
    <div
      className={`rounded-2xl border border-white/15 bg-zinc-950/90 text-white font-sans backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col ${className}`}
      style={{
        ...Object.fromEntries(
          Object.entries(themeVariables).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "1" : "0") : v])
        ),
      }}
    >
      {/* ── Widget Header ── */}
      <header className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)] shadow-[0_0_10px_var(--accent-color)] animate-pulse" />
          <h3 className="font-mono text-xs font-semibold tracking-wider text-white">
            FOUNDATION SYNTHESIS PREVIEW
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/50">
            Interactive Testbed
          </span>
        </div>

        {onApplyConfig && (
          <button
            onClick={() => onApplyConfig(seed)}
            className="px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-[var(--accent-color)] text-zinc-950 hover:brightness-110 transition-all shadow-md"
          >
            Apply to Workspace →
          </button>
        )}
      </header>

      {/* ── Controls Strip: Handle, Hue & Law Selector ── */}
      <div className="p-4 border-b border-white/10 bg-zinc-900/40 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Handle input */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-white/50">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="handle"
              className="w-28 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-[var(--accent-color)]"
            />
          </div>

          {/* Energy Hue Slider */}
          <div className="flex items-center gap-2.5 flex-1 max-w-xs">
            <Palette className="w-3.5 h-3.5 text-white/50" />
            <input
              type="range"
              min="0"
              max="359"
              value={energyHue}
              onChange={(e) => setEnergyHue(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--accent-color)] cursor-pointer h-1.5 bg-white/15 rounded-lg"
            />
            <span className="font-mono text-[11px] text-white/60 w-8">{energyHue}°</span>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSelectedLaws(["Builder", "Quiet", "Creative"]);
                setEnergyHue(198);
              }}
              className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
            >
              Preset: @alex
            </button>
            <button
              onClick={() => {
                setSelectedLaws(["Minimal"]);
                setEnergyHue(258);
              }}
              className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
            >
              Minimal
            </button>
          </div>
        </div>

        {/* Foundation Laws Pill Selectors */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              Select 1 to 3 Foundation Laws (Primary dictates layout)
            </span>
            <span className="text-[10px] font-mono text-[var(--accent-color)]">
              {selectedLaws.length}/3 Laws Selected
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {ALL_LAWS.map((law, idx) => {
              const isSelected = selectedLaws.includes(law);
              const rank = selectedLaws.indexOf(law);
              return (
                <button
                  key={law}
                  type="button"
                  onClick={() => toggleLaw(law)}
                  className={`p-2 rounded-xl text-center font-mono transition-all flex flex-col items-center justify-center gap-1 border relative ${
                    isSelected
                      ? "border-[var(--accent-color)] bg-[var(--accent-color)]/15 text-white shadow-[0_0_15px_var(--accent-color-glow)]"
                      : "border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-1 right-1.5 text-[8px] font-bold text-[var(--accent-color)]">
                      {["1°", "2°", "3°"][rank]}
                    </span>
                  )}
                  <span className="text-xs font-semibold">{law}</span>
                  <span className="text-[9px] text-white/40">
                    {rank === 0 ? "Primary" : isSelected ? "Injected" : "Inactive"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center px-4 border-b border-white/10 bg-black/20 gap-4 text-xs font-mono">
        <button
          onClick={() => setActiveTab("viewport")}
          className={`py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === "viewport"
              ? "border-[var(--accent-color)] text-white font-medium"
              : "border-transparent text-white/50 hover:text-white/80"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Spatial Geometry ({layoutType})</span>
        </button>

        <button
          onClick={() => setActiveTab("primaries")}
          className={`py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === "primaries"
              ? "border-[var(--accent-color)] text-white font-medium"
              : "border-transparent text-white/50 hover:text-white/80"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Core Primaries ({activeTools.length} Modules)</span>
        </button>

        <button
          onClick={() => setActiveTab("chroma")}
          className={`py-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === "chroma"
              ? "border-[var(--accent-color)] text-white font-medium"
              : "border-transparent text-white/50 hover:text-white/80"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Chromodynamics & System State</span>
        </button>
      </div>

      {/* ── Active Tab Content ── */}
      <div className="p-5 flex-1 min-h-[280px] bg-black/30">
        {/* TAB 1: Spatial Geometry Simulation */}
        {activeTab === "viewport" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-white/70">
                Primary Master Frame: <b className="text-[var(--accent-color)]">{primaryLaw}</b> →{" "}
                <code className="text-white bg-white/10 px-1.5 py-0.5 rounded">{layoutType}</code>
              </span>
              <span className="text-white/40">Navigation: {attributes.navMode}</span>
            </div>

            {/* Visual Viewport Simulation Box */}
            <div className="w-full h-48 rounded-xl border border-white/15 bg-zinc-950 p-2 relative overflow-hidden flex flex-col justify-between shadow-inner">
              <div className="h-4 border-b border-white/10 flex items-center justify-between px-2 text-[9px] font-mono text-white/40">
                <span>@{seed.handle}.itsyouonline.com/os</span>
                <span className="text-emerald-400">● {attributes.windowStyle} windows</span>
              </div>

              {/* Dynamic Mock Layout */}
              <div className="flex-1 p-2 flex gap-2">
                {layoutType === "split-grid" && (
                  <>
                    <div className="flex-1 rounded-lg border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-[11px] font-mono text-white/40">
                      Code Editor & Workbench
                    </div>
                    <div className="w-1/3 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-950/20 flex flex-col items-center justify-center text-[10px] font-mono text-cyan-300 p-2 text-center">
                      Live Preview & API Inspector
                    </div>
                  </>
                )}

                {layoutType === "single-focus" && (
                  <div className="w-full flex items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5">
                    <span className="font-mono text-xs text-white/50">
                      Zero-Clutter Infinite Canvas (Auto-Hiding Nav)
                    </span>
                  </div>
                )}

                {layoutType === "spatial-board" && (
                  <div className="w-full relative rounded-lg border border-dashed border-purple-500/30 bg-purple-950/10 p-2 overflow-hidden">
                    <div className="absolute top-3 left-4 p-2 rounded border border-white/20 bg-black/60 text-[9px] font-mono">
                      Asset Canvas Node
                    </div>
                    <div className="absolute bottom-4 right-6 p-2 rounded border border-white/20 bg-black/60 text-[9px] font-mono">
                      Weaver A/V Component
                    </div>
                  </div>
                )}

                {layoutType === "encrypted-vault" && (
                  <div className="w-full rounded-lg border border-emerald-500/30 bg-[#080d0c] flex items-center justify-center font-mono text-xs text-emerald-400 gap-2">
                    <Shield className="w-4 h-4" />
                    <span>Encrypted Ledger & Local Storage Monitored</span>
                  </div>
                )}

                {["multi-pane-feed", "graph-matrix", "fluid-physics", "zen-reader"].includes(layoutType) && (
                  <div className="w-full rounded-lg border border-white/20 bg-white/5 flex items-center justify-center font-mono text-xs text-white/50">
                    {layoutType.toUpperCase()} Viewport Active
                  </div>
                )}
              </div>

              {/* Simulated Primaries Quick Dock */}
              <div className="h-6 flex items-center justify-center">
                <div className="px-3 py-1 rounded-full border border-white/10 bg-black/80 flex items-center gap-2 text-[9px] font-mono text-white/60">
                  <span>Primaries Dock:</span>
                  {activeTools.slice(0, 4).map((t) => (
                    <span key={t.id} className="text-white/80">
                      • {t.name}
                    </span>
                  ))}
                  {activeTools.length > 4 && <span>+{activeTools.length - 4} more</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Injected Core Primaries */}
        {activeTab === "primaries" && (
          <div className="space-y-3">
            <div className="text-xs font-mono text-white/70">
              Merged Tool Modules ({activeTools.length} total from selected laws):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeTools.map((tool) => (
                <div
                  key={tool.id}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:border-[var(--accent-color)] transition-colors"
                >
                  <div className="text-xs font-mono font-medium text-white flex items-center justify-between">
                    <span>{tool.name}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                      {tool.category}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-white/50 mt-1">
                    {tool.description}
                  </div>
                  {tool.appId && (
                    <div className="text-[9px] font-mono text-[var(--accent-color)] mt-1.5">
                      Target App ID: {tool.appId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: Chromodynamics & Environment Variables */}
        {activeTab === "chroma" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="text-[10px] text-white/40 mb-1">ACCENT HUE</div>
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: `hsl(${energyHue} 90% 60%)` }}
                  />
                  <span>{themeVariables["--accent-hue"]}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="text-[10px] text-white/40 mb-1">UI DENSITY</div>
                <div className="text-sm font-semibold uppercase">{themeVariables["--ui-density"]}</div>
              </div>

              <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="text-[10px] text-white/40 mb-1">ANIMATIONS</div>
                <div className="text-sm font-semibold">
                  {themeVariables["--enable-animations"] ? "ENABLED" : "MUTED (QUIET)"}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                <div className="text-[10px] text-white/40 mb-1">BADGES & COUNTERS</div>
                <div className="text-sm font-semibold">
                  {themeVariables["--suppress-badges"] ? "SUPPRESSED" : "VISIBLE"}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-white/10 bg-black/40 font-mono text-xs space-y-1.5">
              <div className="text-white/60 font-medium">Environmental Atmosphere Status:</div>
              <div className="text-[11px] text-[var(--accent-color)]">
                {attributes.environmentNotice}
              </div>
              <div className="text-[10px] text-white/40">
                Ambient Soundscape: {themeVariables["--sound-ambient"].toUpperCase()} · Cursor
                Particles: {themeVariables["--cursor-particles"] ? "ENGAGED" : "OFF"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="px-5 py-2.5 border-t border-white/10 bg-black/50 flex items-center justify-between text-[11px] font-mono text-white/40">
        <span>Layer 1 (Layout) + Layer 2 (Tools) + Layer 3 (Chroma)</span>
        <span>Procedural Synthesis Engine · Neon & Vercel Native</span>
      </footer>
    </div>
  );
};

export default FoundationSynthesisPreview;
