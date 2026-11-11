import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  Award,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  ExternalLink,
  ChevronRight,
  Users,
} from "lucide-react";
import { PortalBackdrop } from "../PortalBackdrop";
import { OwnerLoginModal } from "../gateway/OwnerLoginModal";

interface FoundingAngelsOfferProps {
  onNavigate?: (path: string) => void;
}

export const FoundingAngelsOffer: React.FC<FoundingAngelsOfferProps> = ({ onNavigate }) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Check authentication on mount
  useEffect(() => {
    const token =
      localStorage.getItem("youniverse_session_token") ||
      localStorage.getItem("weaver_jwt");
    if (token) {
      setSessionToken(token);
      // Attempt to retrieve cached handle if available
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("youniverse_os_active_")) {
          setHandle(key.replace("youniverse_os_active_", ""));
          break;
        }
      }
    }
  }, []);

  const handleLoginSuccess = (token: string) => {
    setSessionToken(token);
    setIsLoginModalOpen(false);
    setCheckoutError(null);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("youniverse_os_active_")) {
        setHandle(key.replace("youniverse_os_active_", ""));
        break;
      }
    }
  };

  const handleInitiateCheckout = async () => {
    if (!sessionToken) {
      setIsLoginModalOpen(true);
      return;
    }

    if (isLoadingCheckout) return; // Prevent double-clicks

    setIsLoadingCheckout(true);
    setCheckoutError(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "https://itsyouonline.com";
    const returnUrl = `${origin}/founding-angels`;

    try {
      const res = await fetch("/api/stripe/founding-angels-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ returnUrl }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.url) {
        // Redirect directly to Stripe Checkout
        window.location.href = data.url;
        return;
      }

      if (res.status === 409 || data.status === "sold-out") {
        setCheckoutError("All 500 Founding Angel memberships have been claimed.");
      } else if (res.status === 401) {
        setSessionToken(null);
        setCheckoutError("Your session has expired. Please sign in again to continue.");
        setIsLoginModalOpen(true);
      } else if (res.status === 403) {
        setCheckoutError("Email verification is required before joining Founding Angels. Please check your verification link.");
      } else {
        setCheckoutError(data.message || "Failed to initiate checkout. Please try again.");
      }
    } catch (err: any) {
      console.error("[FoundingAngelsOffer] Checkout error:", err);
      setCheckoutError("Network error connecting to payment gateway. Please check your connection and retry.");
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <PortalBackdrop>
      <div className="w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col items-center z-20 overflow-y-auto max-h-screen">
        {/* Navigation / Brand Tag */}
        <div className="w-full flex items-center justify-between mb-8">
          <button
            onClick={() => navigateTo("/")}
            className="flex items-center gap-2 text-xs font-mono text-white/50 hover:text-white transition-colors uppercase tracking-widest"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>Return to Youniverse</span>
          </button>
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[11px] font-mono font-bold tracking-wider text-amber-300 uppercase">
              Cohort Limit: 500 Members
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <Award className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight uppercase mb-3">
            Founding Angels
          </h1>
          <p className="text-sm md:text-base text-white/70 max-w-2xl mx-auto leading-relaxed">
            The permanent founding patrons of The Youniverse. A strictly bounded cohort of 500 members stewarding sovereign computing, private identity, and independent operating systems.
          </p>
        </motion.div>

        {/* Core Offer Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full bg-[#0a0d14]/80 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden mb-8"
        >
          {/* Subtle gold halo */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Left: What You Receive Today */}
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400 mb-2 block">
                Founding Entitlements
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4">
                What You Receive Today
              </h2>
              <ul className="space-y-3.5">
                <li className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Permanent Numbered Recognition:</strong> Assigned a strictly sequential number (001–500) permanently recorded in the database catalog.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Claimed Youniverse Identity:</strong> Sovereign ownership of your personal handle and permanent subdomain access.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Working Portals OS Access:</strong> Unlocked sovereign operating system desktop, ONEAI companion, and private tools available immediately.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Founding Badge & Recognition:</strong> Permanent historical member number recorded in the public registry; active privileges maintained in good standing subject to dispute and refund terms.
                  </span>
                </li>
              </ul>
            </div>

            {/* Right: Pricing & Purchase Action */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center text-center">
              <span className="text-[11px] font-mono uppercase tracking-widest text-white/50 mb-1">
                One-Time Lifetime Allocation
              </span>
              <div className="flex items-baseline gap-1 my-3">
                <span className="text-4xl md:text-5xl font-black text-white">$200</span>
                <span className="text-sm font-mono text-white/50 uppercase">USD</span>
              </div>
              <p className="text-xs text-white/60 mb-6">
                Single payment. No subscriptions. No recurring fees. Permanent allocation limited to 500 members.
              </p>

              {/* Error banner */}
              <AnimatePresence>
                {checkoutError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="w-full mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-left flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{checkoutError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Purchase Button */}
              <button
                onClick={handleInitiateCheckout}
                disabled={isLoadingCheckout}
                className="w-full py-3.5 px-6 rounded-xl font-bold uppercase tracking-wider text-sm transition-all duration-300 flex items-center justify-center gap-2 bg-linear-to-r from-amber-400 to-amber-500 text-black hover:brightness-110 shadow-[0_0_25px_rgba(245,158,11,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingCheckout ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Securing Slot...</span>
                  </>
                ) : sessionToken ? (
                  <>
                    <span>Claim Founding Membership</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In to Claim — $200</span>
                  </>
                )}
              </button>

              {/* Identity status note */}
              <p className="text-[11px] text-white/40 mt-3 font-mono">
                {sessionToken ? (
                  handle ? (
                    <span>Authenticated as @{handle}</span>
                  ) : (
                    <span>Authenticated session active</span>
                  )
                ) : (
                  <span>Authentication required prior to checkout</span>
                )}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Strict Honesty & Terms Banner */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-white/60 mb-8">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <h4 className="font-bold text-white/90 mb-1">Not An Investment</h4>
            <p>This is a membership patronage for software and identity access. It conveys no equity, ownership interest, dividend, or financial return.</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <h4 className="font-bold text-white/90 mb-1">Strict 500 Cap</h4>
            <p>The membership database enforces a strict kernel-level limit of 500 members under transaction locking. No further members will be minted.</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <h4 className="font-bold text-white/90 mb-1">Creator Circle Separate</h4>
            <p>Creator Circle is a separate deferred tier ($100 / cap 100) not bundled into this offer. Only verified existing features are included.</p>
          </div>
        </div>

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
