import React, { useEffect, useState } from "react";
import { Crown, X, Loader2, ShieldCheck, Globe } from "lucide-react";
import { PortalBackdrop } from "../PortalBackdrop";

interface PublicRegistryWinner {
  designation: string;
  officialTitle: string;
  handle: string;
  subdomain: string;
  awardedAt: string;
}

interface PublicRegistryData {
  officialTitle: string;
  officialDesignation: string;
  isEnabled: boolean;
  eligibleVerifiedAfter: string | null;
  awarded: boolean;
  winner: PublicRegistryWinner | null;
}

const RegistryCard: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [registry, setRegistry] = useState<PublicRegistryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/genesis/registry")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.success && data.registry) {
          setRegistry(data.registry);
        } else {
          setError("Unable to load Genesis registry.");
        }
      })
      .catch(() => {
        if (active) setError("Network error loading Genesis registry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative w-full max-w-lg rounded-[22px] border border-amber-300/30 bg-[#060811]/94 p-6 sm:p-8 text-white shadow-[0_28px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-300/50 to-transparent"
      />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close registry"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/12 border border-amber-300/35 text-amber-300">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-amber-300 block">
            GENESIS 001 · HISTORICAL REGISTRY
          </span>
          <h2 className="text-lg font-bold tracking-wide text-white">
            FIRST PERSON OF THE YOUNIVERSE
          </h2>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex flex-col items-center gap-3 text-white/60 text-xs font-mono">
          <Loader2 className="w-6 h-6 animate-spin text-amber-300" />
          <span>Querying immutable Genesis ledger...</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center text-xs font-mono text-rose-300">{error}</div>
      ) : registry?.awarded && registry.winner ? (
        <div className="rounded-2xl border border-amber-300/30 bg-white/[0.03] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Genesis 001 Holder
            </span>
            <span className="text-[11px] font-mono text-white/45">
              {new Date(registry.winner.awardedAt).toLocaleDateString()}
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-white tracking-tight">
              @{registry.winner.handle}
            </p>
            <p className="text-xs font-mono text-amber-200/80 flex items-center gap-1.5 mt-1">
              <Globe className="w-3.5 h-3.5" />
              <span>{registry.winner.subdomain}</span>
            </p>
          </div>
          <p className="text-xs text-white/60 pt-2 border-t border-white/10 leading-relaxed">
            Permanently inscribed in the immutable Genesis registry as {registry.winner.designation} ({registry.winner.officialTitle}).
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center space-y-2">
          <p className="text-sm font-semibold text-white">
            Awaiting First Verified Claim
          </p>
          <p className="text-xs text-white/65 leading-relaxed">
            The first new Production Youniverse claim completed and email-verified after Genesis activation will permanently receive {registry?.officialDesignation || "GENESIS 001"}.
          </p>
        </div>
      )}
    </div>
  );
};

export const GenesisRegistryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <RegistryCard onClose={onClose} />
    </div>
  );
};

export const GenesisRegistryPage: React.FC<{ onNavigate?: (path: string) => void }> = ({
  onNavigate,
}) => {
  return (
    <PortalBackdrop>
      <div className="w-full h-full overflow-y-auto flex items-center justify-center p-4 z-20">
        <div className="w-full max-w-lg flex flex-col items-center gap-4">
          <RegistryCard />
          <button
            type="button"
            onClick={() => {
              if (onNavigate) onNavigate("/");
              else window.location.href = "/";
            }}
            className="text-xs font-mono uppercase tracking-[0.18em] text-white/55 hover:text-white transition-colors"
          >
            ← Return to Youniverse
          </button>
        </div>
      </div>
    </PortalBackdrop>
  );
};

