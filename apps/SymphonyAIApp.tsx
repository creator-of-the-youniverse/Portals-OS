import React, { useState } from "react";
import { AppProps } from "../types";
import { Music, Play, Square, Loader, Disc, Sparkles, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SymphonyAIApp: React.FC<AppProps> = () => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTracks, setGeneratedTracks] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    
    // Simulate generation time
    setTimeout(() => {
      const newTrack = {
        id: Math.random().toString(36).substr(2, 9),
        title: prompt.split(" ").slice(0, 3).join(" ") + "...",
        style: "AI Generated",
        duration: "2:45"
      };
      setGeneratedTracks([newTrack, ...generatedTracks]);
      setIsGenerating(false);
      setPrompt("");
    }, 4500);
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#05050A] text-white font-sans selection:bg-cyan-900/50">
      
      {/* Header Panel */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(8,145,178,0.3)]">
              <Music className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#05050A]" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-widest uppercase">Symphony AI</h2>
            <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400">
              <span>SONIC WEAVER ENGINE</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span className="text-emerald-400">STUDIO ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 p-8 overflow-y-auto custom-scrollbar">
        
        {/* Creation Interface */}
        <div className="max-w-3xl w-full mx-auto space-y-8">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
              Bring Your World to Life with Sound
            </h1>
            <p className="text-white/50">Describe the music you want to create. Symphony AI will generate a complete, studio-quality track in seconds.</p>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
            <div className="relative bg-black/60 border border-white/10 rounded-2xl p-2 flex">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g. A cyberpunk synthwave track for late night coding..."
                disabled={isGenerating}
                className="flex-1 bg-transparent border-none outline-none px-4 text-lg placeholder-white/30"
              />
              <button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="px-6 py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold uppercase tracking-widest text-sm flex items-center gap-2 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
              >
                {isGenerating ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Weaving...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate</>
                )}
              </button>
            </div>
          </div>

          {/* Generated Tracks list */}
          <AnimatePresence>
            {generatedTracks.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 space-y-4"
              >
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-4 border-b border-white/10 pb-2">Your Studio Library</div>
                
                {generatedTracks.map((track) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={track.id} 
                    className={`group flex items-center justify-between p-4 rounded-xl border transition-all ${nowPlaying === track.id ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setNowPlaying(nowPlaying === track.id ? null : track.id)}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${nowPlaying === track.id ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white group-hover:bg-cyan-500 group-hover:text-black'}`}
                      >
                        {nowPlaying === track.id ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                      </button>
                      
                      <div>
                        <div className="font-bold text-lg text-white">{track.title}</div>
                        <div className="text-sm text-cyan-400 font-mono flex items-center gap-2">
                          <Disc className="w-3 h-3" /> {track.style}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 text-white/50 font-mono text-sm">
                      {nowPlaying === track.id && (
                        <div className="flex gap-1 items-end h-4">
                          {[1,2,3,4].map(i => (
                            <motion.div key={i} animate={{ height: ["20%", "100%", "20%"] }} transition={{ duration: 0.5 + (i*0.1), repeat: Infinity }} className="w-1 bg-cyan-400 rounded-full" />
                          ))}
                        </div>
                      )}
                      <span>{track.duration}</span>
                      <Volume2 className="w-4 h-4 cursor-pointer hover:text-white" />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          
        </div>
      </div>
    </div>
  );
};

export default SymphonyAIApp;
