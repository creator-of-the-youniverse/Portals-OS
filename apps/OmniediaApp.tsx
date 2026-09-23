import React from "react";
import { AppProps } from "../types";
import { BarChart3, Star, TrendingUp } from "lucide-react";
import { useYouniverse } from "../components/YouniverseProvider";

const OmniediaApp: React.FC<AppProps> = () => {
  const { identity } = useYouniverse();
  const username = identity?.username || "Guest";
  
  // Placeholder score — will be driven by the real Omniedia API
  const score = username === "creator-of-the-youniverse" ? 9420 : 1250;
  const rank = username === "creator-of-the-youniverse" ? "Founder" : "Rising";

  return (
    <div className="flex h-full w-full flex-col bg-black/90 p-6 text-purple-200">
      <div className="mb-6 flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-purple-400" />
        <h2 className="text-xl font-bold tracking-tight text-white">Omniedia Score</h2>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 space-y-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-purple-400 font-mono">
          Global Ranking
        </div>
        
        <div className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400">
          {score.toLocaleString()}
        </div>
        
        <div className="flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/20 px-4 py-1.5 backdrop-blur-md">
          <Star className="h-4 w-4 text-yellow-400" />
          <span className="text-xs font-bold text-purple-200 uppercase tracking-widest">{rank} Rank</span>
        </div>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Engagement</span>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> +14%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Reach</span>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> +2.4k</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Social Links</span>
            <span className="text-xs font-mono text-white/80">3 connected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OmniediaApp;
