/**
 * lib/weaverStudioBackend.ts
 *
 * Consolidated multi-action backend engine for Weaver AI Studio:
 *   - action: "generate" (default) — Targeted multi-file code edits & scaffolding
 *   - action: "generate_asset"     — CSP-safe multimodal/SVG asset synthesis
 *   - action: "runtime_infer"      — Server-side text / structuredJson / liveGrounding proxy
 *
 * Shared by both `api/weaver/generate.ts` (Vercel Serverless) and
 * `controllers/weaverController.js` (Express local dev) so zero new top-level
 * Vercel functions are added.
 */

import {
  WEAVER_DEFAULT_ENTRY_FILE,
  applyWeaverOperations,
  extractEntryCode,
  sanitizeAiChips,
  sanitizeFileTree,
  sanitizeVirtualPath,
  syncManifestWithProject,
  type WeaverFileOperation,
  type WeaverFileTree,
} from "./weaverProject.ts";
import {
  WEAVER_MULTI_FILE_RESPONSE_SCHEMA,
  WEAVER_MULTI_FILE_SYSTEM_INSTRUCTION,
  buildWeaverContextPrompt,
} from "./weaverSystemPrompt.js";
import {
  encodeSvgDataUri,
  resolveWeaverProvider,
  sanitizeSvgMarkup,
  type WeaverAIProvider,
} from "./weaverProvider.ts";
import { runOracleDiagnosis } from "./oracleNexusEngine.ts";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_ASSET_PROMPT_LENGTH = 1_500;
const MAX_CUSTOM_SYSTEM_LENGTH = 2_000;
const MAX_RUNTIME_ERROR_LENGTH = 2_000;
const MAX_SCHEMA_BYTES = 8_000;
const MAX_OUTPUT_TOKENS_GENERATE = 8_192;
const ALLOWED_ACTIONS = new Set([
  "generate",
  "generate_asset",
  "runtime_infer",
  "oracle_diagnose",
]);
const ALLOWED_INFER_MODES = new Set(["text", "structuredJson", "liveGrounding"]);
const ALLOWED_ASSET_KINDS = new Set(["image", "icon", "svg"]);
const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3"]);

export interface WeaverAuthenticatedUser {
  userId?: string;
  youniverseId: string;
  handle?: string;
}

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function mapProviderError(res: any, err: any, fallbackMessage: string) {
  const msg = String(err?.message ?? "");
  if (msg.includes("RESOURCE_EXHAUSTED") || err?.status === 429) {
    return res.status(429).json({
      success: false,
      error: "quota_exceeded",
      message: "AI generation quota exceeded. Please try again shortly.",
    });
  }
  if (msg.includes("SAFETY") || msg.toLowerCase().includes("blocked")) {
    return res.status(422).json({
      success: false,
      error: "safety_blocked",
      message: "The prompt was blocked by the safety filter. Please revise your request.",
    });
  }
  return res.status(502).json({
    success: false,
    error: "ai_error",
    message: fallbackMessage,
  });
}

function validateMultiFileAiResponse(parsed: any): {
  projectName: string;
  summary: string;
  entryFile: string;
  dependencies: string[];
  operations: WeaverFileOperation[];
} {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response is not a JSON object.");
  }

  // Backwards-compatible support if a mock/provider returns legacy { name, code, dependencies }
  if (
    !Array.isArray(parsed.operations) &&
    typeof parsed.name === "string" &&
    typeof parsed.code === "string"
  ) {
    const deps = Array.isArray(parsed.dependencies)
      ? parsed.dependencies.filter((d: unknown): d is string => typeof d === "string")
      : [];
    return {
      projectName: parsed.name.trim() || "WeaverProject",
      summary: "Generated component in App.tsx.",
      entryFile: WEAVER_DEFAULT_ENTRY_FILE,
      dependencies: deps,
      operations: [
        {
          action: "upsert",
          path: WEAVER_DEFAULT_ENTRY_FILE,
          content: parsed.code.trim(),
          reason: "Generated primary component",
        },
      ],
    };
  }

  const rawName = typeof parsed.projectName === "string" ? parsed.projectName.trim() : "";
  const projectName = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(rawName)
    ? rawName
    : "WeaverProject";
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 1_000)
      : "Applied targeted workspace edits.";
  const entryFile = sanitizeVirtualPath(parsed.entryFile) ?? WEAVER_DEFAULT_ENTRY_FILE;
  const dependencies = Array.isArray(parsed.dependencies)
    ? parsed.dependencies
        .filter((d: unknown): d is string => typeof d === "string" && d.trim().length > 0)
        .map((d: string) => d.trim())
    : [];

  if (!Array.isArray(parsed.operations) || parsed.operations.length === 0) {
    throw new Error("AI response must include a non-empty operations array.");
  }

  const operations: WeaverFileOperation[] = [];
  for (const op of parsed.operations) {
    if (!op || typeof op !== "object") continue;
    const action = op.action === "delete" ? "delete" : op.action === "upsert" ? "upsert" : null;
    if (!action || typeof op.path !== "string") continue;
    operations.push({
      action,
      path: op.path,
      content: typeof op.content === "string" ? op.content : "",
      reason: typeof op.reason === "string" ? op.reason.slice(0, 300) : undefined,
    });
  }

  if (operations.length === 0) {
    throw new Error("AI response contained no valid file operations.");
  }

  return { projectName, summary, entryFile, dependencies, operations };
}

function validateSchemaOutput(data: unknown, schema: Record<string, any>): { ok: true } | { ok: false; reason: string } {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "Structured output must be a JSON object or array." };
  }
  const expectedType = typeof schema.type === "string" ? schema.type.toLowerCase() : "";
  if (expectedType === "object" && Array.isArray(data)) {
    return { ok: false, reason: "Expected a JSON object." };
  }
  if (expectedType === "array" && !Array.isArray(data)) {
    return { ok: false, reason: "Expected a JSON array." };
  }

  if (!Array.isArray(data) && Array.isArray(schema.required)) {
    const record = data as Record<string, unknown>;
    for (const key of schema.required) {
      if (typeof key === "string" && !(key in record)) {
        return { ok: false, reason: `Missing required field "${key}".` };
      }
    }
  }

  if (!Array.isArray(data) && schema.properties && typeof schema.properties === "object") {
    const record = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries<any>(schema.properties)) {
      if (!(key in record) || record[key] === undefined || record[key] === null) continue;
      const t = typeof propSchema?.type === "string" ? propSchema.type.toLowerCase() : "";
      const val = record[key];
      if (t === "string" && typeof val !== "string") {
        return { ok: false, reason: `Field "${key}" must be a string.` };
      }
      if ((t === "number" || t === "integer") && typeof val !== "number") {
        return { ok: false, reason: `Field "${key}" must be a number.` };
      }
      if (t === "boolean" && typeof val !== "boolean") {
        return { ok: false, reason: `Field "${key}" must be a boolean.` };
      }
      if (t === "array" && !Array.isArray(val)) {
        return { ok: false, reason: `Field "${key}" must be an array.` };
      }
      if (t === "object" && (typeof val !== "object" || Array.isArray(val))) {
        return { ok: false, reason: `Field "${key}" must be an object.` };
      }
    }
  }

  return { ok: true };
}

function extractGroundingCitations(groundingMetadata: any): Array<{ title: string; uri: string }> {
  const chunks = groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const citations: Array<{ title: string; uri: string }> = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const web = chunk?.web;
    const uri = typeof web?.uri === "string" ? web.uri.trim() : "";
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const title =
      typeof web?.title === "string" && web.title.trim()
        ? web.title.trim().slice(0, 160)
        : uri;
    citations.push({ title, uri });
  }
  return citations;
}

async function handleGenerateAction(
  body: any,
  res: any,
  user: WeaverAuthenticatedUser,
  provider: WeaverAIProvider,
  startedAt: number
) {
  const {
    prompt,
    projectTitle,
    files,
    entryFile,
    aiChips,
    history,
    runtimeError,
    systemInstruction,
    temperature,
    selectedElement,
  } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "bad_request",
      message: "A non-empty 'prompt' string is required.",
    });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: "prompt_too_long",
      message: `Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer.`,
    });
  }

  let baseFiles: WeaverFileTree = {};
  if (files !== undefined && files !== null) {
    const sanitizedTree = sanitizeFileTree(files);
    if (!sanitizedTree.ok) {
      const isTooLarge =
        sanitizedTree.error === "payload_too_large" || sanitizedTree.error === "too_many_files";
      return res.status(isTooLarge ? 413 : 400).json({
        success: false,
        error: isTooLarge ? "payload_too_large" : "bad_request",
        message: sanitizedTree.message,
      });
    }
    baseFiles = sanitizedTree.files;
  }

  const cleanChips = sanitizeAiChips(aiChips);
  const cleanEntry = sanitizeVirtualPath(entryFile) ?? WEAVER_DEFAULT_ENTRY_FILE;
  const cleanCustomSystem =
    typeof systemInstruction === "string" && systemInstruction.trim()
      ? systemInstruction.trim().slice(0, MAX_CUSTOM_SYSTEM_LENGTH)
      : null;
  const cleanRuntimeError =
    typeof runtimeError === "string" && runtimeError.trim()
      ? runtimeError.trim().slice(0, MAX_RUNTIME_ERROR_LENGTH)
      : null;
  const cleanTemp = clampNumber(temperature, 0, 1.0, 0.4);

  const cleanSelectedElement =
    selectedElement && typeof selectedElement === "object" && !Array.isArray(selectedElement)
      ? {
          tagName:
            typeof selectedElement.tagName === "string"
              ? selectedElement.tagName.trim().slice(0, 32)
              : undefined,
          domPath:
            typeof selectedElement.domPath === "string"
              ? selectedElement.domPath.trim().slice(0, 300)
              : undefined,
          className:
            typeof selectedElement.className === "string"
              ? selectedElement.className.trim().slice(0, 400)
              : undefined,
          textSnippet:
            typeof selectedElement.textSnippet === "string"
              ? selectedElement.textSnippet.trim().slice(0, 240)
              : undefined,
          rect:
            selectedElement.rect && typeof selectedElement.rect === "object"
              ? {
                  x: Number(selectedElement.rect.x) || 0,
                  y: Number(selectedElement.rect.y) || 0,
                  width: Number(selectedElement.rect.width) || 0,
                  height: Number(selectedElement.rect.height) || 0,
                }
              : undefined,
        }
      : null;

  const contextPrompt = buildWeaverContextPrompt({
    youniverseId: user.youniverseId,
    prompt: prompt.trim(),
    projectTitle: typeof projectTitle === "string" ? projectTitle.trim() : "",
    files: baseFiles,
    entryFile: cleanEntry,
    aiChips: cleanChips,
    history: Array.isArray(history) ? history : [],
    runtimeError: cleanRuntimeError,
    customSystemInstruction: cleanCustomSystem,
    selectedElement: cleanSelectedElement,
  });

  let aiResult;
  try {
    aiResult = await provider.generateStructuredOrText({
      systemInstruction: WEAVER_MULTI_FILE_SYSTEM_INSTRUCTION,
      userPrompt: contextPrompt,
      responseMimeType: "application/json",
      responseSchema: WEAVER_MULTI_FILE_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: cleanTemp,
      maxOutputTokens: MAX_OUTPUT_TOKENS_GENERATE,
    });
  } catch (err: any) {
    console.error("[Weaver Generate] Provider error:", err?.message ?? err);
    return mapProviderError(res, err, "Component synthesis failed.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(aiResult.text);
  } catch {
    return res.status(502).json({
      success: false,
      error: "invalid_ai_response",
      message: "The AI returned a malformed response. Please try again.",
    });
  }

  let validated;
  try {
    validated = validateMultiFileAiResponse(parsed);
  } catch (validationErr: any) {
    return res.status(502).json({
      success: false,
      error: "schema_mismatch",
      message: validationErr?.message || "The AI response did not match the expected schema.",
    });
  }

  const applied = applyWeaverOperations(baseFiles, validated.operations);
  const resolvedName =
    typeof projectTitle === "string" && projectTitle.trim()
      ? projectTitle.trim()
      : validated.projectName;

  const syncedFiles = syncManifestWithProject(applied.files, {
    title: resolvedName,
    dependencies: validated.dependencies,
    aiChips: cleanChips,
  });

  const resolvedEntryFile = syncedFiles[validated.entryFile]
    ? validated.entryFile
    : syncedFiles[cleanEntry]
      ? cleanEntry
      : syncedFiles[WEAVER_DEFAULT_ENTRY_FILE]
        ? WEAVER_DEFAULT_ENTRY_FILE
        : Object.keys(syncedFiles)[0] ?? WEAVER_DEFAULT_ENTRY_FILE;

  const entryCode = extractEntryCode(syncedFiles, resolvedEntryFile);
  const durationMs = Date.now() - startedAt;

  return res.status(200).json({
    success: true,
    action: "generate",
    youniverseId: user.youniverseId,
    project: {
      name: resolvedName,
      entryFile: resolvedEntryFile,
      files: syncedFiles,
      dependencies: validated.dependencies,
      summary: validated.summary,
      operations: validated.operations,
      changedPaths: applied.changedPaths,
      deletedPaths: applied.deletedPaths,
      rejectedPaths: applied.rejected,
      aiChips: cleanChips,
    },
    component: {
      name: resolvedName,
      code: entryCode,
      dependencies: validated.dependencies,
    },
    meta: {
      provider: provider.id,
      model: aiResult.model,
      generatedAt: new Date().toISOString(),
      durationMs,
    },
  });
}

async function handleGenerateAssetAction(
  body: any,
  res: any,
  user: WeaverAuthenticatedUser,
  provider: WeaverAIProvider,
  startedAt: number
) {
  const { prompt, kind, style, aspectRatio, targetPath } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "bad_request",
      message: "A non-empty 'prompt' string is required for asset generation.",
    });
  }
  if (prompt.length > MAX_ASSET_PROMPT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: "prompt_too_long",
      message: `Asset prompt must be ${MAX_ASSET_PROMPT_LENGTH.toLocaleString()} characters or fewer.`,
    });
  }

  const resolvedKind =
    typeof kind === "string" && ALLOWED_ASSET_KINDS.has(kind)
      ? (kind as "image" | "icon" | "svg")
      : "svg";
  const resolvedAspect =
    typeof aspectRatio === "string" && ALLOWED_ASPECT_RATIOS.has(aspectRatio)
      ? (aspectRatio as "1:1" | "16:9" | "9:16" | "4:3")
      : "1:1";

  let cleanTargetPath: string | null = null;
  if (targetPath !== undefined && targetPath !== null && targetPath !== "") {
    cleanTargetPath = sanitizeVirtualPath(targetPath);
    if (!cleanTargetPath) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        message: "Invalid targetPath for generated asset.",
      });
    }
  }

  let assetResult;
  try {
    assetResult = await provider.generateAsset({
      prompt: prompt.trim(),
      kind: resolvedKind,
      style: typeof style === "string" ? style.trim().slice(0, 200) : undefined,
      aspectRatio: resolvedAspect,
    });
  } catch (err: any) {
    console.error("[Weaver Asset] Provider error:", err?.message ?? err);
    return mapProviderError(res, err, "Asset generation failed.");
  }

  // Enforce CSP-safe data URI hygiene even for custom/mock providers
  let safeDataUri = assetResult.dataUri;
  let safeMimeType = assetResult.mimeType;
  if (
    safeMimeType === "image/svg+xml" ||
    safeDataUri.startsWith("data:image/svg+xml")
  ) {
    let rawSvg = "";
    const base64Prefix = "data:image/svg+xml;base64,";
    if (safeDataUri.startsWith(base64Prefix)) {
      rawSvg = Buffer.from(safeDataUri.slice(base64Prefix.length), "base64").toString("utf8");
    } else if (safeDataUri.startsWith("data:image/svg+xml,")) {
      rawSvg = decodeURIComponent(safeDataUri.slice("data:image/svg+xml,".length));
    } else {
      rawSvg = safeDataUri;
    }
    const sanitizedSvg = sanitizeSvgMarkup(rawSvg, assetResult.alt);
    safeMimeType = "image/svg+xml";
    safeDataUri = encodeSvgDataUri(sanitizedSvg);
  } else if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(safeDataUri)) {
    const fallbackSvg = sanitizeSvgMarkup("", assetResult.alt);
    safeMimeType = "image/svg+xml";
    safeDataUri = encodeSvgDataUri(fallbackSvg);
  }

  const assetId = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const durationMs = Date.now() - startedAt;

  return res.status(200).json({
    success: true,
    action: "generate_asset",
    youniverseId: user.youniverseId,
    asset: {
      id: assetId,
      kind: resolvedKind,
      mimeType: safeMimeType,
      dataUri: safeDataUri,
      alt: assetResult.alt,
      width: assetResult.width,
      height: assetResult.height,
      ...(cleanTargetPath ? { targetPath: cleanTargetPath } : {}),
    },
    meta: {
      provider: provider.id,
      model: assetResult.model,
      generatedAt: new Date().toISOString(),
      durationMs,
    },
  });
}

async function handleRuntimeInferAction(
  body: any,
  res: any,
  user: WeaverAuthenticatedUser,
  provider: WeaverAIProvider,
  startedAt: number
) {
  const { mode, prompt, systemInstruction, schema, temperature, maxOutputTokens } = body;

  const resolvedMode = typeof mode === "string" ? mode.trim() : "text";
  if (!ALLOWED_INFER_MODES.has(resolvedMode)) {
    return res.status(400).json({
      success: false,
      error: "invalid_mode",
      message: "mode must be one of text, structuredJson, or liveGrounding.",
    });
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "bad_request",
      message: "A non-empty 'prompt' string is required.",
    });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: "prompt_too_long",
      message: `Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer.`,
    });
  }

  if (resolvedMode === "structuredJson") {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return res.status(400).json({
        success: false,
        error: "invalid_schema",
        message: "structuredJson mode requires a JSON object 'schema'.",
      });
    }
    const schemaSize = Buffer.byteLength(JSON.stringify(schema), "utf8");
    if (schemaSize > MAX_SCHEMA_BYTES) {
      return res.status(413).json({
        success: false,
        error: "payload_too_large",
        message: `Schema exceeds ${MAX_SCHEMA_BYTES} byte limit.`,
      });
    }
  }

  const cleanSystem =
    typeof systemInstruction === "string" && systemInstruction.trim()
      ? systemInstruction.trim().slice(0, MAX_CUSTOM_SYSTEM_LENGTH)
      : resolvedMode === "structuredJson"
        ? "Return valid JSON strictly conforming to the requested schema."
        : "You are a helpful sovereign AI assistant executing inside the owner's Youniverse.";

  const cleanTemp = clampNumber(
    temperature,
    0,
    1.0,
    resolvedMode === "structuredJson" ? 0.3 : 0.5
  );
  const cleanMaxTokens = Math.round(clampNumber(maxOutputTokens, 64, 2_048, 1_024));

  let inferResult;
  try {
    inferResult = await provider.generateStructuredOrText({
      systemInstruction: cleanSystem,
      userPrompt: prompt.trim(),
      responseMimeType: resolvedMode === "structuredJson" ? "application/json" : undefined,
      responseSchema: resolvedMode === "structuredJson" ? schema : undefined,
      temperature: cleanTemp,
      maxOutputTokens: cleanMaxTokens,
      enableGrounding: resolvedMode === "liveGrounding",
    });
  } catch (err: any) {
    console.error("[Weaver Runtime Infer] Provider error:", err?.message ?? err);
    return mapProviderError(res, err, "Runtime inference failed.");
  }

  const durationMs = Date.now() - startedAt;

  if (resolvedMode === "structuredJson") {
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(inferResult.text);
    } catch {
      return res.status(502).json({
        success: false,
        error: "schema_mismatch",
        message: "Structured inference did not return valid JSON.",
      });
    }

    const check = validateSchemaOutput(parsedData, schema);
    if (!check.ok) {
      return res.status(502).json({
        success: false,
        error: "schema_mismatch",
        message: check.reason,
      });
    }

    return res.status(200).json({
      success: true,
      action: "runtime_infer",
      mode: resolvedMode,
      youniverseId: user.youniverseId,
      result: {
        data: parsedData,
        rawText: inferResult.text,
      },
      meta: {
        provider: provider.id,
        model: inferResult.model,
        generatedAt: new Date().toISOString(),
        durationMs,
      },
    });
  }

  if (resolvedMode === "liveGrounding") {
    const citations = extractGroundingCitations(inferResult.groundingMetadata);
    return res.status(200).json({
      success: true,
      action: "runtime_infer",
      mode: resolvedMode,
      youniverseId: user.youniverseId,
      result: {
        text: inferResult.text,
        citations,
      },
      meta: {
        provider: provider.id,
        model: inferResult.model,
        generatedAt: new Date().toISOString(),
        durationMs,
      },
    });
  }

  return res.status(200).json({
    success: true,
    action: "runtime_infer",
    mode: resolvedMode,
    youniverseId: user.youniverseId,
    result: {
      text: inferResult.text,
    },
    meta: {
      provider: provider.id,
      model: inferResult.model,
      generatedAt: new Date().toISOString(),
      durationMs,
    },
  });
}

async function handleOracleDiagnoseAction(
  body: any,
  res: any,
  user: WeaverAuthenticatedUser,
  provider: WeaverAIProvider,
  startedAt: number
) {
  const rawProblem = typeof body.problem === "string" ? body.problem : typeof body.prompt === "string" ? body.prompt : "";
  const problem = rawProblem.trim();
  if (!problem) {
    return res.status(400).json({
      success: false,
      error: "bad_request",
      message: "problem is required for oracle_diagnose.",
    });
  }
  if (problem.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: "payload_too_large",
      message: `problem cannot exceed ${MAX_PROMPT_LENGTH} characters.`,
    });
  }

  const constraints = Array.isArray(body.constraints)
    ? body.constraints
        .filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0)
        .slice(0, 12)
    : [];

  try {
    const result = await runOracleDiagnosis({
      problem,
      constraints,
      provider,
    });
    return res.status(200).json({
      success: true,
      action: "oracle_diagnose",
      youniverseId: user.youniverseId,
      diagnosis: result.diagnosis,
      meta: {
        provider: provider.id,
        model: result.model,
        candidateCount: result.candidateCount,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err: any) {
    console.error("[Oracle Diagnose] Error:", err?.message ?? err);
    return mapProviderError(res, err, "Oracle diagnosis failed.");
  }
}

export async function executeWeaverStudioAction(
  req: any,
  res: any,
  user: WeaverAuthenticatedUser,
  deps: Record<string, any> = {}
) {
  const startedAt = Date.now();
  const body = req?.body && typeof req.body === "object" ? req.body : {};

  const rawAction =
    body.action !== undefined && body.action !== null && body.action !== ""
      ? String(body.action).trim().toLowerCase()
      : "generate";

  if (!ALLOWED_ACTIONS.has(rawAction)) {
    return res.status(400).json({
      success: false,
      error: "invalid_action",
      message:
        "action must be one of generate, generate_asset, runtime_infer, or oracle_diagnose.",
    });
  }

  const providerRes = resolveWeaverProvider({
    requestedProvider: body.provider,
    env: deps.env ?? process.env,
    deps,
  });

  if (!providerRes.ok) {
    const errRes = providerRes as { ok: false; status: number; error: string; message: string };
    return res.status(errRes.status).json({
      success: false,
      error: errRes.error,
      message: errRes.message,
    });
  }

  if (rawAction === "generate_asset") {
    return handleGenerateAssetAction(body, res, user, providerRes.provider, startedAt);
  }
  if (rawAction === "runtime_infer") {
    return handleRuntimeInferAction(body, res, user, providerRes.provider, startedAt);
  }
  if (rawAction === "oracle_diagnose") {
    return handleOracleDiagnoseAction(body, res, user, providerRes.provider, startedAt);
  }
  return handleGenerateAction(body, res, user, providerRes.provider, startedAt);
}
