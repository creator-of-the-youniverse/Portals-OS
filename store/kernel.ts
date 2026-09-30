import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  AppId,
  ChatMessage,
  ChatSession,
  GeminiModel,
  KernelState,
  ProjectFolder,
  WindowInstance,
  Theme,
} from "../types";
import { NEXUS_AGENTS } from "../constants/platoon";
import type {
  OnboardingPhase,
  OnboardingAct,
  OwnerRole,
} from "../types/onboarding";

const useKernelStore = create<KernelState>()(
  persist(
    (set, get) => ({
      windows: [],
      activeWindowId: null,
      nextZIndex: 100,
      wallpaper: "assets/images/welcome.png",
      isStartMenuOpen: false,

      gemini: {
        model: "gemini-1.5-flash",
        sessions: {},
        currentSessionId: null,
        isLoading: false,
        useSmartContext: true,
        useGrounding: false,
      },

      hasWelcomed: false,
      collectedEmails: [],
      isSidebarOpen: false,
      selectedDomainId: null,
      selectedPwa: null,
      isMatrixEffectActive: false,
      hasNewMessage: false,
      theme: "dark",
      initialGreetingSpoken: false,
      micPermissionGranted: false,
      isRadioWidgetVisible: true,
      isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
      projectFolders: [], // User's project folder bookmarks
      currentPath: "/", // Current directory in virtual filesystem
      
      // Not Notes Initial State
      notNotes: {
        projects: {},
        currentProjectId: null,
        pendingDeliverables: [],
      },

      // First-Touch Onboarding State
      onboarding: {
        phase: 'GATEWAY' as OnboardingPhase,
        currentAct: null as OnboardingAct | null,
        actIndex: 0,
        handle: '',
        email: '',
        ownerRole: 'PUBLIC' as OwnerRole,
        isVerified: false,
        dialogueComplete: false,
        hasExploredFileTree: false,
        hasTestedWeaver: false,
      },

      // Access Control
      unlockedNodes: [],
      unlockedSquads: [],
      subscriptionTier: 'free',
      freeNodesUsed: [],
      favoriteNodes: [],

      openWindow: (appId, size = { width: 600, height: 450 }, metadata) => {
        // Check if window for this app already exists - focus it instead of creating duplicate
        const existingWindow = get().windows.find(w => w.appId === appId);
        if (existingWindow) {
          // Focus the existing window and restore if minimized
          set((state) => ({
            windows: state.windows.map(w =>
              w.id === existingWindow.id
                ? { ...w, minimized: false, zIndex: state.nextZIndex }
                : w
            ),
            nextZIndex: state.nextZIndex + 1,
            activeWindowId: existingWindow.id,
            isStartMenuOpen: false,
            isSidebarOpen: false,
          }));
          return;
        }

        // Calculate spawn position based on app type
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

        let position: { x: number; y: number };

        // Handle specific app sizes and positions
        if (appId === 'subscription' && size.width === 600 && size.height === 450) {
          size = {
            width: Math.min(1300, screenWidth - 100),
            height: Math.min(800, screenHeight - 100)
          };
        }

        if (appId === 'subscription') {
          position = {
            x: Math.max(0, (screenWidth - size.width) / 2),
            y: Math.max(0, (screenHeight - size.height) / 2)
          };
        } else if (appId === 'oracle') {
          position = {
            x: screenWidth - size.width - 20, // 20px from right edge
            y: 20 // 20px from top
          };
        } else {
          // Stack windows in a VERTICAL COLUMN - each window below previous
          const existingLeftWindows = get().windows.filter(w =>
            w.appId !== 'oracle'
          );

          const windowCount = existingLeftWindows.length;

          // Use fixed vertical offset so windows show title bars like a card deck
          const VERTICAL_OFFSET = 40; // Just enough to see the title bar

          position = {
            x: 20, // All windows at left edge
            y: 20 + (windowCount * VERTICAL_OFFSET) // Stack in column
          };

          console.log(`[WINDOW STACK] Opening ${appId} - existing windows: ${windowCount}, Y position: ${position.y}`);
        }

        const newWindow: WindowInstance = {
          id: nanoid(),
          appId,
          title:
            appId.charAt(0).toUpperCase() +
            appId
              .slice(1)
              .replace(/([A-Z])/g, " $1")
              .trim(),
          position,
          size,
          zIndex: get().nextZIndex,
          minimized: false,
          snapState: get().isMobile ? "maximized" : "none",
          metadata,
        };

        if (get().isMobile) {
          newWindow.position = { x: 0, y: 0 };
          newWindow.size = { 
            width: typeof window !== 'undefined' ? window.innerWidth : size.width, 
            height: typeof window !== 'undefined' ? window.innerHeight - 48 : size.height 
          };
        }

        set((state) => ({
          windows: [...state.windows, newWindow],
          nextZIndex: state.nextZIndex + 1,
          activeWindowId: newWindow.id,
          isStartMenuOpen: false,
          isSidebarOpen: false,
        }));
      },
      closeWindow: (id) => {
        const win = get().windows.find((w) => w.id === id);
        if (win) {
          const isAgent = NEXUS_AGENTS.some((a) => a.id === win.appId);
          if (isAgent) {
            get().setAgentStatus(win.appId, "offline");
          }
        }
        set((state) => ({
          windows: state.windows.filter((w) => w.id !== id),
        }));
      },
      closeWindowByAppId: (appId) => {
        const windowToClose = get()
          .windows.filter((w) => w.appId === appId)
          .sort((a, b) => b.zIndex - a.zIndex)[0];

        if (windowToClose) {
          get().closeWindow(windowToClose.id);
        }
      },
      focusWindow: (id) => {
        const window = get().windows.find((w) => w.id === id);
        if (window && window.zIndex !== get().nextZIndex - 1) {
          set((state) => ({
            windows: state.windows.map((w) =>
              w.id === id
                ? { ...w, zIndex: state.nextZIndex, minimized: false }
                : w
            ),
            nextZIndex: state.nextZIndex + 1,
            activeWindowId: id,
          }));
        } else if (window && window.minimized) {
          set((state) => ({
            windows: state.windows.map((w) =>
              w.id === id ? { ...w, minimized: false } : w
            ),
            activeWindowId: id,
          }));
        }
      },
      minimizeWindow: (id) =>
        set((state) => ({
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, minimized: !w.minimized } : w
          ),
          activeWindowId:
            id === state.activeWindowId ? null : state.activeWindowId,
        })),
      snapWindow: (id, snapState) => {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight - 48; // Account for taskbar

        set((state) => {
          const windowIndex = state.windows.findIndex((w) => w.id === id);
          if (windowIndex === -1) return state;

          const windows = [...state.windows];
          const currentWindow = { ...windows[windowIndex] };

          const isSnapping = snapState !== "none";
          const wasSnapped = currentWindow.snapState !== "none";

          if (isSnapping && !wasSnapped) {
            currentWindow.preSnapPosition = { ...currentWindow.position };
            currentWindow.preSnapSize = { ...currentWindow.size };
          }

          currentWindow.snapState = snapState;

          switch (snapState) {
            case "maximized":
              currentWindow.position = { x: 0, y: 0 };
              currentWindow.size = { width: screenWidth, height: screenHeight };
              break;
            case "topLeft":
              currentWindow.position = { x: 0, y: 0 };
              currentWindow.size = {
                width: Math.ceil(screenWidth / 2),
                height: Math.ceil(screenHeight / 2),
              };
              break;
            case "topRight":
              currentWindow.position = { x: Math.floor(screenWidth / 2), y: 0 };
              currentWindow.size = {
                width: Math.floor(screenWidth / 2),
                height: Math.ceil(screenHeight / 2),
              };
              break;
            case "bottomLeft":
              currentWindow.position = {
                x: 0,
                y: Math.floor(screenHeight / 2),
              };
              currentWindow.size = {
                width: Math.ceil(screenWidth / 2),
                height: Math.floor(screenHeight / 2),
              };
              break;
            case "bottomRight":
              currentWindow.position = {
                x: Math.floor(screenWidth / 2),
                y: Math.floor(screenHeight / 2),
              };
              currentWindow.size = {
                width: Math.floor(screenWidth / 2),
                height: Math.floor(screenHeight / 2),
              };
              break;
            case "left":
              currentWindow.position = { x: 0, y: 0 };
              currentWindow.size = {
                width: Math.ceil(screenWidth / 2),
                height: screenHeight,
              };
              break;
            case "right":
              currentWindow.position = { x: Math.floor(screenWidth / 2), y: 0 };
              currentWindow.size = {
                width: Math.floor(screenWidth / 2),
                height: screenHeight,
              };
              break;
            case "none":
              if (currentWindow.preSnapPosition && currentWindow.preSnapSize) {
                currentWindow.position = { ...currentWindow.preSnapPosition };
                currentWindow.size = { ...currentWindow.preSnapSize };
              }
              break;
          }

          windows[windowIndex] = currentWindow;
          return { windows };
        });
      },
      updateWindowPosition: (id, position) =>
        set((state) => ({
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, position } : w
          ),
        })),
      updateWindowSize: (id, size) =>
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, size } : w)),
        })),

      setWallpaper: (wallpaperUrl) => set({ wallpaper: wallpaperUrl }),
      toggleStartMenu: () =>
        set((state) => ({
          isStartMenuOpen: !state.isStartMenuOpen,
          isSidebarOpen: false,
        })),
      closeStartMenu: () => set({ isStartMenuOpen: false }),

      startNewChat: () => {
        const newSessionId = nanoid();
        const newSession: ChatSession = {
          id: newSessionId,
          title: "New Chat",
          messages: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          gemini: {
            ...state.gemini,
            sessions: { ...state.gemini.sessions, [newSessionId]: newSession },
            currentSessionId: newSessionId,
          },
        }));
        return newSessionId;
      },
      selectChatSession: (sessionId) => {
        if (get().gemini.sessions[sessionId]) {
          set((state) => ({
            gemini: { ...state.gemini, currentSessionId: sessionId },
          }));
        }
      },
      addMessageToSession: (sessionId, message) => {
        set((state) => {
          const session = state.gemini.sessions[sessionId];
          if (!session) return state;
          const updatedSession = {
            ...session,
            messages: [...session.messages, message],
          };
          return {
            gemini: {
              ...state.gemini,
              sessions: {
                ...state.gemini.sessions,
                [sessionId]: updatedSession,
              },
            },
          };
        });
      },
      setGeminiLoading: (isLoading) =>
        set((state) => ({ gemini: { ...state.gemini, isLoading } })),
      setGeminiModel: (model: GeminiModel) =>
        set((state) => ({ gemini: { ...state.gemini, model } })),
      toggleSmartContext: () =>
        set((state) => ({
          gemini: {
            ...state.gemini,
            useSmartContext: !state.gemini.useSmartContext,
          },
        })),
      toggleGrounding: () =>
        set((state) => ({
          gemini: { ...state.gemini, useGrounding: !state.gemini.useGrounding },
        })),
      deleteChatSession: (sessionId: string) => {
        set((state) => {
          const newSessions = { ...state.gemini.sessions };
          delete newSessions[sessionId];
          let newCurrentSessionId = state.gemini.currentSessionId;
          if (newCurrentSessionId === sessionId) {
            const remainingIds = Object.keys(newSessions);
            newCurrentSessionId =
              remainingIds.length > 0 ? remainingIds[0] : null;
          }
          return {
            gemini: {
              ...state.gemini,
              sessions: newSessions,
              currentSessionId: newCurrentSessionId,
            },
          };
        });
      },
      updateSessionTitle: (sessionId: string, title: string) => {
        set((state) => {
          const session = state.gemini.sessions[sessionId];
          if (!session) return state;
          const updatedSession = { ...session, title };
          return {
            gemini: {
              ...state.gemini,
              sessions: {
                ...state.gemini.sessions,
                [sessionId]: updatedSession,
              },
            },
          };
        });
      },
      setHasWelcomed: (status) => set({ hasWelcomed: status }),
      setInitialGreetingSpoken: (status: boolean) =>
        set({ initialGreetingSpoken: status }),
      setMicPermissionGranted: (status: boolean) =>
        set({ micPermissionGranted: status }),
      addEmail: (email) =>
        set((state) => ({
          collectedEmails: [...state.collectedEmails, email],
        })),
      setRadioWidgetVisible: (status) => set({ isRadioWidgetVisible: status }),

      // ────────────────────────────────────────────────────────
      // First-Touch Onboarding Actions
      // ────────────────────────────────────────────────────────
      setOnboardingPhase: (phase) =>
        set((state) => ({
          onboarding: { ...state.onboarding, phase },
        })),
      setOnboardingHandle: (handle) =>
        set((state) => ({
          onboarding: { ...state.onboarding, handle },
        })),
      setOnboardingEmail: (email) =>
        set((state) => ({
          onboarding: { ...state.onboarding, email },
        })),
      setOwnerRole: (role) =>
        set((state) => ({
          onboarding: { ...state.onboarding, ownerRole: role },
        })),
      advanceOnboardingAct: () =>
        set((state) => {
          const acts = ['WELCOME_ATOM', 'WEAVER_INTRO', 'ORACLE_NEXUS', 'ECOSYSTEM_HUBS'] as const;
          const nextIndex = state.onboarding.actIndex + 1;
          if (nextIndex >= acts.length) {
            return {
              onboarding: {
                ...state.onboarding,
                dialogueComplete: true,
                currentAct: null,
                actIndex: nextIndex,
              },
            };
          }
          return {
            onboarding: {
              ...state.onboarding,
              currentAct: acts[nextIndex],
              actIndex: nextIndex,
            },
          };
        }),
      startOnboardingDialogue: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            phase: 'DIALOGUE',
            currentAct: 'WELCOME_ATOM',
            actIndex: 0,
          },
        })),
      completeOnboardingDialogue: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            dialogueComplete: true,
            phase: 'EXPLORING',
          },
        })),
      upgradeToVerified: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            ownerRole: 'AUTHENTICATED_OWNER',
            isVerified: true,
            phase: 'VERIFIED',
          },
        })),
      toggleSidebar: () =>
        set((state) => ({
          isSidebarOpen: !state.isSidebarOpen,
          isStartMenuOpen: false,
        })),
      closeSidebar: () => set({ isSidebarOpen: false, selectedPwa: null, selectedDomainId: null }),
      consumeFreeNodeSlot: (nodeId: string) => {
        let isAllowed = false;
        set((state) => {
          const updatedFreeNodes = [...state.freeNodesUsed];

          if (updatedFreeNodes.includes(nodeId)) {
            isAllowed = true; // Already used this node, so it's allowed
            return state;
          }

          if (updatedFreeNodes.length < 4) {
            updatedFreeNodes.push(nodeId);
            isAllowed = true;
            return { freeNodesUsed: updatedFreeNodes };
          }

          isAllowed = false; // Over the limit
          return state;
        });
        return isAllowed;
      },
      toggleFavoriteNode: (nodeId) =>
        set((state) => ({
          favoriteNodes: state.favoriteNodes.includes(nodeId)
            ? state.favoriteNodes.filter((id) => id !== nodeId)
            : [...state.favoriteNodes, nodeId],
        })),
      openSquadSidebar: (domainId) =>
        set({
          isSidebarOpen: true,
          selectedDomainId: domainId,
          selectedPwa: null,
          isStartMenuOpen: false,
        }),
      openPwaSidebar: (pwa) =>
        set({
          isSidebarOpen: true,
          selectedPwa: pwa,
          selectedDomainId: null,
          isStartMenuOpen: false,
        }),
      toggleMatrixEffect: (status) => set({ isMatrixEffectActive: status }),
      setHasNewMessage: (status) => set({ hasNewMessage: status }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),

      // Project folder actions
      addProjectFolder: (folder) => {
        const id = `folder:${nanoid()}`;
        const newFolder: ProjectFolder = {
          ...folder,
          id,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          projectFolders: [...state.projectFolders, newFolder],
        }));
      },
      removeProjectFolder: (id) => {
        set((state) => ({
          projectFolders: state.projectFolders.filter((f) => f.id !== id),
        }));
      },
      updateProjectFolder: (id, updates) => {
        set((state) => ({
          projectFolders: state.projectFolders.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        }));
      },

      // Virtual filesystem actions
      navigateToPath: (path) => {
        set({ currentPath: path });
      },
      openFile: (fileId) => {
        get().openWindow("fileViewer", { width: 600, height: 450 }, { fileId });
      },

      // Access Control Implementations
      unlockNode: (nodeId) =>
        set((state) => ({
          unlockedNodes: state.unlockedNodes.includes(nodeId)
            ? state.unlockedNodes
            : [...state.unlockedNodes, nodeId]
        })),
      unlockSquad: (squadId) =>
        set((state) => ({
          unlockedSquads: state.unlockedSquads.includes(squadId)
            ? state.unlockedSquads
            : [...state.unlockedSquads, squadId]
        })),
      setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),

      // Not Notes Methods Implementation
      addDeliverable: (deliverable) => {
        set((state) => ({
          notNotes: {
            ...state.notNotes,
            pendingDeliverables: [...state.notNotes.pendingDeliverables, deliverable],
          },
        }));
      },

      approveDeliverable: (id) => {
        set((state) => {
          const deliverable = state.notNotes.pendingDeliverables.find(d => d.id === id);
          if (!deliverable) return state;

          const updatedDeliverable = { ...deliverable, status: 'approved' as const };
          const remainingPending = state.notNotes.pendingDeliverables.filter(d => d.id !== id);
          
          const currentProjectId = state.notNotes.currentProjectId;
          if (!currentProjectId) {
            // If no project, we still move it to "history" or just clear it?
            // User said: "Oracle calls the tool... deliverable gets handed to not notes"
            // For now, let's just clear it if no project is active, or auto-create one.
            return {
              notNotes: {
                ...state.notNotes,
                pendingDeliverables: remainingPending,
              }
            };
          }

          const project = state.notNotes.projects[currentProjectId];
          const updatedProject = {
            ...project,
            deliverables: [...project.deliverables, id],
            artifact: project.artifact + "\n\n" + deliverable.content,
            updatedAt: new Date().toISOString(),
          };

          return {
            notNotes: {
              ...state.notNotes,
              pendingDeliverables: remainingPending,
              projects: {
                ...state.notNotes.projects,
                [currentProjectId]: updatedProject,
              }
            }
          };
        });
      },

      rejectDeliverable: (id) => {
        set((state) => ({
          notNotes: {
            ...state.notNotes,
            pendingDeliverables: state.notNotes.pendingDeliverables.filter(d => d.id !== id),
          },
        }));
      },

      createNotNotesProject: (title) => {
        const id = nanoid();
        const newProject = {
          id,
          title,
          artifact: `# ${title}\n\nProject started on ${new Date().toLocaleDateString()}\n\n`,
          deliverables: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notNotes: {
            ...state.notNotes,
            projects: { ...state.notNotes.projects, [id]: newProject },
            currentProjectId: id,
          },
        }));
        return id;
      },

      selectNotNotesProject: (id) => {
        set((state) => ({
          notNotes: {
            ...state.notNotes,
            currentProjectId: id,
          },
        }));
      },

      updateArtifact: (projectId, content) => {
        set((state) => {
          const project = state.notNotes.projects[projectId];
          if (!project) return state;
          return {
            notNotes: {
              ...state.notNotes,
              projects: {
                ...state.notNotes.projects,
                [projectId]: { ...project, artifact: content, updatedAt: new Date().toISOString() },
              },
            },
          };
        });
      },

      // Agent Status Implementation
      agentStatus: {},
      setAgentStatus: (agentId, status) => {
        set((state) => ({
          agentStatus: {
            ...state.agentStatus,
            [agentId]: status
          }
        }));
      },

      // Squad Confirmation & Project Sync
      confirmSquad: (squadName: string, agentIds: string[]) => {
        const projectId = get().createNotNotesProject(squadName);
        set((state) => ({
          unlockedSquads: [...state.unlockedSquads, squadName],
          // Unlock all agents in this squad
          unlockedNodes: [...new Set([...state.unlockedNodes, ...agentIds])]
        }));
        return projectId;
      },

      // Compilation & Archival
      compileFinalArtifact: (projectId: string) => {
        const project = get().notNotes.projects[projectId];
        if (!project) return null;

        const finalArtifact = `
# TAKE ACTION ARTIFACT: ${project.title}
Generated by Oracle Core Nexus on ${new Date().toLocaleDateString()}

## EXECUTIVE SUMMARY
This artifact represents the consolidated intelligence of your tactical squad.

## COMPILED DELIVERABLES
${project.artifact}

## NEXT STEPS
Implement the primary directives outlined above to accelerate revenue.
        `.trim();

        get().updateArtifact(projectId, finalArtifact);
        return finalArtifact;
      },

      commitProjectToBooks: async (projectId: string, location: { tower: string; shelf: string; book: string; page: string }, summary: string) => {
        const tier = get().subscriptionTier;
        if (tier !== 'platoon') {
          console.warn("Memory tier required for Books OS archival.");
          return false;
        }

        const project = get().notNotes.projects[projectId];
        if (!project) return false;

        // Simulate API call to Books OS
        console.log(`[BOOKS OS] Archiving to: ${location.tower} -> ${location.shelf} -> ${location.book} -> ${location.page}`);
        console.log(`[BOOKS OS] Summary by ONEAI: ${summary}`);
        
        return true;
      },

      setIsMobile: (status) => set({ isMobile: status }),
    }),
    {
      name: "win11-portfolio-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        wallpaper: state.wallpaper,
        collectedEmails: state.collectedEmails,
        projectFolders: state.projectFolders, // Persist project folders
        unlockedNodes: state.unlockedNodes,
        unlockedSquads: state.unlockedSquads,
        subscriptionTier: state.subscriptionTier,
        freeNodesUsed: state.freeNodesUsed,
        favoriteNodes: state.favoriteNodes,
        gemini: {
          ...state.gemini,
          isLoading: false,
        },
        notNotes: state.notNotes, // Persist Not Notes projects and history
      }),
    }
  )
);

const initialState = useKernelStore.getState();
if (Object.keys(initialState.gemini.sessions).length === 0) {
  useKernelStore.getState().startNewChat();
}

export const useKernel = useKernelStore;
// FIX: Removed redundant interface declaration that conflicted with the imported KernelState type.
