import React, { useState } from "react";
import PortalLayout from "./PortalLayout";
import { useYouniverse } from "./YouniverseProvider";
import { Rocket, ShieldCheck, Sparkles, ExternalLink, ArrowRight, Layers, Cpu, Radio, Volume2, VolumeX, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useClubRadio } from "../contexts/ClubRadioContext";

interface PublicYouniverseProps {
  onEnterOs?: () => void;
}

/** Tiny animated waveform for the ambient strip */
const MiniWave: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => (
  <div className="flex items-end gap-[1.5px] h-3">
    {[0.5, 0.9, 0.6, 1.0, 0.7, 0.85].map((h, i) => (
      <motion.div
        key={i}
        className="w-[1.5px] rounded-full bg-purple-400"
        animate={isPlaying ? {
          height: [`${12 * h}px`, `${4 * h}px`, `${10 * h}px`],
        } : { height: "2px" }}
        transition={{ duration: 0.7 + i * 0.08, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: i * 0.05 }}
        style={{ minHeight: "2px" }}
      />
    ))}
  </div>
);

const PublicYouniverse: React.FC<PublicYouniverseProps> = ({ onEnterOs }) => {
  const { identity } = useYouniverse();
  const radio = useClubRadio();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  if (!identity || identity.kind !== "identity" || !identity.username) {
    return null;
  }

  // Check if current browser session is authenticated as the owner
  const isOwner = 
    localStorage.getItem('active_youniverse_handle') === identity.username && 
    !!localStorage.getItem('youniverse_session_token');

  const handleEnterOs = () => {
    if (!isOwner) {
      // Deny access and show auth prompt
      setShowAuthPrompt(true);
      return;
    }

    if (onEnterOs) {
      onEnterOs();
    } else {
      localStorage.setItem(`youniverse_os_active_${identity.username}`, "true");
      window.location.reload();
    }
  };

  const { nowPlaying, isPlaying, isMuted, togglePlay, setMuted } = radio || {};

  return (
    <PortalLayout>
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-12">
        {/* Subtle cosmic background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-500/15 via-purple-600/20 to-pink-500/10 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 flex w-full max-w-lg flex-col items-center text-center"
        >
          {/* Top Title: Required "The Youniverse" */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-4 py-1 text-xs uppercase tracking-[0.35em] text-cyan-300 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.15)]">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            <span>The Youniverse</span>
          </div>

          {/* Central Portal Avatar / Handle Orb */}
          <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-cyan-500/20 via-purple-900/40 to-black p-1 shadow-2xl backdrop-blur-2xl">
            <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-black/60 border border-white/10">
              <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-mono">
                @
              </span>
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-black shadow-lg">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Identity Handle */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-md font-sans">
            @{identity.username}
          </h1>

          {/* Subdomain URL Badge */}
          <p className="mt-2 text-xs font-mono text-cyan-400/80 tracking-wide">
            {identity.username}.itsyouonline.com
          </p>

          <p className="mt-4 text-sm text-white/70 max-w-md leading-relaxed">
            Welcome to the sovereign digital space of <strong className="text-white">@{identity.username}</strong>. 
            Powered by client-side ONEAI, Weaver dynamic spatial builder, and Portals OS.
          </p>

          {/* ── AMBIENT RADIO STRIP — The Voice of the Youniverse ── */}
          <AnimatePresence>
            {radio && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="mt-6 w-full flex items-center gap-3 rounded-xl border border-purple-500/20 bg-black/50 backdrop-blur-xl px-4 py-3 shadow-[0_0_30px_rgba(168,85,247,0.12)]"
              >
                {/* Play/mute button */}
                <button
                  onClick={() => {
                    if (!radio) return;
                    if (isMuted) setMuted!(false);
                    else togglePlay!();
                  }}
                  className="flex-none w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center hover:bg-purple-600/40 transition-colors"
                >
                  {(isPlaying && !isMuted) ? (
                    <MiniWave isPlaying={true} />
                  ) : (
                    <Radio className="h-3.5 w-3.5 text-purple-400" />
                  )}
                </button>

                {/* Song info */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-purple-400/60 mb-0.5">
                    Club Youniverse — Live
                  </div>
                  <div className="text-xs font-semibold text-white truncate">
                    {nowPlaying?.title || "Tuning in..."}
                  </div>
                  {nowPlaying?.artistName && (
                    <div className="text-[10px] text-white/40 font-mono truncate">{nowPlaying.artistName}</div>
                  )}
                </div>

                {/* Mute toggle */}
                <button
                  onClick={() => setMuted && setMuted(!isMuted)}
                  className="flex-none text-white/30 hover:text-purple-400 transition-colors"
                >
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Primary CTA: Launch / Enter Portals OS */}
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3">
            <div className="flex w-full flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleEnterOs}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] transition-all hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(0,255,255,0.5)]"
              >
                {isOwner ? <Rocket className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span>{isOwner ? "Enter Portals OS" : "Owner Login"}</span>
                {isOwner && <ArrowRight className="h-4 w-4 ml-1" />}
              </button>

              <a
                href="https://itsyouonline.com"
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span>Gateway Hub</span>
                <ExternalLink className="h-3.5 w-3.5 text-white/50" />
              </a>
            </div>

            {/* Auth Prompt for unauthenticated visitors */}
            <AnimatePresence>
              {showAuthPrompt && !isOwner && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="w-full overflow-hidden mt-2"
                >
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center backdrop-blur-md">
                    <p className="text-sm text-red-200 font-medium">Access Denied</p>
                    <p className="text-xs text-red-200/70 mt-1">
                      You are viewing the public lawn. Only the authenticated owner can enter the Portals OS environment for @{identity.username}.
                    </p>
                    <button 
                      onClick={() => setShowAuthPrompt(false)}
                      className="mt-3 text-[10px] uppercase tracking-widest text-red-300 hover:text-red-100 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Feature Overview Strip */}
          <div className="mt-10 grid w-full grid-cols-3 gap-2.5 text-left border-t border-white/10 pt-6">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <Cpu className="h-4 w-4 text-cyan-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">ONEAI</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">Sovereign personal brain</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <Layers className="h-4 w-4 text-purple-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">Weaver</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">Spatial UI builder</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <Radio className="h-4 w-4 text-pink-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">Club</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">Voice of the Youniverse</div>
            </div>
          </div>
        </motion.div>
      </div>
    </PortalLayout>
  );
};

export default PublicYouniverse;
