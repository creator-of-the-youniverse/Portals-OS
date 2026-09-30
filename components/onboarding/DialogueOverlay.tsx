/**
 * @file DialogueOverlay
 *
 * Interactive terminal-style speaker bubble that renders
 * typewriter text with speaker identity. Used by OnboardingFlow
 * to render each line of the onboarding dialogue.
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DialogueSender } from "../../types/onboarding";
import { SPEAKER_CONFIG } from "./SpeakerPills";

// ─────────────────────────────────────────────────────────────
// Typewriter Hook (extended from AtomWelcome.tsx pattern)
// ─────────────────────────────────────────────────────────────

function useTypewriter(text: string, durationMs: number, active: boolean) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active) return;
    setDisplayed("");
    if (!text) return;

    const chars = text.split("");
    const interval = durationMs / chars.length;
    let i = 0;

    const timer = setInterval(() => {
      i++;
      setDisplayed(chars.slice(0, i).join(""));
      if (i >= chars.length) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [text, durationMs, active]);

  return displayed;
}

// ─────────────────────────────────────────────────────────────
// Dialogue Line
// ─────────────────────────────────────────────────────────────

export interface DialogueLine {
  id: string;
  speaker: DialogueSender;
  text: string;
  delay: number;     // ms from act start
  duration: number;  // typewriter duration ms
}

interface DialogueLineComponentProps {
  line: DialogueLine;
  startTime: number;
}

const DialogueLineComponent: React.FC<DialogueLineComponentProps> = ({ line, startTime }) => {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const displayed = useTypewriter(line.text, line.duration, active);
  const config = SPEAKER_CONFIG[line.speaker];
  const isComplete = displayed.length >= line.text.length;

  useEffect(() => {
    const wait = line.delay - (Date.now() - startTime);
    const t = setTimeout(() => {
      setVisible(true);
      setActive(true);
    }, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [line.delay, startTime]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-0.5"
        >
          <p className={`text-sm leading-relaxed font-light tracking-wide ${config?.color || "text-white/90"}`}>
            {displayed}
            {active && !isComplete && (
              <span
                className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle"
                style={{ backgroundColor: config?.glowColor || "rgba(255,255,255,0.6)" }}
              />
            )}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────
// Dialogue Overlay Panel
// ─────────────────────────────────────────────────────────────

interface DialogueOverlayProps {
  speaker: DialogueSender;
  lines: DialogueLine[];
  onComplete: () => void;
  startTime?: number;
}

const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
  speaker,
  lines,
  onComplete,
  startTime: externalStartTime,
}) => {
  const [startTime] = useState(() => externalStartTime || Date.now());
  const [showContinue, setShowContinue] = useState(false);
  const config = SPEAKER_CONFIG[speaker];

  // Show continue button after last line finishes
  useEffect(() => {
    if (lines.length === 0) return;
    const lastLine = lines[lines.length - 1];
    const totalWait = lastLine.delay + lastLine.duration + 600;
    const t = setTimeout(() => setShowContinue(true), totalWait);
    return () => clearTimeout(t);
  }, [lines]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-lg mx-auto"
    >
      {/* Speaker Identity */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`relative h-10 w-10 rounded-full ${config?.bgColor || "bg-white/5"} ${config?.borderColor || "border-white/10"} border flex items-center justify-center`}
          style={{ boxShadow: `0 0 20px ${config?.glowColor || "transparent"}` }}
        >
          <span className={config?.color || "text-white"}>{config?.icon}</span>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-black shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        </div>
        <div>
          <p className={`text-[10px] uppercase tracking-[0.25em] ${config?.color || "text-white"} font-mono opacity-60`}>
            {config?.subtitle}
          </p>
          <h3 className="text-base font-bold text-white tracking-tight">{config?.label}</h3>
        </div>
      </div>

      {/* Dialogue Card */}
      <div className="relative rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-md px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col gap-2.5 min-h-[160px]">
        {/* CRT scan lines */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden opacity-[0.02]"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)",
          }}
        />

        {lines.map((line) => (
          <DialogueLineComponent key={line.id} line={line} startTime={startTime} />
        ))}
      </div>

      {/* Continue Button */}
      <AnimatePresence>
        {showContinue && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex justify-end mt-3"
          >
            <button
              onClick={onComplete}
              className="group flex items-center gap-2 px-4 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/50 text-xs font-mono tracking-widest uppercase hover:bg-white/10 hover:text-white/80 hover:border-white/20 transition-all backdrop-blur-sm"
            >
              <span>continue</span>
              <motion.span
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                →
              </motion.span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export { DialogueLineComponent, useTypewriter };
export default DialogueOverlay;
