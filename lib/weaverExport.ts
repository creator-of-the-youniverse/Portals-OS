/**
 * lib/weaverExport.ts
 *
 * Pure, zero-dependency sovereign ZIP archive generator for Weaver multi-file
 * projects. Packages the active virtual file tree into a standalone,
 * ready-to-run Vite + React + TypeScript project.
 *
 * Format: Standard PKZIP (Store method 0, IEEE 802.3 CRC-32, UTF-8 flag bit 11).
 * Works identically in browser (Blob download) and Node.js (automated tests).
 */

import {
  WEAVER_DEFAULT_ENTRY_FILE,
  sanitizeVirtualPath,
  type WeaverFileTree,
} from "./weaverProject.ts";

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
  modifiedAt?: Date;
}

export interface WeaverExportInput {
  title: string;
  files: WeaverFileTree;
  entryFile?: string;
  dependencies?: string[];
}

export interface WeaverExportResult {
  filename: string;
  slug: string;
  bytes: Uint8Array;
  fileCount: number;
  filePaths: string[];
}

const textEncoder = new TextEncoder();

// Precomputed IEEE 802.3 CRC-32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Builds a standards-compliant PKZIP archive (Store / method 0) with zero
 * external dependencies.
 */
export function buildZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const normalizedEntries = entries
    .map((entry) => {
      const cleanPath = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
      const nameBytes = textEncoder.encode(cleanPath);
      const dataBytes =
        typeof entry.content === "string"
          ? textEncoder.encode(entry.content)
          : entry.content;
      const crc = computeCrc32(dataBytes);
      const { dosTime, dosDate } = toDosTimeDate(entry.modifiedAt ?? new Date());
      return { cleanPath, nameBytes, dataBytes, crc, dosTime, dosDate };
    })
    .filter((e) => e.nameBytes.length > 0);

  let localSectionSize = 0;
  let centralDirSize = 0;
  for (const e of normalizedEntries) {
    localSectionSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralDirSize += 46 + e.nameBytes.length;
  }

  const totalSize = localSectionSize + centralDirSize + 22;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  const localOffsets: number[] = [];
  let offset = 0;

  // 1. Local File Headers + File Data
  for (const e of normalizedEntries) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // General purpose bit flag: UTF-8
    view.setUint16(offset + 8, 0, true); // Compression method: 0 (Store)
    view.setUint16(offset + 10, e.dosTime, true);
    view.setUint16(offset + 12, e.dosDate, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, e.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, e.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // Extra field length
    output.set(e.nameBytes, offset + 30);
    offset += 30 + e.nameBytes.length;
    output.set(e.dataBytes, offset);
    offset += e.dataBytes.length;
  }

  const centralDirOffset = offset;

  // 2. Central Directory Headers
  for (let i = 0; i < normalizedEntries.length; i++) {
    const e = normalizedEntries[i];
    view.setUint32(offset, 0x02014b50, true); // Central file header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // UTF-8
    view.setUint16(offset + 10, 0, true); // Method: Store
    view.setUint16(offset + 12, e.dosTime, true);
    view.setUint16(offset + 14, e.dosDate, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.dataBytes.length, true);
    view.setUint32(offset + 24, e.dataBytes.length, true);
    view.setUint16(offset + 28, e.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // Extra field length
    view.setUint16(offset + 32, 0, true); // File comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal file attributes
    view.setUint32(offset + 38, 0, true); // External file attributes
    view.setUint32(offset + 42, localOffsets[i], true); // Relative offset of local header
    output.set(e.nameBytes, offset + 46);
    offset += 46 + e.nameBytes.length;
  }

  // 3. End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true); // Number of this disk
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, normalizedEntries.length, true);
  view.setUint16(offset + 10, normalizedEntries.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirOffset, true);
  view.setUint16(offset + 20, 0, true); // Comment length

  return output;
}

export function slugifyProjectTitle(title: string): string {
  const cleaned = String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "weaver-project";
}

function sanitizePackageName(dep: string): string | null {
  const clean = dep.trim();
  if (!clean || clean.length > 100) return null;
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(clean)) {
    return null;
  }
  return clean;
}

/**
 * Converts a Weaver virtual file tree into a complete, standalone
 * Vite + React + TypeScript project file map.
 */
export function buildStandaloneViteProjectFiles(
  input: WeaverExportInput
): Record<string, string> {
  const title = input.title.trim() || "WeaverProject";
  const slug = slugifyProjectTitle(title);
  const entryFile = sanitizeVirtualPath(input.entryFile) ?? WEAVER_DEFAULT_ENTRY_FILE;

  const extraDeps: Record<string, string> = {};
  for (const rawDep of input.dependencies ?? []) {
    const pkg = sanitizePackageName(rawDep);
    if (pkg && pkg !== "react" && pkg !== "react-dom" && pkg !== "lucide-react") {
      extraDeps[pkg] = "latest";
    }
  }

  const packageJson = {
    name: slug,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "lucide-react": "^0.548.0",
      ...extraDeps,
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.4",
      typescript: "^5.7.2",
      vite: "^6.2.0",
    },
  };

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/[<>&"]/g, "")}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-zinc-950 text-zinc-100 antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  const viteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
    },
    include: ["src"],
  };

  const hasStylesCss = Boolean(input.files["styles.css"]);
  const entryImportPath = `./${entryFile.replace(/\.(tsx|ts|jsx|js)$/i, "")}`;
  const mainTsx = `import React from "react";
import ReactDOM from "react-dom/client";
import App from ${JSON.stringify(entryImportPath)};
${hasStylesCss ? 'import "./styles.css";\n' : ""}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

  const readmeMd = `# ${title}

Exported from **Portals OS · Weaver AI Studio** as a standalone Vite + React + TypeScript project.

## Quickstart

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build for Production

\`\`\`bash
npm run build
\`\`\`
`;

  const out: Record<string, string> = {
    "package.json": JSON.stringify(packageJson, null, 2) + "\n",
    "index.html": indexHtml,
    "vite.config.ts": viteConfig,
    "tsconfig.json": JSON.stringify(tsConfig, null, 2) + "\n",
    "README.md": readmeMd,
    "src/main.tsx": mainTsx,
  };

  const sortedPaths = Object.keys(input.files).sort();
  for (const rawPath of sortedPaths) {
    const cleanPath = sanitizeVirtualPath(rawPath);
    if (!cleanPath) continue;
    const file = input.files[rawPath];
    if (!file || typeof file.content !== "string") continue;

    if (cleanPath === "manifest.json") {
      out["manifest.json"] = file.content;
    } else if (cleanPath === "README.md") {
      out["README.md"] = file.content;
    } else {
      out[`src/${cleanPath}`] = file.content;
    }
  }

  return out;
}

export function exportWeaverProjectZip(input: WeaverExportInput): WeaverExportResult {
  const slug = slugifyProjectTitle(input.title);
  const projectFiles = buildStandaloneViteProjectFiles(input);
  const filePaths = Object.keys(projectFiles).sort();

  const entries: ZipEntryInput[] = filePaths.map((filePath) => ({
    path: filePath,
    content: projectFiles[filePath],
  }));

  const bytes = buildZipArchive(entries);
  return {
    filename: `${slug}.zip`,
    slug,
    bytes,
    fileCount: filePaths.length,
    filePaths,
  };
}

/**
 * Triggers a client-side browser download for the exported ZIP archive.
 */
export function downloadWeaverProjectZip(input: WeaverExportInput): WeaverExportResult {
  const exported = exportWeaverProjectZip(input);
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const arrayBuffer = exported.bytes.buffer.slice(
      exported.bytes.byteOffset,
      exported.bytes.byteOffset + exported.bytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return exported;
}
