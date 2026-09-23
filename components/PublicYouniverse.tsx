import React from "react";
import PortalLayout from "./PortalLayout";
import { useYouniverse } from "./YouniverseProvider";
import { Rocket, ShieldCheck, Sparkles, ExternalLink, ArrowRight, Layers, Cpu } from "lucide-react";
import { motion } from "framer-motion";

interface PublicYouniverseProps {
  onEnterOs?: () => void;
}

const PublicYouniverse: React.FC<PublicYouniverseProps> = ({ onEnterOs }) => {
  const { identity } = useYouniverse();

  if (!identity || identity.kind !== "identity" || !identity.username) {
    return null;
  }

  const handleEnterOs = () => {
    if (onEnterOs) {
      onEnterOs();
    } else {
      localStorage.setItem(`youniverse_os_active_${identity.username}`, "true");
      window.location.reload();
    }
  };

  return (
    <PortalLayout>
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-12">
        {/* Subtle cosmic background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <div className="h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-500/15 via-purple-600/20 to-pink-500/10 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 flex w-full max-w-lg flex-col items-center text-center"
        >
          {/* Top Title: Required "The Youniverse" */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-4 py-1 text-xs uppercase tracking-[0.35em] text-cyan-300 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.15)]">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            <span>The Youniverse</span>
          </div>

          {/* Central Portal Avatar / Handle Orb */}
          <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-cyan-500/20 via-purple-900/40 to-black p-1 shadow-2xl backdrop-blur-2xl">
            <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-black/60 border border-white/10">
              <span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-mono">
                @
              </span>
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-black shadow-lg">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Identity Handle */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-md font-sans">
            @{identity.username}
          </h1>

          {/* Subdomain URL Badge */}
          <p className="mt-2 text-xs font-mono text-cyan-400/80 tracking-wide">
            {identity.username}.itsyouonline.com
          </p>

          <p className="mt-4 text-sm text-white/70 max-w-md leading-relaxed">
            Welcome to the sovereign digital space of <strong className="text-white">@{identity.username}</strong>. 
            Powered by client-side ONEAI, Weaver dynamic spatial builder, and Portals OS.
          </p>

          {/* Primary CTA: Launch / Enter Portals OS */}
          <div className="mt-8 flex w-full flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleEnterOs}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] transition-all hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(0,255,255,0.5)]"
            >
              <Rocket className="h-4 w-4" />
              <span>Enter Portals OS</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </button>

            <a
              href="https://itsyouonline.com"
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span>Gateway Hub</span>
              <ExternalLink className="h-3.5 w-3.5 text-white/50" />
            </a>
          </div>

          {/* Feature Overview Strip */}
          <div className="mt-10 grid w-full grid-cols-3 gap-2.5 text-left border-t border-white/10 pt-6">
            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <Cpu className="h-4 w-4 text-cyan-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">ONEAI</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">Sovereign personal brain</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <Layers className="h-4 w-4 text-purple-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">Weaver</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">Spatial UI builder</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-pink-400 mb-1.5" />
              <div className="text-[11px] font-semibold text-white">Books OS</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">100% offline vault</div>
            </div>
          </div>
        </motion.div>
      </div>
    </PortalLayout>
  );
};

export default PublicYouniverse;
