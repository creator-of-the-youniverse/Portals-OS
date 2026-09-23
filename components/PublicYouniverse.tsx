/**
 * PublicYouniverse.tsx
 *
 * The sovereign public face of every Youniverse.
 *
 * Every @handle.itsyouonline.com lands here first.
 *
 * Features:
 * - Public interactive profile / showcase
 * - Omniedia Global Score (social analytics aggregation)
 * - Social media links (all platforms)
 * - Public message board (leave / receive messages)
 * - Favorite Youniverses links
 * - Owner sign-in gate → Enter Portals OS (full desktop)
 * - Visitor badge + link back to the Hub
 *
 * For creator-of-the-youniverse: shows the Portals OS network feed.
 */

import React, { useState } from "react";
import PortalLayout from "./PortalLayout";
import { useYouniverse } from "./YouniverseProvider";
import {
  Rocket,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  ArrowRight,
  Layers,
  Cpu,
  Globe,
  MessageSquare,
  Send,
  Star,
  TrendingUp,
  Twitter,
  Instagram,
  Youtube,
  Link,
  LogIn,
  Heart,
  BarChart3,
  Users,
  Zap,
  Facebook,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────

interface SocialLink {
  platform: string;
  icon: React.ReactNode;
  url: string;
  color: string;
}

interface GuestMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface PublicYouniverseProps {
  onEnterOs?: () => void;
}

// ── Omniedia Score Badge ─────────────────────────────────────

const OmnediaBadge: React.FC<{ username: string }> = ({ username }) => {
  // Placeholder score — will be driven by the real Omniedia API
  const score = username === "creator-of-the-youniverse" ? 9420 : null;
  const rank = username === "creator-of-the-youniverse" ? "Founder" : "Rising";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="inline-flex flex-col items-center gap-0.5 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/40 via-fuchsia-900/20 to-black px-5 py-3 backdrop-blur-md shadow-[0_0_30px_rgba(168,85,247,0.2)]"
    >
      <div className="flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-purple-300 font-mono">
          Omniedia Score
        </span>
      </div>
      <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
        {score !== null ? score.toLocaleString() : "—"}
      </div>
      <div className="flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5">
        <Star className="h-2.5 w-2.5 text-yellow-400" />
        <span className="text-[9px] font-bold text-purple-200 uppercase tracking-widest">{rank}</span>
      </div>
      <p className="mt-1 text-[9px] text-purple-400/60 font-mono">
        powered by omniedia.itsyouonline.com
      </p>
    </motion.div>
  );
};

// ── Social Links Config ──────────────────────────────────────

function buildSocialLinks(username: string): SocialLink[] {
  // These will be fetched from the identity API in the future.
  // For now, return template links that the user can fill in via their OS.
  return [
    {
      platform: "Twitter / X",
      icon: <Twitter className="h-3.5 w-3.5" />,
      url: `https://x.com/${username}`,
      color: "border-sky-500/30 text-sky-400 hover:bg-sky-500/10",
    },
    {
      platform: "Instagram",
      icon: <Instagram className="h-3.5 w-3.5" />,
      url: `https://instagram.com/${username}`,
      color: "border-pink-500/30 text-pink-400 hover:bg-pink-500/10",
    },
    {
      platform: "YouTube",
      icon: <Youtube className="h-3.5 w-3.5" />,
      url: `https://youtube.com/@${username}`,
      color: "border-red-500/30 text-red-400 hover:bg-red-500/10",
    },
    {
      platform: "Facebook",
      icon: <Facebook className="h-3.5 w-3.5" />,
      url: `https://facebook.com/${username}`,
      color: "border-blue-500/30 text-blue-400 hover:bg-blue-500/10",
    },
    {
      platform: "Website",
      icon: <Globe className="h-3.5 w-3.5" />,
      url: `https://${username}.itsyouonline.com`,
      color: "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10",
    },
  ];
}

// ── Favorite Youniverses ─────────────────────────────────────
// The creator-of-the-youniverse acts as the Portals OS Network hub.
// Other users will manage their own favorites list through Portals OS.

const CREATOR_NETWORK = [
  { handle: "oracle", label: "The Oracle", desc: "Tactical business diagnostics", verified: true, color: "from-amber-500/20" },
  { handle: "books", label: "Books OS", desc: "Offline knowledge vault", verified: true, color: "from-emerald-500/20" },
  { handle: "ones", label: "ONEAI", desc: "Sovereign personal AI", verified: true, color: "from-cyan-500/20" },
  { handle: "creator-of-the-youniverse", label: "Creator HQ", desc: "The Network hub", verified: true, color: "from-purple-500/20" },
];

// ── Main Component ───────────────────────────────────────────

const PublicYouniverse: React.FC<PublicYouniverseProps> = ({ onEnterOs }) => {
  const { identity } = useYouniverse();
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([
    {
      id: "1",
      author: "ONEAI",
      text: "This Youniverse is live. Leave a message for the sovereign.",
      timestamp: "just now",
    },
  ]);
  const [messageSent, setMessageSent] = useState(false);
  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");

  if (!identity || identity.kind !== "identity" || !identity.username) {
    return null;
  }

  const { username } = identity;
  const isCreatorHub = username === "creator-of-the-youniverse";
  const socialLinks = buildSocialLinks(username);

  const handleEnterOs = () => {
    if (onEnterOs) {
      onEnterOs();
    } else {
      localStorage.setItem(`youniverse_os_active_${username}`, "true");
      window.location.reload();
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        author: "Visitor",
        text: messageText.trim(),
        timestamp: "just now",
      },
    ]);
    setMessageText("");
    setMessageSent(true);
    setTimeout(() => setMessageSent(false), 3000);
  };

  return (
    <PortalLayout>
      <div className="relative w-full min-h-screen flex flex-col items-center px-4 pb-16 pt-10 overflow-x-hidden">

        {/* ── Background glow ────────────────────────────────── */}
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
          <div className="h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-cyan-500/10 via-purple-600/15 to-pink-500/5 blur-[140px]" />
        </div>

        {/* ── "The Youniverse" header badge ─────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-cyan-300 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.15)]"
        >
          <Sparkles className="h-3 w-3 text-cyan-400 animate-pulse" />
          <span>The Youniverse</span>
        </motion.div>

        {/* ── Profile orb + identity ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 flex flex-col items-center text-center mb-8 w-full max-w-xl"
        >
          {/* Avatar orb */}
          <div className="relative mb-5 flex h-28 w-28 items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-cyan-500/20 via-purple-900/40 to-black shadow-2xl backdrop-blur-2xl">
            <div className="flex h-full w-full items-center justify-center rounded-[22px] bg-black/60 border border-white/10">
              <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-mono">
                @
              </span>
            </div>
            <div className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/40">
              <ShieldCheck className="h-4 w-4 text-black" />
            </div>
          </div>

          {/* Handle */}
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-md mb-1">
            @{username}
          </h1>
          <p className="text-xs font-mono text-cyan-400/70 tracking-wide mb-4">
            {username}.itsyouonline.com
          </p>

          {isCreatorHub ? (
            <p className="text-sm text-white/70 max-w-md leading-relaxed mb-6">
              The flagship Youniverse. <strong className="text-cyan-300">creator-of-the-youniverse</strong> is the living hub of the ItsYouOnline network — showcasing the universe being built, every Youniverse, every agent, every milestone.
            </p>
          ) : (
            <p className="text-sm text-white/70 max-w-md leading-relaxed mb-6">
              Welcome to the sovereign digital space of <strong className="text-white">@{username}</strong>.
              Powered by ONEAI, Weaver, and Portals OS.
            </p>
          )}

          {/* Omniedia Score */}
          <OmnediaBadge username={username} />
        </motion.div>

        {/* ── Social Links ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 w-full max-w-lg mb-8"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-mono text-center mb-3">Connect</p>
          <div className="flex flex-wrap justify-center gap-2">
            {socialLinks.map((s) => (
              <a
                key={s.platform}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 backdrop-blur-sm ${s.color}`}
              >
                {s.icon}
                <span>{s.platform}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
              </a>
            ))}
          </div>
        </motion.div>

        {/* ── Feature Strip ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative z-10 w-full max-w-xl grid grid-cols-3 gap-2.5 mb-8"
        >
          {[
            { icon: <Cpu className="h-4 w-4 text-cyan-400" />, label: "ONEAI", sub: "Sovereign brain" },
            { icon: <Layers className="h-4 w-4 text-purple-400" />, label: "Weaver", sub: "Spatial builder" },
            { icon: <TrendingUp className="h-4 w-4 text-pink-400" />, label: "Oracle", sub: "Business insights" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-white/5 bg-white/5 p-3 backdrop-blur-sm text-left">
              {f.icon}
              <div className="mt-1.5 text-[11px] font-semibold text-white">{f.label}</div>
              <div className="text-[10px] text-white/50 leading-tight mt-0.5">{f.sub}</div>
            </div>
          ))}
        </motion.div>

        {/* ── CTAs: Enter OS + Owner Login ───────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="relative z-10 w-full max-w-sm flex flex-col sm:flex-row gap-3 mb-10"
        >
          <button
            onClick={handleEnterOs}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] transition-all hover:scale-105 active:scale-95"
          >
            <Rocket className="h-4 w-4" />
            <span>Enter Portals OS</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowOwnerLogin((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            <span>Owner Login</span>
          </button>
        </motion.div>

        {/* ── Owner Login form (collapsed by default) ─────────── */}
        <AnimatePresence>
          {showOwnerLogin && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="relative z-10 w-full max-w-sm overflow-hidden mb-10"
              onSubmit={(e) => {
                e.preventDefault();
                // TODO: integrate magic link / email verification
                alert(`Verification email sent to ${ownerEmail} — check your inbox.`);
              }}
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs text-white/50 mb-3 text-center">
                  Enter the email you registered with to gain owner access.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@email.com"
                    required
                    className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* ── Public Message Board ────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 w-full max-w-xl mb-10"
        >
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-white/30" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-mono">
                Leave a Message
              </span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Existing messages */}
          <div className="space-y-2 mb-3 max-h-40 overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2.5 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 backdrop-blur-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 flex-shrink-0 text-[9px] font-bold text-cyan-300 mt-0.5">
                  {msg.author[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-semibold text-white/80">{msg.author}</span>
                    <span className="text-[9px] text-white/30">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-white/60 leading-snug">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Message input */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={`Say something to @${username}...`}
              maxLength={200}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/60 transition-colors"
            />
            <button
              type="submit"
              disabled={!messageText.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>

          <AnimatePresence>
            {messageSent && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-center text-[11px] text-emerald-400 font-mono"
              >
                ✓ Message delivered to @{username}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Favorite Youniverses / Network ─────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 w-full max-w-xl mb-10"
        >
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <Heart className="h-3 w-3 text-white/30" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-mono">
                {isCreatorHub ? "The Network" : "Favorite Youniverses"}
              </span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CREATOR_NETWORK.map((entry) => (
              <a
                key={entry.handle}
                href={`https://${entry.handle}.itsyouonline.com`}
                className={`group flex items-center gap-2.5 rounded-xl border border-white/5 bg-gradient-to-br ${entry.color} via-black to-black px-3 py-2.5 hover:border-cyan-500/30 hover:bg-white/10 transition-all`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-400 font-mono font-bold text-xs flex-shrink-0">
                  @
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                    {entry.label}
                  </div>
                  <div className="text-[10px] text-white/40 truncate">{entry.desc}</div>
                </div>
                {entry.verified && (
                  <ShieldCheck className="ml-auto h-3 w-3 text-cyan-500 flex-shrink-0" />
                )}
              </a>
            ))}
          </div>

          {isCreatorHub && (
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-white/20 font-mono">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 4 Live Youniverses</span>
              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Network Growing</span>
              <a href="https://itsyouonline.com" className="flex items-center gap-1 hover:text-cyan-400 transition-colors">
                <Link className="h-3 w-3" /> Hub
              </a>
            </div>
          )}
        </motion.div>

        {/* ── Back to Hub ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative z-10"
        >
          <a
            href="https://itsyouonline.com"
            className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
          >
            ← itsyouonline.com
          </a>
        </motion.div>
      </div>
    </PortalLayout>
  );
};

export default PublicYouniverse;
