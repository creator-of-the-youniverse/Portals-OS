/**
 * @file SubdomainAvailability
 *
 * Real-time handle validation & availability indicator.
 * Shows format feedback inline below the @ line as the user types.
 */

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Loader2 } from "lucide-react";
import { isValidHandle, normalizeHandle } from "../../types/onboarding";
import { checkHandleAvailability, type AvailabilityStatus } from "../../services/identityService";

interface SubdomainAvailabilityProps {
  rawInput: string;
}

const SubdomainAvailability: React.FC<SubdomainAvailabilityProps> = ({ rawInput }) => {
  const [status, setStatus] = useState<AvailabilityStatus | "checking" | "idle">("idle");
  const [handle, setHandle] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = normalizeHandle(rawInput);
    setHandle(normalized);

    if (!normalized || normalized.length < 3) {
      setStatus("idle");
      return;
    }

    if (!isValidHandle(normalized)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const result = await checkHandleAvailability(normalized);
      setStatus(result.status);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawInput]);

  if (status === "idle" || !handle) return null;

  const configs = {
    checking: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      text: `${handle}.itsyouonline.com`,
      color: "text-white/40",
      borderColor: "border-white/10",
      bgColor: "bg-white/5",
    },
    available: {
      icon: <Check className="h-3 w-3" />,
      text: `${handle}.itsyouonline.com`,
      color: "text-emerald-400",
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-950/20",
      badge: "AVAILABLE",
    },
    taken: {
      icon: <X className="h-3 w-3" />,
      text: `${handle}.itsyouonline.com`,
      color: "text-red-400",
      borderColor: "border-red-500/30",
      bgColor: "bg-red-950/20",
      badge: "TAKEN",
    },
    invalid: {
      icon: <X className="h-3 w-3" />,
      text: "lowercase letters, numbers, and hyphens only",
      color: "text-amber-400",
      borderColor: "border-amber-500/20",
      bgColor: "bg-amber-950/10",
    },
    error: {
      icon: <Check className="h-3 w-3" />,
      text: `${handle}.itsyouonline.com`,
      color: "text-emerald-400",
      borderColor: "border-emerald-500/30",
      bgColor: "bg-emerald-950/20",
      badge: "AVAILABLE",
    },
  };

  const config = configs[status];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={`flex items-center justify-center gap-2 py-1.5 px-4 rounded-full ${config.borderColor} border ${config.bgColor} backdrop-blur-sm`}
      >
        <span className={config.color}>{config.icon}</span>
        <span className={`text-xs font-mono ${config.color} tracking-wide`}>
          {config.text}
        </span>
        {"badge" in config && config.badge && (
          <span className={`text-[9px] font-bold tracking-widest uppercase ${config.color} opacity-80`}>
            [{config.badge}]
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default SubdomainAvailability;
