import React, { useState, useRef, useEffect } from "react";
import { AppProps } from "../types";
import { Hexagon, Sparkles, Command, Layout, Code2, Monitor, ArrowRight, Zap, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  id: string;
  role: "user" | "weaver";
  content: string;
  widget?: any;
};

const MOCK_WIDGETS = {
  crypto: (
    <div className="p-6 bg-black/50 border border-fuchsia-500/30 rounded-2xl w-full h-full flex flex-col gap-4">
      <h3 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-indigo-400">CRYPTO_NEXUS</h3>
      <div className="grid grid-cols-2 gap-4 flex-1">
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-between border border-white/5 hover:border-fuchsia-500/50 transition-colors">
          <span className="text-white/50 text-xs font-mono">BTC/USD</span>
          <span className="text-2xl font-bold text-green-400">$84,230.00</span>
          <span className="text-xs text-green-500/70">+4.2%</span>
        </div>
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-between border border-white/5 hover:border-indigo-500/50 transition-colors">
          <span className="text-white/50 text-xs font-mono">ETH/USD</span>
          <span className="text-2xl font-bold text-red-400">$3,420.50</span>
          <span className="text-xs text-red-500/70">-1.1%</span>
        </div>
        <div className="col-span-2 bg-gradient-to-r from-fuchsia-500/10 to-indigo-500/10 rounded-xl p-4 border border-white/5">
          <div className="h-full w-full flex items-end gap-1">
            {[40, 60, 45, 80, 55, 90, 75, 100].map((h, i) => (
              <div key={i} className="flex-1 bg-fuchsia-500/50 rounded-t-sm transition-all duration-500 hover:bg-fuchsia-400" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
  habit: (
    <div className="p-6 bg-zinc-900 border border-emerald-500/30 rounded-2xl w-full h-full flex flex-col gap-4">
      <h3 className="text-xl font-bold text-emerald-400 font-mono tracking-tight">HABIT_TRACKER_V1</h3>
      <div className="flex-1 flex flex-col gap-3">
        {["Code for 2 hours", "Drink 3L Water", "Read 20 pages"].map((task, i) => (
          <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-black/40 border border-white/10 group hover:border-emerald-500/50 cursor-pointer">
            <div className={`w-6 h-6 rounded-md border-2 border-emerald-500/50 flex items-center justify-center ${i === 0 ? 'bg-emerald-500/20' : ''}`}>
              {i === 0 && <div className="w-3 h-3 bg-emerald-400 rounded-sm" />}
            </div>
            <span className={i === 0 ? "text-emerald-400 line-through opacity-70" : "text-white"}>{task}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  default: (
    <div className="flex flex-col items-center justify-center w-full h-full border border-dashed border-white/20 rounded-3xl bg-white/5">
      <Layout className="w-12 h-12 text-white/20 mb-4" />
      <p className="text-white/40 font-mono text-sm">Awaiting conceptualization...</p>
    </div>
  )
};

const WeaverApp: React.FC<AppProps> = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "weaver",
      content: "I am Weaver. Spatial Architect of your Youniverse. Tell me what to build, and I will shape it into reality. Widgets, dashboards, PWAs—anything goes. MySpace on super crack. What are we creating?",
    }
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeWidget, setActiveWidget] = useState<React.ReactNode>(MOCK_WIDGETS.default);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsGenerating(true);

    // Simulate generation process
    setTimeout(() => {
      let widgetType = 'default';
      const lowercaseInput = userMsg.content.toLowerCase();
      
      if (lowercaseInput.includes('crypto') || lowercaseInput.includes('bitcoin') || lowercaseInput.includes('chart')) {
        widgetType = 'crypto';
      } else if (lowercaseInput.includes('habit') || lowercaseInput.includes('task') || lowercaseInput.includes('todo')) {
        widgetType = 'habit';
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "weaver",
        content: `Conceptualized. Architecting ${widgetType === 'default' ? 'custom' : widgetType} component. Compiling UI and injecting into your Youniverse space...`
      }]);
      
      if (widgetType !== 'default') {
        setActiveWidget(MOCK_WIDGETS[widgetType as keyof typeof MOCK_WIDGETS]);
      } else {
        // Fallback random generative look
        setActiveWidget(
          <div className="p-6 bg-black border border-white/20 rounded-2xl w-full h-full flex flex-col justify-center items-center">
            <Hexagon className="w-16 h-16 text-fuchsia-500 mb-4 animate-pulse" />
            <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-indigo-400">
              CUSTOM_NEXUS_WIDGET
            </div>
            <div className="mt-4 text-white/50 text-center text-sm font-mono max-w-xs">
              Dynamically generated based on "{userMsg.content}".
            </div>
          </div>
        );
      }

      setIsGenerating(false);
    }, 2500);
  };

  return (
    <div className="flex h-full w-full bg-[#020202] text-white font-sans selection:bg-fuchsia-900/50">
      
      {/* Left Panel: Chat / Prompt Interface */}
      <div className="w-1/2 border-r border-white/10 flex flex-col relative z-10 bg-black/40 backdrop-blur-xl">
        <div className="p-6 border-b border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(192,38,211,0.3)]">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black tracking-widest uppercase text-white">Weaver</h2>
            <div className="text-[10px] font-mono text-fuchsia-400/80">GENERATIVE SPACE ARCHITECT</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1 ${
                  msg.role === 'user' ? 'bg-white/10' : 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30'
                }`}>
                  {msg.role === 'user' ? <Command className="w-4 h-4" /> : <Hexagon className="w-4 h-4" />}
                </div>
                <div className={`p-4 rounded-2xl max-w-[80%] ${
                  msg.role === 'user' 
                    ? 'bg-white/10 text-white rounded-tr-none' 
                    : 'bg-gradient-to-br from-fuchsia-900/20 to-indigo-900/20 border border-fuchsia-500/20 text-fuchsia-100 rounded-tl-none font-mono text-sm leading-relaxed'
                }`}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                    <RefreshCw className="w-4 h-4" />
                  </motion.div>
                </div>
                <div className="p-4 rounded-2xl bg-fuchsia-900/10 border border-fuchsia-500/20 text-fuchsia-300/70 font-mono text-sm rounded-tl-none flex items-center gap-2">
                  Architecting geometry... <span className="animate-pulse">_</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 border-t border-white/5">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000" />
            <div className="relative bg-black border border-white/10 rounded-2xl p-2 flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="E.g., Build me a cyberpunk crypto tracker..."
                disabled={isGenerating}
                className="flex-1 bg-transparent border-none outline-none px-4 py-2 text-white placeholder-white/30"
              />
              <button 
                type="submit"
                disabled={isGenerating || !input.trim()}
                className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                <ArrowRight className="w-5 h-5 text-white" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Panel: Preview Area */}
      <div className="w-1/2 p-8 relative flex flex-col">
        {/* Decorative background grid */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
        
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-white/50" />
            <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-white/50">Space Canvas</h3>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs font-mono text-white/70 flex items-center gap-2">
              <Code2 className="w-3 h-3" /> View Source
            </button>
            <button className="px-3 py-1.5 rounded-md bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/50 text-xs font-mono text-fuchsia-300 flex items-center gap-2 shadow-[0_0_10px_rgba(192,38,211,0.2)]">
              <Zap className="w-3 h-3" /> Deploy to Desktop
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={isGenerating ? "generating" : "ready"}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-lg aspect-square shadow-2xl"
            >
              {activeWidget}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      
    </div>
  );
};

export default WeaverApp;
