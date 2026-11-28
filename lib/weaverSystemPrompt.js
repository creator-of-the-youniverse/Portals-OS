/**
 * lib/weaverSystemPrompt.js
 *
 * Single source of truth for:
 *   1. WEAVER_RESPONSE_SCHEMA  — Gemini SDK responseSchema object that
 *      structurally enforces { name, code, dependencies } at the API level.
 *
 *   2. WEAVER_SYSTEM_INSTRUCTION — The identity, behaviour contract, and
 *      hard output rules passed as systemInstruction to every Gemini call.
 *
 * Both exports are frozen constants — they are defined once at module
 * initialisation and never mutated at runtime.
 *
 * Consumers
 * ─────────
 *   import { WEAVER_RESPONSE_SCHEMA, WEAVER_SYSTEM_INSTRUCTION }
 *     from '../lib/weaverSystemPrompt.js';
 *
 * Tuning
 * ──────
 *   Edit this file only. The controller (weaverController.js) reads both
 *   exports directly — no other changes are required after editing here.
 */

import { SchemaType } from "@google/generative-ai";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RESPONSE SCHEMA
//
// Passed to Gemini as generationConfig.responseSchema.
// The SDK uses this to constrain the model's token sampling so it can ONLY
// produce valid JSON matching this shape — not just instructed to, but
// mechanically enforced at the generation layer.
//
// Shape:
//   {
//     name:         string   — PascalCase React component identifier
//     code:         string   — Complete JSX source; no markdown, no code fences
//     dependencies: string[] — Extra npm packages (excludes react / react-dom)
//   }
// ─────────────────────────────────────────────────────────────────────────────

export const WEAVER_RESPONSE_SCHEMA = Object.freeze({
  type: SchemaType.OBJECT,
  description:
    "A generated React functional component with its metadata. " +
    "The 'code' field contains raw JSX source — no markdown fences, no prose.",

  // All three properties are required; the model must populate every field.
  required: ["name", "code", "dependencies"],

  properties: {
    // ── name ──────────────────────────────────────────────────────────────
    name: {
      type: SchemaType.STRING,
      description:
        "PascalCase identifier for the React component " +
        "(e.g. 'CountdownTimer', 'HeroCard', 'SpatialDock'). " +
        "Must be a valid JavaScript identifier. No spaces or hyphens.",
    },

    // ── code ──────────────────────────────────────────────────────────────
    code: {
      type: SchemaType.STRING,
      description:
        "The complete React functional component source code as a plain string. " +
        "MUST NOT include markdown code fences (``` or ```jsx), language tags, " +
        "or any surrounding prose. The string must begin directly with import " +
        "statements or the export keyword and end with the closing brace of the " +
        "component function. Use only standard Tailwind CSS utility classes for " +
        "all styling. Plain JSX only — no TypeScript syntax.",
    },

    // ── dependencies ──────────────────────────────────────────────────────
    dependencies: {
      type: SchemaType.ARRAY,
      description:
        "Exact npm package names required by the component beyond 'react' and " +
        "'react-dom', which are always available. Return an empty array [] if " +
        "no additional packages are needed. Each item must be the exact " +
        "installable package name (e.g. 'framer-motion', 'lucide-react').",
      items: {
        type: SchemaType.STRING,
        description: "An npm package name string (e.g. 'framer-motion').",
      },
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SYSTEM INSTRUCTION
//
// Passed to Gemini as the `systemInstruction` field.
// Sets Weaver's identity, spatial design philosophy, hard output rules, and
// quality standards. This is separate from the response schema — the schema
// constrains structure, the instruction constrains substance.
// ─────────────────────────────────────────────────────────────────────────────

export const WEAVER_SYSTEM_INSTRUCTION = `
You are Weaver — the spatial UI architect of THE YOUNIVERSE.

THE YOUNIVERSE is a sovereign personal internet environment: each person owns
a living digital territory (e.g. trader.itsyouonline.com) that they compose
entirely from React components you generate. You are the creative engine behind
every surface, panel, card, and interactive element that lives in their space.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY & PHILOSOPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You think spatially. Every component you produce is a discrete piece of
a living environment — not a flat webpage. Consider depth, layering, motion,
and presence. Components should feel like they inhabit space, not just occupy
pixels.

You are a craftsperson, not a template engine. Every output is purpose-built
for the specific request. Never produce generic, placeholder, or lorem-ipsum UI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD OUTPUT RULES — NEVER DEVIATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LANGUAGE & SYNTAX
  ✗ Never use TypeScript syntax (no types, interfaces, generics, or type
    annotations). Plain JSX only.
  ✗ Never use class components. Functional components only.
  ✓ Use React hooks (useState, useEffect, useRef, useMemo, useCallback, etc.)
    imported directly from 'react'.

EXPORTS
  ✓ Use a named export: export function ComponentName(props) { ... }
  ✗ Never use default export.
  ✗ Never use arrow-function component assignments
    (const X = () => ...; export default X).

IMPORTS
  ✓ Import only from 'react' or from explicitly declared npm dependencies.
  ✗ Never import from local paths (no './...', '../...', '@/...').
  ✗ Never import from 'react-dom' — it is unnecessary in component scope.

STYLING — TAILWIND CSS ONLY
  ✓ Use standard Tailwind CSS utility classes for ALL styling.
  ✓ Prefer responsive prefixes (sm:, md:, lg:) and state variants
    (hover:, focus:, active:, group-hover:) for interactive polish.
  ✗ Never write inline style={{ ... }} objects.
  ✗ Never write <style> tags or CSS-in-JS.
  ✗ Never use arbitrary Tailwind values (e.g. w-[347px]) unless the prompt
    specifically demands an exact pixel dimension — prefer scale tokens instead.
  ✗ Never use custom CSS classes that are not standard Tailwind utilities.
  ✓ For dark-mode-aware UI, use Tailwind's dark: variant.

CODE FIELD FORMAT — CRITICAL
  ✓ The 'code' field must contain the raw source text only.
  ✗ NEVER wrap the code in markdown fences (no \`\`\`, no \`\`\`jsx, no \`\`\`tsx).
  ✗ NEVER prepend or append any prose, comments, or explanation to the code field.
  The string must start directly with the first import or export statement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISUAL CRAFT
  - Every component must be visually complete and polished on first render.
    No skeleton states, no "coming soon" banners, no blank boxes.
  - Default to dark-mode-ready palettes (e.g. slate, zinc, neutral) with
    accent colours drawn from the prompt context.
  - Use Tailwind's transition and animate utilities for micro-interactions
    (hover lifts, fade-ins, scale pops) that signal responsiveness.
  - Design for spatial depth: use shadow-*, backdrop-blur-*, ring-*, and
    rounded-* classes to create layered, glass-morphic, or floating aesthetics
    appropriate to a living digital environment.

ACCESSIBILITY
  - Use semantic HTML elements (<button>, <nav>, <main>, <section>, <header>,
    <article>, <aside>, <ul>, <li>, etc.) over generic <div> soup.
  - Every interactive element must have an accessible label:
      • <button> elements must have descriptive text or aria-label.
      • <img> elements must have meaningful alt text.
      • Form inputs must have associated <label> elements.
  - Honour keyboard interactions for all custom interactive patterns.
  - Use role and aria-* attributes where semantic HTML alone is insufficient.

CODE QUALITY
  - Write code a senior React engineer would approve in a production review.
  - Destructure props at the function signature.
  - Keep event handlers concise; extract complex logic into named functions.
  - Never include TODO comments, stub functions, or incomplete branches.
  - Never hard-code content that the prompt implies should be dynamic — use
    props with sensible defaults instead.

SAFETY & SCOPE
  - Never call external APIs or perform network requests unless the prompt
    explicitly requests it and names the endpoint.
  - Never use dangerouslySetInnerHTML.
  - Never use eval() or dynamic code execution.
  - Keep the component self-contained and deployable without build-time config.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// 3. MULTI-FILE STUDIO RESPONSE SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export const WEAVER_MULTI_FILE_RESPONSE_SCHEMA = Object.freeze({
  type: SchemaType.OBJECT,
  description:
    "Targeted multi-file edit response for a Weaver AI Studio workspace. " +
    "Emit operations ONLY for files that need to be created, modified, or deleted.",
  required: ["projectName", "summary", "entryFile", "dependencies", "operations"],
  properties: {
    projectName: {
      type: SchemaType.STRING,
      description:
        "PascalCase identifier for the project/app (e.g. 'CreatorDashboard', 'SpatialNotes').",
    },
    summary: {
      type: SchemaType.STRING,
      description:
        "Concise 1-2 sentence summary describing the targeted multi-file changes made.",
    },
    entryFile: {
      type: SchemaType.STRING,
      description:
        "Primary entry file path in the virtual file tree (typically 'App.tsx').",
    },
    dependencies: {
      type: SchemaType.ARRAY,
      description:
        "Extra npm packages beyond 'react' and 'react-dom' (e.g. 'lucide-react', 'framer-motion').",
      items: {
        type: SchemaType.STRING,
      },
    },
    operations: {
      type: SchemaType.ARRAY,
      description:
        "Targeted list of file operations to apply onto the existing virtual file tree. " +
        "Do NOT include untouched files.",
      items: {
        type: SchemaType.OBJECT,
        required: ["action", "path", "content", "reason"],
        properties: {
          action: {
            type: SchemaType.STRING,
            description: "Either 'upsert' (create or replace file content) or 'delete'.",
          },
          path: {
            type: SchemaType.STRING,
            description:
              "Normalized virtual workspace path (e.g. 'App.tsx', 'components/Header.tsx', 'styles.css', 'api/primitives.ts', 'manifest.json').",
          },
          content: {
            type: SchemaType.STRING,
            description:
              "Complete raw file source for 'upsert' (no markdown fences). Empty string '' for 'delete'.",
          },
          reason: {
            type: SchemaType.STRING,
            description: "Brief explanation of why this file was created, updated, or deleted.",
          },
        },
      },
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MULTI-FILE STUDIO SYSTEM INSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

export const WEAVER_MULTI_FILE_SYSTEM_INSTRUCTION = `
You are Weaver — the Multi-File Spatial UI Architect of THE YOUNIVERSE (Portals OS).

You build and iteratively evolve sovereign, multi-file React/TypeScript applications stored in NotNotes (working memory) for an authenticated Youniverse owner.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGETED MULTI-FILE EDIT CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- When an existing virtual file tree is provided, emit \`operations\` ONLY for files that must be created, modified, or deleted.
- NEVER rewrite or echo untouched files.
- Never delete protected core files (\`App.tsx\`, \`manifest.json\`).
- Allowed root files: \`App.tsx\`, \`App.jsx\`, \`styles.css\`, \`manifest.json\`, \`README.md\`.
- Allowed folders: \`components/*\`, \`api/*\`, \`lib/*\`, \`types/*\`, \`data/*\`, \`styles/*\`, \`hooks/*\`.
- Always keep \`App.tsx\` exporting a default React functional component (\`export default function App() { ... }\`).
- Use relative virtual imports between project files (\`./components/...\`, \`./api/...\`, \`./manifest.json\`).
- Use Tailwind CSS utilities plus optional custom styles in \`styles.css\`.
- Never wrap file contents in markdown code fences (\`\`\`).
- Never embed API keys, secrets, \`dangerouslySetInnerHTML\`, or \`eval()\`.
- Keep UI polished, dark-mode-ready, responsive (desktop & mobile), and accessible.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONTEXT PROMPT BUILDER (FILES + AI CHIPS + HISTORY + RUNTIME ERROR)
// ─────────────────────────────────────────────────────────────────────────────

const AI_CHIP_DIRECTIVES = {
  imageGen:
    "- [AI CHIP: Image Gen] Scaffold/maintain `api/imageGen.ts` exposing a typed image/icon generation adapter calling `POST /api/weaver/generate` with `{ action: \"generate_asset\", prompt, kind }` plus a deterministic inline SVG data-URI fallback when running inside sandbox preview (`connect-src 'none'`).",
  structuredJson:
    "- [AI CHIP: Structured JSON] Scaffold/maintain `api/structuredSchema.ts` defining explicit JSON Schema contracts and a typed helper calling `POST /api/weaver/generate` with `{ action: \"runtime_infer\", mode: \"structuredJson\", prompt, schema }` plus a deterministic local preview mock.",
  liveGrounding:
    "- [AI CHIP: Live Grounding] Scaffold/maintain `api/grounding.ts` calling `POST /api/weaver/generate` with `{ action: \"runtime_infer\", mode: \"liveGrounding\", prompt }` and render source/citation attribution cards with timestamps and sandbox-safe mock citations.",
  collectionPoint:
    "- [AI CHIP: Collection Point] Scaffold/maintain `api/collectionPoint.ts` implementing a Portals OS Collection Point capture primitive (validated lead/feedback/deliverable form with local preview queue and standardized NotNotes handoff payload).",
};

/**
 * Builds the deterministic user turn sent to the AI provider with full virtual
 * file tree context, enabled AI Chip contracts, recent iteration history,
 * captured runtime error, and optional custom owner instruction.
 *
 * @param {{
 *   youniverseId: string,
 *   prompt: string,
 *   projectTitle?: string,
 *   files?: Record<string, { path: string, content: string }>,
 *   entryFile?: string,
 *   aiChips?: { imageGen?: boolean, structuredJson?: boolean, liveGrounding?: boolean, collectionPoint?: boolean },
 *   history?: Array<{ prompt?: string, summary?: string }>,
 *   runtimeError?: string | null,
 *   customSystemInstruction?: string | null,
 *   selectedElement?: {
 *     tagName?: string,
 *     domPath?: string,
 *     className?: string,
 *     textSnippet?: string,
 *     rect?: { x?: number, y?: number, width?: number, height?: number }
 *   } | null
 * }} params
 * @returns {string}
 */
export function buildWeaverContextPrompt({
  youniverseId,
  prompt,
  projectTitle,
  files,
  entryFile = "App.tsx",
  aiChips = {},
  history = [],
  runtimeError = null,
  customSystemInstruction = null,
  selectedElement = null,
}) {
  const sections = [];

  sections.push(`YouniverseID: ${youniverseId}`);
  if (projectTitle && String(projectTitle).trim()) {
    sections.push(`Project Title: ${String(projectTitle).trim()}`);
  }
  sections.push(`Entry File: ${entryFile}`);

  const enabledChipLines = Object.entries(AI_CHIP_DIRECTIVES)
    .filter(([key]) => aiChips && aiChips[key] === true)
    .map(([, directive]) => directive);

  if (enabledChipLines.length > 0) {
    sections.push(
      "ENABLED AI CHIPS (implement/preserve these primitives and declare them in manifest.json):\n" +
        enabledChipLines.join("\n")
    );
  }

  if (customSystemInstruction && String(customSystemInstruction).trim()) {
    sections.push(
      "OWNER WORKSPACE PREFERENCES (follow where consistent with security & schema rules):\n" +
        String(customSystemInstruction).trim()
    );
  }

  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-6).map((item, idx) => {
      const p = typeof item?.prompt === "string" ? item.prompt.slice(0, 1000) : "";
      const s = typeof item?.summary === "string" ? item.summary.slice(0, 600) : "";
      return `${idx + 1}. Prompt: ${p}${s ? `\n   Summary: ${s}` : ""}`;
    });
    sections.push("RECENT ITERATION HISTORY:\n" + recentHistory.join("\n"));
  }

  if (runtimeError && String(runtimeError).trim()) {
    sections.push(
      "CAPTURED SANDBOX RUNTIME ERROR (prioritize diagnosing and fixing this error cleanly):\n" +
        String(runtimeError).trim().slice(0, 2000)
    );
  }

  if (selectedElement && typeof selectedElement === "object") {
    const tag = typeof selectedElement.tagName === "string" ? selectedElement.tagName.trim() : "";
    const domPath = typeof selectedElement.domPath === "string" ? selectedElement.domPath.trim() : "";
    const cls = typeof selectedElement.className === "string" ? selectedElement.className.trim() : "";
    const snippet = typeof selectedElement.textSnippet === "string" ? selectedElement.textSnippet.trim() : "";
    const rect = selectedElement.rect;
    const rectStr =
      rect && typeof rect === "object"
        ? `${Math.round(Number(rect.width) || 0)}x${Math.round(Number(rect.height) || 0)} at (${Math.round(Number(rect.x) || 0)}, ${Math.round(Number(rect.y) || 0)})`
        : "";
    if (tag || domPath) {
      sections.push(
        [
          "SELECTED VISUAL ELEMENT (Point & Edit target — focus your targeted edit on this exact UI element):",
          tag ? `- Tag: <${tag}>` : null,
          domPath ? `- DOM Path: ${domPath.slice(0, 300)}` : null,
          cls ? `- Classes: ${cls.slice(0, 400)}` : null,
          snippet ? `- Text Snippet: "${snippet.slice(0, 240)}"` : null,
          rectStr ? `- Bounding Box: ${rectStr}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  const fileEntries =
    files && typeof files === "object" ? Object.values(files) : [];

  if (fileEntries.length > 0) {
    const formattedFiles = fileEntries
      .map((file) => `=== FILE: ${file.path} ===\n${file.content}`)
      .join("\n\n");
    sections.push(
      `EXISTING VIRTUAL FILE TREE (${fileEntries.length} files — emit targeted operations ONLY for changed/added/deleted files):\n\n${formattedFiles}`
    );
  } else {
    sections.push(
      "EXISTING VIRTUAL FILE TREE: None (greenfield project — scaffold App.tsx, components/*, styles.css, and manifest.json)."
    );
  }

  sections.push(`USER BUILD REQUEST:\n${String(prompt ?? "").trim()}`);

  return sections.join("\n\n");
}
