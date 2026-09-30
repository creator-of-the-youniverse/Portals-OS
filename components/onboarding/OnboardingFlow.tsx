/**
 * @file OnboardingFlow
 *
 * State machine governing the 4-act onboarding dialogue progression.
 * Acts:
 *   I.   WELCOME_ATOM    — Atom introduces himself as first friend
 *   II.  WEAVER_INTRO    — Weaver explains reality shaping
 *   III. ORACLE_NEXUS    — Oracle diagnoses + Nexus fleet reveals
 *   IV.  ECOSYSTEM_HUBS  — NotNotes, Books OS, Club, Omnedia
 *
 * After all acts complete, the user enters the provisional desktop.
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DialogueOverlay, { type DialogueLine } from "./DialogueOverlay";
import type { OnboardingAct } from "../../types/onboarding";
import { useKernel } from "../../store/kernel";

// ─────────────────────────────────────────────────────────────
// CANONICAL DIALOGUE SCRIPTS (from spec §4)
// ─────────────────────────────────────────────────────────────

function buildDialogueScript(handle: string): Record<OnboardingAct, DialogueLine[]> {
  return {
    WELCOME_ATOM: [
      {
        id: "a1",
        speaker: "ATOM",
        text: "System initialized. Welcome to the Youniverse, " + capitalize(handle) + ".",
        delay: 600,
        duration: 900,
      },
      {
        id: "a2",
        speaker: "ATOM",
        text: "I'm Atom. Consider me your first friend here — the one connection already pinned to your list the second you claim your domain, just like Tom back in the day.",
        delay: 2200,
        duration: 2200,
      },
      {
        id: "a3",
        speaker: "ATOM",
        text: "I am your ONE AI. Wherever your life, your ventures, and your data move over the next eighty years, I stay with you. I don't belong to a cloud provider; I belong to you.",
        delay: 5200,
        duration: 2400,
      },
    ],

    WEAVER_INTRO: [
      {
        id: "w1",
        speaker: "WEAVER",
        text: "And I am Weaver. I shape this reality to your hands.",
        delay: 600,
        duration: 800,
      },
      {
        id: "w2",
        speaker: "WEAVER",
        text: "You never have to settle for a rigid dashboard. If you need a custom widget, an adjusted spatial layout, or a completely different chromatic theme, tell me what you want to see. I generate your interface in real time.",
        delay: 2200,
        duration: 2600,
      },
    ],

    ORACLE_NEXUS: [
      {
        id: "o1",
        speaker: "ORACLE",
        text: "I am the Oracle. Atom keeps your lifelong continuity; Weaver builds your space; I diagnose your friction.",
        delay: 600,
        duration: 1400,
      },
      {
        id: "o2",
        speaker: "ORACLE",
        text: "In the Youniverse, building a sovereign brand is not random luck — it is an engineered sequence of solved problems. From raw thought to your first dollar, all the way to a multi-million-dollar exit, you will hit friction points.",
        delay: 2800,
        duration: 2800,
      },
      {
        id: "o3",
        speaker: "ORACLE",
        text: "When you say: 'I don't know what business to start,' or 'I don't know how to package this skill,' I isolate the exact problem.",
        delay: 6400,
        duration: 1800,
      },
      {
        id: "o4",
        speaker: "ORACLE",
        text: "Once diagnosed, I deploy my fleet: the Nexus. These are independent, sovereign agents living on their own dedicated domains. They don't just chat — they execute. They write the copy, structure the legal rails, configure checkout funnels, and deliver working assets.",
        delay: 9000,
        duration: 3200,
      },
    ],

    ECOSYSTEM_HUBS: [
      {
        id: "e1",
        speaker: "ATOM",
        text: "Everything the Nexus produces lands in NotNotes — your working memory workbench. You review, approve, or discard every piece before it becomes an official artifact.",
        delay: 600,
        duration: 2000,
      },
      {
        id: "e2",
        speaker: "ATOM",
        text: "Once approved and completed, your work commits directly to Books OS (books.itsyouonline.com), preserving your longitudinal track record for decades.",
        delay: 3400,
        duration: 1800,
      },
      {
        id: "e3",
        speaker: "ATOM",
        text: "Two more lifelines to remember on your dock:",
        delay: 6000,
        duration: 600,
      },
      {
        id: "e4",
        speaker: "ATOM",
        text: "clubyouniverse.live: Our 24/7 autonomous frequency. No mainstream noise — just user-created, AI-generated tracks, live AI DJs, community leaderboards, contests, and live Youniverse Knews.",
        delay: 7200,
        duration: 2400,
      },
      {
        id: "e5",
        speaker: "ATOM",
        text: "Omnedia: The global social hub. It bridges your external social metrics into one unified sovereign score so you can monitor your digital footprint across the globe.",
        delay: 10400,
        duration: 2200,
      },
      {
        id: "e6",
        speaker: "ATOM",
        text: "You're looking at your unverified sovereign space right now. Feel free to explore the file tree, test Weaver's themes, or inspect the system.",
        delay: 13400,
        duration: 1800,
      },
    ],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING FLOW COMPONENT
// ─────────────────────────────────────────────────────────────

const ACTS: OnboardingAct[] = [
  "WELCOME_ATOM",
  "WEAVER_INTRO",
  "ORACLE_NEXUS",
  "ECOSYSTEM_HUBS",
];

const ACT_SPEAKERS: Record<OnboardingAct, string> = {
  WELCOME_ATOM: "ATOM",
  WEAVER_INTRO: "WEAVER",
  ORACLE_NEXUS: "ORACLE",
  ECOSYSTEM_HUBS: "ATOM",
};

interface OnboardingFlowProps {
  handle: string;
  email: string;
  onComplete: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ handle, email, onComplete }) => {
  const [actIndex, setActIndex] = useState(0);
  const dialogueScript = buildDialogueScript(handle);
  const currentAct = ACTS[actIndex];
  const currentLines = dialogueScript[currentAct];
  const currentSpeaker = ACT_SPEAKERS[currentAct] as any;

  const advanceAct = useCallback(() => {
    const nextIndex = actIndex + 1;
    if (nextIndex >= ACTS.length) {
      // All acts complete
      onComplete();
    } else {
      setActIndex(nextIndex);
    }
  }, [actIndex, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen w-full flex flex-col items-center justify-center px-4 py-12 overflow-y-auto"
      style={{
        background: "radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.06) 0%, transparent 70%), #000",
      }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-cyan-500/5 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-purple-600/5 blur-[100px]" />
      </div>

      {/* Act progress dots */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {ACTS.map((act, i) => (
          <div
            key={act}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i < actIndex
                ? "w-6 bg-cyan-400/60"
                : i === actIndex
                ? "w-8 bg-white/80"
                : "w-4 bg-white/15"
            }`}
          />
        ))}
      </div>

      {/* Active Dialogue */}
      <div className="relative z-10 w-full max-w-lg">
        <AnimatePresence mode="wait">
          <DialogueOverlay
            key={currentAct}
            speaker={currentSpeaker}
            lines={currentLines}
            onComplete={advanceAct}
          />
        </AnimatePresence>
      </div>

      {/* Handle badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 z-10"
      >
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/10 px-4 py-1 text-xs text-emerald-400/70 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono">@{handle}</span>
          <span className="text-emerald-400/40">·</span>
          <span className="text-emerald-400/40 text-[10px]">provisional</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default OnboardingFlow;
