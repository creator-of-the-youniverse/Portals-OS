/**
 * @file First-Touch Onboarding Types
 *
 * Data schemas from the First-Touch Onboarding Specification §5.3.
 * These types govern the identity claim flow, provisional/authenticated
 * owner states, and the multi-act onboarding dialogue.
 */

// ─────────────────────────────────────────────────────────────
// 1. Owner Roles & Session
// ─────────────────────────────────────────────────────────────

export type OwnerRole =
  | "PUBLIC"
  | "PROVISIONAL_OWNER"
  | "AUTHENTICATED_OWNER";

export interface OwnerSession {
  handle: string;
  email: string;
  role: OwnerRole;
  isVerified: boolean;
  sessionToken?: string;
  claimedAt: number;
  verifiedAt: number | null;
}

// ─────────────────────────────────────────────────────────────
// 2. Youniverse Tenant / Identity Model
// ─────────────────────────────────────────────────────────────

export interface YouniverseTenant {
  id: string;
  handle: string;
  subdomain: string;
  ownerEmail: string;
  isVerified: boolean;
  role: OwnerRole;
  createdAt: string;
  verifiedAt: string | null;
}

// ─────────────────────────────────────────────────────────────
// 3. Atom Continuity Record (ONE AI)
// ─────────────────────────────────────────────────────────────

export type AtomProvider = "local-llm" | "google-gemini" | "anthropic" | "byok";
export type AtomStatus = "ONLINE" | "STANDBY" | "LOCAL_OFFLINE";

export type DialogueSender = "ATOM" | "ORACLE" | "WEAVER" | "NEXUS" | "USER";

export interface DialogueEntry {
  sender: DialogueSender;
  content: string;
  timestamp: number;
}

export interface AtomState {
  id: string;
  youniverseId: string;
  connectionId: "#0001";
  name: "Atom";
  status: AtomStatus;
  provider: AtomProvider;
  dialogueHistory: DialogueEntry[];
}

// ─────────────────────────────────────────────────────────────
// 4. Oracle Diagnosis & Nexus Workflow
// ─────────────────────────────────────────────────────────────

export type OracleStage =
  | "THOUGHT"
  | "VALIDATION"
  | "MONETIZATION"
  | "OPERATION"
  | "EXIT";

export interface OracleDiagnosis {
  id: string;
  youniverseId: string;
  stage: OracleStage;
  identifiedFriction: string;
  recommendedAgentIds: string[];
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// 5. NotNotes Artifact (Working Memory)
// ─────────────────────────────────────────────────────────────

export type NotNoteStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED_BOOKS_OS";

export interface NotNoteItem {
  id: string;
  youniverseId: string;
  title: string;
  content: string;
  sourceAgentId?: string;
  status: NotNoteStatus;
  tags: string[];
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────
// 6. Onboarding Flow State
// ─────────────────────────────────────────────────────────────

/** The four Acts of the onboarding dialogue */
export type OnboardingAct =
  | "WELCOME_ATOM"
  | "WEAVER_INTRO"
  | "ORACLE_NEXUS"
  | "ECOSYSTEM_HUBS";

/** Overall onboarding progression */
export type OnboardingPhase =
  | "GATEWAY"           // User is on itsyouonline.com, seeing the @ line
  | "HANDLE_ENTERED"    // Handle typed, email prompt sliding open
  | "CLAIMING"          // POST /api/v1/auth/claim in progress
  | "PORTAL_TRANSITION" // Animated transition to subdomain
  | "DIALOGUE"          // Multi-act onboarding dialogue playing
  | "EXPLORING"         // User dismissed dialogue, exploring provisional desktop
  | "VERIFIED";         // Email link clicked, full owner mode

export interface OnboardingState {
  phase: OnboardingPhase;
  currentAct: OnboardingAct | null;
  actIndex: number;
  handle: string;
  email: string;
  ownerRole: OwnerRole;
  isVerified: boolean;
  dialogueComplete: boolean;
  hasExploredFileTree: boolean;
  hasTestedWeaver: boolean;
}

// ─────────────────────────────────────────────────────────────
// 7. API Payloads
// ─────────────────────────────────────────────────────────────

export interface ClaimRequest {
  handle: string;
  email: string;
}

export interface ClaimResponse {
  success: boolean;
  subdomain: string;
  sessionToken: string;
  error?: string;
}

export interface VerifyRequest {
  token: string;
}

export interface VerifyResponse {
  success: boolean;
  handle: string;
  role: OwnerRole;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// 8. Handle Validation
// ─────────────────────────────────────────────────────────────

/** Valid handle: lowercase alphanumeric + hyphens, 3-32 chars */
export const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function isValidHandle(input: string): boolean {
  return HANDLE_REGEX.test(input);
}

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
