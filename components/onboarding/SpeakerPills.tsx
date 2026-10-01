/**
 * @file SpeakerPills
 *
 * Distinct glowing identity tags for each speaker in the onboarding dialogue.
 * [ATOM] — amber/cyan glow
 * [WEAVER] — violet glow
 * [ORACLE] — white pulse
 * [NEXUS] — emerald fleet badge
 */

import React from "react";
import { motion } from "framer-motion";
import type { DialogueSender } from "../../types/onboarding";
import { Paintbrush, Eye, Boxes } from "lucide-react";
import { FlowingLight } from "../FlowingLight";

interface SpeakerPillProps {
  speaker: DialogueSender;
  active?: boolean;
}

const SPEAKER_CONFIG: Record<DialogueSender, {
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  borderColor: string;
  bgColor: string;
}> = {
  ATOM: {
    label: "Atom",
    subtitle: "ONE AI · First Friend Till The End",
    icon: (
      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center -ml-1 -mt-1 pointer-events-none relative bg-black">
        <div className="absolute inset-[-100%]">
          <FlowingLight
            lightIntensity={1.5}
            fogDensity={0.5}
            particleCount={40}
            lockTarget={{ x: 48, y: 48 }}
          />
        </div>
      </div>
    ),
    color: "text-cyan-300",
    glowColor: "rgba(0,255,255,0.4)",
    borderColor: "border-cyan-500/0", // Let the orb glow organically
    bgColor: "bg-transparent",
  },
  WEAVER: {
    label: "Weaver",
    subtitle: "Reality Shaper",
    icon: <Paintbrush className="h-4 w-4" />,
    color: "text-violet-300",
    glowColor: "rgba(167,139,250,0.3)",
    borderColor: "border-violet-500/40",
    bgColor: "bg-violet-950/30",
  },
  ORACLE: {
    label: "Oracle",
    subtitle: "Diagnostic Engine",
    icon: <Eye className="h-4 w-4" />,
    color: "text-white",
    glowColor: "rgba(255,255,255,0.2)",
    borderColor: "border-white/30",
    bgColor: "bg-white/5",
  },
  NEXUS: {
    label: "The Nexus",
    subtitle: "Sovereign Fleet",
    icon: <Boxes className="h-4 w-4" />,
    color: "text-emerald-300",
    glowColor: "rgba(52,211,153,0.3)",
    borderColor: "border-emerald-500/40",
    bgColor: "bg-emerald-950/30",
  },
  USER: {
    label: "You",
    subtitle: "",
    icon: null,
    color: "text-white/60",
    glowColor: "transparent",
    borderColor: "border-white/10",
    bgColor: "bg-white/5",
  },
};

const SpeakerPill: React.FC<SpeakerPillProps> = ({ speaker, active = true }) => {
  const config = SPEAKER_CONFIG[speaker];
  if (!config || speaker === "USER") return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-3"
    >
      {/* Avatar */}
      <div className="relative">
        {active && (
          <motion.div
            className={`absolute inset-[-4px] rounded-full ${config.borderColor} border`}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div
          className={`relative h-10 w-10 rounded-full ${config.bgColor} ${config.borderColor} border flex items-center justify-center`}
          style={{ boxShadow: active ? `0 0 20px ${config.glowColor}` : "none" }}
        >
          <span className={config.color}>{config.icon}</span>
        </div>
        {active && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-black shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        )}
      </div>

      {/* Identity */}
      <div>
        <p className={`text-xs uppercase tracking-[0.2em] ${config.color} font-mono opacity-70`}>
          {config.subtitle}
        </p>
        <h3 className="text-sm font-bold text-white tracking-tight">{config.label}</h3>
      </div>
    </motion.div>
  );
};

export { SpeakerPill, SPEAKER_CONFIG };
export default SpeakerPill;
