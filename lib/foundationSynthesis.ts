/**
 * @file foundationSynthesis
 *
 * The Hybrid Engine & Law-to-Attribute Matrix.
 * Translates 1 to 3 Foundation Laws + Energy Hue into:
 *  1. Spatial Geometry (primary layout structure)
 *  2. Core Primaries (active tools & docked apps)
 *  3. Chromodynamics (theme variables, lighting & ambient behavior)
 */

export type FoundationLaw =
  | "Minimal"
  | "Creative"
  | "Private"
  | "Open"
  | "Builder"
  | "Curious"
  | "Playful"
  | "Quiet";

export interface PersonalYouniverseSeed {
  handle: string;
  energyHue: number; // 0-360 HSL color
  laws: FoundationLaw[]; // e.g. ['Builder', 'Quiet', 'Creative']
}

export type SpatialGeometryType =
  | "single-focus"    // Minimal: clean canvas, auto-hiding navigation, center focus
  | "spatial-board"   // Creative: freeform draggable nodes, visible artboard bounds
  | "encrypted-vault" // Private: dense modular windows, local-first ledger
  | "multi-pane-feed" // Open: wide dashboard, incoming network feeds, public cards
  | "split-grid"      // Builder: split view code editor / live preview / system shell
  | "graph-matrix"    // Curious: graph-database layout, interconnected thought-nodes
  | "fluid-physics"   // Playful: elastic fluid grid, bouncy spring objects
  | "zen-reader";     // Quiet: distraction-free reader pane, generous whitespace

export interface CorePrimaryTool {
  id: string;
  name: string;
  category: "core" | "dock" | "palette";
  description: string;
  appId?: string; // Links to apps.config.ts if mapped
  badge?: string;
}

export interface WorkspaceConfig {
  seed: PersonalYouniverseSeed;
  primaryLaw: FoundationLaw;
  layoutType: SpatialGeometryType;
  activeTools: CorePrimaryTool[];
  toolAppIds: string[];
  themeVariables: {
    "--accent-hue": string;
    "--accent-color": string;
    "--accent-color-glow": string;
    "--ambient-opacity": string;
    "--ui-density": "compact" | "spacious" | "balanced";
    "--enable-animations": boolean;
    "--bg-chroma": string;
    "--panel-bg": string;
    "--text-contrast": string;
    "--cursor-particles": boolean;
    "--sound-ambient": "silence" | "zen" | "radio";
    "--suppress-badges": boolean;
  };
  attributes: {
    navMode: "auto-hide" | "docked" | "minimal" | "spacious";
    windowStyle: "vault" | "glass" | "canvas" | "terminal" | "paper" | "playful";
    environmentNotice: string;
  };
}

// ─────────────────────────────────────────────────────────────
// 1. Spatial Geometry Mapping (Primary Law dictates layout)
// ─────────────────────────────────────────────────────────────

export const LAW_LAYOUT_MAP: Record<FoundationLaw, SpatialGeometryType> = {
  Minimal: "single-focus",
  Creative: "spatial-board",
  Private: "encrypted-vault",
  Open: "multi-pane-feed",
  Builder: "split-grid",
  Curious: "graph-matrix",
  Playful: "fluid-physics",
  Quiet: "zen-reader",
};

// ─────────────────────────────────────────────────────────────
// 2. Core Primaries Mapping (Tools per law)
// ─────────────────────────────────────────────────────────────

export const LAW_TOOL_MAP: Record<FoundationLaw, CorePrimaryTool[]> = {
  Minimal: [
    { id: "command-palette", name: "Command Palette (Cmd+K)", category: "palette", description: "Frictionless global launcher" },
    { id: "scratchpad", name: "Scratchpad", category: "core", appId: "markdownEditor", description: "Zero-drag instant thought pad" },
    { id: "focus-timer", name: "Focus Timer", category: "dock", description: "Single-intent flow timer" },
  ],
  Creative: [
    { id: "asset-canvas", name: "Asset Canvas", category: "core", appId: "omniedia", description: "Visual and multimedia collector" },
    { id: "color-extractor", name: "Palette Extractor", category: "dock", description: "Real-time atmospheric color sampler" },
    { id: "weaver-av", name: "A/V Weaver", category: "core", appId: "weaver", description: "Dynamic audio/visual component generator" },
  ],
  Private: [
    { id: "local-storage-monitor", name: "Local Storage Monitor", category: "dock", description: "Inspect sovereign on-device DB" },
    { id: "pgp-signer", name: "PGP Key Signer", category: "palette", description: "Cryptographic identity assertion" },
    { id: "zk-ledger", name: "Zero-Knowledge Sync Ledger", category: "core", description: "Tamper-proof local-first state audit" },
  ],
  Open: [
    { id: "guestbook", name: "Guestbook", category: "core", appId: "messages", description: "Public messages from travelers across the web" },
    { id: "broadcast-channel", name: "Public Broadcast", category: "dock", description: "Transmit updates to @welcome living room" },
    { id: "feed-bridge", name: "Webhook & RSS Bridge", category: "palette", description: "Synchronize incoming network streams" },
  ],
  Builder: [
    { id: "component-shell", name: "Live Component Shell", category: "core", appId: "weaver", description: "Real-time React & state sandbox" },
    { id: "api-playground", name: "API Terminal Playground", category: "core", appId: "terminal", description: "Direct REST/WS invocation console" },
    { id: "neon-inspector", name: "Neon DB Inspector", category: "dock", appId: "fileManager", description: "Real-time Postgres table viewer" },
  ],
  Curious: [
    { id: "spatial-search", name: "Spatial Graph Search", category: "core", appId: "browser", description: "Associative vector thought lookup" },
    { id: "webfeed-aggregator", name: "Unread Webfeed Radar", category: "dock", appId: "oracle", description: "Autonomous frontier discovery stream" },
    { id: "concept-mapper", name: "Concept Mapper", category: "core", appId: "notionLike", description: "Semantic entity link board" },
  ],
  Playful: [
    { id: "soundboard", name: "Interactive Soundboard", category: "dock", appId: "clubYouniverse", description: "Generative audio & dynamic drops" },
    { id: "particle-toy", name: "Visual Particle Physics Toy", category: "core", description: "Interactive gravity & spring sandbox" },
    { id: "doodle-canvas", name: "Doodle Canvas", category: "core", description: "Quick gesture drawing & stickers" },
  ],
  Quiet: [
    { id: "zen-reader", name: "Zen Reader", category: "core", appId: "markdownEditor", description: "Distraction-free typographic reading pane" },
    { id: "ambient-generator", name: "Ambient Soundscape", category: "dock", description: "Brown noise & tranquil procedural drone" },
    { id: "quiet-journal", name: "Quiet Journal", category: "core", appId: "notionLike", description: "Clean thoughtful reflection entries" },
  ],
};

// ─────────────────────────────────────────────────────────────
// 3. Multi-Law Layered Synthesis Engine
// ─────────────────────────────────────────────────────────────

export function resolveYouniverseConfiguration(seed: PersonalYouniverseSeed): WorkspaceConfig {
  const laws = (seed.laws && seed.laws.length > 0 ? seed.laws : ["Minimal"]) as FoundationLaw[];
  const primaryLaw = laws[0] || "Minimal";
  const layoutType = LAW_LAYOUT_MAP[primaryLaw] || "single-focus";

  // Layer 2: Tool deduplication & app id collection
  const rawTools = laws.flatMap((l) => LAW_TOOL_MAP[l] || []);
  const seenToolIds = new Set<string>();
  const activeTools: CorePrimaryTool[] = [];
  const appIds = new Set<string>();

  for (const tool of rawTools) {
    if (!seenToolIds.has(tool.id)) {
      seenToolIds.add(tool.id);
      activeTools.push(tool);
      if (tool.appId) appIds.add(tool.appId);
    }
  }

  // Layer 3: Chromodynamics & Environment Tuning
  const hue = seed.energyHue >= 0 && seed.energyHue <= 360 ? seed.energyHue : 258;
  const isMinimal = laws.includes("Minimal");
  const isQuiet = laws.includes("Quiet");
  const isBuilder = laws.includes("Builder");
  const isCreative = laws.includes("Creative");
  const isPrivate = laws.includes("Private");
  const isOpen = laws.includes("Open");
  const isPlayful = laws.includes("Playful");
  const isCurious = laws.includes("Curious");

  let ambientOpacity = "0.5";
  if (isMinimal) ambientOpacity = "0.15";
  else if (isPrivate) ambientOpacity = "0.25";
  else if (isOpen || isCreative) ambientOpacity = "0.75";

  let uiDensity: "compact" | "spacious" | "balanced" = "balanced";
  if (isBuilder || isPrivate) uiDensity = "compact";
  else if (isMinimal || isQuiet) uiDensity = "spacious";

  let bgChroma = `hsl(${hue} 35% 6%)`;
  if (isPrivate) bgChroma = `hsl(220 18% 4%)`; // Deep obsidian slate
  else if (isMinimal) bgChroma = `hsl(0 0% 5%)`; // Pure monochrome dark
  else if (isQuiet) bgChroma = `hsl(30 10% 8%)`; // Warm muted sepia/charcoal
  else if (isCurious) bgChroma = `hsl(265 40% 7%)`; // Midnight violet

  let panelBg = `hsla(${hue}, 40%, 12%, 0.65)`;
  if (isPrivate) panelBg = `rgba(13, 17, 23, 0.88)`;
  else if (isMinimal) panelBg = `rgba(18, 18, 18, 0.7)`;
  else if (isOpen) panelBg = `rgba(255, 255, 255, 0.08)`;

  let textContrast = "high";
  if (isQuiet) textContrast = "soft";

  let soundAmbient: "silence" | "zen" | "radio" = "silence";
  if (isQuiet) soundAmbient = "zen";
  else if (isPlayful || isCreative) soundAmbient = "radio";

  // Environmental status notice for the user
  const envNotices: string[] = [];
  if (isBuilder) envNotices.push("Split code/canvas containers active");
  if (isQuiet) envNotices.push("Badges and alerts muted");
  if (isCreative) envNotices.push("Interactive luminous cursor particles engaged");
  if (isPrivate) envNotices.push("Zero-knowledge local state verified");
  if (isOpen) envNotices.push("Network guestbook bridge connected");

  return {
    seed,
    primaryLaw,
    layoutType,
    activeTools,
    toolAppIds: Array.from(appIds),
    themeVariables: {
      "--accent-hue": `${hue}deg`,
      "--accent-color": `hsl(${hue} 88% 66%)`,
      "--accent-color-glow": `hsla(${hue}, 92%, 64%, 0.45)`,
      "--ambient-opacity": ambientOpacity,
      "--ui-density": uiDensity,
      "--enable-animations": !isQuiet,
      "--bg-chroma": bgChroma,
      "--panel-bg": panelBg,
      "--text-contrast": textContrast,
      "--cursor-particles": isCreative || isPlayful,
      "--sound-ambient": soundAmbient,
      "--suppress-badges": isQuiet || isMinimal,
    },
    attributes: {
      navMode: isMinimal ? "auto-hide" : isBuilder ? "minimal" : "docked",
      windowStyle: isPrivate ? "vault" : isCreative ? "canvas" : isBuilder ? "terminal" : isQuiet ? "paper" : "glass",
      environmentNotice: envNotices.join(" · ") || "Foundational universe active",
    },
  };
}
