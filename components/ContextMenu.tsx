import React from "react";
import { motion } from "framer-motion";
import { Image, Settings, Sun, Moon } from "lucide-react";
import { nanoid } from "nanoid";
import { useKernel } from "../store/kernel";
import { GlowCard } from "./GlowCard";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onNextWallpaper?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onNextWallpaper }) => {
  const setWallpaper = useKernel((state) => state.setWallpaper);
  const openWindow = useKernel((state) => state.openWindow);
  const theme = useKernel((state) => state.theme);
  const toggleTheme = useKernel((state) => state.toggleTheme);

  const changeWallpaper = () => {
    if (onNextWallpaper) {
      onNextWallpaper();
    }
    onClose();
  };

  const openSettings = () => {
    openWindow("settings");
    onClose();
  };

  const handleToggleTheme = () => {
    toggleTheme();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="absolute w-52 z-9999"
      style={{ top: y, left: x }}
    >
      <GlowCard glowColor="cyan" customSize={true} className="w-full p-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">
          Portals OS
        </div>
        <button
          onClick={changeWallpaper}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 rounded-md hover:bg-white/10 hover:text-white transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Image size={15} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Next Background</span>
          </div>
          <span className="text-[10px] text-white/30 font-mono tracking-widest">⇥</span>
        </button>

        <button
          onClick={handleToggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 rounded-md hover:bg-white/10 hover:text-white transition-colors group"
        >
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Sun size={15} className="text-yellow-400 group-hover:scale-110 transition-transform" />
            ) : (
              <Moon size={15} className="text-indigo-400 group-hover:scale-110 transition-transform" />
            )}
            <span>Toggle Theme</span>
          </div>
        </button>

        <div className="h-px bg-white/10 my-1 mx-2" />

        <button
          onClick={() => { openWindow("terminal"); onClose(); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 rounded-md hover:bg-white/10 hover:text-white transition-colors group"
        >
          <div className="w-4 h-4 flex items-center justify-center font-mono text-emerald-400 text-xs font-bold group-hover:scale-110 transition-transform">
            &gt;_
          </div>
          <span>Open Terminal Here</span>
        </button>

        <div className="h-px bg-white/10 my-1 mx-2" />

        <button
          onClick={openSettings}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 rounded-md hover:bg-white/10 hover:text-white transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Settings size={15} className="text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
            <span>Personalize</span>
          </div>
        </button>
      </GlowCard>
    </motion.div>
  );
};

export default ContextMenu;
