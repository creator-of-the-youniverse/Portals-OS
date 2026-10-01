import React, { useState } from 'react';
import { Globe, ArrowLeft, ArrowRight, RotateCw, Lock, ExternalLink } from 'lucide-react';

interface BrowserWindowProps {
  payload?: {
    url?: string;
    title?: string;
  };
}

export default function BrowserWindowApp({ payload }: BrowserWindowProps) {
  const initialUrl = payload?.url || 'https://news.ycombinator.com';
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let target = urlInput.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    setCurrentUrl(target);
    setUrlInput(target);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      {/* Browser Toolbar / OS Chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-md">
        <div className="flex items-center gap-1 text-zinc-400">
          <button className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors" title="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors" title="Forward">
            <ArrowRight className="w-4 h-4" />
          </button>
          <button 
            onClick={() => { setIsLoading(true); setTimeout(() => setIsLoading(false), 500); }}
            className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Reload"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Sovereign Address Bar */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs focus-within:border-emerald-500 transition-all shadow-inner">
          <Lock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full bg-transparent text-zinc-200 focus:outline-none font-mono"
            placeholder="Enter URL to summon..."
          />
          <a 
            href={currentUrl} 
            target="_blank" 
            rel="noreferrer"
            className="text-zinc-500 hover:text-zinc-300 transition-colors" 
            title="Open in external browser"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </form>
      </div>

      {/* Webview Viewport */}
      <div className="flex-1 relative bg-white">
        <iframe
          src={currentUrl}
          title={payload?.title || "Summoned Webapp"}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
