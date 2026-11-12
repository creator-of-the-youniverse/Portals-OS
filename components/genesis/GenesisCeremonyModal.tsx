import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Sparkles, Loader2, ArrowRight } from "lucide-react";

export const GENESIS_CEREMONY_LINES = [
  "Before there were many, there was one.",
  "Welcome to The Youniverse.",
  "You are the First Person.",
  "Your Youniverse is Genesis 001.",
  "Your place in the history of The Youniverse is permanent.",
] as const;

export interface GenesisCeremonyModalProps {
  isOpen: boolean;
  handle: string;
  mode: "claim" | "replay";
  onAcknowledgeComplete: () => void;
  onCloseReplay: () => void;
}

export const GenesisCeremonyModal: React.FC<GenesisCeremonyModalProps> = ({
  isOpen,
  handle,
  mode,
  onAcknowledgeComplete,
  onCloseReplay,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (mode === "replay") {
      onCloseReplay();
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const token =
        localStorage.getItem("youniverse_session_token") ||
        localStorage.getItem("weaver_jwt");

      if (!token) {
        onAcknowledgeComplete();
        return;
      }

      const res = await fetch("/api/genesis/acknowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (res.ok || res.status === 404) {
        onAcknowledgeComplete();
        return;
      }

      setErrorMsg("Unable to record acknowledgment right now. Please try again.");
    } catch {
      setErrorMsg("Network error recording ceremony acknowledgment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/88 backdrop-blur-2xl">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="genesis-ceremony-title"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-xl rounded-[24px] border border-amber-300/35 bg-[#060810]/95 p-7 sm:p-10 text-center shadow-[0_32px_90px_rgba(0,0,0,0.9),0_0_60px_rgba(245,158,11,0.12)]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-300/60 to-transparent"
          />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400/12 border border-amber-300/35 text-amber-300 mb-5 shadow-[0_0_32px_rgba(245,158,11,0.25)]">
            <Crown className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400/10 border border-amber-300/30 text-amber-200 mb-4 ml-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase">
              GENESIS 001
            </span>
          </div>

          <h2
            id="genesis-ceremony-title"
            className="text-xl sm:text-2xl font-black tracking-[0.14em] uppercase text-white mb-2"
          >
            FIRST PERSON IN THE YOUNIVERSE
          </h2>
          {handle && (
            <p className="text-xs font-mono text-amber-200/75 mb-6">
              @{handle}.itsyouonline.com
            </p>
          )}

          <div className="space-y-3 my-6 py-5 border-y border-white/10">
            {GENESIS_CEREMONY_LINES.map((line, index) => (
              <motion.p
                key={line}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 * (index + 1), duration: 0.45 }}
                className={
                  index === 3
                    ? "text-base sm:text-lg font-bold text-amber-200 tracking-wide"
                    : "text-sm sm:text-base text-white/85 leading-relaxed"
                }
              >
                {line}
              </motion.p>
            ))}
          </div>

          {errorMsg && (
            <p className="text-xs font-mono text-rose-300 mb-4">{errorMsg}</p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl font-bold uppercase tracking-[0.08em] text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-linear-to-b from-amber-300 via-amber-400 to-amber-500 text-[#090704] border border-amber-200/70 shadow-[0_12px_30px_rgba(245,158,11,0.3)] hover:brightness-105 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Inscribing Record...</span>
              </>
            ) : (
              <>
                <span>
                  {mode === "replay" ? "Close Replay" : "Enter Sovereign Desktop"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {mode === "replay" && (
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/40 mt-3">
              Read-only ceremony replay · Historical record unchanged
            </p>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

