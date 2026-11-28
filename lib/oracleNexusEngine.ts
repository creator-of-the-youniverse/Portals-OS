/**
 * lib/oracleNexusEngine.ts
 *
 * Oracle Diagnostic Engine (`constants/platoon.ts`-driven).
 *
 * Architectural boundaries:
 *   - Only Oracle reads `constants/platoon.ts` (`NEXUS_AGENTS`) to diagnose the
 *     user's bleeding-neck problem, sequence real isolated single-duty agent
 *     PWAs (`https://<role>.itsyouonline.com`), and optionally generate a
 *     structured Weaver build handoff (`weaverHandoffSpec`).
 *   - Agent PWAs are sovereign live apps launched inside Portals OS windows —
 *     the backend NEVER impersonates or simulates them.
 */

import { NEXUS_AGENTS, type NexusAgent } from "../constants/platoon.ts";
import { sanitizeAiChips, type WeaverAiChips } from "./weaverProject.ts";
import type { WeaverAIProvider } from "./weaverProvider.ts";

export interface OracleDiagnosisSummary {
  headline: string;
  rootBottleneck: string;
  whyNow: string;
  immediateObjective: string;
}

export interface OracleDiagnosedAgentStep {
  step: number;
  agentId: string;
  name: string;
  role: string;
  category: string;
  squadId: string;
  url: string;
  status: string;
  icon: string;
  color: string;
  whySelected: string;
  inputNeeded: string;
  outputDelivered: string[];
  doNotUseWhen: string[];
}

export interface OracleWeaverHandoffSpec {
  required: boolean;
  projectTitle: string;
  prompt: string;
  recommendedChips: WeaverAiChips;
  agentDeliverableSummary: string;
  sourceAgentIds: string[];
}

export interface OracleDiagnosisResult {
  bleedingNeckDiagnosis: OracleDiagnosisSummary;
  agentChain: OracleDiagnosedAgentStep[];
  weaverHandoffSpec: OracleWeaverHandoffSpec;
}

export interface AgentPwaDeliverable {
  notNoteId: string;
  youniverseId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentUrl: string;
  title: string;
  content: string;
  createdAt: string;
}

/**
 * Builds the contextual launch URL for a real sovereign Agent PWA hosted at
 * `https://<role>.itsyouonline.com` so it opens inside a Portals OS window
 * with `inputNeeded` and `returnTarget=not-notes` query parameters.
 */
export function buildAgentPwaLaunchUrl(
  agentUrl: string,
  params: {
    agentId: string;
    inputNeeded?: string;
    returnTarget?: string;
  }
): string {
  const base = String(agentUrl ?? "").trim();
  const separator = base.includes("?") ? "&" : "?";
  const query = new URLSearchParams();
  query.set("agentId", params.agentId);
  if (params.inputNeeded && params.inputNeeded.trim()) {
    query.set("inputNeeded", params.inputNeeded.trim().slice(0, 600));
  }
  query.set("returnTarget", params.returnTarget || "not-notes");
  query.set("source", "oracle");
  return `${base}${separator}${query.toString()}`;
}

const NEXUS_AGENTS_BY_ID = new Map<string, NexusAgent>(
  NEXUS_AGENTS.map((agent) => [agent.id.toUpperCase(), agent])
);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "have", "are",
  "was", "were", "will", "not", "but", "into", "about", "our", "out", "you",
  "they", "them", "their", "what", "when", "where", "how", "why", "need",
  "want", "help", "can", "all", "has", "had", "its", "just", "more", "very",
]);

function tokenize(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function normalizePhrase(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether an agent's `doNotUseWhen` conditions are explicitly triggered
 * by the user's stated problem or constraints.
 */
export function matchesDoNotUseCondition(
  agent: NexusAgent,
  problemText: string,
  constraints: string[] = []
): boolean {
  const combinedNorm = normalizePhrase([problemText, ...constraints].join(" "));
  if (!combinedNorm) return false;

  for (const rule of agent.toolCard.doNotUseWhen ?? []) {
    const ruleNorm = normalizePhrase(rule);
    if (!ruleNorm) continue;

    // Direct substring match (e.g. "no active customers", "no legal documents exist yet")
    if (combinedNorm.includes(ruleNorm)) {
      return true;
    }

    // High-overlap match on meaningful tokens (requires >= 2 matching tokens and >= 75% rule coverage)
    const ruleTokens = ruleNorm.split(" ").filter((w) => w.length >= 2);
    if (ruleTokens.length >= 2) {
      const matched = ruleTokens.filter((tok) => combinedNorm.includes(tok));
      if (matched.length >= 2 && matched.length / ruleTokens.length >= 0.75) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Ranks `NEXUS_AGENTS` from `constants/platoon.ts` against the user's
 * bleeding-neck problem while excluding agents whose `doNotUseWhen` guardrails
 * are triggered.
 */
export function rankPlatoonCandidates(
  problem: string,
  options: { constraints?: string[]; limit?: number } = {}
): NexusAgent[] {
  const constraints = Array.isArray(options.constraints) ? options.constraints : [];
  const limit = Math.min(Math.max(options.limit ?? 24, 4), 40);
  const problemTokens = new Set(tokenize(problem));

  const scored: Array<{ agent: NexusAgent; score: number }> = [];

  for (const agent of NEXUS_AGENTS) {
    if (matchesDoNotUseCondition(agent, problem, constraints)) {
      continue;
    }

    let score = 0;
    const roleTokens = tokenize(`${agent.role} ${agent.category} ${agent.name}`);
    const useWhenTokens = tokenize((agent.toolCard.useThisWhen ?? []).join(" "));
    const purposeTokens = tokenize(`${agent.toolCard.purpose} ${(agent.toolCard.useCases ?? []).join(" ")}`);
    const outputTokens = tokenize((agent.toolCard.outputDelivered ?? []).join(" "));

    for (const tok of problemTokens) {
      if (roleTokens.includes(tok)) score += 6;
      if (useWhenTokens.includes(tok)) score += 5;
      if (purposeTokens.includes(tok)) score += 3;
      if (outputTokens.includes(tok)) score += 2;
    }

    // Slight boost for live/active agents over Idea stubs when tied
    if (String(agent.status).toLowerCase() === "live") {
      score += 0.5;
    }

    scored.push({ agent, score });
  }

  scored.sort((a, b) => b.score - a.score || a.agent.id.localeCompare(b.agent.id));
  return scored.slice(0, limit).map((s) => s.agent);
}

export function getPlatoonAgentById(agentId: string): NexusAgent | null {
  const clean = typeof agentId === "string" ? agentId.trim().toUpperCase() : "";
  if (!clean) return null;
  return NEXUS_AGENTS_BY_ID.get(clean) ?? null;
}

function stripMarkdownJsonFence(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function buildOracleDiagnosticSystemPrompt(candidates: NexusAgent[]): string {
  const catalogJson = JSON.stringify(
    candidates.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      category: a.category,
      squadId: a.squadId,
      url: a.url,
      status: a.status,
      purpose: a.toolCard.purpose,
      useThisWhen: a.toolCard.useThisWhen,
      inputNeeded: a.toolCard.inputNeeded,
      outputDelivered: a.toolCard.outputDelivered,
      doNotUseWhen: a.toolCard.doNotUseWhen,
    }))
  );

  return [
    "You are THE ORACLE — the sole diagnostic orchestrator of Portals OS.",
    "Only you can read the authoritative platoon.ts agent catalog below. Each listed agent is an isolated, single-duty PWA that produces its deliverable into NotNotes and immediately forgets everything.",
    "Your job:",
    "1. Diagnose the user's 'bleeding-neck' root bottleneck with ruthless clarity.",
    "2. Sequence 1 to 5 agents strictly from the provided platoon.ts catalog, matching their `useThisWhen` criteria and STRICTLY respecting `doNotUseWhen`.",
    "3. Output a structured `weaverHandoffSpec` whenever solving the bottleneck benefits from building a web tool, landing page, dashboard, or Collection Point in Weaver.",
    "",
    "Return STRICT JSON only (no markdown fences) matching this exact shape:",
    "{",
    '  "bleedingNeckDiagnosis": { "headline": string, "rootBottleneck": string, "whyNow": string, "immediateObjective": string },',
    '  "agentChain": [ { "agentId": string, "whySelected": string, "inputNeeded": string } ],',
    '  "weaverHandoffSpec": {',
    '    "required": boolean,',
    '    "projectTitle": string,',
    '    "prompt": string,',
    '    "recommendedChips": { "imageGen": boolean, "structuredJson": boolean, "liveGrounding": boolean, "collectionPoint": boolean },',
    '    "agentDeliverableSummary": string,',
    '    "sourceAgentIds": string[]',
    "  }",
    "}",
    "",
    "AUTHORITATIVE PLATOON.TS CANDIDATE CATALOG:",
    catalogJson,
  ].join("\n");
}

/**
 * Runs Oracle's bleeding-neck diagnosis against `constants/platoon.ts`,
 * validates every selected agent against the authoritative catalog &
 * `doNotUseWhen` rules, and builds a ready-to-dispatch `weaverHandoffSpec`.
 */
export async function runOracleDiagnosis(params: {
  problem: string;
  constraints?: string[];
  provider: WeaverAIProvider;
}): Promise<{
  diagnosis: OracleDiagnosisResult;
  model: string;
  candidateCount: number;
}> {
  const cleanProblem = params.problem.trim();
  const constraints = Array.isArray(params.constraints)
    ? params.constraints.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];

  const candidates = rankPlatoonCandidates(cleanProblem, { constraints, limit: 24 });
  const systemInstruction = buildOracleDiagnosticSystemPrompt(candidates);

  const userPromptLines = [`Bleeding-neck problem:\n${cleanProblem}`];
  if (constraints.length > 0) {
    userPromptLines.push(`\nExplicit constraints / do-not-use boundaries:\n- ${constraints.join("\n- ")}`);
  }

  const aiRes = await params.provider.generateStructuredOrText({
    systemInstruction,
    userPrompt: userPromptLines.join("\n"),
    responseMimeType: "application/json",
    temperature: 0.25,
    maxOutputTokens: 2_048,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(aiRes.text));
  } catch {
    throw new Error("Oracle diagnostic engine returned malformed JSON.");
  }

  const rawDiag = parsed?.bleedingNeckDiagnosis ?? {};
  const bleedingNeckDiagnosis: OracleDiagnosisSummary = {
    headline:
      typeof rawDiag.headline === "string" && rawDiag.headline.trim()
        ? rawDiag.headline.trim().slice(0, 180)
        : "Primary Operational Bottleneck",
    rootBottleneck:
      typeof rawDiag.rootBottleneck === "string" && rawDiag.rootBottleneck.trim()
        ? rawDiag.rootBottleneck.trim().slice(0, 1_200)
        : cleanProblem.slice(0, 600),
    whyNow:
      typeof rawDiag.whyNow === "string" && rawDiag.whyNow.trim()
        ? rawDiag.whyNow.trim().slice(0, 600)
        : "Resolving this bottleneck unblocks downstream revenue and execution velocity.",
    immediateObjective:
      typeof rawDiag.immediateObjective === "string" && rawDiag.immediateObjective.trim()
        ? rawDiag.immediateObjective.trim().slice(0, 600)
        : "Execute the sequenced agent chain and commit deliverables to NotNotes.",
  };

  // Validate agent chain strictly against platoon.ts & doNotUseWhen guardrails
  const rawChain = Array.isArray(parsed?.agentChain) ? parsed.agentChain : [];
  const seenIds = new Set<string>();
  const validatedChain: OracleDiagnosedAgentStep[] = [];

  for (const item of rawChain) {
    if (validatedChain.length >= 5) break;
    const rawId = typeof item?.agentId === "string" ? item.agentId.trim().toUpperCase() : "";
    if (!rawId || seenIds.has(rawId)) continue;

    const agent = getPlatoonAgentById(rawId);
    if (!agent) continue; // Reject hallucinated IDs
    if (matchesDoNotUseCondition(agent, cleanProblem, constraints)) continue; // Enforce doNotUseWhen

    seenIds.add(rawId);
    validatedChain.push({
      step: validatedChain.length + 1,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      category: agent.category,
      squadId: agent.squadId,
      url: agent.url,
      status: agent.status,
      icon: agent.icon,
      color: agent.color,
      whySelected:
        typeof item?.whySelected === "string" && item.whySelected.trim()
          ? item.whySelected.trim().slice(0, 400)
          : agent.toolCard.purpose,
      inputNeeded:
        typeof item?.inputNeeded === "string" && item.inputNeeded.trim()
          ? item.inputNeeded.trim().slice(0, 400)
          : agent.toolCard.inputNeeded,
      outputDelivered: [...agent.toolCard.outputDelivered],
      doNotUseWhen: [...agent.toolCard.doNotUseWhen],
    });
  }

  // Deterministic fallback if model returned no valid platoon IDs
  if (validatedChain.length === 0) {
    for (const fallbackAgent of candidates.slice(0, 2)) {
      validatedChain.push({
        step: validatedChain.length + 1,
        agentId: fallbackAgent.id,
        name: fallbackAgent.name,
        role: fallbackAgent.role,
        category: fallbackAgent.category,
        squadId: fallbackAgent.squadId,
        url: fallbackAgent.url,
        status: fallbackAgent.status,
        icon: fallbackAgent.icon,
        color: fallbackAgent.color,
        whySelected: fallbackAgent.toolCard.purpose,
        inputNeeded: fallbackAgent.toolCard.inputNeeded,
        outputDelivered: [...fallbackAgent.toolCard.outputDelivered],
        doNotUseWhen: [...fallbackAgent.toolCard.doNotUseWhen],
      });
    }
  }

  const rawSpec = parsed?.weaverHandoffSpec ?? {};
  const chainIds = validatedChain.map((s) => s.agentId);
  const rawSourceIds = Array.isArray(rawSpec.sourceAgentIds)
    ? rawSpec.sourceAgentIds
        .map((id: unknown) => (typeof id === "string" ? id.trim().toUpperCase() : ""))
        .filter((id: string) => Boolean(getPlatoonAgentById(id)))
    : [];

  const weaverHandoffSpec: OracleWeaverHandoffSpec = {
    required: rawSpec.required !== false,
    projectTitle:
      typeof rawSpec.projectTitle === "string" && rawSpec.projectTitle.trim()
        ? rawSpec.projectTitle.trim().slice(0, 80)
        : bleedingNeckDiagnosis.headline.slice(0, 64),
    prompt:
      typeof rawSpec.prompt === "string" && rawSpec.prompt.trim()
        ? rawSpec.prompt.trim().slice(0, 3_500)
        : `Build a focused web application to solve: ${bleedingNeckDiagnosis.rootBottleneck}`,
    recommendedChips: sanitizeAiChips(rawSpec.recommendedChips),
    agentDeliverableSummary:
      typeof rawSpec.agentDeliverableSummary === "string" && rawSpec.agentDeliverableSummary.trim()
        ? rawSpec.agentDeliverableSummary.trim().slice(0, 1_500)
        : `Combine outputs from ${validatedChain.map((a) => `${a.name} (${a.role})`).join(", ")} into an executable user experience.`,
    sourceAgentIds: rawSourceIds.length > 0 ? Array.from(new Set(rawSourceIds)) : chainIds,
  };

  return {
    diagnosis: {
      bleedingNeckDiagnosis,
      agentChain: validatedChain,
      weaverHandoffSpec,
    },
    model: aiRes.model,
    candidateCount: candidates.length,
  };
}
