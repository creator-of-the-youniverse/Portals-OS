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
import { ensureBigBangStorageEpoch } from "./lib/storageEpoch";
import { GenesisBadge, GenesisCeremonyModal, GenesisRegistryModal, GenesisRegistryPage } from "./components/genesis";

const App: React.FC = () => {
  const windows = useKernel((state) => state.windows);
  const { identity } = useYouniverse();
  const isYouniverseRoute = identity?.kind === "identity";
  const projectFolders = useKernel((state) => state.projectFolders);
  const weavedWidgets = useKernel((state) => state.weavedWidgets);

  const isClaimRoute = identity?.kind === "claim";
  const serverEntitlements = useKernel((state) => state.serverEntitlements);
  const hydrateServerEntitlements = useKernel((state) => state.hydrateServerEntitlements);
  const markGenesisCeremonySeen = useKernel((state) => state.markGenesisCeremonySeen);
  const isGenesisReplayOpen = useKernel((state) => state.isGenesisReplayOpen);
  const setGenesisReplayOpen = useKernel((state) => state.setGenesisReplayOpen);
  const isGenesisRegistryOpen = useKernel((state) => state.isGenesisRegistryOpen);
  const setGenesisRegistryOpen = useKernel((state) => state.setGenesisRegistryOpen);

  // Subdomain Portals OS active state.
  // Determined by a server-verified ownership check — NOT a client-side flag.
  const [subdomainOsActive, setSubdomainOsActive] = useState<boolean>(false);
  const [ownerGateChecked, setOwnerGateChecked] = useState<boolean>(false);
  const [ownedYouniverses, setOwnedYouniverses] = useState<
    Array<{
      identityId: string;
      handle: string;
      subdomain: string;
      displayName: string;
      plan: string;
      claimSource: string;
    }>
  >([]);
  const [isSwitchingYouniverse, setIsSwitchingYouniverse] = useState<boolean>(false);
  const [ownerHasPassword, setOwnerHasPassword] = useState<boolean | null>(null);
  const [ownerLoginInitialMode, setOwnerLoginInitialMode] = useState<'password' | 'passkey' | 'recover' | 'enroll' | undefined>(undefined);
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const p = window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (p !== "/reset-password") return "";
    return (new URLSearchParams(window.location.search).get("token") || "").trim();
  });
  const [showArrivalCeremony, setShowArrivalCeremony] = useState<boolean>(true);
  const [handoffPending, setHandoffPending] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return /(?:^|#|&)handoff_token=/.test(window.location.hash);
  });
  const handoffReconciledRef = useRef<boolean>(false);

  useEffect(() => {
    ensureBigBangStorageEpoch();
  }, []);

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

  const handleVerifiedArrival = useCallback(
    (_sessionToken: string, _workspaceConfig?: any, entitlements?: any) => {
      if (handoffReconciledRef.current) return;
      handoffReconciledRef.current = true;
      setHandoffPending(false);
      setSubdomainOsActive(true);
      setOwnerGateChecked(true);
      if (entitlements) {
        hydrateServerEntitlements(entitlements);
      }
    },
    [hydrateServerEntitlements]
  );

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
    // Attempt to verify ownership via Bearer token or HttpOnly session cookie.
    // If the user is not the owner, fall through to the Public Youniverse view.
    const verifyOwnership = async () => {
      const token =
        localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt");

      try {
        const res = await fetch(`/api/youniverse/${encodeURIComponent(handle)}/context`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          // 401 / 403 / 404 — not owner or token is stale.
          if (res.status === 401) {
            localStorage.removeItem("youniverse_session_token");
            localStorage.removeItem("weaver_jwt");
            localStorage.removeItem(`youniverse_os_active_${handle}`);
          }
          setSubdomainOsActive(false);
          setOwnedYouniverses([]);
          setOwnerHasPassword(null);
          setOwnerGateChecked(true);
          return;
        }

        const data = await res.json();

        if (data.success && data.isOwner === true) {
          setSubdomainOsActive(true);
          setOwnerHasPassword(typeof data.hasPassword === "boolean" ? data.hasPassword : null);
          hydrateServerEntitlements(data.entitlements ?? null);
          setOwnedYouniverses(
            Array.isArray(data.ownedYouniverses) ? data.ownedYouniverses : []
          );
          // Cache confirmation so the gate only hits the server once per session.
          localStorage.setItem(`youniverse_os_active_${handle}`, "true");
        } else {
          // Valid token but different owner — show public view.
          setSubdomainOsActive(false);
          setOwnedYouniverses([]);
          setOwnerHasPassword(null);
          hydrateServerEntitlements(null);
          localStorage.removeItem(`youniverse_os_active_${handle}`);
        }
      } catch (_err) {
        // Network failure — fail safe: show public view.
        console.warn("[OwnerGate] Network error, defaulting to public view.");
        setSubdomainOsActive(false);
        setOwnedYouniverses([]);
        setOwnerHasPassword(null);
      } finally {
        setOwnerGateChecked(true);
      }
    };

    verifyOwnership();
  }, [identity?.username, handoffPending]);

  // Load custom sovereign widgets from NotNotes when OS boots
  useEffect(() => {
    const activeHandle = identity?.username;
    if (subdomainOsActive && activeHandle) {
      useKernel.getState().setWeavedWidgets([]);
      const fetchWidgets = async () => {
        try {
          const token = localStorage.getItem("youniverse_session_token") || localStorage.getItem("weaver_jwt");
          const widgetHeaders: Record<string, string> = {
            "X-Youniverse-Handle": activeHandle,
          };
          if (token) {
            widgetHeaders.Authorization = `Bearer ${token}`;
          }
          const response = await fetch("/api/not-notes/widgets", {
            credentials: "same-origin",
            headers: widgetHeaders,
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
  }, [subdomainOsActive, identity?.username]);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const enterSubdomainOs = useCallback(async () => {
    const activeHandle = identity?.username;
    if (!activeHandle) {
      setOwnerLoginInitialMode(undefined);
      setIsLoginModalOpen(true);
      return;
    }

    const token =
      localStorage.getItem("youniverse_session_token") ||
      localStorage.getItem("weaver_jwt");

    try {
      const res = await fetch(`/api/youniverse/${encodeURIComponent(activeHandle)}/context`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (res.ok && data?.success && data.isOwner === true) {
        setIsLoginModalOpen(false);
        setSubdomainOsActive(true);
        setOwnerGateChecked(true);
        setOwnerHasPassword(typeof data.hasPassword === "boolean" ? data.hasPassword : null);
        hydrateServerEntitlements(data.entitlements ?? null);
        setOwnedYouniverses(
          Array.isArray(data.ownedYouniverses) ? data.ownedYouniverses : []
        );
        return;
      }
    } catch {
      // Fail closed to login prompt on network error
    }

    setSubdomainOsActive(false);
    setOwnedYouniverses([]);
    setOwnerHasPassword(null);
    hydrateServerEntitlements(null);
    setOwnerLoginInitialMode(undefined);
    setIsLoginModalOpen(true);
  }, [hydrateServerEntitlements, identity?.username]);

  const handleLoginSuccess = useCallback(
    async (token: string) => {
      if (!identity?.username) {
        setIsLoginModalOpen(false);
        return;
      }
      try {
        const res = await fetch(`/api/youniverse/${encodeURIComponent(identity.username)}/context`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (res.ok && data?.success && data.isOwner === true) {
          setIsLoginModalOpen(false);
          setSubdomainOsActive(true);
          setOwnerGateChecked(true);
          setOwnerHasPassword(typeof data.hasPassword === "boolean" ? data.hasPassword : null);
          if (data.entitlements) {
            hydrateServerEntitlements(data.entitlements);
          }
          if (Array.isArray(data.ownedYouniverses)) {
            setOwnedYouniverses(data.ownedYouniverses);
          }
          return;
        }
      } catch {
        // Fail closed on network error
      }
      setSubdomainOsActive(false);
      setOwnedYouniverses([]);
      setOwnerHasPassword(null);
    },
    [hydrateServerEntitlements, identity?.username]
  );

  const handleSwitchYouniverse = useCallback(
    async (targetHandle: string) => {
      if (!targetHandle || targetHandle === identity?.username || isSwitchingYouniverse) {
        return;
      }
      setIsSwitchingYouniverse(true);
      try {
        const token =
          localStorage.getItem("youniverse_session_token") ||
          localStorage.getItem("weaver_jwt");
        const res = await fetch(
          `/api/youniverse/${encodeURIComponent(targetHandle)}/context?handoff=1`,
          {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.isOwner && data.destinationUrl) {
          window.location.href = data.destinationUrl;
        }
      } catch (err) {
        console.warn("[OwnerGate] Failed to switch Youniverse:", err);
      } finally {
        setIsSwitchingYouniverse(false);
      }
    },
    [identity?.username, isSwitchingYouniverse]
  );

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

        if (result.destinationUrl) {
          window.location.href = result.destinationUrl;
          return;
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
        } else if (result.error === 'creator_authorization_denied' || result.error === 'creator_privilege_environment_blocked') {
          setClaimError("Creator authorization could not be verified for this request.");
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
  const isGenesisRegistryRoute = currentPath === "/genesis";
  const isResetPasswordRoute = currentPath === "/reset-password";
  useEffect(() => {
    if (!isResetPasswordRoute || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tok = (params.get("token") || "").trim();
    if (tok) {
      setResetTokenFromUrl(tok);
      window.history.replaceState(null, "", "/reset-password");
    }
  }, [isResetPasswordRoute]);

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTokenFromUrl) {
      setResetError("Missing reset token. Please request a new password reset link.");
      return;
    }
    setResetSubmitting(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetTokenFromUrl, newPassword: resetNewPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setResetSuccess(data.message || "Password reset successfully. You may now sign in.");
        setResetNewPassword("");
      } else {
        setResetError(data?.message || "Unable to reset password. Request a fresh link.");
      }
    } catch {
      setResetError("Could not reach password reset service. Please try again.");
    } finally {
      setResetSubmitting(false);
    }
  };

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
        ) : isGenesisRegistryRoute ? (
          <GenesisRegistryPage
            key="genesis-registry"
            onNavigate={(path: string) => {
              window.history.pushState({}, "", path);
              setCurrentPath(path.split("?")[0].toLowerCase().replace(/\/+$/, "") || "/");
            }}
          />
        ) : isResetPasswordRoute ? (
          <PortalBackdrop key="reset-password">
            <div className="relative z-20 w-full max-w-md mx-auto bg-zinc-900/90 border border-zinc-700/60 rounded-2xl p-6 text-zinc-100 font-mono backdrop-blur-xl shadow-2xl">
              <h1 className="text-lg font-semibold text-white mb-2">Reset Password</h1>
              <p className="text-xs text-zinc-400 mb-5">
                Set a new password for your human continuity identity. All prior sessions will be revoked.
              </p>
              {resetError && (
                <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs">
                  {resetError}
                </div>
              )}
              {resetSuccess ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                    {resetSuccess}
                  </div>
                  <a
                    href="/"
                    className="block w-full text-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg"
                  >
                    Return to Gateway
                  </a>
                </div>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="Min 10 chars, upper + lower + number"
                      required
                      className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 rounded-lg text-sm text-zinc-100 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetSubmitting || !resetTokenFromUrl}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-lg"
                  >
                    {resetSubmitting ? "Updating Password..." : "Update Password"}
                  </button>
                </form>
              )}
            </div>
          </PortalBackdrop>
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
                {ownedYouniverses.length > 1 && (
                  <select
                    aria-label="Switch owned Youniverse"
                    value={identity?.username || ""}
                    disabled={isSwitchingYouniverse}
                    onChange={(e) => handleSwitchYouniverse(e.target.value)}
                    className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono text-cyan-200 border border-white/15 focus:outline-none hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    {ownedYouniverses.map((owned) => (
                      <option key={owned.identityId} value={owned.handle} className="bg-zinc-900 text-white">
                        @{owned.handle}
                      </option>
                    ))}
                  </select>
                )}
                {serverEntitlements?.genesis?.isWinner && (
                  <GenesisBadge
                    variant="pill"
                    onClick={() => setGenesisRegistryOpen(true)}
                    className="py-0.5 px-2.5 text-[10px]"
                  />
                )}
                {ownerHasPassword === false && (
                  <button
                    onClick={() => {
                      setOwnerLoginInitialMode("enroll");
                      setIsLoginModalOpen(true);
                    }}
                    className="ml-1 rounded-md bg-indigo-500/25 border border-indigo-400/40 px-2 py-0.5 text-[10px] text-indigo-200 hover:bg-indigo-500/40 transition-colors"
                    title="Establish a permanent password for your Human Continuity identity"
                  >
                    Set Password
                  </button>
                )}
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
        onClose={() => {
          setIsLoginModalOpen(false);
          setOwnerLoginInitialMode(undefined);
        }}
        handle={identity?.username || ''}
        onLoginSuccess={handleLoginSuccess}
        initialMode={ownerLoginInitialMode}
      />
      {showArrivalCeremony && identity?.username && (subdomainOsActive || handoffPending) && (
        <ArrivalCeremony
          handle={identity.username}
          onDismiss={() => {
            setShowArrivalCeremony(false);
            if (subdomainOsActive && identity?.username && ownerHasPassword === null) {
              const token = localStorage.getItem("youniverse_session_token") || localStorage.getItem("weaver_jwt");
              fetch(`/api/youniverse/${encodeURIComponent(identity.username)}/context`, {
                credentials: "include",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                  if (d?.success && d?.isOwner) {
                    setOwnerHasPassword(typeof d.hasPassword === "boolean" ? d.hasPassword : false);
                    if (Array.isArray(d.ownedYouniverses)) setOwnedYouniverses(d.ownedYouniverses);
                  }
                })
                .catch(() => { });
            }
          }}
          onVerified={handleVerifiedArrival}
          onError={handleHandoffError}
        />
      )}
      {subdomainOsActive &&
        serverEntitlements?.genesis?.isWinner &&
        !showArrivalCeremony &&
        (serverEntitlements.genesis.ceremonyPending || isGenesisReplayOpen) && (
          <GenesisCeremonyModal
            isOpen={true}
            handle={identity?.username || ""}
            mode={isGenesisReplayOpen && !serverEntitlements.genesis.ceremonyPending ? "replay" : "claim"}
            onAcknowledgeComplete={() => {
              markGenesisCeremonySeen();
              setGenesisReplayOpen(false);
            }}
            onCloseReplay={() => setGenesisReplayOpen(false)}
          />
        )}
      <GenesisRegistryModal
        isOpen={isGenesisRegistryOpen}
        onClose={() => setGenesisRegistryOpen(false)}
      />
      <Analytics />
      {!(isFoundingAngelsSuccess || isFoundingAngelsCancel || isFoundingAngelsOffer || isGenesisRegistryRoute) && (
        <PwaInstallPrompt />
      )}
    </ClubRadioProvider>
  );
};

export default App;
