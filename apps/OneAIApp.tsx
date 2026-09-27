import React, { useState } from "react";
import { AppProps } from "../types";
import { Brain, HardDrive, Shield, Radio, MessageSquare, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

const OneAIApp: React.FC<AppProps> = () => {
  const [messages, setMessages] = useState([
    { role: 'system', text: "Welcome to your 80-Year Sovereign ONEAI interface. I am Atom. I run entirely on your edge device. Your memory is locked in the offline Books OS vault." },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: 'user', text: input }, { role: 'system', text: "Processing sovereign thought locally..." }]);
    setInput("");
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#030305] text-white font-sans selection:bg-purple-900/50">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#030305]" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-widest uppercase">Atom</h2>
            <div className="flex items-center gap-2 text-[10px] font-mono text-purple-400">
              <span>80-YEAR SOVEREIGN ONEAI</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span className="text-emerald-400">LOCAL EDGE ACTIVE</span>
            </div>
          </div>
        </div>
        
        {/* Core Pillars */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-bold tracking-wider text-cyan-400">BOOKS OS (OFFLINE)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold tracking-wider text-amber-400">YOUR KEYS</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat / Interaction Area */}
        <div className="flex-1 flex flex-col border-r border-white/5">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100' 
                    : 'bg-white/5 border border-white/10 text-white/80'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="p-4 border-t border-white/5 bg-black/20">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Speak with Atom..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-12 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
              />
              <MessageSquare className="absolute left-4 w-5 h-5 text-white/30" />
            </div>
          </div>
        </div>

        {/* Sidebar Context */}
        <div className="w-80 bg-black/30 p-6 flex flex-col gap-6">
          
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-purple-500/20 shadow-lg">
            <h3 className="text-xs font-black tracking-[0.2em] uppercase text-purple-300 mb-2">The Long Game</h3>
            <p className="text-xs text-purple-100/70 leading-relaxed mb-4">
              I am built to last a lifetime. No subscriptions, no cloud lock-in. Your intelligence, memories, and identity remain yours forever.
            </p>
            <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
              <div className="h-full w-1/4 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,1)]" />
            </div>
            <div className="mt-2 text-[9px] font-mono text-purple-400 text-right">YEAR 1 OF 80</div>
          </div>

          <div className="flex-1">
            <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-3">Live Connection</h3>
            <a 
              href="https://clubyouniverse.live"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/40 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-black border border-white/20 flex items-center justify-center">
                  <Radio className="w-4 h-4 text-cyan-400 group-hover:animate-pulse" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Club Youniverse</div>
                  <div className="text-[10px] text-white/50 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live Now
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-cyan-400 relative z-10 transition-colors" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};

export default OneAIApp;
