import { AppId, ChatMessage, ChatSession, GeminiModel, Theme, WindowInstance } from './types';

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
  isMatrixEffectActive: boolean;
  hasNewMessage: boolean;
  theme: Theme;
  setInitialGreetingSpoken: (status: boolean) => void;
  setMicPermissionGranted: (status: boolean) => void;

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

  startNewChat: () => void;
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
  toggleMatrixEffect: (status: boolean) => void;
  setHasNewMessage: (status: boolean) => void;
  toggleTheme: () => void;
  setHasWelcomed: (status: boolean) => void;
}
