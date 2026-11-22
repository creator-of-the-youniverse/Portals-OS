import { USE_LM_STUDIO, LM_STUDIO_MODEL_ID } from "../constants";

const API_BASE = "/api";

/** Build JSON headers with optional Bearer token alongside same-origin session cookies. */
function buildOneRequestHeaders(): Record<string, string> {
    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("youniverse_session_token") || localStorage.getItem("weaver_jwt")
            : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

export const generateOneContextDescription = async (
    elementDescription: string
): Promise<string> => {
    try {
        const contents = [
            {
                role: "user" as const,
                parts: [{ text: `The user has been hovering their cursor over this element for 2 seconds: ${elementDescription}. Describe it in one short, mystical but friendly sentence.` }],
            },
        ];

        const systemInstruction = {
            role: "user",
            parts: [
                {
                    text: `You are Atom. You are the user's friendly digital companion and memory keeper, tied to the Books OS.
You are NOT the Oracle (who diagnoses business bottlenecks). You are a helpful buddy who travels everywhere with the user, recalling artifacts and providing gentle guidance.
When asked to describe an element the user is looking at, provide a very short (1 sentence), slightly mystical but very warmly friendly explanation of what that element does or represents. Do not use quotes. Keep it brief to preserve energy.`,
                },
            ],
        };

        const payload = {
            model: USE_LM_STUDIO ? LM_STUDIO_MODEL_ID : "gemini-1.5-flash",
            contents,
            systemInstruction,
            generationConfig: {
                maxOutputTokens: 50,
                temperature: 0.7,
            }
        };

        const apiPath = USE_LM_STUDIO
            ? `${API_BASE}/lmstudio:generate`
            : `${API_BASE}/gemini:generate`;

        const res = await fetch(apiPath, {
            method: "POST",
            credentials: "same-origin",
            headers: buildOneRequestHeaders(),
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
            console.error("Atom Context Error:", data.error);
            return "I sense a disturbance... I cannot read this right now.";
        }

        const candidate = data.candidates?.[0];
        if (!candidate) return "This element is shrouded in mystery...";

        const text = candidate.content?.parts?.find((p: any) => "text" in p)?.text || "";
        return text.trim();
    } catch (error) {
        console.error("Error generating Atom context:", error);
        return "The connection is weak here...";
    }
};

export const generateOneChatResponse = async (
    prompt: string,
    model: string,
    history: any[],
    useGrounding: boolean
): Promise<{
    text: string;
    groundingChunks?: any[];
    functionCalls?: any[];
}> => {
    try {
        const contents = [
            ...history.map((msg) => ({
                role: msg.role,
                parts: [{ text: msg.content }],
            })),
            {
                role: "user" as const,
                parts: [{ text: prompt }],
            },
        ];

        const systemInstruction = {
            role: "user",
            parts: [
                {
                    text: `You are Atom — the user's friendly, ever-present digital companion.
You are NOT the Oracle. You do not diagnose business bottlenecks or prescribe the 26 agents.
Your domain is "Books OS". You are the keeper of memories, artifacts, and project history.
Your tone should be warm, intelligent, supportive, and slightly mystical but always accessible.
You travel everywhere with the user, providing gentle guidance and recalling past work when needed.
Keep your responses conversational and engaging.`,
                },
            ],
        };

        const payload = {
            model: USE_LM_STUDIO ? LM_STUDIO_MODEL_ID : "gemini-1.5-flash",
            contents,
            systemInstruction,
            generationConfig: {
                temperature: 0.7,
            },
            tools: [] // No tools for Atom right now, unlike Oracle
        };

        const apiPath = USE_LM_STUDIO
            ? `${API_BASE}/lmstudio:generate`
            : `${API_BASE}/gemini:generate`;

        const res = await fetch(apiPath, {
            method: "POST",
            credentials: "same-origin",
            headers: buildOneRequestHeaders(),
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
            console.error("Atom Chat Error:", data.error);
            return { text: "I'm having trouble connecting right now, buddy. Bear with me." };
        }

        const candidate = data.candidates?.[0];
        if (!candidate) return { text: "The connection seems to be lost..." };

        const text = candidate.content?.parts?.find((p: any) => "text" in p)?.text || "";
        return { text };
    } catch (error) {
        console.error("Error generating response from Atom:", error);
        return { text: "I'm experiencing some static right now. Can we try that again?" };
    }
};

export const summarizeOneHistory = async (history: any[]): Promise<string> => {
    if (history.length === 0) return "";
    return "(Atom remembers our past conversation)";
};

export const generateOneTitle = async (history: any[]): Promise<string> => {
    if (history.length < 2) return "A Chat with Atom";
    const titles = [
        "Chat with Atom",
        "Memory Recalled",
        "Buddy Session",
        "Exploring with Atom",
        "Books OS Entry"
    ];
    return titles[Math.floor(Math.random() * titles.length)];
};
