import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { verifyJwt } from "./middleware/verifyJwt.js";
import { weaverGenerateHandler } from "./controllers/weaverController.js";
import { saveWeaverArtifactHandler, getWeavedWidgetsHandler } from "./controllers/notNotesController.js";
import { getYouniverseContextHandler } from "./controllers/youniverseContextController.js";

dotenv.config();

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist")));

const apiKey = process.env.GEMINI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const localAssistantUrl =
  process.env.LOCAL_ASSISTANT_URL || "http://127.0.0.1:8000/generate";
const lmStudioUrl = process.env.LM_STUDIO_URL || "http://172.20.20.20:1234/v1/chat/completions";

console.log("=== Server Startup ===");
console.log("LM Studio URL:", lmStudioUrl);
console.log("API Key present:", !!apiKey);
console.log(
  "API Key starts with:",
  apiKey ? apiKey.substring(0, 10) + "..." : "NOT SET"
);
console.log("Anthropic Key present:", !!anthropicKey);

const genAI = new GoogleGenerativeAI(apiKey);

// LM Studio Proxy
app.post("/api/lmstudio:generate", async (req, res) => {
  try {
    const { model, contents, systemInstruction, tools } = req.body;
    console.log("=== LM Studio API Request ===");
    console.log("Model:", model);

    // Convert Google Gemini format to OpenAI/LM Studio format
    const messages = [];

    // Add system instruction if present
    if (systemInstruction && systemInstruction.parts) {
      messages.push({
        role: "system",
        content: systemInstruction.parts.map(p => p.text).join("\n")
      });
    }

    // Convert contents
    if (contents) {
      contents.forEach(item => {
        const role = item.role === "model" ? "assistant" : item.role;
        const text = item.parts.map(p => p.text).join("\n");
        messages.push({ role, content: text });
      });
    }

    // Helper to fix Gemini Schema types (UPPERCASE) to OpenAI Schema types (lowercase)
    const fixSchema = (schema) => {
      if (!schema) return schema;
      const newSchema = { ...schema };
      if (newSchema.type && typeof newSchema.type === 'string') {
        newSchema.type = newSchema.type.toLowerCase();
      }
      if (newSchema.properties) {
        newSchema.properties = { ...newSchema.properties };
        for (const key in newSchema.properties) {
          newSchema.properties[key] = fixSchema(newSchema.properties[key]);
        }
      }
      if (newSchema.items) {
        newSchema.items = fixSchema(newSchema.items);
      }
      return newSchema;
    };

    // Convert Tools (Gemini -> OpenAI)
    let openAiTools = undefined;
    if (tools && tools.length > 0) {
      openAiTools = [];
      tools.forEach(toolGroup => {
        if (toolGroup.functionDeclarations) {
          toolGroup.functionDeclarations.forEach(decl => {
            openAiTools.push({
              type: "function",
              function: {
                name: decl.name,
                description: decl.description,
                parameters: fixSchema(decl.parameters)
              }
            });
          });
        }
      });
      console.log(`Included ${openAiTools.length} tools in request`);
    }

    const lmRequest = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: -1,
      stream: false,
      tools: openAiTools
    };

    console.log("Sending to LM Studio:", JSON.stringify({ ...lmRequest, messages: "[...]" }, null, 2));

    const lmRes = await fetch(lmStudioUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lmRequest)
    });

    if (!lmRes.ok) {
      const errorText = await lmRes.text();
      console.error("LM Studio Error Body:", errorText);
      throw new Error(`LM Studio responded with ${lmRes.status}: ${lmRes.statusText} - ${errorText}`);
    }

    const lmData = await lmRes.json();
    console.log("LM Studio response received");

    // Convert back to Gemini format
    const candidates = lmData.choices.map(choice => {
      const parts = [];

      // Handle text content
      if (choice.message.content) {
        parts.push({ text: choice.message.content });
      }

      // Handle tool calls
      if (choice.message.tool_calls) {
        choice.message.tool_calls.forEach(tc => {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch (e) {
            console.error("Failed to parse tool arguments:", tc.function.arguments);
          }
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: args
            }
          });
        });
      }

      return {
        content: {
          parts: parts,
          role: "model"
        },
        finishReason: choice.finish_reason === "stop" ? "STOP" : "OTHER"
      };
    });

    res.json({ candidates });

  } catch (error) {
    console.error("=== LM Studio Proxy Error ===");
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini:generate", async (req, res) => {
  try {
    const {
      model: modelName,
      contents,
      generationConfig,
      tools,
      systemInstruction,
    } = req.body;

    console.log("=== Gemini API Request ===");
    console.log("Model:", modelName || "gemini-pro");
    console.log("API Key available:", !!apiKey);
    console.log("Contents length:", contents?.length);
    console.log(
      "Contents preview:",
      JSON.stringify(contents?.slice(0, 2), null, 2)
    );
    console.log(
      "Full request body:",
      JSON.stringify(
        { model: modelName, contents, generationConfig, systemInstruction },
        null,
        2
      )
    );
    // If the requested model is an Anthropic/Claude model, route to Anthropic API
    if (modelName && modelName.toLowerCase().startsWith("claude")) {
      // If the requested model is a local assistant, proxy to the configured local endpoint
      if (
        modelName === "local-assistant" ||
        (modelName && modelName.toLowerCase().startsWith("local:"))
      ) {
        try {
          console.log(
            "Routing request to local assistant at",
            localAssistantUrl
          );

          // If callers used modelName like 'local:my-assistant', include that name in the body
          const localBody = {
            model: modelName,
            contents,
            generationConfig,
            systemInstruction,
          };

          const localRes = await fetch(localAssistantUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(localBody),
          });

          const localData = await localRes.json();

          // Expect local server to return either { candidates: [...] } or { text: '...' }
          if (localData.candidates) {
            return res.json(localData);
          }

          const text = localData.text || localData.completion || "";
          return res.json({
            candidates: [{ content: { parts: [{ text }], role: "assistant" } }],
          });
        } catch (err) {
          console.error("Error calling local assistant:", err);
          return res
            .status(500)
            .json({ error: "Local assistant request failed." });
        }
      }

      if (!anthropicKey) {
        console.error("Anthropic API key not set but Claude model requested");
        return res
          .status(500)
          .json({ error: "Anthropic API key not configured on server." });
      }

      // Convert the Google-style contents array into a single prompt string suitable for Anthropic
      const buildText = (items) => {
        return (
          items
            .map((c) => {
              const roleLabel =
                c.role === "user"
                  ? "Human"
                  : c.role === "model"
                    ? "Assistant"
                    : c.role || "System";
              const partText = (c.parts || [])
                .map((p) => p.text || "")
                .join("\n");
              return `${roleLabel}: ${partText}`;
            })
            .join("\n") + "\nAssistant:"
        );
      };

      const prompt = buildText(contents || []);

      const anthropicBody = {
        model: modelName,
        prompt,
        max_tokens_to_sample: generationConfig?.maxOutputTokens || 1024,
        temperature: generationConfig?.temperature ?? 0.0,
      };

      const anthRes = await fetch("https://api.anthropic.com/v1/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
        },
        body: JSON.stringify(anthropicBody),
      });

      const anthData = await anthRes.json();

      // Anthropic returns a `completion` field (string). Normalize to the same response shape.
      const completionText =
        anthData.completion || anthData.completion?.content || "";

      const candidates = [
        {
          content: {
            parts: [{ text: completionText }],
            role: "assistant",
          },
        },
      ];

      return res.json({ candidates });
    }

    // Default: use Google Generative AI
    const model = genAI.getGenerativeModel({
      model: modelName || "gemini-1.5-flash",
      generationConfig,
      tools,
      systemInstruction,
    });

    const result = await model.generateContent(contents);
    const response = await result.response;

    // Handle different response types
    const candidates = [];
    if (response.candidates) {
      for (const candidate of response.candidates) {
        const parts = [];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              parts.push({ text: part.text });
            } else if (part.functionCall) {
              parts.push({ functionCall: part.functionCall });
            } else if (part.inlineData) {
              parts.push({ inlineData: part.inlineData });
            }
          }
        }
        candidates.push({
          content: {
            parts,
            role: candidate.content?.role,
          },
          finishReason: candidate.finishReason,
          groundingMetadata: candidate.groundingMetadata,
        });
      }
    }

    console.log("=== Gemini API Success ===");
    res.json({
      candidates,
      error: response.error ? { message: response.error.message } : undefined,
    });
  } catch (error) {
    console.error("=== Gemini API Error ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Full error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// FIRST-TOUCH ONBOARDING — AUTH ENDPOINTS (PRISMA DB)
// ============================================================================

// POST /api/v1/auth/claim — Create User & Youniverse
app.post("/api/v1/auth/claim", async (req, res) => {
  const { handle, email } = req.body;

  if (!handle || !email) {
    return res.status(400).json({ success: false, error: "Handle and email are required" });
  }

  const handleRegex = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
  if (!handleRegex.test(handle)) {
    return res.status(400).json({ success: false, error: "Invalid handle format" });
  }

  try {
    // 1. Check if Handle is taken
    const existingHandle = await prisma.youniverse.findUnique({
      where: { handle }
    });
    
    if (existingHandle) {
      return res.status(409).json({ success: false, error: "Handle already claimed" });
    }

    // 2. Check "One Free Youniverse" rule via Email
    let user = await prisma.user.findUnique({
      where: { email },
      include: { youniverses: true }
    });

    if (user && user.youniverses.length > 0) {
      return res.status(402).json({ success: false, error: "payment_required" });
    }

    // 3. Create User if they don't exist
    if (!user) {
      user = await prisma.user.create({
        data: { email }
      });
    }

    // 4. Create the Youniverse (Provisional/Free Tier)
    const newYouniverse = await prisma.youniverse.create({
      data: {
        handle,
        ownerId: user.id,
        isPrimary: true,
        tier: "FREE"
      }
    });

    // 5. Create a provisional session token (magic link equivalent)
    const sessionToken = `prov_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: sessionToken,
        expiresAt,
        userAgent: req.headers['user-agent'] || null,
      }
    });

    console.log(`[AUTH DB] Provisional tenant created: @${handle} (${email})`);
    console.log(`[AUTH DB] Verification link would be: /api/v1/auth/verify?token=${sessionToken}`);

    res.json({
      success: true,
      subdomain: `${handle}.itsyouonline.com`,
      sessionToken,
    });
  } catch (error) {
    console.error("[AUTH ERROR]", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// GET /api/v1/auth/verify — Verify email via session token
app.get("/api/v1/auth/verify", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, error: "Token is required" });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: { user: { include: { youniverses: true } } }
    });

    if (!session || session.expiresAt < new Date() || session.revokedAt) {
      return res.status(404).json({ success: false, error: "Invalid or expired token" });
    }

    // Upgrade User to verified
    if (!session.user.emailVerified) {
      await prisma.user.update({
        where: { id: session.userId },
        data: { emailVerified: new Date() }
      });
    }

    const primaryHandle = session.user.youniverses[0]?.handle || "unknown";
    console.log(`[AUTH DB] Email verified: @${primaryHandle} upgraded to AUTHENTICATED_OWNER`);

    res.json({
      success: true,
      handle: primaryHandle,
      role: "AUTHENTICATED_OWNER",
    });
  } catch (error) {
    console.error("[AUTH VERIFY ERROR]", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// GET /api/v1/auth/availability — Check handle availability
app.get("/api/v1/auth/availability", async (req, res) => {
  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({ available: false, error: "Handle is required" });
  }

  try {
    const existing = await prisma.youniverse.findUnique({
      where: { handle }
    });

    res.json({
      available: !existing,
      handle,
      subdomain: `${handle}.itsyouonline.com`,
    });
  } catch (error) {
    console.error("[AUTH AVAILABILITY ERROR]", error);
    // Gracefully fallback to available if DB fails (e.g. not connected yet)
    res.json({ available: true, handle, subdomain: `${handle}.itsyouonline.com` });
  }
});

// ============================================================================
// WEAVER — AI COMPONENT GENERATION ENGINE
// POST /api/weaver/generate
// ============================================================================

/**
 * Rate limiter scoped exclusively to the Weaver endpoint.
 *
 * Limits:
 *   - 10 requests per 10-minute window per IP.
 *   - Responds with 429 and a Retry-After header on breach.
 *
 * This is a hard budget guard in addition to the JWT auth layer.
 * Adjust WEAVER_RATE_LIMIT_MAX / WEAVER_RATE_LIMIT_WINDOW_MS in .env
 * to tune without a code deploy.
 */
const weaverRateLimiter = rateLimit({
  windowMs: parseInt(process.env.WEAVER_RATE_LIMIT_WINDOW_MS ?? "600000", 10), // 10 min
  max: parseInt(process.env.WEAVER_RATE_LIMIT_MAX ?? "10", 10),
  standardHeaders: true,   // Return rate-limit headers (RateLimit-*)
  legacyHeaders: false,     // Disable X-RateLimit-* legacy headers
  keyGenerator: (req) => {
    // Prefer the verified userId so the limit is per-user (not per-proxy IP).
    return req.user?.userId ?? req.ip;
  },
  handler: (req, res) => {
    console.warn(`[Weaver] Rate limit breached — key=${req.user?.userId ?? req.ip}`);
    return res.status(429).json({
      success: false,
      error: "rate_limit_exceeded",
      message: "Too many generation requests. Please wait before trying again.",
    });
  },
});

// Note: verifyJwt runs BEFORE weaverRateLimiter so the keyGenerator
// can use req.user.userId for per-user bucketing.
app.post(
  "/api/weaver/generate",
  verifyJwt,
  weaverRateLimiter,
  weaverGenerateHandler
);

// ============================================================================
// NOTNOTES — ARTIFACT PERSISTENCE
// POST /api/not-notes/artifact
// ============================================================================
app.post(
  "/api/not-notes/artifact",
  verifyJwt,
  saveWeaverArtifactHandler
);

app.get(
  "/api/not-notes/widgets",
  verifyJwt,
  getWeavedWidgetsHandler
);

// ============================================================================
// YOUNIVERSE CONTEXT — SERVER-VERIFIED OWNER GATE
// GET /api/youniverse/:handle/context
// verifyJwt stamps req.user; handler compares req.user.youniverseId to DB row.
// ============================================================================
app.get(
  "/api/youniverse/:handle/context",
  verifyJwt,
  getYouniverseContextHandler
);

// Serve the React app for any non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const server = app.listen(3002, () => {
  console.log("Server running on http://localhost:3002");
});

// Set timeout to 10 minutes to allow for slow local LLM responses
server.setTimeout(600000);
