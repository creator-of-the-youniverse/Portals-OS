import React, { useState, useRef, useCallback } from 'react';
import {
  Globe, ArrowLeft, ArrowRight, RotateCw, Lock, ExternalLink,
  AlertTriangle, Home, BookOpen, Code, Cpu, Newspaper, ShoppingBag,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Speed-dial bookmarks shown on the start page
// ─────────────────────────────────────────────
const SPEED_DIAL = [
  { label: 'Hacker News', url: 'https://news.ycombinator.com', icon: Newspaper, color: '#f97316' },
  { label: 'GitHub', url: 'https://github.com', icon: Code, color: '#a78bfa' },
  { label: 'MDN Docs', url: 'https://developer.mozilla.org', icon: BookOpen, color: '#38bdf8' },
  { label: 'Stripe', url: 'https://stripe.com', icon: ShoppingBag, color: '#818cf8' },
  { label: 'Product Hunt', url: 'https://producthunt.com', icon: Cpu, color: '#fb7185' },
  { label: 'The Guardian', url: 'https://theguardian.com', icon: Globe, color: '#34d399' },
];

type NavState = 'idle' | 'loading' | 'error';

interface BrowserWindowProps {
  metadata?: { url?: string; title?: string };
  // also accept top-level payload for Oracle summonUrl compat
  payload?: { url?: string; title?: string };
}

export default function BrowserWindowApp({ metadata, payload }: BrowserWindowProps) {
  const seedUrl = metadata?.url || payload?.url || '';
  const [urlInput, setUrlInput] = useState(seedUrl);
  const [navState, setNavState] = useState<NavState>('idle');
  const [history, setHistory] = useState<string[]>(seedUrl ? [seedUrl] : []);
  const [historyIndex, setHistoryIndex] = useState(seedUrl ? 0 : -1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentUrl = historyIndex >= 0 ? history[historyIndex] : '';

  // Build proxy URL for the iframe src
  const proxyUrl = useCallback(
    (url: string) => `/api/browser/proxy?url=${encodeURIComponent(url)}`,
    []
  );

  const navigateTo = useCallback((raw: string) => {
    let target = raw.trim();
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      // Treat bare words without dots as a search query
      if (!target.includes('.')) {
        target = `https://duckduckgo.com/?q=${encodeURIComponent(target)}`;
      } else {
        target = 'https://' + target;
      }
    }
    setUrlInput(target);
    setNavState('loading');
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, target];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(urlInput);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setUrlInput(history[newIndex]);
      setNavState('loading');
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setUrlInput(history[newIndex]);
      setNavState('loading');
    }
  };

  const reload = () => {
    if (!currentUrl) return;
    setNavState('loading');
    // Force iframe reload by briefly swapping src
    if (iframeRef.current) {
      const src = iframeRef.current.src;
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = src;
      });
    }
  };

  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;
  const isOnStartPage = !currentUrl;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      {/* ── Browser Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-md shrink-0">

        {/* Nav Controls */}
        <div className="flex items-center gap-0.5 text-zinc-400">
          <button
            onClick={goBack}
            disabled={!canBack}
            className="p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={!canForward}
            className="p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={isOnStartPage ? undefined : reload}
            disabled={isOnStartPage}
            className="p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Reload"
          >
            <RotateCw className={`w-4 h-4 ${navState === 'loading' ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            onClick={() => {
              setHistory([]);
              setHistoryIndex(-1);
              setUrlInput('');
              setNavState('idle');
            }}
            className="p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Address Bar */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs focus-within:border-emerald-500/70 focus-within:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all">
          {navState === 'error'
            ? <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
            : <Lock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          }
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-full bg-transparent text-zinc-200 focus:outline-none font-mono placeholder-zinc-600"
            placeholder="Enter URL or search term to summon..."
          />
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
              title="Open in external browser"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </form>
      </div>

      {/* ── Viewport ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Start Page */}
        {isOnStartPage && (
          <div className="absolute inset-0 bg-zinc-950 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-16">
              <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-950/50 mb-5">
                  <Globe className="w-7 h-7 text-zinc-950" />
                </div>
                <h2 className="text-xl font-bold text-zinc-200 mb-2">Sovereign Browser</h2>
                <p className="text-zinc-500 text-sm font-mono">The internet is raw material. Summon any site into your workspace.</p>
              </div>

              {/* Speed Dial Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SPEED_DIAL.map(({ label, url, icon: Icon, color }) => (
                  <button
                    key={url}
                    onClick={() => navigateTo(url)}
                    className="group flex items-center gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 text-left hover:border-zinc-700 hover:bg-zinc-900 transition-all shadow-sm"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors truncate">{label}</p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{url.replace('https://', '')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {navState === 'loading' && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
            <div className="flex items-center gap-3 text-sm text-zinc-400 font-mono">
              <RotateCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Summoning {currentUrl}…</span>
            </div>
          </div>
        )}

        {/* Iframe (proxy) */}
        {currentUrl && (
          <iframe
            ref={iframeRef}
            key={currentUrl}
            src={proxyUrl(currentUrl)}
            title={metadata?.title || payload?.title || 'Summoned Webapp'}
            className="w-full h-full border-0 absolute inset-0"
            onLoad={() => setNavState('idle')}
            onError={() => setNavState('error')}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        )}
      </div>
    </div>
  );
}
