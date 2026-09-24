import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Shield, Zap, ChevronRight, MessageSquare, 
  Terminal, LayoutDashboard, Settings, Star, 
  BarChart3, CheckCircle2, AlertTriangle, ArrowUpRight,
  Loader2, ExternalLink, Wifi, WifiOff, FileText, Check
} from 'lucide-react';
import { NEXUS_AGENTS, NEXUS_SQUADS } from '../../constants/platoon';

interface AgentPWAProps {
  metadata?: {
    id?: string;
    url?: string;
    agentName?: string;
  };
}

// Generate some smooth SVG sparklines based on string seeds
const generateSparkline = (seed: number, points: number, width: number, height: number) => {
  let d = `M 0 ${height / 2}`;
  let y = height / 2;
  for (let i = 1; i <= points; i++) {
    const x = (i / points) * width;
    const change = Math.sin(seed * i) * (height / 3);
    y = Math.max(10, Math.min(height - 10, y + change));
    // Smooth curve
    d += ` S ${x - (width/points)/2} ${y}, ${x} ${y}`;
  }
  return d;
};

const AgentPWA: React.FC<AgentPWAProps> = ({ metadata }) => {
  const [currentAgentId, setCurrentAgentId] = useState(metadata?.id || 'AC');
  const agent = NEXUS_AGENTS.find(a => a.id === currentAgentId) || NEXUS_AGENTS[0];
  const squad = NEXUS_SQUADS.find(s => s.id === agent.squadId);
  const squadOperatives = squad ? NEXUS_AGENTS.filter(a => squad.agentIds.includes(a.id)) : [agent];
  
  const [activeTab, setActiveTab] = useState('AGENT OVERVIEW');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  
  // Deterministic mock metrics based on agent id
  const charSum = agent.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const leverage = (90 + (charSum % 10)) + ((charSum % 100) / 100);
  const secured = (10 + (charSum % 80)) + '.' + (charSum % 9);
  const activeRate = 5 + (charSum % 20);
  const processed = 10000 + (charSum * 123);
  
  const TABS = ['AGENT OVERVIEW', 'ARTIFACT GENERATOR', 'ACTIVE TERMINAL', 'SOVEREIGN CHAT'];

  return (
    <div className="h-full w-full bg-[#05050A] text-white/80 font-sans flex overflow-hidden selection:bg-cyan-900/50">
      
      {/* LEFT SIDEBAR - SQUAD CONTEXT */}
      <div className="w-[260px] shrink-0 border-r border-white/5 bg-black/40 flex flex-col">
        {/* Squad Header */}
        <div className="p-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h2 className="font-black text-white tracking-widest">{agent.squadId || 'SQUAD'}</h2>
          </div>
          <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold tracking-widest flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE
          </div>
        </div>

        {/* Network Operation */}
        <div className="p-5 border-b border-white/5 space-y-3">
          <h3 className="text-[10px] text-white/40 tracking-[0.2em] font-bold uppercase mb-4">Network Operation</h3>
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2 text-white/60">
              <Activity className="w-3.5 h-3.5" /> Nodes Syncing
            </div>
            <div className="font-mono text-cyan-400">100% <span className="text-cyan-400/50">[{charSum*2}/{charSum*2}]</span></div>
          </div>
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2 text-white/60">
              <BarChart3 className="w-3.5 h-3.5" /> Leverage Index
            </div>
            <div className="font-mono text-purple-400">{leverage.toFixed(1)}% <span className="text-purple-400/50">(Opt-Max)</span></div>
          </div>
        </div>

        {/* Squad Operatives */}
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
          <h3 className="text-[10px] text-white/40 tracking-[0.2em] font-bold uppercase mb-4">Squad Operatives</h3>
          <div className="space-y-2">
            {squadOperatives.map(op => {
              const isActive = op.id === agent.id;
              return (
                <div 
                  key={op.id}
                  onClick={() => setCurrentAgentId(op.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]' 
                      : 'bg-white/5 border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-linear-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center text-sm">
                    {op.icon || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{op.name}</div>
                    <div className="text-[10px] text-white/40 truncate">{op.role} • {op.category}</div>
                  </div>
                  <div className="text-[10px] font-mono text-white/20">{op.id}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Version */}
        <div className="p-4 border-t border-white/5 text-[9px] font-mono text-white/20 tracking-widest uppercase">
          {agent.name} CORE V1.0.0 // BY SQUADS
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Background gradient hint */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* TOP HEADER */}
        <div className="p-6 md:p-8 flex items-start justify-between border-b border-white/5 relative z-10">
          <div className="flex gap-6 max-w-[60%]">
            <div className="w-20 h-20 rounded-2xl bg-white shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center text-4xl shrink-0">
              {agent.icon || '🤖'}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-black text-white tracking-wide">{agent.name}</h1>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold tracking-widest uppercase text-white/80">{agent.role}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold tracking-widest uppercase text-white/80">{agent.category}</span>
                </div>
              </div>
              <p className="text-white/60 text-sm mb-4 leading-relaxed max-w-xl">{agent.description}</p>
              
              {agent.oracleInsight && (
                <div className="flex items-start gap-2 text-yellow-500/90 text-xs italic font-medium">
                  <Star className="w-4 h-4 shrink-0 fill-yellow-500/50" />
                  <p>ORACLE INSIGHT: "{agent.oracleInsight}"</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Right Metrics */}
          <div className="flex gap-4">
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 w-32 flex flex-col justify-center">
              <div className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-2">Sovereign Leverage</div>
              <div className="text-xl font-mono text-white">{leverage.toFixed(1)}%</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 w-32 flex flex-col justify-center">
              <div className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-2">IP Secured</div>
              <div className="text-xl font-mono text-cyan-400">${secured}M</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 w-32 flex flex-col justify-center">
              <div className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-2">Processed</div>
              <div className="text-xl font-mono text-purple-400">{processed.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="flex items-center border-b border-white/5 px-8 relative z-10">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-[11px] font-bold tracking-[0.15em] uppercase border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab 
                  ? 'border-cyan-400 text-cyan-400' 
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              {tab === 'AGENT OVERVIEW' && <LayoutDashboard className="w-3.5 h-3.5" />}
              {tab === 'ARTIFACT GENERATOR' && <FileText className="w-3.5 h-3.5" />}
              {tab === 'ACTIVE TERMINAL' && <Terminal className="w-3.5 h-3.5" />}
              {tab === 'SOVEREIGN CHAT' && <MessageSquare className="w-3.5 h-3.5" />}
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENT: AGENT OVERVIEW */}
        {activeTab === 'AGENT OVERVIEW' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 relative z-10">
            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {(agent.toolCard?.useThisWhen || ['Initiate Protocol', 'Establish Baseline', 'Execute Operation']).slice(0, 3).map((feature, i) => (
                <div key={i} className="bg-linear-to-b from-white/3 to-transparent border border-white/5 rounded-xl p-6 hover:border-white/20 transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {i === 0 ? <Shield className="w-5 h-5 text-cyan-400" /> : i === 1 ? <Zap className="w-5 h-5 text-yellow-400" /> : <Terminal className="w-5 h-5 text-purple-400" />}
                  </div>
                  <h3 className="text-white font-bold mb-2">{feature}</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-4 line-clamp-3">
                    {agent.toolCard?.purpose || agent.description}
                  </p>
                  <div className="text-[10px] font-mono font-bold tracking-widest flex items-center gap-2">
                    <span className={i === 0 ? "text-cyan-400" : i === 1 ? "text-yellow-400" : "text-purple-400"}>STATUS: HYPER-ACTIVE</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Graphs Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-black/30 border border-white/5 rounded-xl p-6 h-48 relative overflow-hidden flex flex-col">
                <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4 z-10">Operational Output (24H)</div>
                <div className="flex-1 relative">
                  <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d={generateSparkline(charSum, 10, 100, 100)} fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-500/50" />
                  </svg>
                  {/* Grid lines */}
                  <div className="absolute inset-0 border-t border-b border-white/5 flex justify-between px-2 py-1 pointer-events-none">
                    <span className="text-[8px] text-white/20 font-mono">00:00</span>
                    <span className="text-[8px] text-white/20 font-mono">12:00</span>
                    <span className="text-[8px] text-white/20 font-mono">24:00</span>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-6 h-48 relative overflow-hidden flex flex-col">
                <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4 z-10">Resource Allocation & Efficiency</div>
                <div className="flex-1 relative">
                  <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d={generateSparkline(charSum * 2, 8, 100, 100)} fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500/50" />
                  </svg>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded text-[9px] font-mono text-purple-200 pointer-events-none">
                    PEAK EFFICIENCY
                  </div>
                </div>
              </div>
            </div>

            {/* Operational Core Status */}
            <div className="border border-white/5 bg-black/20 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/2">
                <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Operational Core Status</div>
                <div className="px-2 py-1 rounded bg-white/5 text-[9px] font-mono text-white/60">ALL MODULES GREEN</div>
              </div>
              <div className="divide-y divide-white/5">
                {(agent.toolCard?.outputDelivered || ['Primary Module', 'Secondary Protocol', 'Integration Layer', 'Comms Stream']).map((output, idx) => (
                  <div key={idx} className="p-4 flex justify-between items-center hover:bg-white/2 transition-colors">
                    <div className="text-sm font-medium text-white/80">{output}</div>
                    <div className={`text-[10px] font-mono font-bold tracking-widest flex items-center gap-2 ${
                      idx === 0 ? 'text-emerald-400' : idx === 1 ? 'text-emerald-400' : idx === 2 ? 'text-yellow-400' : 'text-cyan-400'
                    }`}>
                      {idx === 0 ? 'ONLINE (Latency 14ms)' : idx === 1 ? 'SYNCED (1.7M Signatures)' : idx === 2 ? 'RE-ROUTING CAPABILITIES' : 'LINKED (SQUAD)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: ACTIVE TERMINAL (The original iframe) */}
        {activeTab === 'ACTIVE TERMINAL' && (
          <div className="flex-1 relative bg-black overflow-hidden">
            {!(agent.url || metadata?.url) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 gap-4 overflow-y-auto">
                <AlertTriangle className="w-10 h-10 text-yellow-500/60" />
                <p className="text-sm font-mono tracking-widest uppercase">No Terminal URL Configured</p>
                <p className="text-xs text-white/40 text-center">This agent does not have an active deployment URL.</p>
              </div>
            ) : (
              <>
                {!iframeLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#05050A] z-10">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <div className="text-center">
                      <p className="text-white/80 text-[10px] font-black tracking-[0.2em] uppercase mb-2">ESTABLISHING SECURE UPLINK</p>
                      <p className="text-cyan-400/50 text-[10px] font-mono">{(agent.url || metadata!.url).replace('https://', '')}</p>
                    </div>
                  </div>
                )}
                <iframe
                  src={agent.url || metadata?.url}
                  className="w-full h-full border-0 bg-transparent"
                  onLoad={() => setIframeLoaded(true)}
                  allow="clipboard-write; microphone; camera; display-capture"
                  title="Agent Terminal"
                />
              </>
            )}
          </div>
        )}

        {/* TAB CONTENT: ARTIFACT GENERATOR */}
        {activeTab === 'ARTIFACT GENERATOR' && (
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-black text-white tracking-[0.2em] uppercase mb-1">Artifact Synthesis</h1>
                <p className="text-white/40 text-sm">Aggregating deliverables from {squad?.name || agent.category} squad operatives.</p>
              </div>
              <button className="px-6 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30 font-bold tracking-widest text-[10px] rounded uppercase flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <Check className="w-4 h-4" /> Generate Final Artifact
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
              {/* Left Column: Operative Deliverables */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Operative Deliverables Pipeline</div>
                
                <div className="space-y-4">
                  {squadOperatives.map((op, idx) => {
                    const opCharSum = op.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const opLeverage = (80 + (opCharSum % 20)) + ((opCharSum % 100) / 100);
                    
                    return (
                    <div key={op.id} className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-6 hover:bg-white/5 transition-colors">
                      <div className="flex items-start gap-4 md:w-1/3">
                        <div className="w-12 h-12 rounded bg-white/5 border border-white/10 flex items-center justify-center text-2xl shrink-0">
                          {op.icon || '🤖'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-white text-sm">{op.name}</h4>
                          </div>
                          <div className="text-[10px] text-white/40 truncate">{op.role}</div>
                          <div className="mt-2 text-[9px] font-mono text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 rounded inline-block">
                            UPLINK: ACTIVE
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
                        <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-2">Deliverables & Payload</div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(op.toolCard?.outputDelivered || ['Context Map', 'Initial Findings']).map((output, i) => (
                            <div key={i} className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded text-white/70 flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-500/70" />
                              {output}
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex items-end gap-4 h-12">
                          <div className="flex-1 h-full relative border-b border-white/10">
                            <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                              <path d={generateSparkline(opCharSum * 5, 8, 100, 100)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-500/60" />
                            </svg>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] text-white/40 uppercase tracking-widest">Confidence</div>
                            <div className="text-lg font-mono text-cyan-400">{opLeverage.toFixed(1)}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
              
              {/* Right Column: Synthesis Stats & Graphs */}
              <div className="flex flex-col gap-6">
                <div className="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden">
                  <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4 z-10 relative">Synthesis Confidence</div>
                  <div className="text-4xl font-black text-white mb-2 relative z-10">{leverage.toFixed(1)}%</div>
                  <p className="text-xs text-white/50 relative z-10 mb-6">Based on cross-referenced deliverables.</p>
                  
                  <div className="h-24 relative z-10 border-b border-white/10">
                    <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d={generateSparkline(charSum * 3, 12, 100, 100)} fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-500/50" />
                    </svg>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-xl p-6">
                  <div className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4">Pipeline Status</div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Data Aggregation</span>
                      <span className="text-emerald-400">Complete</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Context Mapping</span>
                      <span className="text-emerald-400">Complete</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Logic Synthesis</span>
                      <span className="text-yellow-400">In Progress (84%)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Draft Generation</span>
                      <span className="text-white/20">Pending</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: SOVEREIGN CHAT */}
        {activeTab === 'SOVEREIGN CHAT' && (
          <div className="flex-1 flex flex-col bg-[#05050A]">
            {/* Chat Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-white/5 border border-white/10 flex items-center justify-center text-lg">
                  {agent.icon || '🤖'}
                </div>
                <div>
                  <h3 className="font-bold text-white">{agent.name} <span className="text-white/40 font-normal">Terminal</span></h3>
                  <p className="text-[10px] text-white/40 font-mono">Secure Sovereign Channel [{agent.id}]</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                UPLINK ESTABLISHED
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="flex justify-center">
                <span className="text-[10px] font-bold tracking-widest text-white/20 uppercase bg-black/50 px-3 py-1 rounded-full border border-white/5">Session Started</span>
              </div>
              
              {/* Agent Message */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded shrink-0 bg-white/5 border border-white/10 flex items-center justify-center text-sm">
                  {agent.icon || '🤖'}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">{agent.name}</span>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl rounded-tl-none text-sm text-white/80 max-w-2xl leading-relaxed">
                    Sovereign communication channel is active. I have loaded the {agent.squadId} squad context and my operational parameters. How can I assist with the current directive?
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-white/5 bg-black/40">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder={`Send a secure message to ${agent.name}...`}
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-4 pr-12 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/5 rounded text-white/40 hover:text-cyan-400 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentPWA;

