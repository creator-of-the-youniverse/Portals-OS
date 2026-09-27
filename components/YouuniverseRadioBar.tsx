/**
 * @file YouuniverseRadioBar — The persistent voice of the Youniverse.
 * A glassmorphic radio widget that rides across all Portals-OS windows.
 * Backed by GlobalBroadcastManager / ClubRadioContext.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useClubRadio } from "../contexts/ClubRadioContext";
import { useKernel } from "../store/kernel";

// Animated equalizer bars
const EqBars: React.FC<{ isPlaying: boolean; volume: number }> = ({ isPlaying, volume }) => {
  const bars = [0.4, 0.7, 1.0, 0.6, 0.85, 0.5, 0.9, 0.3];
  return (
    <div className="flex items-end gap-[2px] h-4 w-10">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-gradient-to-t from-purple-600 to-cyan-400"
          animate={isPlaying ? {
            height: [`${8 * h * volume}px`, `${4 * h * volume}px`, `${12 * h * volume}px`, `${6 * h * volume}px`],
          } : { height: "2px" }}
          transition={{
            duration: 0.6 + i * 0.07,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
            delay: i * 0.04,
          }}
          style={{ minHeight: "2px", maxHeight: "16px" }}
        />
      ))}
    </div>
  );
};

// Scrolling ticker text
const TickerText: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div className="overflow-hidden w-full">
      <motion.div
        key={text}
        initial={{ x: "100%" }}
        animate={{ x: "-100%" }}
        transition={{ duration: 18, ease: "linear", repeat: Infinity }}
        className="whitespace-nowrap text-[9px] font-mono font-semibold uppercase tracking-[0.15em] text-purple-300/80"
      >
        {text}
      </motion.div>
    </div>
  );
};

export const YouuniverseRadioBar: React.FC<{ onEnterClub?: () => void }> = ({ onEnterClub }) => {
  const radio = useClubRadio();
  const openWindow = useKernel((s) => s.openWindow);
  const [expanded, setExpanded] = useState(false);
  const [localVolume, setLocalVolume] = useState(radio?.volume ?? 0.6);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const sliderTimeout = useRef<number | null>(null);

  // Sync volume from global state
  useEffect(() => {
    if (radio?.volume !== undefined) setLocalVolume(radio.volume);
  }, [radio?.volume]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setLocalVolume(vol);
    radio?.setVolume(vol);
  }, [radio]);

  const handleEnterClub = useCallback(() => {
    if (onEnterClub) {
      onEnterClub();
    } else {
      // Open Club Youniverse as a Portals window
      openWindow("clubYouniverse" as any, { width: 900, height: 650 });
    }
  }, [onEnterClub, openWindow]);

  const showVolume = () => {
    setShowVolumeSlider(true);
    if (sliderTimeout.current) clearTimeout(sliderTimeout.current);
    sliderTimeout.current = window.setTimeout(() => setShowVolumeSlider(false), 3000);
  };

  const isVisible = useKernel((s) => s.isRadioWidgetVisible);
  const setVisible = useKernel((s) => s.setRadioWidgetVisible);
  const constraintsRef = useRef(null);

  if (!radio || !isVisible) return null;

  const { nowPlaying, isPlaying, isMuted, togglePlay, setMuted, tickerText, djBanter } = radio;

  const displayTitle = nowPlaying?.title || "Club Youniverse";
  const displayArtist = nowPlaying?.artistName || "The Voice of the Youniverse";
  const isPaused = !isPlaying || isMuted;

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 2, duration: 0.8, ease: "easeOut" }}
      className="fixed bottom-6 left-4 z-50 select-none cursor-move"
      style={{ pointerEvents: "auto", touchAction: "none" }}
    >
      <div
        className={`
          relative flex flex-col rounded-2xl border overflow-hidden
          bg-black/80 backdrop-blur-2xl
          border-purple-500/20 shadow-[0_0_40px_rgba(168,85,247,0.15),0_4px_24px_rgba(0,0,0,0.6)]
          transition-[width] duration-300
          ${expanded ? "w-72" : "w-56"}
        `}
      >
        {/* Top bar with close button and live indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[7px] font-mono font-bold uppercase tracking-[0.2em] text-purple-400/70">Live</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setVisible(false); }}
            className="w-4 h-4 rounded-full bg-white/5 hover:bg-red-500/50 text-white/50 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close Radio"
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main row */}
        <div className="flex items-center gap-2.5 p-3 pr-16 pt-5">
          {/* Waveform / play button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isMuted) setMuted(false);
              else togglePlay();
            }}
            className="relative flex-none w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center hover:bg-purple-600/40 transition-colors group cursor-pointer"
            title={isPaused ? "Play" : "Mute"}
          >
            <AnimatePresence mode="wait">
              {isPaused ? (
                <motion.div key="play" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                  <svg className="w-3.5 h-3.5 text-purple-300 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </motion.div>
              ) : (
                <motion.div key="eq" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                  <EqBars isPlaying={true} volume={localVolume} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          {/* Song info */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-white truncate leading-tight pointer-events-none">{displayTitle}</div>
            <div className="text-[9px] text-purple-300/70 truncate font-mono pointer-events-none">{displayArtist}</div>
          </div>
        </div>

        {/* Ticker */}
        <div className="border-t border-purple-500/10 px-3 py-1.5 bg-purple-950/20 pointer-events-none">
          <TickerText text={tickerText || djBanter || "CLUB YOUNIVERSE — THE VOICE OF THE YOUNIVERSE"} />
        </div>

        {/* Expanded controls */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-purple-500/10 overflow-hidden"
            >
              <div className="p-3 flex flex-col gap-2 cursor-default">
                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMuted(!isMuted); }}
                    className="flex-none text-purple-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {isMuted || localVolume === 0 ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : localVolume}
                    onChange={handleVolumeChange}
                    className="flex-1 h-1 appearance-none bg-purple-900/60 rounded-full cursor-pointer accent-purple-500"
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag on slider
                  />
                  <span className="text-[8px] font-mono text-purple-400/60 w-6 text-right">
                    {Math.round((isMuted ? 0 : localVolume) * 100)}
                  </span>
                </div>

                {/* Enter Club button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleEnterClub(); }}
                  className="w-full py-1.5 rounded-lg bg-gradient-to-r from-purple-700 to-cyan-700 text-[9px] font-black uppercase tracking-[0.2em] text-white hover:from-purple-600 hover:to-cyan-600 transition-all shadow-[0_0_16px_rgba(168,85,247,0.3)] cursor-pointer"
                >
                  Enter Club Youniverse →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(e => !e); }}
          className="absolute bottom-1 right-2 p-1 text-purple-500/40 hover:text-purple-400 transition-colors cursor-pointer z-10"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
};

export default YouuniverseRadioBar;
