import React, { useState } from 'react';
import { Lock, X, Terminal, ShieldAlert } from 'lucide-react';

interface OwnerLoginModalProps {
  handle: string;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export default function OwnerLoginModal({ handle, onClose, onSuccess }: OwnerLoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, handle })
      });
      const data = await res.json();

      if (data.success && data.token) {
        onSuccess(data.token);
      } else {
        setError(data.error || 'Invalid credentials or unauthorized handle owner.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error connecting to sovereign authentication service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Owner Access: @{handle}</h3>
            <p className="text-xs text-zinc-500 font-mono">Authenticate to unlock Portals OS</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5">Owner Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@itsyouonline.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-400 mb-1.5">Password / Secure Key</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-lg text-xs font-mono transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
          >
            <Terminal className="w-4 h-4" />
            {loading ? 'Authenticating Gate...' : 'Unlock Sovereign OS'}
          </button>
        </form>
      </div>
    </div>
  );
}
