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
  ChevronRight,
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
      <div className="w-full h-full overflow-y-auto overflow-x-hidden overscroll-y-contain z-20 relative">
        {/* Soft atmospheric edge vignette preserving the luminous center portal */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_38%,rgba(4,6,12,0.18)_0%,rgba(4,6,12,0.62)_70%,rgba(3,4,9,0.88)_100%)]"
        />

        {/* Safe flexbox centering: my-auto collapses to 0 when content exceeds viewport so top/bottom never clip */}
        <div className="relative min-h-full w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-7 flex flex-col">
          <div className="my-auto w-full flex flex-col gap-4 sm:gap-5">
            {/* Top Utility Bar */}
            <header className="w-full flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => navigateTo("/")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#05070d]/75 border border-white/12 backdrop-blur-md text-[11px] font-mono text-white/75 hover:text-white hover:border-white/25 transition-colors uppercase tracking-[0.14em]"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                <span>Return to Youniverse</span>
              </button>

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#05070d]/80 border border-amber-300/25 backdrop-blur-md shadow-[0_6px_24px_rgba(0,0,0,0.55)]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.85)]" />
                <span className="text-[11px] font-mono font-semibold tracking-[0.14em] text-amber-200/95 uppercase">
                  Cohort Limit: 500 Members
                </span>
              </div>
            </header>

            {/* Hero Section — feathered dark scrim behind copy without a heavy rectangular border fighting the circular portal */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="relative mx-auto w-full max-w-2xl text-center px-3 py-3 sm:px-6 sm:py-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(5,7,14,0.82)_0%,rgba(5,7,14,0.55)_58%,transparent_100%)]"
            >
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1 mb-2.5 rounded-full bg-[#070a12]/80 border border-amber-300/30 backdrop-blur-md text-amber-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <Award className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span className="text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-[0.14em] sm:tracking-[0.2em] whitespace-nowrap">
                  Patronage · Editions 001–500
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.02em] uppercase bg-linear-to-b from-white via-white to-amber-100/85 bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] mb-2">
                Founding Angels
              </h1>

              <p className="text-xs sm:text-sm md:text-[15px] text-white/85 max-w-xl mx-auto leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                The permanent founding patrons of The Youniverse. A strictly bounded cohort of 500 members stewarding sovereign computing, private identity, and independent operating systems.
              </p>
            </motion.section>

            {/* Core Sovereign Offer Vault */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="relative w-full rounded-2xl sm:rounded-[22px] bg-[#060811]/82 border border-amber-200/20 backdrop-blur-2xl shadow-[0_28px_85px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.09)]"
            >
              {/* Clipped decorative metallic accents isolated from interactive content */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-2xl sm:rounded-[22px] overflow-hidden pointer-events-none"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-300/55 to-transparent" />
                <div className="absolute -top-24 -right-24 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-slate-300/5 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10 p-4 sm:p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-7 items-stretch">
                {/* Left Column (Desktop) / Second (Mobile): Founding Entitlements cleanly unified inside Vault */}
                <div className="order-2 lg:order-1 lg:col-span-7 min-w-0 flex flex-col justify-center lg:pr-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-amber-300/95">
                      Founding Entitlements
                    </span>
                  </div>

                  <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight mb-4 pb-3 border-b border-white/10">
                    What You Receive Today
                  </h2>

                  <ul className="space-y-3.5">
                    <li className="flex items-start gap-3 text-xs sm:text-sm text-white/85 leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/12 border border-emerald-400/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                      <span>
                        <strong className="text-white font-semibold">Permanent Numbered Recognition:</strong> Assigned a strictly sequential number (001–500) permanently recorded in the database catalog.
                      </span>
                    </li>
                    <li className="flex items-start gap-3 text-xs sm:text-sm text-white/85 leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/12 border border-emerald-400/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                      <span>
                        <strong className="text-white font-semibold">Claimed Youniverse Identity:</strong> Sovereign ownership of your personal handle and permanent subdomain access.
                      </span>
                    </li>
                    <li className="flex items-start gap-3 text-xs sm:text-sm text-white/85 leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/12 border border-emerald-400/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                      <span>
                        <strong className="text-white font-semibold">Working Portals OS Access:</strong> Unlocked sovereign operating system desktop, ONEAI companion, and private tools available immediately.
                      </span>
                    </li>
                    <li className="flex items-start gap-3 text-xs sm:text-sm text-white/85 leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/12 border border-emerald-400/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                      <span>
                        <strong className="text-white font-semibold">Founding Badge & Recognition:</strong> Permanent historical member number recorded in the public registry; active privileges maintained in good standing subject to dispute and refund terms.
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Right Column (Desktop) / First (Mobile): High-Ticket Allocation Pedestal */}
                <div className="order-1 lg:order-2 lg:col-span-5 min-w-0 rounded-xl sm:rounded-2xl bg-linear-to-b from-amber-300/[0.06] via-[#090d17]/90 to-[#05070d]/95 border border-amber-300/28 p-5 sm:p-6 flex flex-col justify-between text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_18px_45px_rgba(0,0,0,0.65)]">
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <span className="h-px flex-1 bg-linear-to-r from-transparent to-amber-300/35" />
                      <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-amber-200/85 whitespace-nowrap">
                        One-Time Lifetime Allocation
                      </span>
                      <span className="h-px flex-1 bg-linear-to-l from-transparent to-amber-300/35" />
                    </div>

                    <div className="flex items-baseline justify-center gap-2 my-2">
                      <span className="text-5xl sm:text-[54px] font-black tracking-tight tabular-nums bg-linear-to-b from-white via-amber-50 to-amber-200/90 bg-clip-text text-transparent">
                        $200
                      </span>
                      <span className="text-xs font-mono font-semibold tracking-[0.16em] text-amber-200/75 uppercase">
                        USD
                      </span>
                    </div>

                    <p className="text-xs text-white/75 leading-relaxed max-w-xs mx-auto mb-5">
                      Single payment. No subscriptions. No recurring fees. Permanent allocation limited to 500 members.
                    </p>
                  </div>

                  <div className="w-full">
                    {/* Error banner */}
                    <AnimatePresence>
                      {checkoutError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="w-full mb-4 p-3 rounded-xl bg-rose-500/12 border border-rose-500/25 text-rose-200 text-xs text-left flex items-start gap-2"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                          <span>{checkoutError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Purchase CTA Button — sized & tracked to avoid multi-line wrap or cutoff across mobile/desktop */}
                    <button
                      type="button"
                      onClick={handleInitiateCheckout}
                      disabled={isLoadingCheckout}
                      data-testid="founding-angels-cta"
                      className="w-full min-h-[50px] px-3.5 sm:px-5 py-3 rounded-xl font-bold uppercase tracking-[0.04em] sm:tracking-[0.06em] text-[12px] sm:text-[13px] whitespace-nowrap transition-all duration-300 flex items-center justify-center gap-2 bg-linear-to-b from-amber-300 via-amber-400 to-amber-500 text-[#090704] border border-amber-200/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_30px_rgba(245,158,11,0.3)] hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_16px_36px_rgba(245,158,11,0.42)] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isLoadingCheckout ? (
                        <>
                          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                          <span>Securing Slot...</span>
                        </>
                      ) : sessionToken ? (
                        <>
                          <span>Claim Founding Membership</span>
                          <ArrowRight className="w-4 h-4 shrink-0" />
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 shrink-0" />
                          <span>Sign In to Claim — $200</span>
                        </>
                      )}
                    </button>

                    {/* Identity status & Stripe verification row */}
                    <div className="mt-3.5 pt-3 border-t border-white/[0.08] flex flex-col items-center gap-1.5">
                      <p className="text-[11px] font-mono text-white/65 flex items-center justify-center gap-1.5">
                        {sessionToken ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {handle ? (
                              <span>Authenticated as @{handle}</span>
                            ) : (
                              <span>Authenticated session active</span>
                            )}
                          </>
                        ) : (
                          <span>Authentication required prior to checkout</span>
                        )}
                      </p>
                      <p className="text-[10px] font-mono uppercase tracking-[0.12em] sm:tracking-[0.14em] text-white/45 flex items-center justify-center gap-1.5">
                        <ShieldCheck className="w-3 h-3 shrink-0 text-amber-300/80" />
                        <span>Stripe Checkout · Sequential Slot Lock</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Disclosures / Terms — Smoked Obsidian Glass over Portal Glow */}
            <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              <div className="p-4 sm:p-5 rounded-xl bg-[#05070e]/82 border border-white/12 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.75)]">
                <div className="w-8 h-px bg-amber-300/55 mb-2.5" />
                <h4 className="font-semibold text-white/95 tracking-wide mb-1.5">Not An Investment</h4>
                <p className="text-white/75 leading-relaxed">
                  This is a membership patronage for software and identity access. It conveys no equity, ownership interest, dividend, or financial return.
                </p>
              </div>
              <div className="p-4 sm:p-5 rounded-xl bg-[#05070e]/82 border border-white/12 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.75)]">
                <div className="w-8 h-px bg-amber-300/55 mb-2.5" />
                <h4 className="font-semibold text-white/95 tracking-wide mb-1.5">Strict 500 Cap</h4>
                <p className="text-white/75 leading-relaxed">
                  The membership database enforces a strict kernel-level limit of 500 members under transaction locking. No further members will be minted.
                </p>
              </div>
              <div className="p-4 sm:p-5 rounded-xl bg-[#05070e]/82 border border-white/12 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.75)]">
                <div className="w-8 h-px bg-amber-300/55 mb-2.5" />
                <h4 className="font-semibold text-white/95 tracking-wide mb-1.5">Creator Circle Separate</h4>
                <p className="text-white/75 leading-relaxed">
                  Creator Circle is a separate deferred tier ($100 / cap 100) not bundled into this offer. Only verified existing features are included.
                </p>
              </div>
            </section>
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
