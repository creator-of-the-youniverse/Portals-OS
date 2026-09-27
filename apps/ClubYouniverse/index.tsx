/**
 * @file ClubYouniverse — Portals-OS App
 * Embeds Club Youniverse as a first-class Portals-OS window app.
 * 
 * Architecture:
 *  - Uses an iframe pointing to clubyouniverse.live for the full experience
 *  - Falls back to a minimal native Sidewalk view if the iframe is blocked
 *  - Bridges Portals kernel events to the Club via postMessage
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useClubRadio } from "../../contexts/ClubRadioContext";
import { Radio as Music, Volume2, VolumeX, ExternalLink, Wifi, WifiOff } from "lucide-react";

// Animated waveform for loading state
const WaveformLoader: React.FC = () => (
  <div className="flex items-end gap-1 h-8">
    {[0.4, 0.7, 1.0, 0.8, 0.6, 0.9, 0.5, 0.75, 0.45, 0.85].map((h, i) => (
      <motion.div
        key={i}
        className="w-1 rounded-full bg-gradient-to-t from-purple-700 to-cyan-400"
        animate={{ height: [`${32 * h}px`, `${10 * h}px`, `${28 * h}px`] }}
        transition={{ duration: 0.8 + i * 0.05, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: i * 0.06 }}
        style={{ minHeight: "4px" }}
      />
    ))}
  </div>
);

interface ClubYouniverseProps {
  metadata?: any;
}

const ClubYouniverse: React.FC<ClubYouniverseProps> = () => {
  const radio = useClubRadio();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeState, setIframeState] = useState<"loading" | "loaded" | "error">("loading");
  const [useEmbedded, setUseEmbedded] = useState(false);

  // Try iframe first; fall back to embedded native view after 8s
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (iframeState === "loading") {
        console.warn("[ClubYouniverse] iframe timeout — switching to embedded view");
        setUseEmbedded(true);
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [iframeState]);

  const handleIframeLoad = () => setIframeState("loaded");
  const handleIframeError = () => { setIframeState("error"); setUseEmbedded(true); };

  if (!radio) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="text-center text-white/40">
          <Music className="mx-auto mb-3 h-8 w-8" />
          <p className="text-sm">Initializing Club Youniverse...</p>
        </div>
      </div>
    );
  }

  const { nowPlaying, isPlaying, isMuted, togglePlay, setMuted, volume, setVolume, djBanter, tickerText } = radio;

  // ── EMBEDDED NATIVE VIEW (fallback / direct) ──
  if (useEmbedded) {
    return (
      <div className="h-full w-full flex flex-col bg-zinc-950 text-white overflow-hidden relative">
        {/* Ambient art background */}
        {nowPlaying?.coverArtUrl && (
          <div className="absolute inset-0 opacity-15 pointer-events-none">
            <img src={nowPlaying.coverArtUrl} className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 to-zinc-950" />
          </div>
        )}

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-purple-400/80 mb-1">Club Youniverse</div>
            <div className="text-lg font-black text-white">The Voice of the Youniverse</div>
          </div>
          <a
            href="https://clubyouniverse.live"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/50 hover:text-white hover:border-purple-500/40 transition-all"
          >
            <ExternalLink className="h-3 w-3" />
            Full Site
          </a>
        </div>

        {/* Now Playing */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
          {/* Cover art */}
          <div className="relative mb-6">
            <div className="w-40 h-40 rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(168,85,247,0.3)]">
              {nowPlaying?.coverArtUrl ? (
                <img src={nowPlaying.coverArtUrl} className="w-full h-full object-cover" alt={nowPlaying.title} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-900 to-zinc-900 flex items-center justify-center">
                  <Music className="h-12 w-12 text-purple-400/40" />
                </div>
              )}
            </div>
            {isPlaying && !isMuted && (
              <motion.div
                className="absolute -inset-2 rounded-3xl border border-purple-500/30"
                animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={nowPlaying?.id || "idle"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-2"
            >
              <div className="text-xl font-black text-white mb-1">
                {nowPlaying?.title || "Tuning in..."}
              </div>
              <div className="text-sm text-purple-300/70 font-mono">
                {nowPlaying?.artistName || "Club Youniverse"}
              </div>
              {nowPlaying?.stars && (
                <div className="mt-1 text-xs text-yellow-400/60">
                  {"★".repeat(Math.round(nowPlaying.stars / 2))} {nowPlaying.stars.toFixed(1)} / 10
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Playback controls */}
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => setMuted(!isMuted)}
              className="p-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-purple-500/40 transition-all"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-600 shadow-[0_0_30px_rgba(168,85,247,0.4)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying && !isMuted ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* Volume slider */}
            <div className="flex items-center gap-1.5">
              <input
                type="range" min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 appearance-none bg-purple-900/60 rounded-full cursor-pointer accent-purple-500"
              />
            </div>
          </div>
        </div>

        {/* DJ Banter */}
        {djBanter && (
          <div className="relative z-10 px-5 py-3 border-t border-white/5 bg-black/20">
            <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-purple-400/50 mb-0.5">DJ Line</div>
            <div className="text-[11px] text-white/70 font-medium italic leading-snug line-clamp-2">{djBanter}</div>
          </div>
        )}

        {/* Ticker */}
        <div className="relative z-10 px-5 py-2 bg-black/40 border-t border-purple-500/10 overflow-hidden">
          <motion.div
            key={tickerText}
            initial={{ x: "100%" }}
            animate={{ x: "-100%" }}
            transition={{ duration: 20, ease: "linear", repeat: Infinity }}
            className="whitespace-nowrap text-[8px] font-mono font-semibold uppercase tracking-[0.15em] text-purple-300/60"
          >
            {tickerText}
          </motion.div>
        </div>

        {/* Link to full club */}
        <div className="relative z-10 flex items-center justify-center py-3 border-t border-white/5">
          <a
            href="https://clubyouniverse.live/club"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-cyan-700 text-[10px] font-black uppercase tracking-[0.15em] text-white hover:from-purple-600 hover:to-cyan-600 transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]"
          >
            <Wifi className="h-3 w-3" />
            Enter the Club (Full Experience)
          </a>
        </div>
      </div>
    );
  }

  // ── IFRAME VIEW (primary) ──
  return (
    <div className="h-full w-full relative bg-zinc-950 flex flex-col">
      {/* Loading overlay */}
      <AnimatePresence>
        {iframeState === "loading" && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950"
          >
            <WaveformLoader />
            <p className="mt-5 text-xs font-mono uppercase tracking-[0.2em] text-purple-300/60 animate-pulse">
              Connecting to Club Youniverse...
            </p>
            <button
              onClick={() => setUseEmbedded(true)}
              className="mt-4 text-[9px] text-white/20 hover:text-white/50 transition-colors"
            >
              Use embedded view instead
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src="https://clubyouniverse.live"
        className="flex-1 w-full border-none"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        allow="autoplay; fullscreen; microphone"
        title="Club Youniverse"
        style={{ opacity: iframeState === "loaded" ? 1 : 0, transition: "opacity 0.5s" }}
      />
    </div>
  );
};

export default ClubYouniverse;
