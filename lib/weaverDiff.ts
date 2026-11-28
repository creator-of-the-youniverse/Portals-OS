/**
 * lib/weaverDiff.ts
 *
 * Pure, zero-dependency LCS line-level diff engine for Weaver AI Studio.
 * Powers changed-file badges (`A` / `M` / `D`) in the File Tree Explorer and
 * unified emerald/rose diff highlighting in the Code Editor.
 */

import type { WeaverFileTree } from "./weaverProject.ts";

export type WeaverDiffLineType = "unchanged" | "added" | "removed";

export interface WeaverDiffLine {
  type: WeaverDiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface WeaverFileDiffSummary {
  status: "added" | "modified" | "deleted" | "unchanged";
  addedLines: number;
  removedLines: number;
}

const MAX_LCS_CELLS = 400_000;

function splitLines(input: string): string[] {
  if (!input) return [];
  return input.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Computes a line-by-line diff between `before` and `after` using LCS.
 * Falls back to a fast prefix/suffix diff for very large files to keep UI snappy.
 */
export function computeLineDiff(before: string, after: string): WeaverDiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  if (a.length === 0 && b.length === 0) return [];
  if (before === after) {
    return a.map((text, idx) => ({
      type: "unchanged",
      text,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
  }

  // Trim common prefix and suffix to shrink DP table
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const out: WeaverDiffLine[] = [];

  for (let i = 0; i < prefix; i++) {
    out.push({
      type: "unchanged",
      text: a[i],
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
    });
  }

  const aMid = a.slice(prefix, a.length - suffix);
  const bMid = b.slice(prefix, b.length - suffix);

  if (aMid.length * bMid.length > MAX_LCS_CELLS) {
    // Fast linear fallback for massive files
    for (let i = 0; i < aMid.length; i++) {
      out.push({
        type: "removed",
        text: aMid[i],
        oldLineNumber: prefix + i + 1,
        newLineNumber: null,
      });
    }
    for (let j = 0; j < bMid.length; j++) {
      out.push({
        type: "added",
        text: bMid[j],
        oldLineNumber: null,
        newLineNumber: prefix + j + 1,
      });
    }
  } else {
    const m = aMid.length;
    const n = bMid.length;
    const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));

    for (let i = m - 1; i >= 0; i--) {
      const row = dp[i];
      const nextRow = dp[i + 1];
      for (let j = n - 1; j >= 0; j--) {
        if (aMid[i] === bMid[j]) {
          row[j] = nextRow[j + 1] + 1;
        } else {
          row[j] = nextRow[j] >= row[j + 1] ? nextRow[j] : row[j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (aMid[i] === bMid[j]) {
        out.push({
          type: "unchanged",
          text: aMid[i],
          oldLineNumber: prefix + i + 1,
          newLineNumber: prefix + j + 1,
        });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({
          type: "removed",
          text: aMid[i],
          oldLineNumber: prefix + i + 1,
          newLineNumber: null,
        });
        i++;
      } else {
        out.push({
          type: "added",
          text: bMid[j],
          oldLineNumber: null,
          newLineNumber: prefix + j + 1,
        });
        j++;
      }
    }

    while (i < m) {
      out.push({
        type: "removed",
        text: aMid[i],
        oldLineNumber: prefix + i + 1,
        newLineNumber: null,
      });
      i++;
    }

    while (j < n) {
      out.push({
        type: "added",
        text: bMid[j],
        oldLineNumber: null,
        newLineNumber: prefix + j + 1,
      });
      j++;
    }
  }

  for (let s = 0; s < suffix; s++) {
    const aIdx = a.length - suffix + s;
    const bIdx = b.length - suffix + s;
    out.push({
      type: "unchanged",
      text: a[aIdx],
      oldLineNumber: aIdx + 1,
      newLineNumber: bIdx + 1,
    });
  }

  return out;
}

export function computeFileDiffSummary(
  beforeFiles: WeaverFileTree,
  afterFiles: WeaverFileTree
): Record<string, WeaverFileDiffSummary> {
  const allPaths = new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)]);
  const summary: Record<string, WeaverFileDiffSummary> = {};

  for (const path of allPaths) {
    const prev = beforeFiles[path]?.content;
    const next = afterFiles[path]?.content;

    if (prev === undefined && next !== undefined) {
      summary[path] = {
        status: "added",
        addedLines: splitLines(next).length,
        removedLines: 0,
      };
    } else if (prev !== undefined && next === undefined) {
      summary[path] = {
        status: "deleted",
        addedLines: 0,
        removedLines: splitLines(prev).length,
      };
    } else if (prev === next) {
      summary[path] = {
        status: "unchanged",
        addedLines: 0,
        removedLines: 0,
      };
    } else {
      const lines = computeLineDiff(prev ?? "", next ?? "");
      let addedLines = 0;
      let removedLines = 0;
      for (const line of lines) {
        if (line.type === "added") addedLines++;
        else if (line.type === "removed") removedLines++;
      }
      summary[path] = {
        status: "modified",
        addedLines,
        removedLines,
      };
    }
  }

  return summary;
}
