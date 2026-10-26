import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, Key, X, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { validateOwnerTokenOnServer, processMagicLinkResponse } from '../../lib/ownerAuth';

interface OwnerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  handle: string;
  onLoginSuccess: (token: string) => void;
}

export const OwnerLoginModal: React.FC<OwnerLoginModalProps> = ({
  isOpen,
  onClose,
  handle,
  onLoginSuccess,
}) => {
  const [authMode, setAuthMode] = useState<'magic-link' | 'token'>('magic-link');
  const [email, setEmail] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateOwnerToken = async (candidateToken: string): Promise<boolean> => {
    const result = await validateOwnerTokenOnServer(handle, candidateToken, fetch);
    if (result.ok) {
      return true;
    }
    setErrorMessage(result.errorMessage || 'Ownership verification failed.');
    return false;
  };

  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid owner email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Send claim request to backend
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, email }),
      });

      const data = await res.json().catch(() => ({}));

      const outcome = await processMagicLinkResponse({
        res,
        data,
        handle,
        validateOwnerToken,
        onLoginSuccess,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      });

      if (outcome.type === 'success_link_dispatched') {
        setSuccessMessage(outcome.message);
        setErrorMessage(null);
      } else if (outcome.type === 'error') {
        setErrorMessage(outcome.message);
        setSuccessMessage(null);
      } else if (outcome.type === 'error_validation_failed') {
        // Validation failed: validateOwnerToken already set the error message.
        // Guarantee successMessage is null so no conflicting messages appear.
        setSuccessMessage(null);
      }
    } catch {
      setErrorMessage('Could not connect to authentication node. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setErrorMessage('Please enter your session token or verification key.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const isVerifiedOwner = await validateOwnerToken(cleanToken);
      if (isVerifiedOwner) {
        localStorage.setItem('youniverse_session_token', cleanToken);
        const cleanHandle = (handle || '').toLowerCase().replace(/^@/, '').trim();
        if (cleanHandle) {
          localStorage.setItem(`youniverse_os_active_${cleanHandle}`, 'true');
        }
        onLoginSuccess(cleanToken);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-zinc-900/90 border border-zinc-700/60 rounded-2xl shadow-2xl p-6 text-zinc-100 font-sans z-10 backdrop-blur-xl overflow-hidden"
        >
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close owner login"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Owner Authentication
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                @{handle}.itsyouonline.com
              </p>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex p-1 bg-zinc-950/60 rounded-lg border border-zinc-800/80 mb-5">
            <button
              type="button"
              onClick={() => {
                setAuthMode('magic-link');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'magic-link'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> Magic Link
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('token');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'token'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" /> Session Token
            </button>
          </div>

          {/* Status Notifications */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/20 text-amber-300 text-xs font-mono leading-relaxed">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-xs font-mono leading-relaxed flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          {authMode === 'magic-link' ? (
            <form onSubmit={handleRequestMagicLink} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Owner Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Transmitting...</span>
                  </>
                ) : (
                  <>
                    <span>Send Magic Link</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Paste Session Token or Secret Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Session token or key"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Sovereign OS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer note */}
          <div className="mt-5 text-center">
            <p className="text-[11px] text-zinc-500 font-mono">
              Only the sovereign owner can unlock this private node environment.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
