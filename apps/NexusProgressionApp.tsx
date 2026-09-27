import React, { useState } from "react";
import { AppProps } from "../types";
import { Rocket, Target, Zap, DollarSign, Award, Crown, TrendingUp, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STAGES = [
  {
    level: 0,
    title: "Ground Zero",
    revenue: "$0 / 0 Audience",
    icon: <Rocket className="w-6 h-6" />,
    color: "from-zinc-500 to-zinc-700",
    description: "ONEAI Discovery • Voice & Skill Extraction • 1st Free Youniverse",
    squads: ["ONEAI Discovery", "Bridge Validation Squad"],
    painPoint: "Imposter syndrome, no audience, no idea what to sell."
  },
  {
    level: 1,
    title: "First Dollar",
    revenue: "$1",
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500",
    description: "Break Zero Inertia • Sovereign Micro-Offer • Proof of Work",
    squads: ["Gamma Production", "Bridge Validation", "Cash Flow"],
    painPoint: "Overcoming the psychological barrier of never transacting online."
  },
  {
    level: 2,
    title: "The First $100",
    revenue: "$100",
    icon: <Zap className="w-6 h-6" />,
    color: "from-cyan-500 to-emerald-500",
    description: "Repeatable Micro-Sales • Validated Niche • Starter Digital Product",
    squads: ["Community Manager", "Research Squad", "Sales Engineering"],
    painPoint: "Lack of consistency, wondering if the first sale was just luck."
  },
  {
    level: 3,
    title: "The First $1,000",
    revenue: "$1,000",
    icon: <DollarSign className="w-6 h-6" />,
    color: "from-emerald-500 to-amber-500",
    description: "Productized Service • Automated Email Engine • Self-Serve Asset",
    squads: ["Gamma Production", "Developer Squad", "Cash Flow"],
    painPoint: "Trading time for money; burnout from manual messaging."
  },
  {
    level: 4,
    title: "The First $10,000",
    revenue: "$10,000",
    icon: <TrendingUp className="w-6 h-6" />,
    color: "from-amber-500 to-orange-500",
    description: "High-Ticket Funnel • Recurring Community • Retainers",
    squads: ["Customer Success", "Sales Engineering", "Shadow Operations"],
    painPoint: "Revenue plateau; inconsistent cash flow spikes."
  },
  {
    level: 5,
    title: "The First $100,000",
    revenue: "$100,000",
    icon: <Layers className="w-6 h-6" />,
    color: "from-orange-500 to-rose-500",
    description: "Full Squad Orchestration • Multi-Channel Distribution",
    squads: ["All 10 Tactical Squads deployed"],
    painPoint: "Operational complexity, customer support bottlenecks."
  },
  {
    level: 6,
    title: "The First $1,000,000",
    revenue: "$1,000,000",
    icon: <Award className="w-6 h-6" />,
    color: "from-rose-500 to-purple-500",
    description: "Full 'Money While You Sleep' • Autonomous Multi-Asset Ecosystem",
    squads: ["Project Command", "Shadow Operations", "Cash Flow"],
    painPoint: "Founder dependency; the business stops if you step away."
  },
  {
    level: 7,
    title: "Unicorn Status & Brand Exit",
    revenue: "Exit",
    icon: <Crown className="w-6 h-6" />,
    color: "from-purple-500 to-indigo-500",
    description: "Brand Equity Structuring • Secondary Market • Sellable Enterprise",
    squads: ["Cash Flow", "Research", "Project Command"],
    painPoint: "Wealth lock-up; realizing the ultimate value of the brand."
  }
];

const NexusProgressionApp: React.FC<AppProps> = () => {
  const [activeStage, setActiveStage] = useState(0);

  return (
    <div className="flex h-full w-full bg-[#05050A] text-white font-sans selection:bg-purple-900/50">
      
      {/* Sidebar - The Ladder */}
      <div className="w-80 border-r border-white/10 bg-black/40 flex flex-col p-6 overflow-y-auto custom-scrollbar">
        <div className="mb-8">
          <h1 className="text-2xl font-black tracking-widest uppercase bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            Nexus Roadmap
          </h1>
          <p className="text-xs font-mono text-white/50 mt-2">MONEY WHILE YOU SLEEP OS</p>
        </div>

        <div className="flex-1 flex flex-col gap-3 relative">
          {/* Vertical connecting line */}
          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-white/5 z-0" />
          
          {STAGES.map((stage) => (
            <button
              key={stage.level}
              onClick={() => setActiveStage(stage.level)}
              className={`relative z-10 w-full text-left group flex items-center gap-4 p-3 rounded-2xl transition-all ${activeStage === stage.level ? 'bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'hover:bg-white/5'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${stage.color} shadow-lg transition-transform group-hover:scale-105 ${activeStage === stage.level ? 'ring-2 ring-white/50' : 'opacity-70'}`}>
                {stage.icon}
              </div>
              <div>
                <div className="font-bold text-sm text-white">{stage.title}</div>
                <div className={`text-[10px] font-mono mt-1 ${activeStage === stage.level ? 'text-white' : 'text-white/50'}`}>
                  {stage.revenue}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden bg-black flex flex-col">
        {/* Dynamic Background Glow */}
        <div className={`absolute -inset-32 bg-gradient-to-br ${STAGES[activeStage].color} opacity-[0.03] blur-3xl transition-colors duration-1000 pointer-events-none`} />

        <AnimatePresence mode="wait">
          <motion.div 
            key={activeStage}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 p-12 overflow-y-auto custom-scrollbar relative z-10 flex flex-col justify-center max-w-4xl mx-auto w-full"
          >
            
            <div className="mb-6 flex items-center gap-4">
              <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono tracking-widest uppercase border border-white/20">
                Stage {STAGES[activeStage].level}
              </span>
              <span className={`text-xl font-mono font-bold bg-clip-text text-transparent bg-gradient-to-r ${STAGES[activeStage].color}`}>
                {STAGES[activeStage].revenue}
              </span>
            </div>

            <h2 className="text-6xl font-black tracking-tight mb-4">{STAGES[activeStage].title}</h2>
            
            <p className="text-xl text-white/60 mb-12 max-w-2xl leading-relaxed">
              {STAGES[activeStage].description}
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md hover:bg-white/10 transition-colors">
                <h3 className="text-xs font-black tracking-[0.2em] uppercase text-rose-400 mb-4">Target Pain Point</h3>
                <p className="text-white/80 leading-relaxed text-lg">"{STAGES[activeStage].painPoint}"</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md hover:bg-white/10 transition-colors">
                <h3 className="text-xs font-black tracking-[0.2em] uppercase text-emerald-400 mb-4">Nexus Squads Deployed</h3>
                <div className="flex flex-wrap gap-2">
                  {STAGES[activeStage].squads.map(squad => (
                    <span key={squad} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-sm font-bold">
                      {squad}
                    </span>
                  ))}
                </div>
              </div>

            </div>

            {/* CTA */}
            <div className="mt-12 flex justify-end">
              <button className={`px-8 py-4 rounded-2xl bg-gradient-to-r ${STAGES[activeStage].color} font-black uppercase tracking-widest text-sm shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-all`}>
                Initialize Stage {STAGES[activeStage].level}
              </button>
            </div>

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NexusProgressionApp;
