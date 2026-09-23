import React, { lazy } from "react";
import { AppId, BuiltInAppId, AppDefinition, ProjectFolder } from "./types";
import { FileText, Folder, FolderOpen, Sparkles } from "lucide-react";
import {
  TerminalIcon,
  ContactIcon,
  OracleIcon,
  PotatoCometIcon,
} from "./components/icons";
import { NEXUS_AGENTS, CATEGORY_COLORS } from "./constants/platoon";


// CLEAN SLATE: Only the 6 core apps you requested
export const APPS_CONFIG: Record<BuiltInAppId, AppDefinition> = {
  oracle: {
    id: "oracle",
    name: "Oracle",
    icon: OracleIcon,
    component: lazy(() => import("./apps/Oracle")),
    description: "AI-powered voice assistant for guidance and app control.",
  },
  subscription: {
    id: "subscription" as BuiltInAppId,
    name: "Upgrades",
    icon: Sparkles,
    component: lazy(() => import("./apps/SubscriptionApp")),
    description: "Unlock Architect tier for Memory & Books OS.",
  },
  notionLike: {
    id: "notionLike",
    name: "Not Notes",
    icon: FileText,
    component: lazy(() => import("./apps/Not")),
    description: "Integrated Artifact Compilation layer for Agent deliverables.",
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    icon: TerminalIcon,
    component: lazy(() => import("./apps/Terminal")),
    description: "Access to command-line interface.",
  },
  markdownEditor: {
    id: "markdownEditor",
    name: "Markdown Editor",
    icon: FileText,
    component: lazy(() => import("./apps/MarkdownEditor")),
    description: "A simple, persistent markdown notes application.",
  },
  contact: {
    id: "contact",
    name: "Contact Me",
    icon: ContactIcon,
    component: lazy(() => import("./apps/Contact")),
    description: "Send me a message.",
  },
  fileManager: {
    id: "fileManager",
    name: "File Manager",
    icon: Folder,
    component: lazy(() => import("./apps/FileManager")),
    description: "Browse files and manage project folders.",
  },
  fileViewer: {
    id: "fileViewer",
    name: "File Viewer",
    icon: FileText,
    component: lazy(() => import("./apps/FileViewer")),
    description: "View file contents.",
  },
  settings: {
    id: "settings",
    name: "Settings",
    icon: Folder,
    component: lazy(() => import("./apps/Settings")),
    description: "System settings.",
  },
  omniedia: {
    id: "omniedia" as BuiltInAppId,
    name: "Omniedia",
    icon: Sparkles,
    component: lazy(() => import("./apps/OmniediaApp")),
    description: "Social media analytics and gamification ranking.",
  },
  messages: {
    id: "messages" as BuiltInAppId,
    name: "Messages",
    icon: ContactIcon,
    component: lazy(() => import("./apps/MessagesApp")),
    description: "Public message board.",
  },
  ones: {
    id: "ones" as BuiltInAppId,
    name: "ONEAI",
    icon: Sparkles,
    component: lazy(() => import("./apps/OneAIApp")),
    description: "Sovereign personal AI interface.",
  },
};

export const APPS = Object.values(APPS_CONFIG);

// Core system apps that appear in start menu and circular menu
const CORE_APP_IDS: BuiltInAppId[] = [
  "oracle",
  "subscription",
  "notionLike",
  "terminal",
  "markdownEditor",
  "contact",
  "fileManager",
  "settings",
  "omniedia" as BuiltInAppId,
  "messages" as BuiltInAppId,
  "ones" as BuiltInAppId,
];

/**
 * Get core system apps for the start menu
 */
export const getCoreApps = (
  projectFolders: ProjectFolder[]
): AppDefinition[] => {
  const coreApps = CORE_APP_IDS.map((id) => APPS_CONFIG[id]);

  const folderApps: AppDefinition[] = projectFolders.map((folder) => ({
    id: folder.id as AppId,
    name: folder.name,
    icon: FolderOpen,
    component: lazy(() => import("./apps/FolderView")),
    description: `Project: ${folder.path}`,
    isCustom: true,
  }));

  return [...coreApps, ...folderApps];
};

/**
 * Get all apps — includes core apps, folder apps, AND dynamically resolved Nexus agents
 */
export const getAllApps = (
  projectFolders: ProjectFolder[]
): AppDefinition[] => {
  const coreAndFolders = getCoreApps(projectFolders);

  // Dynamically include any Nexus agent that has an open window
  // This is called per-render in App.tsx so we generate AppDefinitions on the fly
  const agentApps: AppDefinition[] = NEXUS_AGENTS.map((agent: any) => ({
    id: agent.id as AppId,
    name: agent.name,
    icon: FileText, // placeholder icon — window title bar uses the name
    component: lazy(() => import("./apps/AgentPWA")),
    description: agent.description,
  }));

  return [...coreAndFolders, ...agentApps];
};



/**
 * Get apps for the floating sphere - The full Nexus constellation
 */
export const getSphereApps = (
  _projectFolders: ProjectFolder[]
): any[] => {
  // Map all Nexus agents to the sphere definition
  const agents = NEXUS_AGENTS.map((agent: any) => ({
    id: agent.id as AppId,
    name: agent.name,
    icon: agent.icon, // Restore actual agent icons (emoji URLs)
    description: agent.description,
    color: CATEGORY_COLORS[agent.category] || '#fff', // Pass the category color for the constellation
  }));

  // Add the Potato Comet as the core of the constellation
  return [
    {
      id: 'potatoComet' as AppId,
      name: 'Potato Comet',
      icon: PotatoCometIcon,
      description: 'A flaming potato hauling ass through the cosmos',
    },
    ...agents
  ];
};
