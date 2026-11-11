import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, XCircle, ChevronRight } from "lucide-react";
import { PortalBackdrop } from "../PortalBackdrop";

interface FoundingAngelsCancelProps {
  onNavigate?: (path: string) => void;
}

export const FoundingAngelsCancel: React.FC<FoundingAngelsCancelProps> = ({ onNavigate }) => {
  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <PortalBackdrop>
      <div className="w-full max-w-lg mx-auto px-4 py-8 flex flex-col items-center z-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full bg-[#0a0d14]/90 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
        >
          <div className="inline-flex items-center justify-center p-4 mb-4 rounded-full bg-white/5 border border-white/10 text-white/50">
            <XCircle className="w-8 h-8" />
          </div>

          <span className="text-xs font-mono font-bold tracking-widest text-white/50 uppercase block mb-1">
            Checkout Incomplete
          </span>

          <h1 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">
            Order Canceled
          </h1>

          <p className="text-sm text-white/70 mb-6 leading-relaxed">
            You returned from the checkout session before completion. Your claimed Youniverse handle remains reserved. If you completed payment in another window, sign in to verify your membership status.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigateTo("/founding-angels")}
              className="flex-1 py-3 px-6 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-300 flex items-center justify-center gap-2 bg-linear-to-r from-amber-400 to-amber-500 text-black hover:brightness-110 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Founding Offer</span>
            </button>
            <button
              onClick={() => navigateTo("/")}
              className="flex-1 py-3 px-6 rounded-xl font-bold uppercase tracking-wider text-xs border border-white/10 text-white/70 hover:text-white transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return Home</span>
            </button>
          </div>
        </motion.div>
      </div>
    </PortalBackdrop>
  );
};
