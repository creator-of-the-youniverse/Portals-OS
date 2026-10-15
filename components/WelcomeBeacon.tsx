/**
 * @file WelcomeBeacon
 *
 * Ambient hearth link connecting personal subdomains (@<handle>.itsyouonline.com)
 * back to @welcome.itsyouonline.com.
 *
 * Architecture:
 *   - Tier 1: 24x24px passive breathing glow (no audio, no badge counts, zero focus disruption)
 *   - Tier 2: Hover/click inspection overlay (recent network updates, milestone, return button)
 *   - Peripheral States: Idle (8s breathe), Warm (milestone surge), Broadcast (orbiting ring), Amber (halo)
 *   - SSE Streaming: Listens to /api/beacon/stream with graceful fallback
 *   - Law Filters:
 *       • "Quiet": Disables real-time visual pulses entirely; content updates on click only.
 *       • "Minimal": Hides beacon from floating dock (available via Cmd+K).
 */

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { welcomeUrl } from "../lib/welcomeWorld";
import { Sparkles, Globe, Radio, ArrowUpRight, Flame, X } from "lucide-react";

export interface GlobalBeaconEvent {
  type: "PULSE" | "BROADCAST" | "MILESTONE" | "STATUS";
  title: string;
  energyHue?: number;
  timestamp?: string;
}

interface WelcomeBeaconProps {
  variant?: "floating" | "inline" | "icon";
  className?: string;
  foundationLaws?: string[];
  hidden?: boolean;
}

export const WelcomeBeacon: React.FC<WelcomeBeaconProps> = ({
  variant = "floating",
  className = "",
  foundationLaws = [],
  hidden = false,
}) => {
  const [pulseState, setPulseState] = useState<"idle" | "warm" | "broadcast" | "amber">("idle");
  const [latestEvent, setLatestEvent] = useState<GlobalBeaconEvent | null>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<{ presence: number; sparkedToday: number } | null>(null);

  const isQuiet = foundationLaws.some((l) => l.toLowerCase() === "quiet");
  const isMinimal = foundationLaws.some((l) => l.toLowerCase() === "minimal");

  // Respect user focus: Minimal hides from viewport
  if (hidden || (isMinimal && variant === "floating")) {
    return null;
  }

  // SSE Stream Listener
  useEffect(() => {
    // If Quiet law is active, skip real-time streaming pulses entirely
    if (isQuiet) return;

    let eventSource: EventSource | null = null;

    try {
      // Connect to local/subdomain SSE endpoint
      eventSource = new EventSource("/api/beacon/stream");

      eventSource.addEventListener("global_event", (e: MessageEvent) => {
        try {
          const data: GlobalBeaconEvent = JSON.parse(e.data);
          setLatestEvent(data);

          // Subtle peripheral shift without focus interruption
          if (data.type === "BROADCAST") {
            setPulseState("broadcast");
          } else if (data.type === "MILESTONE") {
            setPulseState("warm");
          } else if (data.type === "STATUS") {
            setPulseState("amber");
          }

          // Automatically return to calm idle after 4 seconds
          setTimeout(() => {
            setPulseState("idle");
          }, 4000);
        } catch (err) {
          console.warn("[WelcomeBeacon] SSE parsing notice", err);
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
      };
    } catch (err) {
      console.warn("[WelcomeBeacon] SSE connection fallback", err);
    }

    return () => {
      eventSource?.close();
    };
  }, [isQuiet]);

  // Load latest presence & season upon Tier 2 expansion
  useEffect(() => {
    if (!isOverlayOpen) return;

    fetch("/api/welcome/pulse")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "ok") {
          setLiveStats({
            presence: data.presence ?? 1,
            sparkedToday: data.sparkedToday ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [isOverlayOpen]);

  const url = welcomeUrl();

  return (
    <div className={`relative ${variant === "floating" ? "fixed bottom-5 left-5 z-50" : "inline-block"}`}>
      {/* ── Tier 1: Ambient Passive Hearth ── */}
      <button
        id="welcome-hearth-beacon"
        type="button"
        onClick={() => setIsOverlayOpen(!isOverlayOpen)}
        className={`ww-beacon ww-beacon--${variant} state-${pulseState} ${className} cursor-pointer group select-none`}
        title={latestEvent?.title || "@welcome hearth (The Living Room of the Network)"}
        aria-label="Toggle @welcome ambient hearth overlay"
      >
        <span className="ww-beacon__flame relative" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C10.5 5 8 7.5 8 11.5C8 14.54 10.46 17 13.5 17C14.88 17 16.14 16.49 17.09 15.65C16.71 19.24 13.7 22 10 22C5.58 22 2 18.42 2 14C2 9.5 5.5 5 12 2Z" />
          </svg>
          {pulseState === "broadcast" && !isQuiet && <div className="orbit-ring" />}
        </span>

        {variant !== "icon" && (
          <span className="text-[11px] font-mono tracking-wide text-white/80 group-hover:text-white transition-colors">
            @welcome
          </span>
        )}
      </button>

      {/* ── Tier 2: Ambient Hover / Click Inspection Overlay ── */}
      <AnimatePresence>
        {isOverlayOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute bottom-12 left-0 w-80 p-4 rounded-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-2xl text-white font-mono shadow-2xl z-60"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold tracking-wider text-white">
                  @welcome hearth
                </span>
              </div>
              <button
                onClick={() => setIsOverlayOpen(false)}
                className="text-white/40 hover:text-white p-1 rounded-md transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-white/70">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/50">Living Room Pulse</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {liveStats ? `${liveStats.presence} souls live` : "online"}
                </span>
              </div>

              {liveStats && liveStats.sparkedToday > 0 && (
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/80">
                  {liveStats.sparkedToday} new Youniverses sparked today across the network.
                </div>
              )}

              {latestEvent?.title && (
                <div className="text-[11px] text-purple-300/90 leading-relaxed italic">
                  "{latestEvent.title}"
                </div>
              )}

              <p className="text-[10px] text-white/40 leading-relaxed pt-1">
                Your sovereign room is connected to the living room of the network.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <a
                href={url}
                className="w-full py-2 px-3 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm group"
              >
                <span>Step into @welcome</span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WelcomeBeacon;
