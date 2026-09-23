import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  Rocket,
  Globe,
  Zap,
  Users,
  Building2,
  Check,
  ArrowRight,
  Mail,
  Star,
  ExternalLink,
} from "lucide-react";
import PortalLayout from "./PortalLayout";

// ============================================================
// TYPES
// ============================================================

interface YouniverePack {
  id: string;
  name: string;
  icon: React.ReactNode;
  slots: number;
  price: string;
  priceNote: string;
  color: string;
  glow: string;
  features: string[];
  badge?: string;
  popular?: boolean;
}

// ============================================================
// DATA
// ============================================================

const PACKS: YouniverePack[] = [
  {
    id: "free",
    name: "Sovereign Free",
    icon: <Sparkles className="h-5 w-5" />,
    slots: 1,
    price: "$0",
    priceNote: "forever",
    color: "from-cyan-500/20 via-cyan-900/30 to-black",
    glow: "rgba(0,255,255,0.3)",
    features: [
      "1 Youniverse handle",
      "Full Portals OS desktop",
      "ONEAI personal companion",
      "Weaver spatial builder",
      "Books OS offline vault",
    ],
  },
  {
    id: "starter",
    name: "Starter Pack",
    icon: <Globe className="h-5 w-5" />,
    slots: 3,
    price: "$9",
    priceNote: "/mo",
    color: "from-violet-500/20 via-purple-900/30 to-black",
    glow: "rgba(139,92,246,0.3)",
    features: [
      "3 Youniverse handles",
      "All Sovereign Free features",
      "Priority ONEAI processing",
      "Custom domain redirect",
      "Early feature access",
    ],
  },
  {
    id: "explorer",
    name: "Explorer Pack",
    icon: <Star className="h-5 w-5" />,
    slots: 5,
    price: "$19",
    priceNote: "/mo",
    color: "from-pink-500/20 via-fuchsia-900/30 to-black",
    glow: "rgba(236,72,153,0.3)",
    popular: true,
    badge: "Most Popular",
    features: [
      "5 Youniverse handles",
      "All Starter features",
      "Oracle business diagnostics",
      "Nexus agent squads access",
      "Analytics dashboard",
    ],
  },
  {
    id: "builder",
    name: "Builder Pack",
    icon: <Zap className="h-5 w-5" />,
    slots: 10,
    price: "$39",
    priceNote: "/mo",
    color: "from-amber-500/20 via-orange-900/30 to-black",
    glow: "rgba(245,158,11,0.3)",
    features: [
      "10 Youniverse handles",
      "All Explorer features",
      "Full Nexus PPSA fleet",
      "White-label sub-domains",
      "Revenue automation tools",
    ],
  },
  {
    id: "agency",
    name: "Agency Pack",
    icon: <Users className="h-5 w-5" />,
    slots: 50,
    price: "$99",
    priceNote: "/mo",
    color: "from-emerald-500/20 via-green-900/30 to-black",
    glow: "rgba(16,185,129,0.3)",
    features: [
      "50 Youniverse handles",
      "All Builder features",
      "Client Youniverse management",
      "Team seats & permissions",
      "Dedicated support channel",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise Pack",
    icon: <Building2 className="h-5 w-5" />,
    slots: 100,
    price: "Custom",
    priceNote: "contact us",
    color: "from-sky-500/20 via-blue-900/30 to-black",
    glow: "rgba(14,165,233,0.3)",
    badge: "For Unicorns",
    features: [
      "100+ Youniverse handles",
      "All Agency features",
      "Custom AI model integration",
      "SLA & uptime guarantees",
      "White-glove onboarding",
    ],
  },
];

// Placeholder directory (replace with real API data)
const DEMO_DIRECTORY = [
  { handle: "creator-of-the-youniverse", verified: true },
  { handle: "zero-to-hero", verified: false },
  { handle: "sovereign-builder", verified: true },
  { handle: "the-oracle-method", verified: false },
  { handle: "sleep-money-machine", verified: false },
  { handle: "nexus-commander", verified: true },
];

// ============================================================
// COMPONENT
// ============================================================

interface ClaimYouniverseProps {
  prefilledHandle?: string;
}

const ClaimYouniverse: React.FC<ClaimYouniverseProps> = ({
  prefilledHandle,
}) => {
  const [handle, setHandle] = useState(prefilledHandle ?? "");
  const [email, setEmail] = useState("");
  const [selectedPack, setSelectedPack] = useState<string>("free");
  const [step, setStep] = useState<"claim" | "email" | "confirm">("claim");

  // Read ?handle= (prod) or ?claim= (dev) from URL params if not passed as prop
  useEffect(() => {
    if (!prefilledHandle && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const h = params.get("handle") || params.get("claim") || params.get("@") || "";
      if (h) setHandle(h.replace(/^@+/, "").trim().toLowerCase());
    }
  }, [prefilledHandle]);

  const cleanHandle = handle.replace(/^@+/, "").trim().toLowerCase();

  const handleContinue = () => {
    if (!cleanHandle) return;
    setStep("email");
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStep("confirm");
  };

  return (
    <PortalLayout>
      <div className="relative min-h-screen w-full flex flex-col items-center justify-start px-4 py-10 overflow-x-hidden">
        {/* Cosmic background glow */}
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
          <div className="h-[700px] w-[700px] rounded-full bg-gradient-to-tr from-cyan-500/10 via-purple-600/15 to-pink-500/5 blur-[140px]" />
        </div>

        {/* Header badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-cyan-300 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.15)]"
        >
          <Sparkles className="h-3 w-3 text-cyan-400 animate-pulse" />
          <span>The Youniverse</span>
        </motion.div>

        {/* ── STEPS ─────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* STEP 1: Choose / confirm handle */}
          {step === "claim" && (
            <motion.div
              key="claim"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 flex w-full max-w-lg flex-col items-center text-center"
            >
              {cleanHandle ? (
                <div className="mb-4 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/30 px-4 py-1 text-xs text-emerald-300 backdrop-blur-md">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    <strong>@{cleanHandle}</strong> is available
                  </span>
                </div>
              ) : (
                <div className="mb-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-white/50 backdrop-blur-md">
                  <Rocket className="h-3 w-3" />
                  <span>Claim your Youniverse handle</span>
                </div>
              )}

              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 drop-shadow-md mb-2">
                {cleanHandle ? `@${cleanHandle}` : "Your @ Handle"}
              </h1>
              <p className="text-sm text-white/60 max-w-sm leading-relaxed mb-8">
                Every Youniverse starts with an{" "}
                <strong className="text-white">@handle</strong>. It is your
                sovereign digital address — your brand, your space, your OS.
              </p>

              {/* Handle input */}
              <div className="w-full max-w-sm mb-6">
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-cyan-400 font-mono text-lg font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) =>
                      setHandle(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, "-")
                          .replace(/^-+/, "")
                      )
                    }
                    placeholder="your-handle"
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 focus:border-cyan-500/60 text-white placeholder:text-white/30 focus:outline-none font-mono text-sm tracking-wide backdrop-blur-sm transition-colors"
                  />
                </div>
                <p className="mt-2 text-[11px] text-white/30 text-center font-mono">
                  {cleanHandle || "your-handle"}.itsyouonline.com
                </p>
              </div>

              <button
                onClick={handleContinue}
                disabled={!cleanHandle}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                <span>Claim This Youniverse</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: Pick pack + email */}
          {step === "email" && (
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center"
            >
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-4 py-1 text-xs text-emerald-300">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>@{cleanHandle} is being reserved for you</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight">
                Choose your pack
              </h2>
              <p className="text-sm text-white/50 mb-8">
                All plans include{" "}
                <strong className="text-white">
                  ONEAI, Weaver, Nexus fleet &amp; Books OS
                </strong>
                . Start free, scale when ready.
              </p>

              {/* Pack grid */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                {PACKS.map((pack) => (
                  <motion.button
                    key={pack.id}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedPack(pack.id)}
                    className={`relative flex flex-col items-start p-4 rounded-2xl border text-left transition-all backdrop-blur-sm bg-gradient-to-br ${pack.color} ${
                      selectedPack === pack.id
                        ? "border-cyan-500/60"
                        : "border-white/10 hover:border-white/20"
                    }`}
                    style={
                      selectedPack === pack.id
                        ? { boxShadow: `0 0 30px ${pack.glow}` }
                        : {}
                    }
                  >
                    {pack.badge && (
                      <div className="absolute -top-2 right-3 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md">
                        {pack.badge}
                      </div>
                    )}
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-400">
                        {pack.icon}
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {pack.name}
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-2xl font-bold text-white">
                        {pack.price}
                      </span>
                      <span className="ml-1 text-xs text-white/50">
                        {pack.priceNote}
                      </span>
                    </div>
                    <div className="text-[10px] text-cyan-300/80 font-mono mb-3">
                      {pack.slots === 1
                        ? "1 Youniverse"
                        : `${pack.slots} Youniverses`}
                    </div>
                    <ul className="space-y-1">
                      {pack.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-1.5 text-[11px] text-white/60"
                        >
                          <Check className="h-3 w-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {selectedPack === pack.id && (
                      <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 shadow-lg">
                        <Check className="h-3 w-3 text-black" />
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Email form */}
              <form
                onSubmit={handleEmailSubmit}
                className="w-full max-w-sm flex flex-col gap-3"
              >
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 focus:border-cyan-500/60 text-white placeholder:text-white/30 focus:outline-none text-sm backdrop-blur-sm transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all hover:scale-105 active:scale-95"
                >
                  <span>
                    {selectedPack === "free"
                      ? "Claim for Free"
                      : `Continue with ${
                          PACKS.find((p) => p.id === selectedPack)?.name
                        }`}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          )}

          {/* STEP 3: Confirmation */}
          {step === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 flex w-full max-w-md flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-cyan-900/40 shadow-[0_0_40px_rgba(16,185,129,0.4)]"
              >
                <ShieldCheck className="h-10 w-10 text-emerald-400" />
              </motion.div>
              <h2 className="text-3xl font-extrabold text-white mb-2">
                Youniverse Reserved!
              </h2>
              <p className="text-sm text-white/60 mb-3">
                <strong className="text-cyan-400">@{cleanHandle}</strong> is
                being held for{" "}
                <strong className="text-white">{email}</strong>.
              </p>
              <p className="text-xs text-white/40 max-w-xs leading-relaxed mb-8">
                Check your inbox for a verification link. Once confirmed, your
                Youniverse will be live at{" "}
                <span className="font-mono text-cyan-300">
                  {cleanHandle}.itsyouonline.com
                </span>
                .
              </p>
              <a
                href={`https://${cleanHandle}.itsyouonline.com`}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span>Preview your Youniverse</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DIRECTORY ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="relative z-10 mt-16 w-full max-w-2xl"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs uppercase tracking-[0.3em] text-white/30 font-mono">
              Claimed Youniverses
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEMO_DIRECTORY.map((entry) => (
              <a
                key={entry.handle}
                href={`https://${entry.handle}.itsyouonline.com`}
                className="group flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 hover:border-cyan-500/30 hover:bg-white/10 transition-all"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-cyan-400 font-mono font-bold text-xs flex-shrink-0">
                  @
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white group-hover:text-cyan-300 transition-colors">
                    @{entry.handle}
                  </div>
                  <div className="text-[10px] text-white/30 font-mono truncate">
                    {entry.handle}.itsyouonline.com
                  </div>
                </div>
                {entry.verified && (
                  <ShieldCheck className="ml-auto h-3 w-3 text-cyan-500 flex-shrink-0" />
                )}
              </a>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-white/20 font-mono">
            Every @ is a sovereign space. Yours is waiting.
          </p>
        </motion.div>
      </div>
    </PortalLayout>
  );
};

export default ClaimYouniverse;
