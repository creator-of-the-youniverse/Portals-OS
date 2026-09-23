import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share2, Sparkles, ShieldCheck, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already running in standalone mode (already installed)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    if (checkStandalone()) {
      return;
    }

    // Check if user dismissed prompt recently (within 24 hours)
    const lastDismissed = localStorage.getItem('youniverse-pwa-dismissed');
    const isDismissedRecently =
      lastDismissed && Date.now() - parseInt(lastDismissed, 10) < 24 * 60 * 60 * 1000;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice && !isDismissedRecently) {
      // Delay showing iOS banner slightly to not interrupt initial screen
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3500);
      return () => clearTimeout(timer);
    }

    // Standard Chromium / Android / Edge install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissedRecently) {
        // Show after brief grace period
        setTimeout(() => setShowPrompt(true), 2500);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // App installed listener
    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      console.log('[PWA] Youniverse successfully installed.');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    const handleCustomOpen = () => {
      setShowPrompt(true);
    };
    window.addEventListener('open-pwa-install', handleCustomOpen);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-pwa-install', handleCustomOpen);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the installation');
        setShowPrompt(false);
      } else {
        console.log('[PWA] User dismissed the installation');
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('[PWA] Error launching install prompt:', err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem('youniverse-pwa-dismissed', Date.now().toString());
  };

  if (isStandalone || (!showPrompt && !showIOSGuide)) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-5000 w-[94vw] max-w-md"
      >
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#090a14]/90 p-4 shadow-[0_10px_40px_rgba(0,255,255,0.18)] backdrop-blur-xl">
          {/* Subtle cosmic accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-purple-500" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/30 border border-cyan-400/40 p-2 shadow-inner">
                <img src="/favicon.svg" alt="Youniverse" className="h-full w-full object-contain" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-white tracking-wide">
                    Install The Youniverse
                  </h3>
                  <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-500/30">
                    Offline App
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/70 leading-relaxed">
                  Run ONEAI & Books OS 100% offline with zero latency and sovereign native power.
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action Row */}
          {!showIOSGuide ? (
            <div className="mt-3.5 flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 py-2.5 px-4 text-xs font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:opacity-95 active:scale-[0.98]"
              >
                <Download className="h-3.5 w-3.5" />
                Install Free App
              </button>

              <button
                onClick={handleDismiss}
                className="rounded-xl border border-white/10 bg-white/5 py-2.5 px-3 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                Later
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 rounded-xl bg-purple-950/40 border border-purple-500/30 p-3 text-xs text-white/90"
            >
              <div className="flex items-center gap-2 text-cyan-300 font-medium mb-1.5">
                <Smartphone className="h-4 w-4" />
                <span>To install on iOS Safari:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-white/80 text-[11px]">
                <li>Tap the <Share2 className="inline h-3.5 w-3.5 text-cyan-400 mx-1" /> <strong>Share</strong> button in Safari</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong> (+)</li>
                <li>Tap <strong>Add</strong> in the top right corner</li>
              </ol>
            </motion.div>
          )}

          {/* Micro Trust Indicators */}
          <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/40 pt-2 border-t border-white/5">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-cyan-400/80" /> 100% Sovereign & Local
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-purple-400/80" /> Money While You Sleep
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PwaInstallPrompt;
