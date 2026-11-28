/**
 * lib/weaverProvider.ts
 *
 * Provider-agnostic server-side AI adapter layer for Weaver AI Studio.
 * Enforces provider sovereignty: API keys and provider endpoints live
 * exclusively in server environment variables and never reach the browser.
 *
 * Erasable TypeScript only (direct Node ESM execution & Vercel TS sync).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface WeaverProviderGenerateParams {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: Record<string, unknown>;
  responseMimeType?: string;
  temperature?: number;
  maxOutputTokens?: number;
  enableGrounding?: boolean;
}

export interface WeaverProviderGenerateResult {
  text: string;
  model: string;
  groundingMetadata?: unknown;
}

export interface WeaverProviderAssetParams {
  prompt: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  kind?: "image" | "icon" | "svg";
  model?: string;
}

export interface WeaverProviderAssetResult {
  mimeType: string;
  dataUri: string;
  model: string;
  alt: string;
  width: number;
  height: number;
}

export interface WeaverAIProvider {
  readonly id: string;
  readonly defaultModel: string;
  generateStructuredOrText(
    params: WeaverProviderGenerateParams
  ): Promise<WeaverProviderGenerateResult>;
  generateAsset(
    params: WeaverProviderAssetParams
  ): Promise<WeaverProviderAssetResult>;
}

export type ResolveWeaverProviderResult =
  | { ok: true; provider: WeaverAIProvider }
  | { ok: false; status: number; error: string; message: string };

const ALLOWED_PROVIDER_IDS = new Set(["gemini", "openai_compatible"]);

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 512, height: 512 },
  "16:9": { width: 640, height: 360 },
  "9:16": { width: 360, height: 640 },
  "4:3": { width: 512, height: 384 },
};

/**
 * Strips potentially dangerous elements and attributes from SVG markup so
 * generated vector assets are strictly CSP-safe when encoded as data URIs.
 */
export function sanitizeSvgMarkup(rawSvg: string, fallbackAlt = "Generated visual"): string {
  const input = String(rawSvg ?? "").trim();
  const svgMatch = input.match(/<svg[\s\S]*<\/svg>/i);
  let svg = svgMatch ? svgMatch[0] : "";

  if (!svg) {
    const safeTitle = fallbackAlt.replace(/[<>&"']/g, "").slice(0, 60) || "Weaver Asset";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${safeTitle}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4c1d95"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="512" height="512" rx="32" fill="url(#g)"/><circle cx="256" cy="256" r="120" fill="#8b5cf6" fill-opacity="0.28" stroke="#a78bfa" stroke-width="4"/></svg>`;
  }

  // Strip active / embedded content tags
  svg = svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");

  // Strip inline event handlers (onload, onclick, etc.)
  svg = svg.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Strip javascript: and external http(s): href/xlink:href/src references
  svg = svg.replace(
    /\s+(?:xlink:)?(?:href|src)\s*=\s*(?:"\s*(?:javascript:|https?:|\/\/)[^"]*"|'\s*(?:javascript:|https?:|\/\/)[^']*')/gi,
    ""
  );

  // Ensure xmlns attribute exists on root <svg>
  if (!/\bxmlns\s*=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}

export function encodeSvgDataUri(sanitizedSvg: string): string {
  const base64 = Buffer.from(sanitizedSvg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

export function createGeminiProvider(options: {
  apiKey: string;
  defaultModel?: string;
  imageModel?: string;
  GoogleGenerativeAI?: any;
}): WeaverAIProvider {
  const GenAIClass = options.GoogleGenerativeAI ?? GoogleGenerativeAI;
  const genAI = new GenAIClass(options.apiKey);
  const defaultModel = options.defaultModel || "gemini-2.0-flash-001";

  return {
    id: "gemini",
    defaultModel,

    async generateStructuredOrText(params: WeaverProviderGenerateParams) {
      const modelName = params.model || defaultModel;
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: params.maxOutputTokens ?? 8_192,
        temperature: params.temperature ?? 0.4,
        topP: 0.9,
      };
      if (params.responseMimeType) {
        generationConfig.responseMimeType = params.responseMimeType;
      }
      if (params.responseSchema) {
        generationConfig.responseSchema = params.responseSchema;
      }

      const modelConfig: Record<string, unknown> = {
        model: modelName,
        systemInstruction: { parts: [{ text: params.systemInstruction }] },
        generationConfig,
      };
      if (params.enableGrounding) {
        modelConfig.tools = [{ googleSearch: {} }];
      }

      const model = genAI.getGenerativeModel(modelConfig);
      const userTurn = {
        role: "user",
        parts: [{ text: params.userPrompt }],
      };

      const result = await model.generateContent([userTurn]);
      const response = await result.response;
      const text = response.text();
      const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;

      return {
        text,
        model: modelName,
        ...(groundingMetadata !== undefined ? { groundingMetadata } : {}),
      };
    },

    async generateAsset(params: WeaverProviderAssetParams) {
      const dims = ASPECT_DIMENSIONS[params.aspectRatio ?? "1:1"] ?? ASPECT_DIMENSIONS["1:1"];
      const modelName = params.model || options.imageModel || defaultModel;
      const systemInstruction =
        "You are a vector graphic designer for Portals OS. " +
        "Return strict JSON matching { \"svg\": string, \"alt\": string }. " +
        "The 'svg' field must be a self-contained <svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " +
        `${dims.width} ${dims.height}\">...</svg> with zero <script>, zero event handlers, and zero external URLs.`;

      const userPrompt = [
        `Asset kind: ${params.kind ?? "svg"}`,
        params.style ? `Visual style: ${params.style}` : null,
        `Dimensions: ${dims.width}x${dims.height}`,
        `Prompt: ${params.prompt}`,
      ]
        .filter(Boolean)
        .join("\n");

      const generated = await this.generateStructuredOrText({
        model: modelName,
        systemInstruction,
        userPrompt,
        responseMimeType: "application/json",
        temperature: 0.6,
        maxOutputTokens: 2_048,
      });

      let rawSvg = generated.text;
      let alt = params.prompt.slice(0, 120);
      try {
        const parsed = JSON.parse(generated.text);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.svg === "string") rawSvg = parsed.svg;
          if (typeof parsed.alt === "string" && parsed.alt.trim()) {
            alt = parsed.alt.trim().slice(0, 160);
          }
        }
      } catch {
        // Fallback to extracting <svg> directly from text
      }

      const cleanSvg = sanitizeSvgMarkup(rawSvg, alt);
      return {
        mimeType: "image/svg+xml",
        dataUri: encodeSvgDataUri(cleanSvg),
        model: generated.model,
        alt,
        width: dims.width,
        height: dims.height,
      };
    },
  };
}

export function createOpenAICompatibleProvider(options: {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  fetchImpl?: typeof fetch;
}): WeaverAIProvider {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const defaultModel = options.defaultModel;

  return {
    id: "openai_compatible",
    defaultModel,

    async generateStructuredOrText(params: WeaverProviderGenerateParams) {
      const modelName = params.model || defaultModel;
      const body: Record<string, unknown> = {
        model: modelName,
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxOutputTokens ?? 8_192,
      };

      if (params.responseMimeType === "application/json") {
        body.response_format = { type: "json_object" };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (options.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }

      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Provider returned HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        throw new Error("Provider returned an empty completion.");
      }

      return {
        text,
        model: modelName,
      };
    },

    async generateAsset(params: WeaverProviderAssetParams) {
      const dims = ASPECT_DIMENSIONS[params.aspectRatio ?? "1:1"] ?? ASPECT_DIMENSIONS["1:1"];
      const generated = await this.generateStructuredOrText({
        model: params.model || defaultModel,
        systemInstruction:
          `Return JSON { "svg": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 ${dims.width} ${dims.height}\\">...</svg>", "alt": "..." } with zero scripts or external URLs.`,
        userPrompt: `Create ${params.kind ?? "svg"} asset: ${params.prompt}`,
        responseMimeType: "application/json",
        temperature: 0.6,
        maxOutputTokens: 2_048,
      });

      let rawSvg = generated.text;
      let alt = params.prompt.slice(0, 120);
      try {
        const parsed = JSON.parse(generated.text);
        if (typeof parsed?.svg === "string") rawSvg = parsed.svg;
        if (typeof parsed?.alt === "string" && parsed.alt.trim()) alt = parsed.alt.trim();
      } catch {
        // Fallback
      }

      const cleanSvg = sanitizeSvgMarkup(rawSvg, alt);
      return {
        mimeType: "image/svg+xml",
        dataUri: encodeSvgDataUri(cleanSvg),
        model: generated.model,
        alt,
        width: dims.width,
        height: dims.height,
      };
    },
  };
}

export function resolveWeaverProvider(options: {
  requestedProvider?: unknown;
  env?: Record<string, string | undefined>;
  deps?: Record<string, any>;
}): ResolveWeaverProviderResult {
  const env = options.env ?? process.env;
  const deps = options.deps ?? {};

  if (deps.provider && typeof deps.provider.generateStructuredOrText === "function") {
    return { ok: true, provider: deps.provider as WeaverAIProvider };
  }

  const rawRequested =
    typeof options.requestedProvider === "string" && options.requestedProvider.trim().length > 0
      ? options.requestedProvider.trim().toLowerCase()
      : (env.WEAVER_PROVIDER || "gemini").trim().toLowerCase();

  if (!ALLOWED_PROVIDER_IDS.has(rawRequested)) {
    return {
      ok: false,
      status: 400,
      error: "unsupported_provider",
      message: `Unsupported AI provider "${rawRequested}".`,
    };
  }

  if (rawRequested === "openai_compatible") {
    const baseUrl = env.WEAVER_OPENAI_BASE_URL;
    const defaultModel = env.WEAVER_OPENAI_MODEL || "gpt-4o-mini";
    if (!baseUrl) {
      return {
        ok: false,
        status: 500,
        error: "server_misconfiguration",
        message: "Configured AI provider is missing server endpoint settings.",
      };
    }
    return {
      ok: true,
      provider: createOpenAICompatibleProvider({
        baseUrl,
        apiKey: env.WEAVER_OPENAI_API_KEY,
        defaultModel,
        fetchImpl: deps.fetch,
      }),
    };
  }

  const apiKey = deps.apiKey ?? env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "server_misconfiguration",
      message: "AI service not configured.",
    };
  }

  return {
    ok: true,
    provider: createGeminiProvider({
      apiKey,
      defaultModel: env.WEAVER_GEMINI_MODEL || env.WEAVER_MODEL || "gemini-2.0-flash-001",
      imageModel: env.WEAVER_IMAGE_MODEL,
      GoogleGenerativeAI: deps.GoogleGenerativeAI,
    }),
  };
}
