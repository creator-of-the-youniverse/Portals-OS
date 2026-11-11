import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  Award,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Lock,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { PortalBackdrop } from "../PortalBackdrop";
import { OwnerLoginModal } from "../gateway/OwnerLoginModal";

interface FoundingAngelsSuccessProps {
  onNavigate?: (path: string) => void;
}

export const FoundingAngelsSuccess: React.FC<FoundingAngelsSuccessProps> = ({ onNavigate }) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pollCount, setPollCount] = useState<number>(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Status state
  const [status, setStatus] = useState<"loading" | "pending" | "fulfilled" | "not_found" | "error" | "unauthenticated">("loading");
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [grantedAt, setGrantedAt] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const isRequestInFlightRef = useRef<boolean>(false);

  const clearTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Parse session_id from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("session_id");
      setSessionId(sid);

      const token =
        localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt");
      setSessionToken(token);

      if (!token) {
        setStatus("unauthenticated");
        setLoading(false);
      }
    }
  }, []);

  // Poll or query status
  const checkStatus = async (tokenOverride?: string) => {
    if (isRequestInFlightRef.current) return;

    const token = tokenOverride || sessionToken;
    if (!token) {
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }

    if (!sessionId) {
      setStatus("not_found");
      setErrorMessage("No checkout session ID provided in the return URL.");
      setLoading(false);
      return;
    }

    isRequestInFlightRef.current = true;

    try {
      const res = await fetch(
        `/api/stripe/founding-angels-status?session_id=${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 401) {
        setStatus("unauthenticated");
        setErrorMessage("Your session has expired. Please sign in to view your membership.");
        setLoading(false);
        clearTimer();
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.status === "ok") {
        const orderData = data.data;

        if (orderData.status === "fulfilled" && orderData.memberNumber) {
          // Authoritative fulfillment confirmed!
          setStatus("fulfilled");
          setMemberNumber(orderData.memberNumber);
          setGrantedAt(orderData.grantedAt);
          if (data.handle) setHandle(data.handle);
          setLoading(false);
          clearTimer();
          return;
        }

        if (orderData.status === "pending") {
          setStatus("pending");
          pollCountRef.current += 1;
          const currentCount = pollCountRef.current;
          setPollCount(currentCount);

          const elapsed = Date.now() - startTimeRef.current;

          // Poll again in 2 seconds if within limits (max 15 attempts AND max 30s)
          if (currentCount < 15 && elapsed < 30000) {
            clearTimer();
            pollTimerRef.current = setTimeout(() => {
              checkStatus(token);
            }, 2000);
          } else {
            setLoading(false);
            setErrorMessage("Webhook fulfillment is still in progress. Your payment is received and your membership will activate shortly.");
            clearTimer();
          }
          return;
        }

        // Other status (refunded, expired, disputed)
        setStatus("error");
        setErrorMessage(`Order status: ${orderData.status}`);
        setLoading(false);
        clearTimer();
        return;
      }

      if (res.status === 404) {
        setStatus("not_found");
        setErrorMessage(data.message || "Order not found for this session.");
        setLoading(false);
        clearTimer();
        return;
      }

      setStatus("error");
      setErrorMessage(data.message || "Unable to confirm membership status.");
      setLoading(false);
      clearTimer();
    } catch (err: any) {
      console.error("[FoundingAngelsSuccess] Status query failed:", err);
      setStatus("error");
      setErrorMessage("Network error verifying status. Please retry.");
      setLoading(false);
      clearTimer();
    } finally {
      isRequestInFlightRef.current = false;
    }
  };

  useEffect(() => {
    clearTimer();
    pollCountRef.current = 0;
    startTimeRef.current = Date.now();
    setPollCount(0);

    if (sessionToken && sessionId) {
      checkStatus();
    }
    return () => {
      clearTimer();
    };
  }, [sessionToken, sessionId]);

  const handleLoginSuccess = (token: string) => {
    setSessionToken(token);
    setIsLoginModalOpen(false);
    setLoading(true);
    pollCountRef.current = 0;
    startTimeRef.current = Date.now();
    setPollCount(0);
    checkStatus(token);
  };

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const formattedMemberNumber = memberNumber
    ? `#${String(memberNumber).padStart(3, "0")}`
    : null;

  return (
    <PortalBackdrop>
      <div className="w-full max-w-xl mx-auto px-4 py-8 flex flex-col items-center z-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full bg-[#0a0d14]/90 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
        >
          {/* FULFILLED STATE: Authoritative Member Number Confirmed */}
          {status === "fulfilled" && (
            <div>
              <div className="inline-flex items-center justify-center p-4 mb-4 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                <Award className="w-10 h-10" />
              </div>

              <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase block mb-1">
                Fulfillment Confirmed
              </span>

              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight mb-2">
                Welcome, Founding Angel
              </h1>

              {/* Number Badge */}
              <div className="my-6 p-6 rounded-xl bg-white/[0.04] border border-amber-400/30 shadow-inner">
                <span className="text-[11px] font-mono uppercase tracking-widest text-white/50 block mb-1">
                  Permanent Sequential Member Number
                </span>
                <span className="text-4xl md:text-5xl font-mono font-black text-amber-300 tracking-wider">
                  {formattedMemberNumber}
                </span>
                <p className="text-xs text-white/60 mt-2">
                  Permanently allocated and bound to your sovereign identity.
                </p>
              </div>

              {grantedAt && (
                <p className="text-xs font-mono text-white/40 mb-6">
                  Granted: {new Date(grantedAt).toLocaleDateString()} at {new Date(grantedAt).toLocaleTimeString()}
                </p>
              )}

              <button
                onClick={() => {
                  if (handle) {
                    window.location.href = `https://${handle}.itsyouonline.com?entered=true`;
                  } else {
                    navigateTo("/?entered=true");
                  }
                }}
                className="w-full py-3.5 px-6 rounded-xl font-bold uppercase tracking-wider text-sm transition-all duration-300 flex items-center justify-center gap-2 bg-linear-to-r from-amber-400 to-amber-500 text-black hover:brightness-110 shadow-[0_0_25px_rgba(245,158,11,0.3)]"
              >
                <span>Enter Sovereign Operating System</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* PENDING STATE: Webhook / Fulfillment in flight */}
          {status === "pending" && (
            <div>
              <div className="inline-flex items-center justify-center p-4 mb-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <RefreshCw className="w-8 h-8 text-amber-300" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wide mb-2">
                {loading ? "Securing Your Membership Slot" : "Fulfillment In Progress"}
              </h2>
              <p className="text-sm text-white/70 mb-6 leading-relaxed">
                {loading
                  ? "Payment received. Your order is undergoing transaction-locked allocation to assign your sequential member number..."
                  : (errorMessage || "Payment received. Webhook confirmation is taking a moment longer than expected. Your membership is safe.")}
              </p>
              {loading ? (
                <div className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs font-mono text-white/50 flex items-center justify-between">
                  <span>Checking confirmation</span>
                  <span>Attempt {pollCount} of 15</span>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setLoading(true);
                      pollCountRef.current = 0;
                      startTimeRef.current = Date.now();
                      setPollCount(0);
                      checkStatus();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold uppercase tracking-wider text-xs bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check Again</span>
                  </button>
                  <button
                    onClick={() => navigateTo("/")}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold uppercase tracking-wider text-xs border border-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    Return Home
                  </button>
                </div>
              )}
            </div>
          )}

          {/* LOADING STATE: Initial fetch */}
          {status === "loading" && (
            <div className="py-8">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-4" />
              <p className="text-sm text-white/60 font-mono">
                Querying authoritative membership registry...
              </p>
            </div>
          )}

          {/* UNAUTHENTICATED STATE */}
          {status === "unauthenticated" && (
            <div>
              <div className="inline-flex items-center justify-center p-3 mb-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">
                Authentication Required
              </h2>
              <p className="text-xs text-white/60 mb-6">
                Please sign in to retrieve and display your confirmed Founding Angel member number.
              </p>
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full py-3 px-6 rounded-xl font-bold uppercase tracking-wider text-xs bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                Sign In to View Membership
              </button>
            </div>
          )}

          {/* NOT FOUND / ERROR STATE */}
          {(status === "not_found" || status === "error") && (
            <div>
              <div className="inline-flex items-center justify-center p-3 mb-4 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">
                Verification Note
              </h2>
              <p className="text-xs text-white/60 mb-6">
                {errorMessage || "Unable to confirm membership. Please verify your session ID or retry."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setLoading(true);
                    pollCountRef.current = 0;
                    startTimeRef.current = Date.now();
                    setPollCount(0);
                    checkStatus();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold uppercase tracking-wider text-xs bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Status Check</span>
                </button>
                <button
                  onClick={() => navigateTo("/founding-angels")}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold uppercase tracking-wider text-xs border border-white/10 text-white/70 hover:text-white transition-colors"
                >
                  Return to Offer
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Authentication Modal */}
        <OwnerLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          handle={handle || ""}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    </PortalBackdrop>
  );
};
