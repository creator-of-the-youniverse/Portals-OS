/**
 * controllers/weaverController.js
 *
 * POST /api/weaver/generate
 *
 * Secure endpoint for the Weaver — the AI component-generation engine within
 * THE YOUNIVERSE. Accepts a user prompt and the verified youniverseId from
 * the active JWT session, then uses Gemini to produce a validated React
 * component string wrapped in strict JSON.
 *
 * Security layers:
 *  - JWT authentication (verifyJwt middleware, applied in server.js).
 *  - Per-IP rate limiting (applied in server.js via weaverRateLimiter).
 *  - API key never leaves the server process — sourced exclusively from .env.
 *  - Strict JSON output enforcement via Gemini's responseMimeType.
 *  - Input length cap to prevent prompt-injection / token exhaustion.
 *  - Structured error responses that never expose raw stack traces.
 *
 * Response payload:
 *  {
 *    success: true,
 *    youniverseId: string,
 *    component: {
 *      name: string,          // PascalCase component identifier
 *      code: string,          // Complete React functional component source
 *      dependencies: string[] // NPM packages required (empty [] if none)
 *    },
 *    meta: {
 *      model: string,
 *      generatedAt: string    // ISO 8601 timestamp
 *    }
 *  }
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  WEAVER_RESPONSE_SCHEMA,
  WEAVER_SYSTEM_INSTRUCTION,
} from "../lib/weaverSystemPrompt.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEAVER_MODEL = "gemini-2.0-flash-001";
const MAX_PROMPT_LENGTH = 4_000;         // chars (~1k tokens) — protects budget
const MAX_OUTPUT_TOKENS = 8_192;         // generous for a full React component

// System instruction and response schema are sourced from lib/weaverSystemPrompt.js.
// Edit that file to tune Weaver's persona, rules, or output contract.

// ── Lazy-initialise the Gemini client on first request ────────────────────────

let _genAI = null;

function getGenAI() {
  if (_genAI) return _genAI;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment.");
  }

  _genAI = new GoogleGenerativeAI(apiKey);
  return _genAI;
}

// ── Response validation ───────────────────────────────────────────────────────

/**
 * Validates that the Gemini JSON response conforms to the expected schema.
 * Throws a descriptive Error if validation fails so the caller can 502.
 */
function validateWeaverPayload(parsed) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Response is not a JSON object.");
  }

  const { name, code, dependencies } = parsed;

  if (typeof name !== "string" || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error(`Invalid component name: "${name}".`);
  }

  if (typeof code !== "string" || code.trim().length < 10) {
    throw new Error("Component code is missing or too short.");
  }

  if (!Array.isArray(dependencies)) {
    throw new Error("Dependencies field must be an array.");
  }

  // Ensure all entries are strings
  if (dependencies.some((d) => typeof d !== "string")) {
    throw new Error("All dependency entries must be strings.");
  }

  return { name, code: code.trim(), dependencies };
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * @param {import('express').Request}  req  – authenticated; req.user is set by verifyJwt.
 * @param {import('express').Response} res
 */
export async function weaverGenerateHandler(req, res) {
  const requestStart = Date.now();

  // ── 1. Validate request body ───────────────────────────────────────────────
  const { prompt } = req.body ?? {};
  const { youniverseId } = req.user; // Set by verifyJwt middleware.

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

  // ── 2. Build Gemini request ────────────────────────────────────────────────
  let genAI;
  try {
    genAI = getGenAI();
  } catch (envErr) {
    console.error("[Weaver] API key error:", envErr.message);
    return res.status(500).json({
      success: false,
      error: "server_misconfiguration",
      message: "The AI service is not configured.",
    });
  }

  const model = genAI.getGenerativeModel({
    model: WEAVER_MODEL,
    // Identity, output contract, and quality rules — see lib/weaverSystemPrompt.js.
    systemInstruction: {
      parts: [{ text: WEAVER_SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      // responseMimeType + responseSchema together provide two-layer JSON enforcement:
      //   • responseMimeType tells Gemini to emit JSON text (not markdown).
      //   • responseSchema constrains token sampling to the exact object shape.
      responseMimeType: "application/json",
      responseSchema: WEAVER_RESPONSE_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.4,  // Low temp = more deterministic, structurally reliable code.
      topP: 0.9,
    },
  });

  // Construct the user turn; never allow the prompt to contain the system key.
  const userTurn = {
    role: "user",
    parts: [
      {
        text: `YouiuniverseID: ${youniverseId}\n\nComponent request:\n${prompt.trim()}`,
      },
    ],
  };

  // ── 3. Call Gemini ─────────────────────────────────────────────────────────
  let rawText;
  try {
    console.log(
      `[Weaver] Generating for youniverse=${youniverseId} prompt_len=${prompt.length}`
    );
    const result = await model.generateContent([userTurn]);
    const response = await result.response;
    rawText = response.text();
  } catch (aiErr) {
    console.error("[Weaver] Gemini API error:", aiErr.message);

    // Surface quota / safety errors distinctly so the client can act on them.
    if (aiErr.message?.includes("RESOURCE_EXHAUSTED") || aiErr.status === 429) {
      return res.status(429).json({
        success: false,
        error: "quota_exceeded",
        message: "AI generation quota exceeded. Please try again shortly.",
      });
    }

    if (aiErr.message?.includes("SAFETY") || aiErr.message?.includes("blocked")) {
      return res.status(422).json({
        success: false,
        error: "safety_blocked",
        message: "The prompt was blocked by the safety filter. Please revise your request.",
      });
    }

    return res.status(502).json({
      success: false,
      error: "ai_error",
      message: "The AI service encountered an error. Please try again.",
    });
  }

  // ── 4. Parse and validate the JSON payload ─────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    console.error("[Weaver] Failed to parse Gemini response as JSON:", rawText?.slice(0, 300));
    return res.status(502).json({
      success: false,
      error: "invalid_ai_response",
      message: "The AI returned a malformed response. Please try again.",
    });
  }

  let component;
  try {
    component = validateWeaverPayload(parsed);
  } catch (validationErr) {
    console.error("[Weaver] Payload validation failed:", validationErr.message);
    return res.status(502).json({
      success: false,
      error: "schema_mismatch",
      message: "The AI response did not match the expected schema. Please try again.",
    });
  }

  // ── 5. Return the payload ──────────────────────────────────────────────────
  const durationMs = Date.now() - requestStart;
  console.log(`[Weaver] ✓ Success — youniverse=${youniverseId} component=${component.name} (${durationMs}ms)`);

  return res.status(200).json({
    success: true,
    youniverseId,
    component,
    meta: {
      model: WEAVER_MODEL,
      generatedAt: new Date().toISOString(),
      durationMs,
    },
  });
}
