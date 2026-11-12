import React, { lazy, Suspense, useEffect, useRef, useCallback, useState } from "react";
import "./index.css";
import { useKernel } from "./store/kernel";
import Desktop from "./components/Desktop";
import Window from "./components/Window";
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
import { OwnerLoginModal } from "./components/gateway/OwnerLoginModal";
import ArrivalCeremony from "./components/ArrivalCeremony";
import {
  FoundingAngelsOffer,
  FoundingAngelsSuccess,
  FoundingAngelsCancel,
} from "./components/founding-angels";

const App: React.FC = () => {
  const windows = useKernel((state) => state.windows);
  const { identity } = useYouniverse();
  const isYouniverseRoute = identity?.kind === "identity";
  const projectFolders = useKernel((state) => state.projectFolders);
  const weavedWidgets = useKernel((state) => state.weavedWidgets);

  const isClaimRoute = identity?.kind === "claim";

  // Subdomain Portals OS active state.
  // Determined by a server-verified ownership check — NOT a client-side flag.
  const [subdomainOsActive, setSubdomainOsActive] = useState<boolean>(false);
  const [ownerGateChecked, setOwnerGateChecked] = useState<boolean>(false);
  const [showArrivalCeremony, setShowArrivalCeremony] = useState<boolean>(true);
  const [handoffPending, setHandoffPending] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return /(?:^|#|&)handoff_token=/.test(window.location.hash);
  });
  const handoffReconciledRef = useRef<boolean>(false);

  // Client-side route tracking for direct path navigation
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  });

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleVerifiedArrival = useCallback((sessionToken: string) => {
    if (handoffReconciledRef.current) return;
    handoffReconciledRef.current = true;
    setHandoffPending(false);
    setSubdomainOsActive(true);
    setOwnerGateChecked(true);
  }, []);

  const handleHandoffError = useCallback((err: any) => {
    if (handoffReconciledRef.current) return;
    handoffReconciledRef.current = true;
    console.warn("[OwnerGate] Handoff exchange failed:", err);
    setHandoffPending(false);
    setSubdomainOsActive(false);
    setOwnerGateChecked(true);
  }, []);

  useEffect(() => {
    if (!identity?.username) return;

    const handle = identity.username;
    const params = new URLSearchParams(window.location.search);

    // Dev-only fast path: explicit ?mode=os or ?enter=true query params skip the gate
    // check on localhost. NEVER skip on production domains — that would be a security
    // bypass allowing any visitor to access the private owner OS.
    const hostname = window.location.hostname;
    const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocalDev && (params.get("mode") === "os" || params.get("enter") === "true")) {
      setSubdomainOsActive(true);
      setOwnerGateChecked(true);
      return;
    }

    if (handoffPending) {
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
  }, [identity?.username, handoffPending]);

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

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const enterSubdomainOs = useCallback(() => {
    setIsLoginModalOpen(true);
  }, []);

  const handleLoginSuccess = useCallback((_token: string) => {
    setIsLoginModalOpen(false);
    setSubdomainOsActive(true);
  }, []);

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
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Handle gateway claim submission
  const handleGatewayClaim = useCallback(async (handle: string, email: string) => {
    setIsClaimLoading(true);
    setClaimError(null);
    setOnboardingHandle(handle);
    setOnboardingEmail(email);
    setOnboardingPhase('CLAIMING');

    try {
      const result = await claimHandle({ handle, email });

      if (result.success) {
        localStorage.setItem('active_youniverse_handle', handle);
        localStorage.setItem('youniverse_owner_email', email);
        if (result.subdomain) {
          localStorage.setItem('active_youniverse_subdomain', result.subdomain);
        }
        if (result.sessionToken) {
          localStorage.setItem('youniverse_session_token', result.sessionToken);
        }

        // Transition to portal animation then dialogue
        setOwnerRole('PROVISIONAL_OWNER');
        setOnboardingPhase('PORTAL_TRANSITION');
        playRandomWelcomeMessage();

        // Brief portal transition animation, then start dialogue
        setTimeout(() => {
          startOnboardingDialogue();
        }, 1500);
      } else if (result.error === 'payment_required') {
        // Email has already claimed a free Youniverse — redirect to Pay Screen
        setIsClaimLoading(false);
        window.location.href = `/?claim=${encodeURIComponent(handle)}&email=${encodeURIComponent(email)}`;
        return;
      } else {
        // Claim failed (taken, network error, etc.) — do NOT grant owner access.
        console.warn('[ONBOARDING] Claim failed:', result.error);
        if (result.error === 'taken' || result.error === 'username-taken') {
          setClaimError("That handle has already been claimed. Please choose another.");
        } else if (result.error === 'network_error') {
          setClaimError("We couldn\u2019t connect to the service. Please try again.");
        } else {
          setClaimError("We couldn\u2019t claim that handle. Please try again.");
        }
        // Reset gateway so user can try a different handle
        setOnboardingPhase('GATEWAY');
      }
    } catch (e) {
      // Claim threw unexpectedly — do NOT grant owner access on failure.
      console.error('[ONBOARDING] Unexpected claim error:', e);
      setClaimError("We couldn\u2019t connect to the service. Please try again.");
      setOnboardingPhase('GATEWAY');
    } finally {
      setIsClaimLoading(false);
    }
  }, [setOnboardingHandle, setOnboardingEmail, setOnboardingPhase, setOwnerRole, startOnboardingDialogue]);

  // Handle onboarding dialogue completion
  const handleOnboardingComplete = useCallback(() => {
    completeOnboardingDialogue();
  }, [completeOnboardingDialogue]);

  // Check for verification token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verify_token');
    if (!verifyToken) return;

    // Clean verify_token from URL while preserving other params and hash.
    const cleanUrl = () => {
      const cleaned = new URLSearchParams(window.location.search);
      cleaned.delete('verify_token');
      const qs = cleaned.toString();
      const newUrl =
        window.location.pathname +
        (qs ? `?${qs}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', newUrl);
    };

    import('./services/identityService')
      .then(({ verifyEmail }) => verifyEmail(verifyToken))
      .then((result) => {
        if (result.success) {
          if (result.sessionToken) {
            localStorage.setItem('youniverse_session_token', result.sessionToken);
            if (result.handle) {
              localStorage.setItem(`youniverse_os_active_${result.handle}`, 'true');
            }
          }
          upgradeToVerified();
          setSubdomainOsActive(true);
          setVerificationError(null);

          if (result.destinationUrl) {
            cleanUrl();
            window.location.href = result.destinationUrl;
            return;
          }
        } else {
          setVerificationError(
            "We couldn\u2019t verify your email. Verification is not complete. Please try again later."
          );
        }
        cleanUrl();
      })
      .catch(() => {
        setVerificationError(
          "We couldn\u2019t verify your email. Verification is not complete. Please try again later."
        );
        cleanUrl();
      });
  }, [upgradeToVerified]);

  // ────────────────────────────────────────────────────────────
  // ROUTING LOGIC
  // ────────────────────────────────────────────────────────────
  const isFoundingAngelsSuccess = currentPath === "/founding-angels/success";
  const isFoundingAngelsCancel =
    currentPath === "/founding-angels/cancel" ||
    (currentPath === "/founding-angels" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("canceled") === "true");
  const isFoundingAngelsOffer = currentPath === "/founding-angels" && !isFoundingAngelsCancel;

  const showClaimRoute = isClaimRoute;

  // On a Youniverse subdomain, hold rendering until the async owner-gate check
  // resolves so we never flash the public view while the fetch is in-flight.
  const gateStillPending = isYouniverseRoute && (!ownerGateChecked || handoffPending);
  const showPublicYouniverse = isYouniverseRoute && ownerGateChecked && !handoffPending && !subdomainOsActive;
  // First-Touch Onboarding overrides
  const showGateway =
    !isYouniverseRoute &&
    !isClaimRoute &&
    !subdomainOsActive &&
    (onboarding.phase === 'GATEWAY' ||
      onboarding.phase === 'HANDLE_ENTERED' ||
      onboarding.phase === 'CLAIMING');
  const showPortalTransition = onboarding.phase === 'PORTAL_TRANSITION';
  const showOnboardingDialogue = onboarding.phase === 'DIALOGUE';
  const showProvisionalDesktop = onboarding.phase === 'EXPLORING' || onboarding.phase === 'VERIFIED';
  const isProvisionalOwner = onboarding.ownerRole === 'PROVISIONAL_OWNER' && !onboarding.isVerified;

  return (
    <ClubRadioProvider>
    <AnimatePresence mode="sync">
      {/* Founding Angels dedicated routes */}
      {isFoundingAngelsSuccess ? (
        <FoundingAngelsSuccess
          key="fa-success"
          onNavigate={(path: string) => {
            window.history.pushState({}, "", path);
            setCurrentPath(path.split("?")[0].toLowerCase().replace(/\/+$/, "") || "/");
          }}
        />
      ) : isFoundingAngelsCancel ? (
        <FoundingAngelsCancel
          key="fa-cancel"
          onNavigate={(path: string) => {
            window.history.pushState({}, "", path);
            setCurrentPath(path.split("?")[0].toLowerCase().replace(/\/+$/, "") || "/");
          }}
        />
      ) : isFoundingAngelsOffer ? (
        <FoundingAngelsOffer
          key="fa-offer"
          onNavigate={(path: string) => {
            window.history.pushState({}, "", path);
            setCurrentPath(path.split("?")[0].toLowerCase().replace(/\/+$/, "") || "/");
          }}
        />
      ) : gateStillPending ? (
        <motion.div
          key="gate-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0 }}
          className="fixed inset-0 bg-black"
        />
      ) : showClaimRoute ? (
        <ClaimYouniverse key="claim" />
      ) : showPublicYouniverse ? (
        <PublicYouniverse key="youniverse" handle={identity?.username || ''} onOpenLoginModal={enterSubdomainOs} />
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
                  claimError={claimError}
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
      ) : showProvisionalDesktop ? (
        <PortalBackdrop key="provisional-success">
          <div className="absolute inset-0 flex flex-col items-center justify-center relative z-20">
            {isProvisionalOwner ? (
              <VerificationBanner
                email={onboarding.email}
                handle={onboarding.handle}
                isVerified={onboarding.isVerified}
                onDismiss={() => setOnboardingPhase('GATEWAY')}
              />
            ) : (
              <div className="text-emerald-400 font-mono mb-4 text-center mt-8">
                Email verified successfully!
              </div>
            )}
            <div className="text-center mt-16 font-mono text-zinc-400 text-sm">
              <p>Your Youniverse is initializing.</p>
              <button
                onClick={() => setOnboardingPhase('GATEWAY')}
                className="mt-4 px-4 py-2 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
              >
                Return to Gateway
              </button>
              {!isProvisionalOwner && onboarding.handle && (
                <a
                  href={`https://${onboarding.handle}.itsyouonline.com`}
                  className="block mt-4 text-cyan-400 hover:underline"
                >
                  Go to your Youniverse →
                </a>
              )}
            </div>
          </div>
        </PortalBackdrop>
      ) : subdomainOsActive ? (
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="fixed inset-0 overflow-hidden bg-black font-sans"
        >
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
      ) : null}
    </AnimatePresence>
      {/* Verification failure banner — rendered outside the routing AnimatePresence
          so it is visible regardless of current route. */}
      <AnimatePresence>
        {verificationError && (
          <motion.div
            key="verification-error"
            role="alert"
            initial={{ opacity: 0, y: -32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -32 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 px-4 py-2.5 bg-amber-950/90 border-b border-amber-500/20 backdrop-blur-md"
          >
            <span className="text-xs font-mono tracking-wide text-amber-200">
              {verificationError}
            </span>
            <button
              onClick={() => setVerificationError(null)}
              className="ml-2 p-1 rounded-md hover:bg-white/10 transition-colors text-amber-400/40 hover:text-amber-300"
              aria-label="Dismiss verification warning"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <OwnerLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        handle={identity?.username || ''}
        onLoginSuccess={handleLoginSuccess}
      />
      {showArrivalCeremony && identity?.username && (subdomainOsActive || handoffPending) && (
        <ArrivalCeremony
          handle={identity.username}
          onDismiss={() => setShowArrivalCeremony(false)}
          onVerified={handleVerifiedArrival}
          onError={handleHandoffError}
        />
      )}
      <Analytics />
      {!(isFoundingAngelsSuccess || isFoundingAngelsCancel || isFoundingAngelsOffer) && (
        <PwaInstallPrompt />
      )}
    </ClubRadioProvider>
  );
};

export default App;
