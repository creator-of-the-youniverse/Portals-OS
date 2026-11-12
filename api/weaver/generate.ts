/**
 * POST /api/weaver/generate
 *
 * Vercel Serverless Function — AI component generation engine for authenticated owners.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateRequest } from "../../lib/serverlessAuth.ts";
import { WEAVER_RESPONSE_SCHEMA, WEAVER_SYSTEM_INSTRUCTION } from "../../lib/weaverSystemPrompt.js";

const WEAVER_MODEL = "gemini-2.0-flash-001";
const MAX_PROMPT_LENGTH = 4_000;
const MAX_OUTPUT_TOKENS = 8_192;

export default async function handler(req: any, res: any, deps: any = {}) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const auth = await authenticateRequest(req, deps);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error, message: auth.message });
  }

  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ success: false, error: "bad_request", message: "A non-empty 'prompt' is required." });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({ success: false, error: "prompt_too_long", message: "Prompt too long." });
  }

  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "server_misconfiguration", message: "AI service not configured." });
  }

  try {
    const GenAI = deps.GoogleGenerativeAI ?? GoogleGenerativeAI;
    const genAI = new GenAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: WEAVER_MODEL,
      systemInstruction: { parts: [{ text: WEAVER_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: WEAVER_RESPONSE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4,
        topP: 0.9,
      },
    });

    const userTurn = {
      role: "user",
      parts: [{ text: `YouniverseID: ${auth.user.youniverseId}\n\nComponent request:\n${prompt.trim()}` }],
    };

    const result = await model.generateContent([userTurn]);
    const response = await result.response;
    const rawText = response.text();
    const parsed = JSON.parse(rawText);

    return res.status(200).json({
      success: true,
      youniverseId: auth.user.youniverseId,
      component: parsed,
      meta: {
        model: WEAVER_MODEL,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Weaver Generate] Error:", error.message);
    return res.status(502).json({ success: false, error: "ai_error", message: "Component synthesis failed." });
  }
}
