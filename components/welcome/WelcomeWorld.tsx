/**
 * @file WelcomeWorld
 *
 * The Foundational World (@welcome.itsyouonline.com).
 * Living room of the network, global pulse, thesis, and three-stage doorway forging ritual.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./WelcomeWorld.css";
import WelcomeAtmosphere from "./WelcomeAtmosphere";
import GlobalPulse from "./GlobalPulse";
import DoorwayForging from "./DoorwayForging";
import FoundationSynthesisPreview from "../FoundationSynthesisPreview";
import {
  WELCOME_ENERGY,
  handleEnergy,
  getSeasonalMoment,
  getVisitorId,
  encodeArrival,
  youniverseUrl,
  THESIS,
  AMBIENT_WHISPERS,
  type ArrivalPayload,
} from "../../lib/welcomeWorld";
import { fetchPulse, type WelcomePulse } from "../../services/welcomeService";

interface WelcomeWorldProps {
  onBypassToOS?: () => void;
}

export const WelcomeWorld: React.FC<WelcomeWorldProps> = ({ onBypassToOS }) => {
  const [pulse, setPulse] = useState<WelcomePulse | null>(null);
  const [liveHue, setLiveHue] = useState<number>(WELCOME_ENERGY.hue);
  const [liveHue2, setLiveHue2] = useState<number>(WELCOME_ENERGY.hue2);
  const [tempo, setTempo] = useState<number>(WELCOME_ENERGY.tempo);
  const [whisperIdx, setWhisperIdx] = useState(0);
  const [gateOpening, setGateOpening] = useState(false);
  const [arrivalData, setArrivalData] = useState<ArrivalPayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const hueRef = useRef(liveHue);
  hueRef.current = liveHue;

  const visitorId = useRef(getVisitorId()).current;
  const season = useRef(getSeasonalMoment()).current;

  // Sync custom CSS properties for buttery CSS transition
  useEffect(() => {
    const root = document.querySelector(".ww-root") as HTMLElement;
    if (root) {
      root.style.setProperty("--ww-hue", String(liveHue));
      root.style.setProperty("--ww-hue2", String(liveHue2));
    }
  }, [liveHue, liveHue2]);

  // Global pulse heartbeat loop (polls every 30s)
  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await fetchPulse(visitorId);
      if (active && data) setPulse(data);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [visitorId]);

  // Ambient whisper rotation
  useEffect(() => {
    const t = setInterval(() => {
      setWhisperIdx((i) => (i + 1) % AMBIENT_WHISPERS.length);
    }, 9000);
    return () => clearInterval(t);
  }, []);

  // Update atmosphere on handle input change
  const handleSignal = useCallback((handle: string | null) => {
    if (!handle) {
      setLiveHue(WELCOME_ENERGY.hue);
      setLiveHue2(WELCOME_ENERGY.hue2);
      setTempo(WELCOME_ENERGY.tempo);
    } else {
      const energy = handleEnergy(handle);
      setLiveHue(energy.hue);
      setLiveHue2(energy.hue2);
      setTempo(energy.tempo);
    }
  }, []);

  // Final claim completion: expand gate and transfer user to their new room
  const handleIgnited = useCallback((payload: ArrivalPayload) => {
    setArrivalData(payload);
    setGateOpening(true);

    const root = document.querySelector(".ww-root") as HTMLElement;
    if (root) root.style.setProperty("--ww-glow", "1");

    // Seamless handoff after the parting gate animation
    setTimeout(() => {
      let hash = "";
      if (payload.handoffToken) {
        hash = `handoff_token=${encodeURIComponent(payload.handoffToken)}`;
      } else {
        hash = encodeArrival(payload);
      }
      const destUrl = youniverseUrl(payload.handle, { hash });
      window.location.href = destUrl;
    }, 2800);
  }, []);

  return (
    <div className="ww-root" id="welcome-world-root">
      {/* Dynamic atmospheric backdrops */}
      <div className="ww-sky" aria-hidden="true" />
      <div className="ww-aurora" aria-hidden="true" />
      <WelcomeAtmosphere hueRef={hueRef} tempo={tempo} surge={gateOpening} />
      <div className="ww-grain" aria-hidden="true" />
      <div className="ww-vignette" aria-hidden="true" />

      {/* Embedded thesis in scenery */}
      <div className="ww-thesis" aria-hidden="true">
        <span className="ww-thesis__a">{THESIS.primary}</span>
        <span className="ww-thesis__b">{THESIS.secondary}</span>
      </div>

      {/* Floating ambient whisper */}
      <div className="ww-whisper" style={{ bottom: 100, right: 36 }}>
        <AnimatePresence mode="wait">
          <motion.span
            key={whisperIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 1.2 }}
          >
            {AMBIENT_WHISPERS[whisperIdx]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Top Header Chrome */}
      <header className="ww-top">
        <div className="ww-mark">
          <span className="ww-mark__hearth" aria-hidden="true" />
          <span className="ww-mark__name">
            @<b>welcome</b>.itsyouonline.com
          </span>
          <span className="ww-mark__sub">the foundational world</span>
        </div>

        <div className="ww-chips">
          <span className="ww-chip ww-chip--live">
            network online
          </span>
          {season.isCelebration && (
            <span className="ww-chip ww-chip--celebrate">
              ✦ {season.label}
            </span>
          )}
          <button
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="ww-chip"
            title="Preview Procedural Foundation Synthesis Engine"
          >
            ⚙ Law Synthesis Preview
          </button>
          {onBypassToOS && (
            <button
              onClick={onBypassToOS}
              className="ww-chip"
              title="Enter developer workspace"
            >
              developer os →
            </button>
          )}
        </div>
      </header>

      {/* Onboarding Ritual Stage */}
      <main className="ww-stage">
        <DoorwayForging onSignal={handleSignal} onIgnited={handleIgnited} />
      </main>

      {/* Global pulse ticker along the floor */}
      <GlobalPulse pulse={pulse} season={season} />

      {/* Synthesis Engine Interactive Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-4xl"
            >
              <div className="relative">
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white border border-white/20 flex items-center justify-center z-50 font-mono text-xs shadow-xl"
                  title="Close preview"
                >
                  ✕
                </button>
                <FoundationSynthesisPreview
                  initialHandle="alex"
                  initialHue={liveHue}
                  initialLaws={["Builder", "Quiet", "Creative"]}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Parting Gate Transition on claim */}
      <AnimatePresence>
        {gateOpening && (
          <div className="ww-gate" aria-live="assertive">
            <motion.div
              className="ww-gate__panel ww-gate__panel--l"
              initial={{ x: 0 }}
              animate={{ x: "-100%" }}
              transition={{ duration: 2.4, ease: [0.76, 0, 0.24, 1], delay: 0.4 }}
            />
            <motion.div
              className="ww-gate__panel ww-gate__panel--r"
              initial={{ x: 0 }}
              animate={{ x: "100%" }}
              transition={{ duration: 2.4, ease: [0.76, 0, 0.24, 1], delay: 0.4 }}
            />
            <motion.div
              className="ww-gate__seam"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: [0, 1, 1, 0], scaleY: [0, 1, 1, 0] }}
              transition={{ duration: 2.2, times: [0, 0.2, 0.8, 1] }}
            />
            <motion.div
              className="ww-gate__flood"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.9, 0] }}
              transition={{ duration: 2.6, times: [0, 0.5, 1], delay: 0.2 }}
            />
            <motion.div
              className="ww-gate__dest"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 1.2 }}
            >
              <span>crossing the threshold into</span>
              <strong>@{arrivalData?.handle}</strong>
              <span style={{ fontSize: 13, opacity: 0.7 }}>
                {arrivalData?.handle}.itsyouonline.com
              </span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WelcomeWorld;
