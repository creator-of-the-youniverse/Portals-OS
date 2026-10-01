import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKernel } from '../store/kernel';
import { generateOracleResponse, summarizeOracleHistory, generateOracleTitle } from '../services/oracleService';
import { ChatMessage, AppId } from '../types';
import { APPS } from '../apps.config';

interface VoiceAssistantOverlayProps {
    embedded?: boolean;
}

const VoiceAssistantOverlay: React.FC<VoiceAssistantOverlayProps> = ({ embedded = false }) => {
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const gemini = useKernel(state => state.gemini);
    const addMessageToSession = useKernel(state => state.addMessageToSession);
    const startNewChat = useKernel(state => state.startNewChat);
    const updateSessionTitle = useKernel(state => state.updateSessionTitle);
    const openWindow = useKernel(state => state.openWindow);
    const openFile = useKernel(state => state.openFile);

    const handleSend = async () => {
        if (!input.trim() || isProcessing) return;

        const userInput = input;
        setInput('');
        setIsProcessing(true);

        try {
            let sessionId = gemini.currentSessionId;
            if (!sessionId) {
                sessionId = startNewChat();
            }

            const userMessage: ChatMessage = { role: 'user', content: userInput };
            addMessageToSession(sessionId, userMessage);

            const currentSession = gemini.sessions[sessionId];
            const historyForAPI: ChatMessage[] = gemini.useSmartContext && currentSession.messages.length > 1
                ? [{ role: 'user', content: await summarizeOracleHistory(currentSession.messages) }, userMessage]
                : [...currentSession.messages, userMessage];

            const { text: responseText, groundingChunks, functionCalls } = await generateOracleResponse(
                userInput,
                'gemini-1.5-flash',
                historyForAPI,
                false
            );

            let executedActions: string[] = [];
            if (functionCalls && functionCalls.length > 0) {
                for (const fc of functionCalls) {
                    if (fc.name === 'openWindow') {
                        const { appId } = fc.args;
                        if (appId && APPS.some(app => app.id === appId)) {
                            openWindow(appId);
                            const appName = APPS.find(app => app.id === appId)?.name || appId;
                            executedActions.push(`Opening ${appName}`);
                        }
                    } else if (fc.name === 'openFile') {
                        const { fileId } = fc.args;
                        if (fileId) {
                            openFile(fileId);
                            executedActions.push(`Opening file: ${fileId}`);
                        }
                    } else if (fc.name === 'submitDeliverable') {
                        const { agentId, agentName, content } = fc.args;
                        if (content) {
                            useKernel.getState().addDeliverable({
                                id: Math.random().toString(36).substr(2, 9),
                                agentId: agentId || 'unknown',
                                agentName: agentName || 'Assistant',
                                content,
                                timestamp: new Date().toISOString(),
                                status: 'pending'
                            });
                            executedActions.push(`Delivered report from ${agentName || 'Agent'}`);
                        }
                    } else if (fc.name === 'confirmSquad') {
                        const { squadName, agentIds } = fc.args;
                        const projectId = useKernel.getState().confirmSquad(squadName, agentIds);
                        executedActions.push(`Squad confirmed: ${squadName}. Project initialized in NotNotes.`);
                        openWindow('notnotes' as AppId);
                    } else if (fc.name === 'compileArtifact') {
                        const { projectName } = fc.args;
                        const currentProjectId = useKernel.getState().notNotes.currentProjectId;
                        if (currentProjectId) {
                            useKernel.getState().compileFinalArtifact(currentProjectId);
                            executedActions.push(`Final Take Action Artifact compiled for ${projectName}`);
                        }
                    } else if (fc.name === 'commitToBooksOS') {
                        const { location, summary } = fc.args;
                        const currentProjectId = useKernel.getState().notNotes.currentProjectId;
                        if (currentProjectId) {
                            const success = await useKernel.getState().commitProjectToBooks(currentProjectId, location, summary);
                            if (success) {
                                executedActions.push(`Session archived to Books OS: ${location.tower}/${location.shelf}`);
                            }
                        }
                    } else if (fc.name === 'summonUrl') {
                        const { url, title } = fc.args;
                        if (url) {
                            let safeUrl = url.trim();
                            if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://')) {
                                safeUrl = 'https://' + safeUrl;
                            }
                            openWindow('browser' as AppId, { width: 1100, height: 700 }, { url: safeUrl, title: title || safeUrl });
                            executedActions.push(`Summoned: ${title || safeUrl}`);
                        }
                    } else if (fc.name === 'launchAgent') {
                        const { agentId, initialPayload } = fc.args;
                        if (agentId) {
                            openWindow(agentId as AppId, initialPayload || undefined);
                            executedActions.push(`Launched agent: ${agentId}`);
                        }
                    }
                }
            }

            let finalResponse = responseText || '';
            if (!finalResponse && executedActions.length > 0) {
                finalResponse = `${executedActions.join('. ')}. Systems updated.`;
            }
            if (!finalResponse && (!functionCalls || functionCalls.length === 0)) {
                finalResponse = "The connection is weak here... I cannot reach the nexus.";
            }

            if (finalResponse) {
                const teleportMatch = finalResponse.match(/\[TELEPORT\s*->\s*([A-Z])\]/i);
                if (teleportMatch) {
                    const agentLetter = teleportMatch[1].toLowerCase();
                    if (APPS.some(app => app.id === agentLetter)) {
                        openWindow(agentLetter as AppId);
                    }
                }

                const modelMessage: ChatMessage = { role: 'model', content: finalResponse, groundingChunks };
                addMessageToSession(sessionId, modelMessage);
            }

            if (currentSession.messages.length <= 2) {
                const newTitle = await generateOracleTitle([userMessage, { role: 'model', content: responseText || '' }]);
                updateSessionTitle(sessionId, newTitle);
            }
        } catch (error) {
            console.error("Error in oracle chat:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    // Auto-greet when Oracle opens in embedded mode
    const [greeting, setGreeting] = useState<string | null>(null);
    const [isGreeting, setIsGreeting] = useState(false);
    const greetedRef = React.useRef(false);

    useEffect(() => {
        if (embedded && !greetedRef.current) {
            greetedRef.current = true;
            setIsGreeting(true);

            // Add the greeting to the chat session
            const greet = async () => {
                try {
                    let sessionId = gemini.currentSessionId;
                    if (!sessionId) {
                        sessionId = startNewChat();
                    }

                    const { text } = await generateOracleResponse(
                        "The user just entered the Youniverse for the first time in this session. Greet them warmly as Oracle — the AI guide of Portals OS. Keep it brief (2-3 sentences), mystical but friendly. Mention you're here to help them navigate their agents and tools. Do NOT use markdown formatting.",
                        'gemini-1.5-flash',
                        [],
                        false
                    );

                    const greetingText = text || "Welcome to the Youniverse. I am Oracle — your guide through the Nexus. Ask me anything, or explore the fleet below.";
                    setGreeting(greetingText);

                    const modelMessage: ChatMessage = { role: 'model', content: greetingText };
                    addMessageToSession(sessionId, modelMessage);
                } catch (e) {
                    setGreeting("Welcome to the Youniverse. I am Oracle — your guide through the Nexus. Ask me anything, or explore the fleet below.");
                } finally {
                    setIsGreeting(false);
                }
            };

            greet();
        }
    }, [embedded]);

    // Get current session messages for embedded view
    const currentSession = gemini.currentSessionId ? gemini.sessions[gemini.currentSessionId] : null;
    const messages = currentSession?.messages || [];

    if (embedded) {
        return (
            <div className="w-full h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-purple-500/20 bg-linear-to-r from-purple-900/20 to-blue-900/20">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">Oracle Core Nexus</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && isGreeting && (
                        <div className="flex justify-start">
                            <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                                    <span className="text-purple-300/70 text-xs font-mono">Oracle is manifesting...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className={`rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-blue-600/30 border border-blue-500/20 rounded-br-sm text-white'
                                        : 'bg-purple-900/30 border border-purple-500/20 rounded-bl-sm text-purple-100'
                                }`}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-purple-500/20">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder={isProcessing ? "Oracle is compiling..." : "Talk to Oracle..."}
                            disabled={isProcessing}
                            className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg p-4 pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 text-white placeholder-gray-400 text-sm min-h-[50px] max-h-32"
                            rows={2}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isProcessing}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                            <Send size={16} className={isProcessing ? "animate-pulse" : ""} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="oracle-nexus-container z-10000">
            {/* The Oracle Corner Button */}
            <button
                onClick={() => openWindow("oracle" as AppId)}
                className={`
                    fixed -bottom-10 -right-10 pointer-events-auto flex flex-col items-center justify-center 
                    w-24 h-24 rounded-full bg-black/80 backdrop-blur-xl border border-purple-500/40
                    shadow-[0_0_40px_rgba(168,85,247,0.5)] hover:bg-purple-900/60
                    transition-all duration-300 overflow-hidden group
                `}
            >
                <div className="absolute top-4 left-4 w-6 h-6 rounded-full bg-purple-500/30 group-hover:bg-purple-400/50 blur-sm animate-pulse" />
                <div className="relative -top-2 -left-2 w-4 h-4 bg-purple-400 rounded-full shadow-[0_0_15px_rgba(168,85,247,1)]" />
            </button>
        </div>
    );
};

export default VoiceAssistantOverlay;

