import React from "react";
import { Crown, Sparkles } from "lucide-react";

export interface GenesisBadgeProps {
  variant?: "pill" | "card";
  handle?: string;
  awardedAt?: string | null;
  onClick?: () => void;
  className?: string;
}

export const GenesisBadge: React.FC<GenesisBadgeProps> = ({
  variant = "pill",
  handle,
  awardedAt,
  onClick,
  className = "",
}) => {
  if (variant === "card") {
    return (
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={`relative rounded-2xl border border-amber-300/35 bg-linear-to-b from-amber-300/[0.08] via-[#090c16]/95 to-[#05070d]/98 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] ${
          onClick ? "cursor-pointer hover:border-amber-300/55 transition-colors" : ""
        } ${className}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/12 border border-amber-300/35 text-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.2)]">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-[0.2em] uppercase text-amber-300">
                  GENESIS 001
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                  Lifetime Access
                </span>
              </div>
              <p className="text-sm font-bold text-white tracking-wide mt-0.5">
                FIRST PERSON IN THE YOUNIVERSE
              </p>
              {handle && (
                <p className="text-xs font-mono text-white/55 mt-0.5">
                  @{handle}.itsyouonline.com
                </p>
              )}
            </div>
          </div>

          {awardedAt && (
            <span className="text-[11px] font-mono text-white/45 whitespace-nowrap">
              {new Date(awardedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    );
  }

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title="GENESIS 001 — FIRST PERSON IN THE YOUNIVERSE"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#090c14]/90 border border-amber-300/40 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.18)] ${
        onClick ? "cursor-pointer hover:border-amber-200/70 hover:brightness-110 transition-all" : ""
      } ${className}`}
    >
      <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <span className="text-[11px] font-mono font-bold tracking-[0.16em] uppercase text-amber-200">
        GENESIS 001
      </span>
      <span className="hidden sm:inline text-[10px] font-mono text-amber-300/70 uppercase tracking-wider">
        · FIRST PERSON
      </span>
    </Tag>
  );
};

