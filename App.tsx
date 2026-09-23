import React, { lazy, Suspense, useEffect, useRef, useCallback, useState } from "react";
import "./index.css";
import { useKernel } from "./store/kernel";
import Desktop from "./components/Desktop";
import Window from "./components/Window";
import WelcomeScreen from "./components/WelcomeScreen";
import PublicYouniverse from "./components/PublicYouniverse";
import ClaimYouniverse from "./components/ClaimYouniverse";
import { useYouniverse } from "./components/YouniverseProvider";
import Sidebar from "./components/Sidebar";
import VoiceAssistant from "./components/VoiceAssistant";
import VoiceAssistantOverlay from "./components/VoiceAssistantOverlay";
import { CheckoutHandler } from "./components/CheckoutHandler";

import ErrorBoundary from "./components/ErrorBoundary";
import { getAllApps } from "./apps.config";
import {
  usePerformanceMonitor,
  performanceMonitor,
  PerformanceMetrics,
} from "./lib/performanceUtils";

import { motion, AnimatePresence } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";

const App: React.FC = () => {
  const windows = useKernel((state) => state.windows);
  const hasWelcomed = useKernel((state) => state.hasWelcomed);
  const { identity } = useYouniverse();
  const isYouniverseRoute = identity?.kind === "identity";
  const setHasWelcomed = useKernel((state) => state.setHasWelcomed);
  const projectFolders = useKernel((state) => state.projectFolders);

  const isClaimRoute = identity?.kind === "claim";

  // Subdomain Portals OS active state
  // Use useEffect so we can safely read localStorage after identity resolves
  const [subdomainOsActive, setSubdomainOsActive] = useState<boolean>(false);

  useEffect(() => {
    if (identity?.username) {
      const stored = localStorage.getItem(`youniverse_os_active_${identity.username}`);
      const params = new URLSearchParams(window.location.search);
      if (stored === "true" || params.get("mode") === "os" || params.get("enter") === "true") {
        setSubdomainOsActive(true);
      }
    }
  }, [identity?.username]);

  const enterSubdomainOs = useCallback(() => {
    setSubdomainOsActive(true);
    if (identity?.username) {
      localStorage.setItem(`youniverse_os_active_${identity.username}`, "true");
    }
  }, [identity?.username]);

  const viewPublicShowcase = useCallback(() => {
    setSubdomainOsActive(false);
  }, []);

  const theme = useKernel((state) => state.theme);
  const lastPerformanceLogTime = useRef(0);

  // Performance monitoring callback - memoized to prevent multiple subscriptions
  const performanceCallback = useCallback((metrics: PerformanceMetrics) => {
    // Throttle logging to reduce console spam
    const now = performance.now();
    if (now - lastPerformanceLogTime.current > 5000) {
      if (metrics.fps < 30) {
        console.warn(`Performance warning: ${metrics.fps}fps`);
      }
      if (metrics.memoryUsage && metrics.memoryUsage > 150) {
        console.warn(`Memory usage high: ${metrics.memoryUsage}MB`);
      }
      lastPerformanceLogTime.current = now;
    }
  }, []);

  usePerformanceMonitor(performanceCallback);



  useEffect(() => {
    // Start performance monitoring
    performanceMonitor.start();

    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Cleanup performance monitoring on unmount
    return () => {
      performanceMonitor.stop();
    };
  }, [theme]);

   const addDeliverable = useKernel((state) => state.addDeliverable);
  const setAgentStatus = useKernel((state) => state.setAgentStatus);
  const setIsMobile = useKernel((state) => state.setIsMobile);
  const openWindow = useKernel((state) => state.openWindow);
  const initialGreetingSpoken = useKernel((state) => state.initialGreetingSpoken);
  const setInitialGreetingSpoken = useKernel((state) => state.setInitialGreetingSpoken);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsMobile]);

  // Auto-open logic removed per user request

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, agentId, agentName, content, timestamp } = event.data || {};

      switch (type) {
        case "SUBMIT_DELIVERABLE":
          if (content) {
            addDeliverable({
              id: Math.random().toString(36).substr(2, 9),
              agentId: agentId || "unknown",
              agentName: agentName || "Agent",
              content,
              timestamp: timestamp || new Date().toISOString(),
              status: "pending",
            });
            console.log(`[KERNEL] Received deliverable from ${agentName || agentId}`);
          }
          break;

        case "AGENT_READY":
          console.log(`[KERNEL] Uplink Established: ${agentName || agentId} is online.`);
          if (agentId) setAgentStatus(agentId, "online");
          break;

        case "AGENT_HEARTBEAT":
          if (agentId) setAgentStatus(agentId, "online");
          break;

        case "AGENT_ERROR":
          console.error(`[KERNEL] Connection Error: ${agentId} reported a failure.`);
          if (agentId) setAgentStatus(agentId, "error");
          break;

        default:
          // Ignore other messages
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [addDeliverable, setAgentStatus]);


  const showClaimRoute = isClaimRoute;
  const showPublicYouniverse = isYouniverseRoute && !subdomainOsActive;
  const showWelcome = !isYouniverseRoute && !isClaimRoute && !hasWelcomed;

  return (
    <AnimatePresence mode="sync">
      {showClaimRoute ? (
        <ClaimYouniverse key="claim" />
      ) : showPublicYouniverse ? (
        <PublicYouniverse key="youniverse" onEnterOs={enterSubdomainOs} />
      ) : showWelcome ? (
        <WelcomeScreen key="welcome" />
      ) : (
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="fixed inset-0 overflow-hidden bg-black font-sans"
        >
          <Desktop>
            {windows.map((win) => {
              const allApps = getAllApps(projectFolders);
              const appDef = allApps.find((app) => app.id === win.appId);
              const App = appDef?.component;
              if (!App) return null;
              return (
                <Window key={win.id || `window-${win.appId}-${Math.random()}`} {...win}>
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div className="h-full flex items-center justify-center bg-[hsl(var(--window-bg-hsl))] text-[hsl(var(--foreground-hsl))]">
                          <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-4"></div>
                            <p>Loading App...</p>
                          </div>
                        </div>
                      }
                    >
                      <App metadata={win.metadata} />
                    </Suspense>
                  </ErrorBoundary>
                </Window>
              );
            })}
          </Desktop>

          {/* Subdomain Mode Indicator / Public Toggle */}
          {isYouniverseRoute && (
            <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-purple-500/40 bg-black/70 px-3.5 py-1 text-xs text-purple-200 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono font-medium">@{identity?.username} Portals OS</span>
              <button
                onClick={viewPublicShowcase}
                className="ml-2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                title="Switch to Public Showcase Page"
              >
                Public Page
              </button>
            </div>
          )}

          <Sidebar />
          <VoiceAssistant />
          <VoiceAssistantOverlay />
          <CheckoutHandler />

        </motion.div>
      )}
      <Analytics />
      <PwaInstallPrompt />
    </AnimatePresence>
  );
};

export default App;
