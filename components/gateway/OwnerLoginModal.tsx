import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, Key, X, ArrowRight, Loader2, CheckCircle2, ShieldCheck, Fingerprint, UserPlus } from 'lucide-react';
import { validateOwnerTokenOnServer, signInWithPassword, requestPasswordRecovery, enrollWithPassword, signInWithPasskey } from '../../lib/ownerAuth';
import { getPasskeyReadiness } from '../../lib/passkeyScaffolding';

interface OwnerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  handle: string;
  onLoginSuccess: (token: string) => void;
  initialMode?: 'password' | 'passkey' | 'recover' | 'enroll';
}

export const OwnerLoginModal: React.FC<OwnerLoginModalProps> = ({
  isOpen,
  onClose,
  handle,
  onLoginSuccess,
  initialMode,
}) => {
  const [authMode, setAuthMode] = useState<'password' | 'passkey' | 'recover' | 'enroll'>(initialMode ?? 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && initialMode) {
      setAuthMode(initialMode);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const verifyContextAfterAuth = async (targetHandle: string): Promise<boolean> => {
    const cleanHandle = (targetHandle || '').toLowerCase().replace(/^@/, '').trim();
    if (!cleanHandle) return true;
    const ctxRes = await fetch(`/api/youniverse/${encodeURIComponent(cleanHandle)}/context`, {
      credentials: 'include',
    });
    const ctxData = ctxRes.ok ? await ctxRes.json().catch(() => null) : null;
    if (ctxRes.ok && ctxData?.success === true && ctxData?.isOwner === true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`youniverse_os_active_${cleanHandle}`, 'true');
      }
      return true;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`youniverse_os_active_${cleanHandle}`);
    }
    setErrorMessage(`Your account is signed in, but does not own @${cleanHandle}.`);
    return false;
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid owner email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setLoading(true);
    resetMessages();

    try {
      const result = await signInWithPassword(email, password);
      if (result.ok) {
        const verified = await verifyContextAfterAuth(handle);
        if (!verified) return;
        setSuccessMessage('Authenticated. Transitioning to Sovereign OS...');
        setTimeout(() => {
          onLoginSuccess('');
          onClose();
        }, 600);
      } else {
        setErrorMessage(result.errorMessage || 'Invalid email or password.');
      }
    } catch {
      setErrorMessage('Could not connect to authentication node. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setLoading(true);
    resetMessages();

    try {
      const result = await signInWithPasskey();
      if (!result.ok) {
        setErrorMessage(result.errorMessage || 'Passkey authentication failed.');
        return;
      }

      const verified = await verifyContextAfterAuth(handle);
      if (!verified) return;
      setSuccessMessage('Passkey verified successfully. Authenticating session...');
      setTimeout(() => {
        onLoginSuccess('');
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || 'Passkey authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    resetMessages();

    try {
      const result = await requestPasswordRecovery(email);
      setSuccessMessage(result.message);
    } catch {
      setErrorMessage('Could not connect to recovery service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please choose a password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    resetMessages();

    try {
      const cleanHandle = (handle || '').toLowerCase().replace(/^@/, '').trim();
      const result = await enrollWithPassword(cleanHandle, email, password);
      if (result.ok) {
        const verified = await verifyContextAfterAuth(cleanHandle);
        if (!verified) return;
        setSuccessMessage(
          result.enrollmentStatus === 'existing'
            ? 'Account already established. Signing in...'
            : 'Password set. Transitioning to Sovereign OS...'
        );
        setTimeout(() => {
          onLoginSuccess('');
          onClose();
        }, 700);
      } else {
        setErrorMessage(result.errorMessage || 'Enrollment failed. Please try again.');
      }
    } catch {
      setErrorMessage('Could not connect to enrollment service. Please try again.');
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
              <ShieldCheck className="w-5 h-5" />
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
          <div className="flex p-1 bg-zinc-950/60 rounded-lg border border-zinc-800/80 mb-5 gap-0.5">
            <button
              type="button"
              onClick={() => { setAuthMode('password'); resetMessages(); }}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'password'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" /> Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('enroll'); resetMessages(); }}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'enroll'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> First Time
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('passkey'); resetMessages(); }}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authMode === 'passkey'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" /> Passkey
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

          {/* Forms */}
          {authMode === 'password' ? (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
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
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-mono text-zinc-400">
                    Account Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('recover'); resetMessages(); }}
                    className="text-[11px] font-mono text-emerald-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
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
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Sovereign OS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : authMode === 'enroll' ? (
            <form onSubmit={handleEnroll} className="space-y-4">
              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-indigo-300 text-xs font-mono leading-relaxed">
                First-time setup. Your email must already be verified. You'll set a permanent password here.
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Verified Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Choose Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 10 chars, upper + lower + number"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Setting Up...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Establish Human Identity</span>
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setAuthMode('password'); resetMessages(); }}
                  className="text-xs font-mono text-zinc-400 hover:text-zinc-200"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          ) : authMode === 'passkey' ? (
            <div className="space-y-4 py-2 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-cyan-400">
                <Fingerprint className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-mono text-zinc-300">
                  Passwordless Biometric or Security Key Sign-In
                </p>
                <p className="text-[11px] font-mono text-zinc-500 mt-1">
                  Authenticate instantly using Touch ID, Face ID, Windows Hello, or YubiKey.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Passkey...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    <span>Sign In with Passkey</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordRecovery} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                  Registered Account Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all font-mono"
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
                    <span>Dispatching Link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Password Reset Link</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setAuthMode('password'); resetMessages(); }}
                  className="text-xs font-mono text-zinc-400 hover:text-zinc-200"
                >
                  ← Back to Password Sign-In
                </button>
              </div>
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
