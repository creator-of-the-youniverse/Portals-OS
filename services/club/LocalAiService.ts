/**
 * @file LocalAiService.ts - Bridge to your self-hosted LM Studio (Gemma-3-1b)
 */

import { Song } from "./types";

const LM_STUDIO_URL = import.meta.env?.VITE_LM_STUDIO_URL || "http://localhost:1234/v1/chat/completions";

export class LocalAiService {
    /**
     * Generate a quick DJ banter line based on the transition.
     */
    static async generateDJSpeech(winner: Song, losers: Song[]): Promise<string> {
        // Prevent external clients (phones, internet users) from getting PNA (Private Network Access) browser prompts
        const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (!isLocalHost) {
            console.log("🤖 Skipping Local AI (Running on remote client)");
            return `The crowd has spoken! Up next: ${winner.title} by ${winner.artistName}.`;
        }

        const prompt = `You are a high-energy, slightly edgy AI DJ for "Club Youniverse". 
        The song "${winner.title}" by ${winner.artistName} just won the vote.
        It beat out ${losers.map(l => `"${l.title}"`).join(", ")}.
        Write a ONE SENTENCE announcement for the listeners. 
        Be cool, mysterious, and hype up the winner.`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const response = await fetch(LM_STUDIO_URL, {
                method: "POST",
                mode: "cors", // Explicitly enable CORS mode
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer no-key" // Some servers expect this header even if not used
                },
                body: JSON.stringify({
                    model: import.meta.env?.VITE_LM_MODEL || "nemotron",
                    messages: [
                        { role: "system", content: "You are a professional radio DJ." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 60
                })
            });

            if (!response.ok) {
                throw new Error(`LM Studio returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            clearTimeout(timeoutId);
            return data.choices?.[0]?.message?.content || `The crowd has spoken! Up next: ${winner.title}.`;
        } catch (e) {
            // SILENT FAIL: Don't spam the console with red errors if LM Studio is just off or unreachable
            console.groupCollapsed("🤖 AI Banter Fallback Enabled");
            console.debug("Reason:", e);
            console.groupEnd();
            return `The crowd has spoken! Up next: ${winner.title} by ${winner.artistName}.`;
        }
    }

    /**
     * Ticker Banter: Extremely short, high-impact messages for the marquee.
     */
    static async generateDjBanter(context: string): Promise<string> {
        try {
            // Updated prompt for extreme density
            const prompt = `You are THE ARCHITECT, a sleek AI DJ for Club Youniverse.
            Generate ONE EXTREMELY SHORT sentence (max 10 words) responding to this context: ${context}.
            Tone: Sleek, cyberpunk, slightly arrogant. NO EMOJIS.
            Example: "Fate has claimed the airwaves. Synchronization complete."`;

            const response = await this.queryAi(prompt);
            return response.trim().toUpperCase(); // Capitalized for ticker aesthetic
        } catch (error) {
            return "FREQUENCY STABLE. PROCEED.";
        }
    }

    /**
     * Generate a short roast for the chat.
     */
    static async generateRoast(song: Song): Promise<string> {
        const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (!isLocalHost) {
            return "This track is hitting different right now.";
        }

        try {
            const response = await fetch(LM_STUDIO_URL, {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer no-key"
                },
                body: JSON.stringify({
                    model: import.meta.env?.VITE_LM_MODEL || "nemotron",
                    messages: [
                        { role: "system", content: "You are a witty, sarcastic AI bot in a club chat." },
                        { role: "user", content: `Write a very short, funny one-line roast for the song "${song.title}" by ${song.artistName}.` }
                    ],
                    temperature: 0.9,
                    max_tokens: 40
                })
            });

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "This track is... certainly something.";
        } catch (e) {
            console.groupCollapsed("🤖 AI Roast Fallback Enabled");
            console.debug("Reason:", e);
            console.groupEnd();
            return "This track is hitting different right now.";
        }
    }
    /**
     * Internal helper for AI queries.
     */
    private static async queryAi(prompt: string, modelType: string = "system"): Promise<string> {
        const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (!isLocalHost) return "";

        try {
            const response = await fetch(LM_STUDIO_URL, {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer no-key"
                },
                body: JSON.stringify({
                    model: import.meta.env?.VITE_LM_MODEL || "nemotron",
                    messages: [
                        { role: "system", content: `You are a ${modelType} for Club Youniverse.` },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.8,
                    max_tokens: 50
                })
            });

            if (!response.ok) return "";
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "";
        } catch (e) {
            return "SYNCING WITH ARCHIVE... STAND BY.";
        }
    }
}
