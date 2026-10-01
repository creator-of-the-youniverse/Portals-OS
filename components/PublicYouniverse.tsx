import React, { useEffect, useState } from 'react';
import { Globe, Lock, ShieldCheck, Terminal, Cpu, ArrowUpRight } from 'lucide-react';

interface PublicYouniverseProps {
  handle: string;
  onOpenLoginModal: () => void;
}

interface PublicWidget {
  id: string;
  title: string;
  content: {
    type: string;
    code?: string;
  };
  updatedAt: string;
}

export default function PublicYouniverse({ handle, onOpenLoginModal }: PublicYouniverseProps) {
  const [profile, setProfile] = useState<any>(null);
  const [widgets, setWidgets] = useState<PublicWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPublicData() {
      try {
        const res = await fetch(`/api/youniverse/${handle}/public`);
        const data = await res.json();
        
        if (data.success) {
          setProfile(data.youniverse);
          setWidgets(data.publicWidgets);
        } else {
          setError(data.error || "Youniverse not found.");
        }
      } catch (err) {
        console.error("Failed to load public profile", err);
        setError("Network error connecting to sovereign node.");
      } finally {
        setLoading(false);
      }
    }
    fetchPublicData();
  }, [handle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono">
        <div className="animate-pulse flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-500" />
          <span>Booting sovereign node @{handle}...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center p-6 font-mono text-center">
        <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 font-bold text-lg">
            !
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Node Unreachable</h2>
          <p className="text-zinc-400 text-xs mb-6 leading-relaxed">{error}</p>
          <a
            href="https://itsyouonline.com"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs px-4 py-2 rounded-md transition-colors"
          >
            Return to Gateway <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-zinc-950">
      {/* Top Sovereign Navigation Header */}
      <header className="border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between bg-zinc-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-zinc-950 font-bold shadow-lg shadow-emerald-950/50 font-mono">
            {handle.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-200">@{profile?.handle || handle}.itsyouonline.com</h1>
            <p className="text-xs text-zinc-500 font-mono">Sovereign Decentralized Node</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a 
            href="https://itsyouonline.com" 
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors font-mono"
          >
            <Globe className="w-3.5 h-3.5 text-zinc-500" />
            Gateway
          </a>
          <button
            onClick={onOpenLoginModal}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3.5 py-1.5 rounded-md border border-zinc-700 flex items-center gap-1.5 transition-all font-mono shadow-sm"
          >
            <Lock className="w-3 h-3 text-emerald-400" />
            Owner Access
          </button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-16">
        <section className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-6 shadow-inner">
            <ShieldCheck className="w-3.5 h-3.5" /> Verified Sovereign Instance • {profile?.type || 'STANDARD'}
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight text-white mb-4">
            Welcome to @{handle}'s Digital Domain
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            An independent autonomous node powered by Portals OS and intelligent micro-utilities. Operating securely on the itsyouonline.com network.
          </p>
        </section>

        {/* Public Applets & Artifacts Showcase */}
        <section>
          <div className="flex items-center justify-between mb-6 border-b border-zinc-800 pb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" /> Published Public Applets ({widgets.length})
            </h3>
            <span className="text-xs text-zinc-600 font-mono">Read-Only View</span>
          </div>

          {widgets.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/20">
              <p className="text-zinc-500 text-xs font-mono">No public applets published to this node yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {widgets.map((widget) => (
                <div 
                  key={widget.id}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <h4 className="font-semibold text-sm text-zinc-200 mb-1">{widget.title}</h4>
                    <p className="text-xs text-zinc-500 font-mono">
                      {widget.content?.type || 'REACT_WIDGET'} • ID: {widget.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="mt-6 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <span className="text-emerald-500/80">● Live</span>
                    <span className="text-zinc-500">{new Date(widget.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900/80 py-6 text-center text-xs text-zinc-600 font-mono bg-zinc-950">
        Powered by Portals OS • Secure Sovereign Architecture
      </footer>
    </div>
  );
}
