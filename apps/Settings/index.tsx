import React, { useState } from 'react';
import { useKernel } from '../../store/kernel';
import { PORTAL_BACKGROUNDS } from '../../constants';
import { Monitor, Palette, Cpu, Info, Shield, HardDrive, Wifi, CheckCircle2 } from 'lucide-react';

const Settings: React.FC = () => {
  const currentWallpaper = useKernel(state => state.wallpaper);
  const setWallpaper = useKernel(state => state.setWallpaper);
  const theme = useKernel(state => state.theme);
  const toggleTheme = useKernel(state => state.toggleTheme);
  
  const [activeTab, setActiveTab] = useState('personalization');

  return (
    <div className="flex h-full bg-[#05050A] text-white/90 overflow-hidden font-sans selection:bg-cyan-900/50">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-white/10 bg-black/40 flex flex-col pt-6">
        <div className="px-6 mb-8">
          <h1 className="text-xl font-black tracking-widest uppercase">Settings</h1>
          <p className="text-[10px] font-mono text-cyan-400 mt-1">PORTALS OS CONFIG</p>
        </div>
        
        <nav className="flex-1 px-3 space-y-1">
          <button 
            onClick={() => setActiveTab('personalization')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'personalization' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Palette className="w-4 h-4" /> Personalization
          </button>
          <button 
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'system' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Monitor className="w-4 h-4" /> System & Display
          </button>
          <button 
            onClick={() => setActiveTab('network')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'network' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Wifi className="w-4 h-4" /> Network & Uplink
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'security' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Shield className="w-4 h-4" /> Security & Identity
          </button>
          <button 
            onClick={() => setActiveTab('about')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'about' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
          >
            <Info className="w-4 h-4" /> About Portals OS
          </button>
        </nav>
        
        <div className="p-4 border-t border-white/10 text-[9px] font-mono text-white/30 uppercase tracking-widest">
          Version 1.2.0-rc4
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="p-10 max-w-4xl mx-auto relative z-10">
          
          {/* PERSONALIZATION TAB */}
          {activeTab === 'personalization' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-black tracking-wide mb-2">Personalization</h2>
                <p className="text-white/50 text-sm">Customize the appearance of your Sovereign Youniverse.</p>
              </div>

              {/* Theme Toggle */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-6">System Theme</h3>
                <div className="flex gap-4">
                  <button 
                    onClick={() => theme !== 'dark' && toggleTheme()}
                    className={`flex-1 flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-black border border-white/20 mb-3 flex items-center justify-center">🌙</div>
                    <span className="font-bold text-sm">Dark Matter</span>
                  </button>
                  <button 
                    onClick={() => theme !== 'light' && toggleTheme()}
                    className={`flex-1 flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-white border border-black/20 mb-3 flex items-center justify-center">☀️</div>
                    <span className="font-bold text-sm">Light Speed</span>
                  </button>
                </div>
              </div>

              {/* Backgrounds */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/40">Desktop Background</h3>
                  <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-400/10 px-2 py-1 rounded border border-cyan-400/20">{PORTAL_BACKGROUNDS.length} Available</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {PORTAL_BACKGROUNDS.map((url, idx) => (
                    <button
                      key={url}
                      onClick={() => setWallpaper(url)}
                      className={`group relative aspect-video rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                        currentWallpaper === url 
                          ? 'border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] scale-[1.02]' 
                          : 'border-transparent hover:border-white/30'
                      }`}
                    >
                      <img src={url} alt={`Wallpaper ${idx+1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      
                      {currentWallpaper === url && (
                        <div className="absolute top-2 right-2 bg-cyan-500 text-black p-1 rounded-full shadow-lg">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                        <span className="text-[10px] text-white/80 font-bold tracking-wider">SET AS ACTIVE</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SYSTEM TAB */}
          {activeTab === 'system' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-black tracking-wide mb-2">System & Display</h2>
                <p className="text-white/50 text-sm">Hardware allocation and rendering settings.</p>
              </div>

              <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/40 mb-6">Hardware Status</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="text-sm font-bold text-white">Quantum Core Usage</div>
                        <div className="text-[10px] text-white/40">Virtual Threading Active</div>
                      </div>
                    </div>
                    <div className="font-mono text-cyan-400">12.4%</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-purple-400" />
                      <div>
                        <div className="text-sm font-bold text-white">Sovereign Memory</div>
                        <div className="text-[10px] text-white/40">Encrypted VFS</div>
                      </div>
                    </div>
                    <div className="font-mono text-purple-400">2.1GB / 1TB</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABOUT TAB */}
          {activeTab === 'about' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-10">
              <div className="w-32 h-32 mx-auto rounded-3xl bg-linear-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(6,182,212,0.1)]">
                <span className="text-5xl">🌌</span>
              </div>
              <h2 className="text-3xl font-black tracking-[0.2em] uppercase text-white">Portals OS</h2>
              <p className="text-cyan-400 font-mono tracking-widest text-sm">THE SOVEREIGN YOUNIVERSE</p>
              
              <div className="max-w-md mx-auto text-white/50 text-sm leading-relaxed mt-6">
                Portals OS is the foundational architecture for your sovereign digital identity. 
                Powered by client-side ONEAI, it provides a deterministic, private, and endlessly scalable interface to the spatial web.
              </div>
              
              <div className="mt-12 flex justify-center gap-4">
                <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white/40">
                  Build: 2026.09.24
                </div>
                <div className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400">
                  System: GREEN
                </div>
              </div>
            </div>
          )}

          {/* PLACEHOLDERS FOR OTHER TABS */}
          {['network', 'security'].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center h-64 text-white/30 animate-in fade-in duration-500">
              <Monitor className="w-12 h-12 mb-4 opacity-50" />
              <p className="font-mono uppercase tracking-widest text-sm">Module Offline</p>
              <p className="text-xs mt-2">This configuration panel is currently locked.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;
