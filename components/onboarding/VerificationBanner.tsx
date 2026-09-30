/**
 * @file VerificationBanner
 *
 * Sticky minimal banner at the top of the workspace:
 * "Confirm email to unlock Nexus"
 *
 * Shows when the user is in PROVISIONAL_OWNER mode.
 * Disappears after verification.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Shield, X, ExternalLink } from "lucide-react";

interface VerificationBannerProps {
  email: string;
  handle: string;
  isVerified: boolean;
  onDismiss?: () => void;
}

const VerificationBanner: React.FC<VerificationBannerProps> = ({
  email,
  handle,
  isVerified,
  onDismiss,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (isVerified || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -32 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 px-4 py-2 bg-amber-950/80 border-b border-amber-500/20 backdrop-blur-md"
      >
        <div className="flex items-center gap-2 text-amber-200">
          <Mail className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-mono tracking-wide">
            To unlock full write authority — deploying Nexus agents and committing permanent records —
          </span>
        </div>

        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-mono font-bold tracking-wide hover:bg-amber-500/20 hover:border-amber-500/40 transition-all"
        >
          <Shield className="h-3 w-3" />
          click the confirmation link
          <ExternalLink className="h-2.5 w-2.5 opacity-50" />
        </a>

        <span className="text-xs text-amber-400/50 font-mono">
          sent to {email}
        </span>

        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className="ml-2 p-1 rounded-md hover:bg-white/10 transition-colors text-amber-400/40 hover:text-amber-300"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default VerificationBanner;
