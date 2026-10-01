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
import { playRandomWelcomeMessage } from "./lib/audioUtils";

import { motion, AnimatePresence } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { ClubRadioProvider } from "./contexts/ClubRadioContext";
import YouuniverseRadioBar from "./components/YouuniverseRadioBar";

// First-Touch Onboarding System
import AtLineGateway from "./components/gateway/AtLineGateway";
import OnboardingFlow from "./components/onboarding/OnboardingFlow";
import VerificationBanner from "./components/onboarding/VerificationBanner";
import { PortalBackdrop } from "./components/PortalBackdrop";
import { claimHandle } from "./services/identityService";
import { normalizeHandle } from "./types/onboarding";

const App: React.FC = () => {
  const windows = useKernel((state) => state.windows);
  const hasWelcomed = useKernel((state) => state.hasWelcomed);
  const { identity } = useYouniverse();
  const isYouniverseRoute = identity?.kind === "identity";
  const setHasWelcomed = useKernel((state) => state.setHasWelcomed);
  const projectFolders = useKernel((state) => state.projectFolders);
  const weavedWidgets = useKernel((state) => state.weavedWidgets);

  const isClaimRoute = identity?.kind === "claim";

  // Subdomain Portals OS active state.
  // Determined by a server-verified ownership check — NOT a client-side flag.
  const [subdomainOsActive, setSubdomainOsActive] = useState<boolean>(false);
  const [ownerGateChecked, setOwnerGateChecked] = useState<boolean>(false);

  useEffect(() => {
    if (!identity?.username) return;

    const handle = identity.username;
    const params = new URLSearchParams(window.location.search);

    // Fast path: explicit ?mode=os or ?enter=true query params skip the gate check
    // (still requires a valid session to load protected data, so this is fine UX-wise).
    if (params.get("mode") === "os" || params.get("enter") === "true") {
      setSubdomainOsActive(true);
      setOwnerGateChecked(true);
      return;
    }

    // ── Server-verified owner gate ──────────────────────────────────────────
    // Attempt to verify ownership via JWT. If the user is not the owner (or has
    // no token at all), fall through to the Public Youniverse view.
    const verifyOwnership = async () => {
      const token =
        localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt");

      if (!token) {
        // No session present — definitely not the owner in this browser.
        setSubdomainOsActive(false);
        setOwnerGateChecked(true);
        return;
      }

      try {
        const res = await fetch(`/api/youniverse/${handle}/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          // 401 / 403 / 404 — not owner or token is stale.
          setSubdomainOsActive(false);
          setOwnerGateChecked(true);
          return;
        }

        const data = await res.json();

        if (data.success && data.isOwner === true) {
          setSubdomainOsActive(true);
          // Cache confirmation so the gate only hits the server once per session.
          localStorage.setItem(`youniverse_os_active_${handle}`, "true");
        } else {
          // Valid token but different owner — show public view.
          setSubdomainOsActive(false);
          localStorage.removeItem(`youniverse_os_active_${handle}`);
        }
      } catch (_err) {
        // Network failure — fail safe: show public view.
        console.warn("[OwnerGate] Network error, defaulting to public view.");
        setSubdomainOsActive(false);
      } finally {
        setOwnerGateChecked(true);
      }
    };

    verifyOwnership();
  }, [identity?.username]);

  // Load custom sovereign widgets from NotNotes when OS boots
  useEffect(() => {
    if (subdomainOsActive) {
      const fetchWidgets = async () => {
        try {
          const token = localStorage.getItem("youniverse_session_token") || localStorage.getItem("weaver_jwt");
          if (!token) return;

          const response = await fetch("/api/not-notes/widgets", {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (data.success && data.widgets) {
            useKernel.getState().setWeavedWidgets(data.widgets);
          }
        } catch (error) {
          console.error("Failed to fetch sovereign widgets:", error);
        }
      };
      fetchWidgets();
    }
  }, [subdomainOsActive]);

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

  useEffect(() => {
    if (subdomainOsActive && !initialGreetingSpoken) {
      const welcomeAudios = Array.from({ length: 25 }, (_, i) => `/assets/audio/welcome_${i + 1}.mp3`);
      const randomAudio = welcomeAudios[Math.floor(Math.random() * welcomeAudios.length)];
      import('./lib/audioUtils').then(({ playAudio }) => {
        playAudio(randomAudio, undefined, 0.3);
      });
      setInitialGreetingSpoken(true);
    }
  }, [subdomainOsActive, initialGreetingSpoken, setInitialGreetingSpoken]);

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

  // ────────────────────────────────────────────────────────────
  // FIRST-TOUCH ONBOARDING STATE
  // ────────────────────────────────────────────────────────────
  const onboarding = useKernel((state) => state.onboarding);
  const setOnboardingPhase = useKernel((state) => state.setOnboardingPhase);
  const setOnboardingHandle = useKernel((state) => state.setOnboardingHandle);
  const setOnboardingEmail = useKernel((state) => state.setOnboardingEmail);
  const setOwnerRole = useKernel((state) => state.setOwnerRole);
  const startOnboardingDialogue = useKernel((state) => state.startOnboardingDialogue);
  const completeOnboardingDialogue = useKernel((state) => state.completeOnboardingDialogue);
  const upgradeToVerified = useKernel((state) => state.upgradeToVerified);
  const [isClaimLoading, setIsClaimLoading] = useState(false);

  // Handle gateway claim submission
  const handleGatewayClaim = useCallback(async (handle: string, email: string) => {
    setIsClaimLoading(true);
    setOnboardingHandle(handle);
    setOnboardingEmail(email);
    setOnboardingPhase('CLAIMING');

    try {
      const result = await claimHandle({ handle, email });

      if (result.success) {
        // Store session locally
        localStorage.setItem('active_youniverse_handle', handle);
        localStorage.setItem('youniverse_session_token', result.sessionToken);
        localStorage.setItem('youniverse_owner_email', email);

        // Transition to portal animation then dialogue
        setOwnerRole('PROVISIONAL_OWNER');
        setOnboardingPhase('PORTAL_TRANSITION');
        playRandomWelcomeMessage();

        // Brief portal transition animation, then start dialogue
        setTimeout(() => {
          startOnboardingDialogue();
          // Also mark hasWelcomed so the old WelcomeScreen doesn't interfere
          setHasWelcomed(true);
        }, 1500);
      } else if (result.error === 'payment_required') {
        // Email has already claimed a free Youniverse — redirect to Pay Screen
        setIsClaimLoading(false);
        window.location.href = `/?claim=${encodeURIComponent(handle)}&email=${encodeURIComponent(email)}`;
        return;
      }
    } catch (e) {
      console.warn('[ONBOARDING] Claim error, proceeding anyway:', e);
      setOwnerRole('PROVISIONAL_OWNER');
      playRandomWelcomeMessage();
      startOnboardingDialogue();
      setHasWelcomed(true);
    } finally {
      setIsClaimLoading(false);
    }
  }, [setOnboardingHandle, setOnboardingEmail, setOnboardingPhase, setOwnerRole, startOnboardingDialogue, setHasWelcomed]);

  // Handle onboarding dialogue completion
  const handleOnboardingComplete = useCallback(() => {
    completeOnboardingDialogue();
  }, [completeOnboardingDialogue]);

  // Check for verification token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verify_token');
    if (verifyToken) {
      import('./services/identityService').then(({ verifyEmail }) => {
        verifyEmail(verifyToken).then((result) => {
          if (result.success) {
            upgradeToVerified();
            // Clean the URL
            window.history.replaceState({}, '', window.location.pathname);
          }
        });
      });
    }
  }, [upgradeToVerified]);

  // ────────────────────────────────────────────────────────────
  // ROUTING LOGIC
  // ────────────────────────────────────────────────────────────
  const showClaimRoute = isClaimRoute;

  // On a Youniverse subdomain, hold rendering until the async owner-gate check
  // resolves so we never flash the public view while the fetch is in-flight.
  const gateStillPending = isYouniverseRoute && !ownerGateChecked;
  const showPublicYouniverse = isYouniverseRoute && ownerGateChecked && !subdomainOsActive;
  const showWelcome = !isYouniverseRoute && !isClaimRoute && !hasWelcomed;

  // First-Touch Onboarding overrides
  const showGateway = showWelcome && onboarding.phase === 'GATEWAY';
  const showPortalTransition = onboarding.phase === 'PORTAL_TRANSITION';
  const showOnboardingDialogue = onboarding.phase === 'DIALOGUE';
  const showProvisionalDesktop = onboarding.phase === 'EXPLORING' || onboarding.phase === 'VERIFIED';
  const isProvisionalOwner = onboarding.ownerRole === 'PROVISIONAL_OWNER' && !onboarding.isVerified;

  return (
    <ClubRadioProvider>
    <AnimatePresence mode="sync">
      {/* Owner gate in-flight — render nothing while async check resolves */}
      {gateStillPending ? (
        <motion.div
          key="gate-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0 }}
          className="fixed inset-0 bg-black"
        />
      ) : showClaimRoute ? (
        <ClaimYouniverse key="claim" />
      ) : showPublicYouniverse ? (
        <PublicYouniverse key="youniverse" onEnterOs={enterSubdomainOs} />
      ) : showGateway || showPortalTransition || showOnboardingDialogue ? (
        /* ── FIRST-TOUCH ONBOARDING WRAPPED IN PORTAL ── */
        <PortalBackdrop key="onboarding-portal">
          <AnimatePresence mode="wait">
            {showGateway && (
              <motion.div
                key="gateway"
                className="w-full flex flex-col items-center justify-center"
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              >
                <AtLineGateway
                  onClaim={handleGatewayClaim}
                  isLoading={isClaimLoading}
                />
                {/* Brand watermark */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.15 }}
                  transition={{ delay: 2, duration: 2 }}
                  className="absolute bottom-8 text-[10px] text-white font-mono tracking-[0.3em] uppercase"
                >
                  The Youniverse · ItsYouOnline.com
                </motion.p>
              </motion.div>
            )}

            {showPortalTransition && (
              <motion.div
                key="portal-transition"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="w-full flex flex-col items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 1.3, opacity: 0 }}
                  transition={{ duration: 1.5, ease: "easeIn" }}
                  className="text-center"
                >
                  <p className="text-white/60 font-mono text-sm tracking-widest">
                    @{onboarding.handle}
                  </p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="text-cyan-400/80 font-mono text-xs tracking-wider mt-1"
                  >
                    {onboarding.handle}.itsyouonline.com
                  </motion.p>
                </motion.div>
              </motion.div>
            )}

            {showOnboardingDialogue && (
              <motion.div
                key="onboarding-dialogue"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="w-full flex flex-col items-center justify-center relative z-20"
              >
                <OnboardingFlow
                  handle={onboarding.handle}
                  email={onboarding.email}
                  onComplete={handleOnboardingComplete}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </PortalBackdrop>
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
          {/* Verification Banner for provisional owners */}
          {isProvisionalOwner && (
            <VerificationBanner
              email={onboarding.email}
              handle={onboarding.handle}
              isVerified={onboarding.isVerified}
            />
          )}

          <Desktop>
            {windows.map((win) => {
              const allApps = getAllApps(projectFolders, weavedWidgets);
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
          <YouuniverseRadioBar />
          <CheckoutHandler />

        </motion.div>
      )}
      <Analytics />
      <PwaInstallPrompt />
    </AnimatePresence>
    </ClubRadioProvider>
  );
};

export default App;
