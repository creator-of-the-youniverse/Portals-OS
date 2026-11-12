import { GoogleGenerativeAI } from '@google/generative-ai';
import { neon } from '@neondatabase/serverless';
import { validateSession } from '../lib/neonSession.ts';

// ── Server-enforced security bounds and allowlists ───────────────────────────
export const ALLOWED_MODELS = ['gemini-1.5-flash'];
export const MAX_CONTENT_ITEMS = 20;
export const MAX_PARTS_PER_CONTENT = 10;
export const MAX_TOTAL_TEXT_LENGTH = 10000;
export const MAX_SYSTEM_INSTRUCTION_TEXT_LENGTH = 2000;
export const MAX_SYSTEM_INSTRUCTION_PARTS = 5;
export const MAX_OUTPUT_TOKENS_LIMIT = 100;

export interface ValidatedGeminiRequest {
    model: string;
    contents: Array<{ role?: string; parts: Array<{ text: string }> }>;
    systemInstruction?: { parts: Array<{ text: string }> };
    generationConfig: { temperature: number; maxOutputTokens: number };
}

export type GeminiValidationResult =
    | { ok: true; value: ValidatedGeminiRequest }
    | { ok: false; status: number; error: string; message: string };

/**
 * Validates and bounds all incoming request payloads against strict server limits.
 * Unsupported features (inline binary data, client-supplied tools, arbitrary configs)
 * fail closed with controlled 4xx errors.
 */
export function validateGeminiInput(body: any): GeminiValidationResult {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return {
            ok: false,
            status: 400,
            error: 'invalid_request',
            message: 'Request body must be a JSON object.',
        };
    }

    const { model: requestedModel, contents, tools, systemInstruction, generationConfig } = body;

    // 1. Model allowlist
    const modelName = requestedModel || 'gemini-1.5-flash';
    if (!ALLOWED_MODELS.includes(modelName)) {
        return {
            ok: false,
            status: 400,
            error: 'invalid_model',
            message: `Model '${modelName}' is not allowed. Allowed models: ${ALLOWED_MODELS.join(', ')}`,
        };
    }

    // 2. Reject client-supplied tools
    if (tools !== undefined && tools !== null) {
        return {
            ok: false,
            status: 400,
            error: 'unsupported_feature',
            message: 'Client-supplied tools are not permitted.',
        };
    }

    // 3. Contents validation
    if (!contents || !Array.isArray(contents) || contents.length === 0 || contents.length > MAX_CONTENT_ITEMS) {
        return {
            ok: false,
            status: 400,
            error: 'invalid_contents',
            message: `Contents must be a non-empty array with at most ${MAX_CONTENT_ITEMS} elements.`,
        };
    }

    let totalTextLength = 0;
    const validatedContents: Array<{ role?: string; parts: Array<{ text: string }> }> = [];

    for (const item of contents) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return {
                ok: false,
                status: 400,
                error: 'invalid_contents',
                message: 'Each content item must be an object.',
            };
        }

        if (!item.parts || !Array.isArray(item.parts) || item.parts.length === 0 || item.parts.length > MAX_PARTS_PER_CONTENT) {
            return {
                ok: false,
                status: 400,
                error: 'invalid_contents',
                message: `Each content item must have between 1 and ${MAX_PARTS_PER_CONTENT} parts.`,
            };
        }

        const validatedParts: Array<{ text: string }> = [];

        for (const part of item.parts) {
            if (!part || typeof part !== 'object' || Array.isArray(part)) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_contents',
                    message: 'Each content part must be an object.',
                };
            }

            // Reject inline binary data or unsupported parts
            if ('inlineData' in part || 'fileData' in part || 'functionCall' in part || 'functionResponse' in part) {
                return {
                    ok: false,
                    status: 400,
                    error: 'unsupported_content',
                    message: 'Inline binary data and advanced parts are not permitted.',
                };
            }

            if (typeof part.text !== 'string') {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_contents',
                    message: 'Each content part must contain a text string.',
                };
            }

            totalTextLength += part.text.length;
            validatedParts.push({ text: part.text });
        }

        const role = typeof item.role === 'string' ? item.role : undefined;
        validatedContents.push({ ...(role ? { role } : {}), parts: validatedParts });
    }

    if (totalTextLength > MAX_TOTAL_TEXT_LENGTH) {
        return {
            ok: false,
            status: 400,
            error: 'payload_too_large',
            message: `Total prompt text exceeds maximum allowed size of ${MAX_TOTAL_TEXT_LENGTH} characters.`,
        };
    }

    // 4. System instruction validation
    let validatedSystemInstruction: { parts: Array<{ text: string }> } | undefined;
    if (systemInstruction !== undefined && systemInstruction !== null) {
        if (typeof systemInstruction === 'string') {
            if (systemInstruction.length > MAX_SYSTEM_INSTRUCTION_TEXT_LENGTH) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_system_instruction',
                    message: `System instruction exceeds maximum allowed size of ${MAX_SYSTEM_INSTRUCTION_TEXT_LENGTH} characters.`,
                };
            }
            validatedSystemInstruction = { parts: [{ text: systemInstruction }] };
        } else if (typeof systemInstruction === 'object' && !Array.isArray(systemInstruction)) {
            const sParts = systemInstruction.parts;
            if (!sParts || !Array.isArray(sParts) || sParts.length === 0 || sParts.length > MAX_SYSTEM_INSTRUCTION_PARTS) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_system_instruction',
                    message: `System instruction parts must be an array with 1 to ${MAX_SYSTEM_INSTRUCTION_PARTS} elements.`,
                };
            }

            let sysTextLen = 0;
            const validSParts: Array<{ text: string }> = [];
            for (const sp of sParts) {
                if (!sp || typeof sp !== 'object' || Array.isArray(sp)) {
                    return {
                        ok: false,
                        status: 400,
                        error: 'invalid_system_instruction',
                        message: 'System instruction parts must be objects.',
                    };
                }
                if ('inlineData' in sp || 'fileData' in sp) {
                    return {
                        ok: false,
                        status: 400,
                        error: 'unsupported_content',
                        message: 'Inline binary data is not permitted in system instructions.',
                    };
                }
                if (typeof sp.text !== 'string') {
                    return {
                        ok: false,
                        status: 400,
                        error: 'invalid_system_instruction',
                        message: 'System instruction part must contain a text string.',
                    };
                }
                sysTextLen += sp.text.length;
                validSParts.push({ text: sp.text });
            }

            if (sysTextLen > MAX_SYSTEM_INSTRUCTION_TEXT_LENGTH) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_system_instruction',
                    message: `System instruction exceeds maximum allowed size of ${MAX_SYSTEM_INSTRUCTION_TEXT_LENGTH} characters.`,
                };
            }

            validatedSystemInstruction = { parts: validSParts };
        } else {
            return {
                ok: false,
                status: 400,
                error: 'invalid_system_instruction',
                message: 'System instruction must be a string or an object with text parts.',
            };
        }
    }

    // 5. Server-enforced output generation bounds
    let validatedMaxTokens = MAX_OUTPUT_TOKENS_LIMIT;
    let validatedTemperature = 0.7;

    if (generationConfig !== undefined && generationConfig !== null) {
        if (typeof generationConfig !== 'object' || Array.isArray(generationConfig)) {
            return {
                ok: false,
                status: 400,
                error: 'invalid_generation_config',
                message: 'Generation configuration must be an object.',
            };
        }

        if (generationConfig.maxOutputTokens !== undefined) {
            if (
                typeof generationConfig.maxOutputTokens !== 'number' ||
                !Number.isInteger(generationConfig.maxOutputTokens) ||
                generationConfig.maxOutputTokens <= 0 ||
                generationConfig.maxOutputTokens > MAX_OUTPUT_TOKENS_LIMIT
            ) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_generation_config',
                    message: `maxOutputTokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS_LIMIT}.`,
                };
            }
            validatedMaxTokens = generationConfig.maxOutputTokens;
        }

        if (generationConfig.temperature !== undefined) {
            if (
                typeof generationConfig.temperature !== 'number' ||
                Number.isNaN(generationConfig.temperature) ||
                generationConfig.temperature < 0 ||
                generationConfig.temperature > 2.0
            ) {
                return {
                    ok: false,
                    status: 400,
                    error: 'invalid_generation_config',
                    message: 'temperature must be a number between 0.0 and 2.0.',
                };
            }
            validatedTemperature = generationConfig.temperature;
        }
    }

    return {
        ok: true,
        value: {
            model: modelName,
            contents: validatedContents,
            systemInstruction: validatedSystemInstruction,
            generationConfig: {
                maxOutputTokens: validatedMaxTokens,
                temperature: validatedTemperature,
            },
        },
    };
}

export interface GeminiHandlerDeps {
    neon?: any;
    validateSession?: (sql: any, rawToken: string) => Promise<any>;
    GoogleGenerativeAI?: any;
    databaseUrl?: string;
    apiKey?: string;
}

export default async function handler(req: any, res: any, deps?: GeminiHandlerDeps) {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── 1. Authenticate bearer session token ──────────────────────────────────
    const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Valid bearer session token required.',
        });
    }
    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Valid bearer session token required.',
        });
    }

    const databaseUrl = deps?.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) {
        return res.status(500).json({
            error: 'server_misconfiguration',
            message: 'Database not configured.',
        });
    }

    // Controlled error-handling boundary for database session store
    let sessionValidation;
    try {
        const neonFactory = deps?.neon ?? neon;
        const sql = neonFactory(databaseUrl);
        const sessionValidator = deps?.validateSession ?? validateSession;
        sessionValidation = await sessionValidator(sql, rawToken);
    } catch (dbError: any) {
        // Safe server error: does not classify outages as invalid credentials,
        // and does not leak internal exception details or tokens to the caller
        console.error('Session validation store error');
        return res.status(500).json({
            error: 'session_store_unavailable',
            message: 'Authentication service temporarily unavailable.',
        });
    }

    if (!sessionValidation || !sessionValidation.ok) {
        return res.status(401).json({
            error: 'invalid_token',
            message: 'Session is invalid, expired, or revoked.',
        });
    }

    // ── 2. Validate request shape and enforce model allowlist / bounds ────────
    const validation = validateGeminiInput(req.body);
    if (!validation.ok) {
        return res.status(validation.status).json({
            error: validation.error,
            message: validation.message,
        });
    }

    const { model: modelName, contents, systemInstruction, generationConfig } = validation.value;

    const apiKey = deps?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: 'server_misconfiguration',
            message: 'Gemini API key not configured.',
        });
    }

    // ── 3. Invoke provider with strictly bounded configuration ───────────────
    try {
        const GenAIClass = deps?.GoogleGenerativeAI ?? GoogleGenerativeAI;
        const genAI = new GenAIClass(apiKey);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: generationConfig.temperature,
                maxOutputTokens: generationConfig.maxOutputTokens,
            },
            systemInstruction: systemInstruction,
        });

        const result = await model.generateContent(contents);
        const response = await result.response;

        const candidates = [];
        if (response?.candidates) {
            for (const candidate of response.candidates) {
                const parts = [];
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text) {
                            parts.push({ text: part.text });
                        }
                    }
                }
                candidates.push({
                    content: {
                        parts,
                        role: candidate.content?.role,
                    },
                    finishReason: candidate.finishReason,
                });
            }
        }

        return res.status(200).json({ candidates });
    } catch (error: any) {
        // Safe logging: no sensitive tokens, raw prompts, or secret configurations leaked
        console.error('=== Gemini API Error ===', error?.message || 'Unknown error');
        return res.status(500).json({
            error: 'generation_failed',
            message: 'An error occurred while generating content.',
        });
    }
}
