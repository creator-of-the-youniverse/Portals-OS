/**
 * @file AtLineGateway
 *
 * The minimal gateway interaction: a single horizontal rule with an @ symbol.
 * Two-step flow per spec:
 *   Step 1A: User types handle → live availability feedback
 *   Step 1B: Email prompt slides open → user claims domain
 *
 * Pitch black canvas. Zero navigation. Zero marketing banners.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SubdomainAvailability from "./SubdomainAvailability";
import { normalizeHandle, isValidHandle } from "../../types/onboarding";
import { checkHandleAvailability } from "../../services/identityService";

interface AtLineGatewayProps {
  onClaim: (handle: string, email: string) => void;
  isLoading?: boolean;
}

const AtLineGateway: React.FC<AtLineGatewayProps> = ({ onClaim, isLoading = false }) => {
  const [handleInput, setHandleInput] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailField, setShowEmailField] = useState(false);
  const [handleLocked, setHandleLocked] = useState(false);

  const handleRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus the @ line on mount
  useEffect(() => {
    const t = setTimeout(() => handleRef.current?.focus(), 800);
    return () => clearTimeout(t);
  }, []);

  // Focus email field when it appears
  useEffect(() => {
    if (showEmailField && emailRef.current) {
      emailRef.current.focus();
    }
  }, [showEmailField]);

  // ── HANDLERS ──

  const onHandleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const normalized = normalizeHandle(handleInput);
      if (normalized && isValidHandle(normalized)) {
        setHandleInput(normalized);
        setHandleLocked(true);
        
        // Check if it's already taken
        const result = await checkHandleAvailability(normalized);
        
        if (result.status === "taken") {
          // ── DIRECT ROUTING LOGIC ──
          // If taken, they aren't claiming it — warp them straight to it!
          const currentHost = window.location.hostname;
          if (currentHost === "localhost" || currentHost === "127.0.0.1" || currentHost.includes("vercel.app")) {
            window.location.href = `/?@=${normalized}`;
          } else {
            window.location.href = `https://${normalized}.itsyouonline.com`;
          }
        } else {
          // If available, proceed to email collection for claiming
          setShowEmailField(true);
        }
      }
    }
  };

  const onHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (handleLocked) return;
    const raw = e.target.value.replace(/^@+/, "").replace(/\s/g, "");
    setHandleInput(raw);
  };

  const onEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitClaim();
    }
    if (e.key === "Backspace" && email === "") {
      setShowEmailField(false);
      setHandleLocked(false);
      setTimeout(() => handleRef.current?.focus(), 50);
    }
  };

  const submitClaim = () => {
    const normalized = normalizeHandle(handleInput);
    const emailTrimmed = email.trim();
    if (!normalized || !isValidHandle(normalized)) return;
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) return;
    onClaim(normalized, emailTrimmed);
  };

  const normalized = normalizeHandle(handleInput);

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[400px]">
      
      {/* ── THE @ LINE ── */}
      <motion.div
        initial={{ opacity: 0, height: 0, scale: 0.9 }}
        animate={{ opacity: 1, height: "auto", scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center justify-center w-full relative z-20"
      >
        {/* Smaller, centered container */}
        <div className="relative w-64 sm:w-72">
          
          {/* Background tracker for @ symbol */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-xl tracking-wide">
            {/* The pulsing @ symbol */}
            <motion.span
              className="text-white/60 select-none mr-2"
              animate={{
                opacity: handleInput.length > 0 ? 1 : [0.4, 0.8, 0.4],
                textShadow: handleInput.length > 0
                  ? "0 0 8px rgba(255,255,255,0.3)"
                  : ["0 0 4px rgba(255,255,255,0.1)", "0 0 15px rgba(255,255,255,0.5)", "0 0 4px rgba(255,255,255,0.1)"],
              }}
              transition={{
                duration: handleInput.length > 0 ? 0.3 : 2.5,
                repeat: handleInput.length > 0 ? 0 : Infinity,
                ease: "easeInOut",
              }}
            >
              @
            </motion.span>
            
            {/* Invisible mirror of the input to push the @ symbol to the left */}
            <span className="text-transparent whitespace-pre">{handleInput || (showEmailField ? " " : "")}</span>
          </div>

          {/* Actual Input */}
          <input
            ref={handleRef}
            type="text"
            value={handleInput}
            onChange={onHandleChange}
            onKeyDown={onHandleKeyDown}
            disabled={handleLocked || isLoading}
            placeholder={handleInput === "" ? "      " : ""} // spaces to make room for @ when empty
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent border-none px-0 text-white font-mono text-xl tracking-wide py-3 focus:outline-none placeholder:text-transparent text-center caret-cyan-400 selection:bg-cyan-900/50"
            style={{ caretColor: "#22d3ee" }}
          />

          {/* The white line */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/30" />
          <motion.div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[1px] bg-white/80"
            style={{ boxShadow: "0 0 10px rgba(255,255,255,0.4)" }}
            animate={{ width: handleInput.length > 0 ? "100%" : "0%" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

      {/* ── AVAILABILITY INDICATOR ── */}
      <AnimatePresence>
        {handleInput.length >= 3 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SubdomainAvailability rawInput={handleInput} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EMAIL COLLECTION (Step 1B) ── */}
      <AnimatePresence>
        {showEmailField && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-md mt-6"
          >
            <p className="text-xs text-white/30 font-mono tracking-wide mb-2 text-center">
              enter your email to claim your domain
            </p>
            <div className="relative">
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onEmailKeyDown}
                disabled={isLoading}
                placeholder="email@address.com"
                autoComplete="email"
                className="w-full bg-transparent border-none text-white font-mono text-sm tracking-wide px-4 py-2.5 focus:outline-none placeholder:text-white/20 caret-cyan-400 text-center selection:bg-cyan-900/50"
                style={{ caretColor: "#22d3ee" }}
              />
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/20" />
            </div>

            {/* Claim Button */}
            <AnimatePresence>
              {email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-center mt-5"
                >
                  <button
                    onClick={submitClaim}
                    disabled={isLoading}
                    className="group flex items-center gap-2 px-6 py-2 rounded-full border border-white/20 bg-white/5 text-white/80 text-xs font-mono tracking-widest uppercase hover:bg-white/10 hover:border-white/30 transition-all disabled:opacity-50 backdrop-blur-sm"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-3 h-3 border border-white/40 border-t-white rounded-full"
                        />
                        <span>claiming...</span>
                      </>
                    ) : (
                      <>
                        <span>Claim</span>
                        <span className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
                          {normalized}.itsyouonline.com
                        </span>
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      
      </motion.div>
    </div>
  );
};

export default AtLineGateway;
