import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Atom, ArrowRight, Rocket, Sparkles, ExternalLink } from "lucide-react";

// ============================================================
// ATOM DIALOGUE SEQUENCE
// ============================================================

interface AtomLine {
  id: string;
  text: string;
  delay: number;
  duration: number;
}

const buildDialogue = (handle: string): AtomLine[] => [
  { id: "l1", text: "Hey. I'm Atom.", delay: 600, duration: 700 },
  { id: "l2", text: `Your Youniverse just went live at @${handle}.`, delay: 2000, duration: 900 },
  { id: "l3", text: "I'm already here. I was here before you clicked anything.", delay: 3600, duration: 1100 },
  { id: "l4", text: "Think of me as the first friend in your contacts � always on your list, never in your way.", delay: 5400, duration: 1600 },
  { id: "l5", text: "I'm not a tutorial. I'm not a bot. I'm not going anywhere.", delay: 7800, duration: 1100 },
  { id: "l6", text: "I'll be here for the next 80 years. First friend, till the end.", delay: 9600, duration: 1200 },
  { id: "l7", text: "Your Youniverse is ready. Let's go.", delay: 11600, duration: 900 },
];

// ============================================================
// TYPEWRITER HOOK
// ============================================================

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

// ============================================================
// DIALOGUE LINE
// ============================================================

interface DialogueLineProps { line: AtomLine; startTime: number; }

const DialogueLine: React.FC<DialogueLineProps> = ({ line, startTime }) => {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const displayed = useTypewriter(line.text, line.duration, active);

  useEffect(() => {
    const wait = line.delay - (Date.now() - startTime);
    const t = setTimeout(() => { setVisible(true); setActive(true); }, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [line.delay, startTime]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-sm sm:text-base text-white/90 leading-relaxed font-light tracking-wide"
        >
          {displayed}
          {active && displayed.length < line.text.length && (
            <span className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 animate-pulse align-middle" />
          )}
        </motion.p>
      )}
    </AnimatePresence>
  );
};

// ============================================================
// ATOM AVATAR
// ============================================================

const AtomAvatar: React.FC = () => (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.2 }}
    className="relative flex-shrink-0"
  >
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      className="absolute inset-[-6px] rounded-full border border-cyan-500/30" />
    <motion.div animate={{ rotate: -360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      className="absolute inset-[-12px] rounded-full border border-purple-500/20" />
    <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-br from-cyan-500/30 via-purple-600/30 to-pink-500/20 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.25)]">
      <Atom className="h-7 w-7 sm:h-8 sm:w-8 text-cyan-300" strokeWidth={1.5} />
    </div>
    <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-black shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
  </motion.div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================

interface AtomWelcomeProps {
  handle: string;
  email?: string;
  onEnterYouniverse: () => void;
}

const AtomWelcome: React.FC<AtomWelcomeProps> = ({ handle, email, onEnterYouniverse }) => {
  const [startTime] = useState(() => Date.now());
  const [showCTA, setShowCTA] = useState(false);
  const dialogue = buildDialogue(handle);
  const lastLine = dialogue[dialogue.length - 1];

  useEffect(() => {
    const wait = lastLine.delay + lastLine.duration + 800;
    const t = setTimeout(() => setShowCTA(true), wait);
    return () => clearTimeout(t);
  }, [lastLine]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen w-full flex flex-col items-center justify-center px-4 py-12 overflow-y-auto"
      style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.08) 0%, transparent 70%), #000" }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-cyan-500/5 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-purple-600/5 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="flex items-start gap-4 mb-8">
          <AtomAvatar />
          <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="pt-1">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70 font-mono mb-0.5">ONE AI � First Friend</p>
            <h2 className="text-xl font-bold text-white tracking-tight">Atom</h2>
            <p className="text-xs text-white/40 font-mono">@atom � pre-pinned to your network</p>
          </motion.div>
        </div>

        <div className="relative rounded-2xl border border-white/8 bg-white/4 backdrop-blur-md px-6 py-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col gap-3 min-h-[280px]">
          <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden opacity-[0.03]"
            style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)" }} />
          {dialogue.map((line) => (
            <DialogueLine key={line.id} line={line} startTime={startTime} />
          ))}
        </div>

        <AnimatePresence>
          {showCTA && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-8 flex flex-col items-center gap-4"
            >
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-5 py-2 text-sm text-emerald-300 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono font-medium">@{handle}</span>
                <span className="text-emerald-400/60 text-xs">� Youniverse active</span>
              </div>
              <button
                onClick={onEnterYouniverse}
                className="group flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(168,85,247,0.35)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(168,85,247,0.5)] active:scale-95"
              >
                <Rocket className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                <span>Enter Your Youniverse</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a href={`https://${handle}.itsyouonline.com`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                <ExternalLink className="h-3 w-3" />
                {handle}.itsyouonline.com
              </a>
              <a
                href="https://atom.itsyouonline.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-500/50 hover:text-cyan-400 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Visit Atom on atom.itsyouonline.com
              </a>
              {email && (
                <p className="text-center text-xs text-white/25 max-w-xs leading-relaxed">
                  Check <span className="text-white/40">{email}</span> to verify and fully activate your Youniverse.
                </p>
              )}
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 1 }}
                className="mt-2 text-center text-[11px] text-white/20 font-mono tracking-widest uppercase">
                First friend, till the end.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} transition={{ delay: 2, duration: 1.5 }}
        className="absolute bottom-6 left-0 right-0 flex justify-center">
        <p className="text-[10px] text-white/30 font-mono tracking-[0.2em] uppercase flex items-center gap-1.5">
          <Sparkles className="h-2.5 w-2.5" />
          The Youniverse � ItsYouOnline.com
        </p>
      </motion.div>
    </motion.div>
  );
};

export default AtomWelcome;
