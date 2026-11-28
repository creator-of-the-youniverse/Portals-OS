import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Hammer,
  AlertTriangle,
  FileText,
  Save,
} from "lucide-react";
import { useKernel } from "../store/kernel";
import { useWeaverStore } from "../store/weaverStore";
import { resolveYouniverseRoute } from "../lib/youniverseRouting";
import {
  generateOracleResponse,
  summarizeOracleHistory,
  generateOracleTitle,
} from "../services/oracleService";
import { ChatMessage, AppId } from "../types";
import { APPS } from "../apps.config";
import {
  buildAgentPwaLaunchUrl,
  type AgentPwaDeliverable,
  type OracleDiagnosisResult,
  type OracleDiagnosedAgentStep,
} from "../lib/oracleNexusEngine";

interface VoiceAssistantOverlayProps {
  embedded?: boolean;
}

const VoiceAssistantOverlay: React.FC<VoiceAssistantOverlayProps> = ({ embedded = false }) => {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"diagnose" | "chat">("diagnose");

  // Oracle Diagnostic Pipeline State
  const [diagnosis, setDiagnosis] = useState<OracleDiagnosisResult | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [stepInputs, setStepInputs] = useState<Record<string, string>>({});
  const [deliverableDrafts, setDeliverableDrafts] = useState<Record<string, string>>({});
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [deliverablesByAgent, setDeliverablesByAgent] = useState<
    Record<string, AgentPwaDeliverable>
  >({});

  const gemini = useKernel((state) => state.gemini);
  const onboarding = useKernel((state) => state.onboarding);
  const addMessageToSession = useKernel((state) => state.addMessageToSession);
  const startNewChat = useKernel((state) => state.startNewChat);
  const updateSessionTitle = useKernel((state) => state.updateSessionTitle);
  const openWindow = useKernel((state) => state.openWindow);
  const openFile = useKernel((state) => state.openFile);

  const targetHandle = useMemo(() => {
    if (typeof window === "undefined") return onboarding.handle || "";
    const route = resolveYouniverseRoute(window.location.host, window.location.search);
    if (route?.kind === "identity" && route.username) {
      return route.username;
    }
    return onboarding.handle || "";
  }, [onboarding.handle]);

  const buildAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (typeof window !== "undefined") {
      const token =
        localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt") ||
        sessionStorage.getItem("weaver_jwt");
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (targetHandle) {
      headers["X-Youniverse-Handle"] = targetHandle;
    }
    return headers;
  }, [targetHandle]);

  const handleDiagnoseProblem = useCallback(async () => {
    const problemText = input.trim();
    if (!problemText || isDiagnosing) return;

    setIsDiagnosing(true);
    setDiagnosisError(null);
    setActiveTab("diagnose");

    try {
      const response = await fetch("/api/weaver/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action: "oracle_diagnose",
          problem: problemText,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.diagnosis) {
        throw new Error(data?.message || data?.error || `Diagnosis failed (${response.status})`);
      }

      const nextDiag: OracleDiagnosisResult = data.diagnosis;
      setDiagnosis(nextDiag);
      setDeliverablesByAgent({});
      const initialInputs: Record<string, string> = {};
      for (const step of nextDiag.agentChain) {
        initialInputs[step.agentId] = `${problemText}\n\nRequired input: ${step.inputNeeded}`;
      }
      setStepInputs(initialInputs);
      setInput("");
    } catch (err: any) {
      setDiagnosisError(err?.message ?? "Oracle diagnosis failed.");
    } finally {
      setIsDiagnosing(false);
    }
  }, [buildAuthHeaders, input, isDiagnosing]);

  const handleLaunchAgentPwa = useCallback(
    (step: OracleDiagnosedAgentStep) => {
      const taskText = (stepInputs[step.agentId] ?? step.inputNeeded).slice(0, 600);
      const launchUrl = buildAgentPwaLaunchUrl(step.url, {
        agentId: step.agentId,
        inputNeeded: taskText,
        returnTarget: "not-notes",
      });

      useKernel.getState().openWindow(
        step.agentId as AppId,
        { width: 1120, height: 740 },
        {
          id: step.agentId,
          url: launchUrl,
          agentName: step.name,
          agentRole: step.role,
          inputNeeded: taskText,
          returnTarget: "not-notes",
          initialTab: "ACTIVE TERMINAL",
        }
      );
    },
    [stepInputs]
  );

  const persistDeliverableToNotNotes = useCallback(
    async (step: OracleDiagnosedAgentStep, rawContent: string) => {
      const cleanContent = rawContent.trim();
      if (!cleanContent || savingAgentId) return;

      setSavingAgentId(step.agentId);
      setDiagnosisError(null);

      try {
        const response = await fetch("/api/not-notes/artifact", {
          method: "POST",
          credentials: "same-origin",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            action: "save_deliverable",
            agentId: step.agentId,
            agentName: step.name,
            agentRole: step.role,
            agentUrl: step.url,
            content: cleanContent,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success || !data?.deliverable) {
          throw new Error(
            data?.message || data?.error || `Failed to save deliverable (${response.status})`
          );
        }

        const deliverable: AgentPwaDeliverable = data.deliverable;
        setDeliverablesByAgent((prev) => ({
          ...prev,
          [step.agentId]: deliverable,
        }));
        setDeliverableDrafts((prev) => ({
          ...prev,
          [step.agentId]: "",
        }));

        useKernel.getState().addDeliverable({
          id: deliverable.notNoteId,
          agentId: deliverable.agentId,
          agentName: `${deliverable.agentName} (${deliverable.agentRole})`,
          content: deliverable.content,
          timestamp: deliverable.createdAt,
          status: "approved",
        });
      } catch (err: any) {
        setDiagnosisError(err?.message ?? `Failed to save deliverable for ${step.name}.`);
      } finally {
        setSavingAgentId(null);
      }
    },
    [buildAuthHeaders, savingAgentId]
  );

  // Listen for postMessage deliverables returned from live https://<role>.itsyouonline.com Agent PWAs
  useEffect(() => {
    if (!embedded || !diagnosis || typeof window === "undefined") return;

    const handleAgentMessage = (event: MessageEvent) => {
      if (typeof event.origin !== "string") return;
      if (!/^https:\/\/[a-z0-9-]+\.itsyouonline\.com$/i.test(event.origin)) return;

      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== "AGENT_DELIVERABLE") return;

      const msgAgentId = typeof data.agentId === "string" ? data.agentId.trim().toUpperCase() : "";
      const msgContent =
        typeof data.content === "string"
          ? data.content
          : typeof data.bodyMarkdown === "string"
            ? data.bodyMarkdown
            : "";
      if (!msgAgentId || !msgContent.trim()) return;

      const matchingStep = diagnosis.agentChain.find(
        (s) => s.agentId.toUpperCase() === msgAgentId
      );
      if (matchingStep) {
        persistDeliverableToNotNotes(matchingStep, msgContent);
      }
    };

    window.addEventListener("message", handleAgentMessage);
    return () => window.removeEventListener("message", handleAgentMessage);
  }, [diagnosis, embedded, persistDeliverableToNotNotes]);

  const handleBuildInWeaver = useCallback(() => {
    if (!diagnosis) return;
    const completedDeliverables = Object.values(deliverablesByAgent).map((d) => ({
      agentId: d.agentId,
      agentName: d.agentName,
      agentRole: d.agentRole,
      content: d.content,
      notNoteId: d.notNoteId,
    }));

    useWeaverStore.getState().loadDiagnosticSpec({
      projectTitle: diagnosis.weaverHandoffSpec.projectTitle,
      prompt: diagnosis.weaverHandoffSpec.prompt,
      recommendedChips: diagnosis.weaverHandoffSpec.recommendedChips,
      agentDeliverableSummary: diagnosis.weaverHandoffSpec.agentDeliverableSummary,
      sourceAgentIds: diagnosis.weaverHandoffSpec.sourceAgentIds,
      deliverables: completedDeliverables,
      diagnosisHeadline: diagnosis.bleedingNeckDiagnosis.headline,
    });

    openWindow("weaver" as AppId);
  }, [deliverablesByAgent, diagnosis, openWindow]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userInput = input;
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = gemini.currentSessionId;
      if (!sessionId) {
        sessionId = startNewChat();
      }

      const userMessage: ChatMessage = { role: "user", content: userInput };
      addMessageToSession(sessionId, userMessage);

      const currentSession = gemini.sessions[sessionId];
      const historyForAPI: ChatMessage[] =
        gemini.useSmartContext && currentSession.messages.length > 1
          ? [{ role: "user", content: await summarizeOracleHistory(currentSession.messages) }, userMessage]
          : [...currentSession.messages, userMessage];

      const { text: responseText, groundingChunks, functionCalls } = await generateOracleResponse(
        userInput,
        "gemini-1.5-flash",
        historyForAPI,
        false
      );

      const executedActions: string[] = [];
      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          if (fc.name === "openWindow") {
            const { appId } = fc.args;
            if (appId && APPS.some((app) => app.id === appId)) {
              openWindow(appId);
              const appName = APPS.find((app) => app.id === appId)?.name || appId;
              executedActions.push(`Opening ${appName}`);
            }
          } else if (fc.name === "openFile") {
            const { fileId } = fc.args;
            if (fileId) {
              openFile(fileId);
              executedActions.push(`Opening file: ${fileId}`);
            }
          } else if (fc.name === "submitDeliverable") {
            const { agentId, agentName, content } = fc.args;
            if (content) {
              useKernel.getState().addDeliverable({
                id: Math.random().toString(36).substr(2, 9),
                agentId: agentId || "unknown",
                agentName: agentName || "Assistant",
                content,
                timestamp: new Date().toISOString(),
                status: "pending",
              });
              executedActions.push(`Delivered report from ${agentName || "Agent"}`);
            }
          } else if (fc.name === "confirmSquad") {
            const { squadName, agentIds } = fc.args;
            useKernel.getState().confirmSquad(squadName, agentIds);
            executedActions.push(`Squad confirmed: ${squadName}. Project initialized in NotNotes.`);
            openWindow("notnotes" as AppId);
          } else if (fc.name === "compileArtifact") {
            const { projectName } = fc.args;
            const currentProjectId = useKernel.getState().notNotes.currentProjectId;
            if (currentProjectId) {
              useKernel.getState().compileFinalArtifact(currentProjectId);
              executedActions.push(`Final Take Action Artifact compiled for ${projectName}`);
            }
          } else if (fc.name === "commitToBooksOS") {
            const { location, summary } = fc.args;
            const currentProjectId = useKernel.getState().notNotes.currentProjectId;
            if (currentProjectId) {
              const success = await useKernel
                .getState()
                .commitProjectToBooks(currentProjectId, location, summary);
              if (success) {
                executedActions.push(`Session archived to Books OS: ${location.tower}/${location.shelf}`);
              }
            }
          } else if (fc.name === "summonUrl") {
            const { url, title } = fc.args;
            if (url) {
              let safeUrl = url.trim();
              if (!safeUrl.startsWith("http://") && !safeUrl.startsWith("https://")) {
                safeUrl = "https://" + safeUrl;
              }
              openWindow(
                "browser" as AppId,
                { width: 1100, height: 700 },
                { url: safeUrl, title: title || safeUrl }
              );
              executedActions.push(`Summoned: ${title || safeUrl}`);
            }
          } else if (fc.name === "launchAgent") {
            const { agentId, initialPayload } = fc.args;
            if (agentId) {
              openWindow(agentId as AppId, initialPayload || undefined);
              executedActions.push(`Launched agent: ${agentId}`);
            }
          }
        }
      }

      let finalResponse = responseText || "";
      if (!finalResponse && executedActions.length > 0) {
        finalResponse = `${executedActions.join(". ")}. Systems updated.`;
      }
      if (!finalResponse && (!functionCalls || functionCalls.length === 0)) {
        finalResponse = "The connection is weak here... I cannot reach the nexus.";
      }

      if (finalResponse) {
        const teleportMatch = finalResponse.match(/\[TELEPORT\s*->\s*([A-Z])\]/i);
        if (teleportMatch) {
          const agentLetter = teleportMatch[1].toLowerCase();
          if (APPS.some((app) => app.id === agentLetter)) {
            openWindow(agentLetter as AppId);
          }
        }

        const modelMessage: ChatMessage = { role: "model", content: finalResponse, groundingChunks };
        addMessageToSession(sessionId, modelMessage);
      }

      if (currentSession.messages.length <= 2) {
        const newTitle = await generateOracleTitle([
          userMessage,
          { role: "model", content: responseText || "" },
        ]);
        updateSessionTitle(sessionId, newTitle);
      }
    } catch (error) {
      console.error("Error in oracle chat:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-greet when Oracle opens in embedded mode
  const [isGreeting, setIsGreeting] = useState(false);
  const greetedRef = React.useRef(false);

  useEffect(() => {
    if (embedded && !greetedRef.current) {
      greetedRef.current = true;
      setIsGreeting(true);

      const greet = async () => {
        try {
          let sessionId = gemini.currentSessionId;
          if (!sessionId) {
            sessionId = startNewChat();
          }

          const { text } = await generateOracleResponse(
            "The user just entered the Youniverse for the first time in this session. Greet them warmly as Oracle — the AI guide of Portals OS. Keep it brief (2-3 sentences), mystical but friendly. Mention you're here to help them navigate their agents and tools. Do NOT use markdown formatting.",
            "gemini-1.5-flash",
            [],
            false
          );

          const greetingText =
            text ||
            "Welcome to the Youniverse. I am Oracle — your guide through the Nexus. Describe your bleeding-neck problem to sequence your agent fleet.";

          const modelMessage: ChatMessage = { role: "model", content: greetingText };
          addMessageToSession(sessionId, modelMessage);
        } catch {
          // Non-fatal
        } finally {
          setIsGreeting(false);
        }
      };

      greet();
    }
  }, [embedded]);

  const currentSession = gemini.currentSessionId ? gemini.sessions[gemini.currentSessionId] : null;
  const messages = currentSession?.messages || [];

  if (embedded) {
    const completedCount = Object.keys(deliverablesByAgent).length;

    return (
      <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100">
        {/* Header with Mode Tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-gradient-to-r from-purple-950/40 to-blue-950/30">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-white font-semibold text-sm">Oracle Core Nexus</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900/90 border border-zinc-800 p-0.5 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setActiveTab("diagnose")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === "diagnose"
                  ? "bg-purple-600/30 text-purple-200 border border-purple-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Diagnostic Pipeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === "chat"
                  ? "bg-purple-600/30 text-purple-200 border border-purple-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Oracle Chat
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {activeTab === "diagnose" ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {diagnosisError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-mono text-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{diagnosisError}</span>
              </div>
            )}

            {!diagnosis && !isDiagnosing && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-950/15 p-5 space-y-2">
                <h3 className="text-sm font-semibold text-purple-200">
                  Bleeding-Neck Diagnostic Engine
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Describe your highest-friction bottleneck below. Oracle will match it against the
                  166 isolated single-duty agent PWAs in <code className="text-purple-300">platoon.ts</code>,
                  sequence the exact chain needed, capture their stateless deliverables into NotNotes,
                  and prepare a one-click build handoff for Weaver.
                </p>
              </div>
            )}

            {isDiagnosing && (
              <div className="flex items-center gap-2.5 rounded-xl border border-purple-500/30 bg-purple-950/20 px-4 py-4 text-xs font-mono text-purple-200">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                Scanning platoon.ts catalog and sequencing isolated agent PWAs…
              </div>
            )}

            {diagnosis && (
              <div className="space-y-4">
                {/* 1. Bleeding-Neck Diagnosis Card */}
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300">
                      Bleeding-Neck Diagnosis
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {diagnosis.agentChain.length} Sequenced Agent
                      {diagnosis.agentChain.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {diagnosis.bleedingNeckDiagnosis.headline}
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {diagnosis.bleedingNeckDiagnosis.rootBottleneck}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-2.5">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-0.5">
                        Why Now
                      </span>
                      <span className="text-zinc-300">{diagnosis.bleedingNeckDiagnosis.whyNow}</span>
                    </div>
                    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-2.5">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-0.5">
                        Immediate Objective
                      </span>
                      <span className="text-zinc-300">
                        {diagnosis.bleedingNeckDiagnosis.immediateObjective}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Sequenced Agent PWA Chain */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    Sequenced Sovereign Agent PWAs (Open in Portals OS → NotNotes)
                  </div>
                  {diagnosis.agentChain.map((step) => {
                    const deliverable = deliverablesByAgent[step.agentId];
                    const isSaving = savingAgentId === step.agentId;
                    const draftText = deliverableDrafts[step.agentId] ?? "";
                    const isImageIcon = step.icon.startsWith("/");

                    return (
                      <div
                        key={step.agentId}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => handleLaunchAgentPwa(step)}
                            className="flex items-center gap-2.5 min-w-0 text-left group"
                            title={`Open ${step.name} (${step.url}) inside a Portals OS window`}
                          >
                            <div
                              className={`w-9 h-9 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-base shrink-0 border border-white/10 group-hover:scale-105 transition-transform`}
                            >
                              {isImageIcon ? (
                                <span className="text-xs font-mono font-bold text-white">
                                  {step.agentId}
                                </span>
                              ) : (
                                <span>{step.icon}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                  Step {step.step}
                                </span>
                                <span className="text-sm font-semibold text-white group-hover:text-purple-200 transition-colors">
                                  {step.name}
                                </span>
                                <span className="text-xs font-mono text-purple-300">
                                  · {step.role}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400">
                                  {step.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5">{step.whySelected}</p>
                            </div>
                          </button>

                          {deliverable && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-950/50 text-emerald-300 shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              Saved to NotNotes
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="rounded bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1.5">
                            <span className="text-zinc-500 block text-[10px]">Input Needed</span>
                            <span className="text-zinc-300">{step.inputNeeded}</span>
                          </div>
                          <div className="rounded bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1.5">
                            <span className="text-zinc-500 block text-[10px]">Output Delivered</span>
                            <span className="text-zinc-300">
                              {step.outputDelivered.join(" · ")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-zinc-500 truncate">
                            {step.url}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleLaunchAgentPwa(step)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/60 hover:bg-purple-900/60 text-[11px] font-mono text-purple-200 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open Agent PWA Window
                          </button>
                        </div>

                        {/* Lightweight Deliverable Intake -> NotNotes */}
                        <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 p-2.5 space-y-2">
                          <div className="text-[10px] font-mono text-zinc-400">
                            Save Deliverable to NotNotes (auto-captured via postMessage or paste output from {step.name})
                          </div>
                          <textarea
                            value={draftText}
                            onChange={(e) =>
                              setDeliverableDrafts((prev) => ({
                                ...prev,
                                [step.agentId]: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder={`Paste ${step.outputDelivered[0] || "deliverable"} produced by ${step.name}…`}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={!draftText.trim() || Boolean(savingAgentId)}
                              onClick={() => persistDeliverableToNotNotes(step, draftText)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-950/50 hover:bg-emerald-900/50 text-[11px] font-mono text-emerald-200 disabled:opacity-40 transition-colors"
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              {isSaving ? "Saving…" : "Save Deliverable to NotNotes"}
                            </button>
                          </div>
                        </div>

                        {deliverable && (
                          <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 p-2.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono text-emerald-300">
                              <span className="inline-flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                NotNotes Artifact ({deliverable.notNoteId.slice(0, 10)})
                              </span>
                            </div>
                            <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                              {deliverable.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 3. Weaver Build Handoff Card */}
                {diagnosis.weaverHandoffSpec && (
                  <div className="rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/40 to-indigo-950/30 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300">
                        Weaver Build Handoff Spec
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {completedCount} NotNotes deliverable{completedCount === 1 ? "" : "s"} ready
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {diagnosis.weaverHandoffSpec.projectTitle}
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {diagnosis.weaverHandoffSpec.agentDeliverableSummary}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {Object.entries(diagnosis.weaverHandoffSpec.recommendedChips)
                          .filter(([, enabled]) => enabled)
                          .map(([chip]) => (
                            <span
                              key={chip}
                              className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-950/60 text-violet-200"
                            >
                              {chip}
                            </span>
                          ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleBuildInWeaver}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-violet-400/60 bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white shadow-lg transition-colors"
                      >
                        <Hammer className="w-3.5 h-3.5" />
                        Build in Weaver
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && isGreeting && (
              <div className="flex justify-start">
                <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                    <span className="text-purple-300/70 text-xs font-mono">
                      Oracle is manifesting...
                    </span>
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600/30 border border-blue-500/20 rounded-br-sm text-white"
                      : "bg-purple-900/30 border border-purple-500/20 rounded-bl-sm text-purple-100"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3.5 border-t border-purple-500/20 bg-zinc-950/90">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeTab === "diagnose") {
                    handleDiagnoseProblem();
                  } else {
                    handleSend();
                  }
                }
              }}
              placeholder={
                activeTab === "diagnose"
                  ? isDiagnosing
                    ? "Oracle is diagnosing your bottleneck…"
                    : "Describe your bleeding-neck problem (e.g. 'Churn is spiking and our pricing page isn't converting leads')…"
                  : isProcessing
                    ? "Oracle is compiling..."
                    : "Talk to Oracle..."
              }
              disabled={isProcessing || isDiagnosing}
              className="flex-1 bg-zinc-900/80 border border-purple-500/30 rounded-lg px-3.5 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-white placeholder-zinc-500 text-xs min-h-[44px] max-h-28"
              rows={2}
            />
            {activeTab === "diagnose" ? (
              <button
                type="button"
                onClick={handleDiagnoseProblem}
                disabled={!input.trim() || isDiagnosing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors shrink-0"
              >
                {isDiagnosing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Diagnose
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="p-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors shrink-0"
              >
                <Send size={16} className={isProcessing ? "animate-pulse" : ""} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oracle-nexus-container z-10000">
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
