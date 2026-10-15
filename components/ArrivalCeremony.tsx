/**
 * @file ArrivalCeremony
 *
 * Full-screen moment that plays on first arrival in a personal Youniverse
 * after crossing the gate from @welcome. Reads arrival data from URL hash or localStorage.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  decodeArrival,
  STORAGE,
  type ArrivalPayload,
  FOUNDATION_LAWS,
} from "../lib/welcomeWorld";
import {
  resolveYouniverseConfiguration,
  type WorkspaceConfig,
  type FoundationLaw,
  type PersonalYouniverseSeed,
} from "../lib/foundationSynthesis";

interface ArrivalCeremonyProps {
  handle: string;
  onDismiss: () => void;
  onConfigResolved?: (config: WorkspaceConfig) => void;
}

export const ArrivalCeremony: React.FC<ArrivalCeremonyProps> = ({
  handle,
  onDismiss,
  onConfigResolved,
}) => {
  const [arrival, setArrival] = useState<ArrivalPayload | null>(null);
  const [resolvedConfig, setResolvedConfig] = useState<WorkspaceConfig | null>(null);

  useEffect(() => {
    // 1. Check for cryptographic #handoff_token=<jwt> in hash
    const hash = window.location.hash.replace(/^#/, "");
    const matchToken = hash.match(/(?:^|&)handoff_token=([^&]+)/);

    if (matchToken && matchToken[1]) {
      const token = decodeURIComponent(matchToken[1]);
      
      // Call serverless token verification endpoint
      fetch("/api/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.workspaceConfig) {
            setResolvedConfig(data.workspaceConfig);
            onConfigResolved?.(data.workspaceConfig);
            setArrival({
              handle: data.handle,
              laws: data.workspaceConfig.seed.laws.map((l: string) => l.toLowerCase()),
              hue: data.workspaceConfig.seed.energyHue,
              forgedAt: new Date().toISOString(),
            });
            localStorage.setItem(STORAGE.foundation(handle), JSON.stringify(data.workspaceConfig));
            localStorage.setItem(STORAGE.arrived(handle), "true");
          }
        })
        .catch((err) => {
          console.warn("[ArrivalCeremony] verify-token network error:", err);
        })
        .finally(() => {
          // Clean up hash immediately so token never lingers in browser address bar
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        });
      return;
    }

    // 2. Try URL hash legacy payload
    const fromHash = decodeArrival(window.location.hash);
    if (fromHash && fromHash.handle.toLowerCase() === handle.toLowerCase()) {
      setArrival(fromHash);
      
      // Capitalize/normalize laws for the synthesis engine
      const seedLaws = fromHash.laws.map(
        (l) => (l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()) as FoundationLaw
      );
      const seed: PersonalYouniverseSeed = {
        handle: fromHash.handle,
        energyHue: fromHash.hue,
        laws: seedLaws,
      };

      const workspaceConfig = resolveYouniverseConfiguration(seed);
      setResolvedConfig(workspaceConfig);
      onConfigResolved?.(workspaceConfig);

      // Persist to local storage
      localStorage.setItem(STORAGE.foundation(handle), JSON.stringify(workspaceConfig));
      localStorage.setItem(STORAGE.arrived(handle), "true");
      // Clean up hash without reloading
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    // 2. Check if configuration exists in localStorage
    const saved = localStorage.getItem(STORAGE.foundation(handle));
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.seed) {
          onConfigResolved?.(parsed);
        }
      } catch (e) {
        console.warn("Failed to parse stored foundation config", e);
      }
    }

    // 3. Otherwise first visit fallback
    const hasArrived = localStorage.getItem(STORAGE.arrived(handle));
    if (!hasArrived) {
      const fallbackPayload: ArrivalPayload = {
        handle,
        laws: ["minimal"],
        hue: 258,
        forgedAt: new Date().toISOString(),
      };
      setArrival(fallbackPayload);
      const seed: PersonalYouniverseSeed = {
        handle,
        energyHue: 258,
        laws: ["Minimal"],
      };
      const cfg = resolveYouniverseConfiguration(seed);
      setResolvedConfig(cfg);
      onConfigResolved?.(cfg);
      localStorage.setItem(STORAGE.foundation(handle), JSON.stringify(cfg));
      localStorage.setItem(STORAGE.arrived(handle), "true");
    }
  }, [handle, onConfigResolved]);

  if (!arrival) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="ww-arrival"
        style={{ ["--a-hue" as string]: arrival.hue }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 1.4 }}
        onClick={onDismiss}
      >
        <motion.span
          className="ww-arrival__k"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          threshold crossed
        </motion.span>

        <motion.h1
          className="ww-arrival__h"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          Welcome to @{arrival.handle}
        </motion.h1>

        <motion.p
          className="ww-arrival__p"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Built specifically for you. Connected to the network.
        </motion.p>

        {arrival.laws.length > 0 && (
          <motion.div
            className="ww-arrival__laws"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
          >
            {arrival.laws.map((lawId) => {
              const def = FOUNDATION_LAWS.find((l) => l.id.toLowerCase() === lawId.toLowerCase());
              return def ? (
                <span key={lawId}>
                  {def.glyph} {def.label}
                </span>
              ) : null;
            })}
          </motion.div>
        )}

        {resolvedConfig && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="mt-4 text-[11px] font-mono text-white/50 tracking-wider"
          >
            Synthesized: {resolvedConfig.primaryLaw} Layout ({resolvedConfig.layoutType}) · {resolvedConfig.activeTools.length} Primaries Active
          </motion.div>
        )}

        <span className="ww-arrival__foot">click anywhere to step inside</span>
      </motion.div>
    </AnimatePresence>
  );
};

export default ArrivalCeremony;
