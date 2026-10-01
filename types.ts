import {
  AppId,
  BuiltInAppId,
  AppDefinition,
  ChatMessage,
  ChatSession,
  GeminiModel,
  GroundingChunk,
  Theme,
  WindowInstance,
  VirtualFile,
  VirtualFileType,
  ProjectFolder,
} from "./src/types";

import type {
  OnboardingPhase,
  OnboardingAct,
  OwnerRole,
  OnboardingState,
} from "./types/onboarding";

export type {
  AppId,
  BuiltInAppId,
  AppDefinition,
  ChatMessage,
  ChatSession,
  GeminiModel,
  GroundingChunk,
  Theme,
  WindowInstance,
  VirtualFile,
  VirtualFileType,
  ProjectFolder,
};

export interface WeavedWidget {
  id: string;
  title: string;
  code: string;
  dependencies: string[];
}

export interface KernelState {
  windows: WindowInstance[];
  activeWindowId: string | null;
  nextZIndex: number;
  wallpaper: string;
  isStartMenuOpen: boolean;

  gemini: {
    model: GeminiModel;
    sessions: Record<string, ChatSession>;
    currentSessionId: string | null;
    isLoading: boolean;
    useSmartContext: boolean;
    useGrounding: boolean;
  };

  hasWelcomed: boolean;
  collectedEmails: string[];
  isSidebarOpen: boolean;
  selectedDomainId: string | null;

  // New Access Control State
  unlockedNodes: string[];
  unlockedSquads: string[]; // Keep squad package ownership since users buy these
  subscriptionTier: 'free' | 'squad+' | 'platoon';
  freeNodesUsed: string[];
  favoriteNodes: string[];

  // New Access Control Methods
  unlockNode: (nodeId: string) => void;
  unlockSquad: (squadId: string) => void;
  setSubscriptionTier: (tier: 'free' | 'squad+' | 'platoon') => void;
  consumeFreeNodeSlot: (nodeId: string) => boolean;
  toggleFavoriteNode: (nodeId: string) => void;

  selectedPwa: {
    id: string;
    label: string;
    parentLabel: string;
    parentSquadId?: string;
    role?: string;
    pain?: string;
    artifact?: string;
    purpose?: string;
    mission?: string;
    preFlight?: { deployWhen: string; abstainWhen: string; };
    inputs?: string;
    deliverables?: string[];
    oracleInsight?: string;
    prevNode?: string;
    nextNode?: string;
  } | null;
  isMatrixEffectActive: boolean;
  hasNewMessage: boolean;
  theme: Theme;
  initialGreetingSpoken: boolean;
  micPermissionGranted: boolean;
  isRadioWidgetVisible: boolean;
  currentPath: string; // Current directory in virtual filesystem
  projectFolders: ProjectFolder[]; // User's project folder bookmarks
  weavedWidgets: WeavedWidget[]; // User's dynamically loaded Weaver applets
  setWeavedWidgets: (widgets: WeavedWidget[]) => void;

  setInitialGreetingSpoken: (status: boolean) => void;
  setMicPermissionGranted: (status: boolean) => void;
  setRadioWidgetVisible: (status: boolean) => void;

  openWindow: (appId: AppId, sizeOrPayload?: { width: number; height: number } | string, metadata?: any) => void;
  closeWindow: (id: string) => void;
  closeWindowByAppId: (appId: AppId) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  snapWindow: (
    id: string,
    snapState:
      | "none"
      | "maximized"
      | "topLeft"
      | "topRight"
      | "bottomLeft"
      | "bottomRight"
      | "left"
      | "right"
  ) => void;
  updateWindowPosition: (
    id: string,
    position: { x: number; y: number }
  ) => void;
  updateWindowSize: (
    id: string,
    size: { width: number; height: number }
  ) => void;

  setWallpaper: (wallpaperUrl: string) => void;
  toggleStartMenu: () => void;
  closeStartMenu: () => void;

  startNewChat: () => string;
  selectChatSession: (sessionId: string) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  setGeminiLoading: (isLoading: boolean) => void;
  setGeminiModel: (model: GeminiModel) => void;
  toggleSmartContext: () => void;
  toggleGrounding: () => void;
  deleteChatSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  addEmail: (email: string) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openSquadSidebar: (squadId: string) => void;
  openPwaSidebar: (pwa: {
    id: string;
    label: string;
    parentLabel: string;
    parentSquadId?: string;
    role?: string;
    pain?: string;
    artifact?: string;
    purpose?: string;
    mission?: string;
    preFlight?: { deployWhen: string; abstainWhen: string; };
    inputs?: string;
    deliverables?: string[];
    oracleInsight?: string;
    prevNode?: string;
    nextNode?: string;
  }) => void;
  toggleMatrixEffect: (status: boolean) => void;
  setHasNewMessage: (status: boolean) => void;
  toggleTheme: () => void;
  setHasWelcomed: (status: boolean) => void;

  // Project folder actions
  addProjectFolder: (folder: Omit<ProjectFolder, 'id' | 'createdAt'>) => void;
  removeProjectFolder: (id: string) => void;
  updateProjectFolder: (id: string, updates: Partial<ProjectFolder>) => void;

  // Virtual filesystem actions
  navigateToPath: (path: string) => void;
  openFile: (fileId: string) => void;

  // Not Notes State
  notNotes: {
    projects: Record<string, NotNotesProject>;
    currentProjectId: string | null;
    pendingDeliverables: NotNotesDeliverable[];
  };

  // Not Notes Methods
  addDeliverable: (deliverable: NotNotesDeliverable) => void;
  approveDeliverable: (id: string) => void;
  rejectDeliverable: (id: string) => void;
  createNotNotesProject: (title: string) => string;
  selectNotNotesProject: (id: string) => void;
  updateArtifact: (projectId: string, content: string) => void;

  // Agent Connectivity Tracking
  agentStatus: Record<string, "offline" | "online" | "error">;
  setAgentStatus: (
    agentId: string,
    status: "offline" | "online" | "error"
  ) => void;

  isMobile: boolean;
  setIsMobile: (status: boolean) => void;

  // Tactical Actions
  confirmSquad: (squadName: string, agentIds: string[]) => string;
  compileFinalArtifact: (projectId: string) => string | null;
  commitProjectToBooks: (
    projectId: string,
    location: { tower: string; shelf: string; book: string; page: string },
    summary: string
  ) => Promise<boolean>;

  // First-Touch Onboarding
  onboarding: OnboardingState;
  setOnboardingPhase: (phase: OnboardingPhase) => void;
  setOnboardingHandle: (handle: string) => void;
  setOnboardingEmail: (email: string) => void;
  setOwnerRole: (role: OwnerRole) => void;
  advanceOnboardingAct: () => void;
  startOnboardingDialogue: () => void;
  completeOnboardingDialogue: () => void;
  upgradeToVerified: () => void;
}

export interface NotNotesDeliverable {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface NotNotesProject {
  id: string;
  title: string;
  artifact: string;
  deliverables: string[]; // IDs of approved deliverables
  createdAt: string;
  updatedAt: string;
}
