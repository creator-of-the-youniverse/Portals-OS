// ============================================================================
// IMPORTS
// ============================================================================
// React core and hooks for component functionality
import React, { useRef, useEffect, useState, useCallback } from "react";
// Global state management for user session data
import { useKernel } from "../store/kernel";
// Animation library for smooth transitions and effects
import { motion } from "framer-motion";
// Audio playback utility
import { playAudio } from "../lib/audioUtils";
// Minimalist text effect component
import { MinimalistTextEffect } from "./MinimalistTextEffect";
// Background image styling for this welcome screen
import "../components/WelcomeScreen.css";
// ASMR animated background for inside the circle
import { AsmrBackground } from "../components/AsmrBackground";
// Shatter button component
import { Component as ShatterButton } from "../@/components/ui/shatter-button";
// Shimmer button component
import { LiquidMetalButton } from "./LiquidMetalButton";
import { createYouniverseDiscovery } from "../lib/youniverseDiscovery";
import { createYouniverseIdentityApiResolver } from "../services/youniverseIdentityService";
import { Download } from "lucide-react";

// ============================================================================
// AUDIO CONSTANTS
// ============================================================================
// 15 different welcome audio messages that play randomly when user submits email
const welcomeAudio1 = "/assets/audio/welcome_1.mp3";
const welcomeAudio2 = "/assets/audio/welcome_2.mp3";
const welcomeAudio3 = "/assets/audio/welcome_3.mp3";
const welcomeAudio4 = "/assets/audio/welcome_4.mp3";
const welcomeAudio5 = "/assets/audio/welcome_5.mp3";
const welcomeAudio6 = "/assets/audio/welcome_6.mp3";
const welcomeAudio7 = "/assets/audio/welcome_7.mp3";
const welcomeAudio8 = "/assets/audio/welcome_8.mp3";
const welcomeAudio9 = "/assets/audio/welcome_9.mp3";
const welcomeAudio10 = "/assets/audio/welcome_10.mp3";
const welcomeAudio11 = "/assets/audio/welcome_11.mp3";
const welcomeAudio12 = "/assets/audio/welcome_12.mp3";
const welcomeAudio13 = "/assets/audio/welcome_13.mp3";
const welcomeAudio14 = "/assets/audio/welcome_14.mp3";
const welcomeAudio15 = "/assets/audio/welcome_15.mp3";
const welcomeAudio16 = "/assets/audio/welcome_16.mp3";
const welcomeAudio17 = "/assets/audio/welcome_17.mp3";
const welcomeAudio18 = "/assets/audio/welcome_18.mp3";
const welcomeAudio19 = "/assets/audio/welcome_19.mp3";
const welcomeAudio20 = "/assets/audio/welcome_20.mp3";
const welcomeAudio21 = "/assets/audio/welcome_21.mp3";
const welcomeAudio22 = "/assets/audio/welcome_22.mp3";
const welcomeAudio23 = "/assets/audio/welcome_23.mp3";
const welcomeAudio24 = "/assets/audio/welcome_24.mp3";
const welcomeAudio25 = "/assets/audio/welcome_25.mp3";
// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
// Props for the interactive EmailFieldComponent
interface EmailFieldProps {
  placeholder?: string;                    // Text shown when field is empty
  onSubmit?: (value: string) => void;      // Callback when user submits email
  disabled?: boolean;                      // Whether the field is interactive
}

// ============================================================================
// EXPORTED COMPONENT
// ============================================================================
const WelcomeScreen: React.FC = () => {
  // @ LINE COMPONENT
  const AtLineComponent = ({
    placeholder = "Enter @Handle",
    onSubmit = (value: string) => console.log("Submitted:", value),
    disabled = false,
  }: EmailFieldProps) => {
    // ------------------------------------------------------------------------
    // REFS - Direct DOM element access
    // ------------------------------------------------------------------------
    const svgRef = useRef<SVGSVGElement>(null);      // Reference to SVG for gradient calculations
    const inputRef = useRef<HTMLInputElement>(null);  // Reference to input for programmatic focus

    // ------------------------------------------------------------------------
    // STATE - Component data that changes over time
    // ------------------------------------------------------------------------
    const [isHovered, setIsHovered] = useState(false);                      // Whether mouse is over the field
    const [isFocused, setIsFocused] = useState(false);                      // Whether input is focused
    const [ripplePosition, setRipplePosition] = useState({ cx: "50%", cy: "50%" }); // Gradient center position
    const [isDark, setIsDark] = useState(false);                            // Dark mode detection
    const [value, setValue] = useState("");                                 // Current identity input value

    // ------------------------------------------------------------------------
    // EFFECT: Dark Mode Detection
    // ------------------------------------------------------------------------
    // Watches for changes to the document's dark mode class and updates styling accordingly
    useEffect(() => {
      const checkDark = () => {
        if (typeof window !== "undefined") {
          setIsDark(document.documentElement.classList.contains("dark"));
        }
      };
      checkDark();
      const observer = new MutationObserver(checkDark);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }, []);

    // ------------------------------------------------------------------------
    // HANDLER: Mouse Move for Gradient Following
    // ------------------------------------------------------------------------
    // Calculates cursor position relative to SVG and updates gradient center directly
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (svgRef.current) {
        const svgRect = svgRef.current.getBoundingClientRect();
        const cxPercentage = ((e.clientX - svgRect.left) / svgRect.width) * 100;
        const cyPercentage = ((e.clientY - svgRect.top) / svgRect.height) * 100;

        setRipplePosition({
          cx: `${cxPercentage}%`,
          cy: `${cyPercentage}%`,
        });
      }
    }, []);

    // ------------------------------------------------------------------------
    // HANDLER: Form Submission
    // ------------------------------------------------------------------------
    // Processes identity submission and clears the field
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim() && onSubmit && !disabled) {
        onSubmit(value.trim());
        setValue("");
      }
    };

    // ------------------------------------------------------------------------
    // COMPUTED VALUES
    // ------------------------------------------------------------------------
    // BRIGHT gradient colors for maximum visibility on first pass
    const gradientStops = isDark
      ? [
        <stop key="dark-0" offset="0%" stopColor="#ffffff" />,      // Pure white center
        <stop key="dark-1" offset="50%" stopColor="#e0e0e0" />,     // Bright gray
        <stop key="dark-2" offset="100%" stopColor="#909090" />     // Medium gray
      ]
      : [
        <stop key="light-0" offset="0%" stopColor="#ffffff" />,     // Pure white center
        <stop key="light-1" offset="50%" stopColor="#d0d0d0" />,    // Bright gray
        <stop key="light-2" offset="100%" stopColor="#808080" />    // Medium gray
      ];

    const isActive = isHovered || isFocused;

    // ------------------------------------------------------------------------
    // RENDER: Component UI
    // ------------------------------------------------------------------------
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[200px]">
        <form onSubmit={handleSubmit} className="relative w-full max-w-md">
          <div
            className="relative w-full h-16 flex items-center justify-center cursor-text"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMouseMove}
            onClick={() => inputRef.current?.focus()}
          >
            {/* ============ MINIMALIST TEXT EFFECT ============ */}
            {/* Invisible until hover - reveals with gradient following mouse */}
            <div className="absolute inset-0 pointer-events-none">
              <MinimalistTextEffect text={placeholder} duration={0.3} />
            </div>

            {/* ============ AT SYMBOL CUE ============ */}
            {/* Pulsing @ symbol that disappears once the user starts typing */}
            <motion.div
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none text-white font-mono"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: value.length > 0 ? 0 : 0.6,
                scale: value.length > 0 ? 0.8 : 1,
                y: value.length > 0 ? 10 : 0
              }}
              transition={{
                duration: value.length > 0 ? 0.3 : 1.5,
                repeat: value.length > 0 ? 0 : Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }}
              style={{ bottom: "16px", textShadow: "0 0 15px rgba(255,255,255,0.8)", fontSize: "1.5rem" }}
            >
              @
            </motion.div>

            {/* ============ ACTUAL INPUT FIELD ============ */}
            {/* Appears when user clicks - transparent with blinking cursor */}
            {/* Using !bg-transparent and inline styles to override any browser/UA defaults */}
            <motion.input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-12 px-4 bg-transparent! border-none text-white text-center placeholder:text-gray-500 focus:outline-none transition-all font-mono tracking-wider relative z-10"
              style={{
                caretColor: 'white',
                background: 'none',
                backgroundColor: 'transparent',
                boxShadow: 'none',
                outline: 'none',
                WebkitAppearance: 'none',
              }}
              placeholder=""
              animate={{
                opacity: isFocused || value.length > 0 ? 1 : 0,
              }}
              transition={{ duration: 0.5 }}
            />

            {/* ============ WHITE LINE - ALWAYS VISIBLE ============ */}
            {/* Static white underline that's always shown for identity entry */}
            <div
              className="absolute bottom-2 left-1/2 transform -translate-x-1/2"
              style={{
                width: '80%',
                height: '2px',
                background: 'rgba(255, 255, 255, 0.8)',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
              }}
            />
          </div>
        </form>
      </div>
    );
  };

  // ============================================================================
  // WELCOME SCREEN COMPONENT
  // ============================================================================
  // Main landing page with background image, title, and identity collection
  // ------------------------------------------------------------------------
  // GLOBAL STATE - Kernel store actions
  // ------------------------------------------------------------------------
  const setHasWelcomed = useKernel((state) => state.setHasWelcomed);
  const addEmail = useKernel((state) => state.addEmail);
  const collectedEmails = useKernel((state) => state.collectedEmails);
  const setInitialGreetingSpoken = useKernel(
    (state) => state.setInitialGreetingSpoken
  );
  const setMicPermissionGranted = useKernel(
    (state) => state.setMicPermissionGranted
  );

  // ------------------------------------------------------------------------
  // LOCAL STATE
  // ------------------------------------------------------------------------
  const [isFadingOut, setIsFadingOut] = useState(false);  // Controls exit animation
  const [isShatterAnimating, setIsShatterAnimating] = useState(false); // Controls shatter animation delay
  const [showIdentityEntry, setShowIdentityEntry] = useState(false); // ALWAYS require the user to press the button to reveal identity entry
  const [pendingYouniverseSubdomain, setPendingYouniverseSubdomain] = useState<string | null>(null);

  // ------------------------------------------------------------------------
  // HANDLER: Random Welcome Audio
  // ------------------------------------------------------------------------
  // Selects and plays one of 15 random welcome messages
  const playRandomWelcomeMessage = () => {
    const welcomeAudios = [
      welcomeAudio1,
      welcomeAudio2,
      welcomeAudio3,
      welcomeAudio4,
      welcomeAudio5,
      welcomeAudio6,
      welcomeAudio7,
      welcomeAudio8,
      welcomeAudio9,
      welcomeAudio10,
      welcomeAudio11,
      welcomeAudio12,
      welcomeAudio13,
      welcomeAudio14,
      welcomeAudio15,
      welcomeAudio16,
      welcomeAudio17,
      welcomeAudio18,
      welcomeAudio19,
      welcomeAudio20,
      welcomeAudio21,
      welcomeAudio22,
      welcomeAudio23,
      welcomeAudio24,
      welcomeAudio25,
    ];

    const randomAudio =
      welcomeAudios[Math.floor(Math.random() * welcomeAudios.length)];
    playAudio(randomAudio, undefined, 0.3); // Set volume to 30%
  };


  // ------------------------------------------------------------------------
  // ------------------------------------------------------------------------
  // YOUNIVERSE DISCOVERY
  // ------------------------------------------------------------------------
  // The @ Line resolves a human identity through the authoritative
  // ItsYouOnline identity API before crossing to that Youniverse.
  const youniverseDiscovery = createYouniverseDiscovery(
    createYouniverseIdentityApiResolver()
  );

  // HANDLER: Skip Microphone Permission
  // ------------------------------------------------------------------------
  // Sets mic permission to false and triggers fade-out animation
  const skipMicPermission = () => {
    console.log("Skipping microphone permission");
    setMicPermissionGranted(false);
    setIsFadingOut(true);
  };

  // ------------------------------------------------------------------------
  // HANDLER: Proceed to Main App
  // ------------------------------------------------------------------------
  // Marks welcome screen as completed in global state
  const proceedWithWelcome = () => {
    setHasWelcomed(true);
  };

  // ------------------------------------------------------------------------
  // HANDLER: Animation Complete Callback
  // ------------------------------------------------------------------------
  // HANDLER: Animation Complete Callback
  // ------------------------------------------------------------------------
  // Called when fade-out animation finishes, proceeds to main app or subdomain
  const onFadeOutComplete = () => {
    proceedWithWelcome();

    if (pendingYouniverseSubdomain) {
      const currentHost = window.location.hostname;
      // In local development, route with ?@=handle so it stays in the local dev server
      if (
        currentHost === "localhost" ||
        currentHost === "127.0.0.1" ||
        currentHost.includes("vercel.app")
      ) {
        const handle = pendingYouniverseSubdomain.split(".")[0];
        window.location.href = `/?@=${handle}`;
      } else {
        window.location.href = `https://${pendingYouniverseSubdomain}`;
      }
    }
  };

  // ------------------------------------------------------------------------
  // LOCAL STATE: @ Line discovery feedback
  // ------------------------------------------------------------------------
  const [atLineStatus, setAtLineStatus] = useState<"idle" | "loading" | "error">("idle");

  // ------------------------------------------------------------------------
  // HANDLER: YOUNIVERSE IDENTITY SUBMISSION
  // ------------------------------------------------------------------------
  // Handles @handles, usernames, and emails seamlessly without dead-ending:
  //  • Standard email → collect + enter main OS
  //  • @handle (found) → warp to subdomain Youniverse
  //  • @handle (not found) → redirect to claim.itsyouonline.com/?handle=name
  //  • @handle (invalid/API error) → inline error with graceful fallback
  const handleEmailSubmit = async (identityInput: string) => {
    const rawInput = identityInput.trim();
    if (!rawInput) return;

    // Standard email address fallback — just collect it and enter the OS
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput)) {
      addEmail(rawInput);
      playRandomWelcomeMessage();
      skipMicPermission();
      return;
    }

    // It is a Youniverse handle (e.g. "@creator-of-the-youniverse" or "creator-of-the-youniverse")
    const cleanHandle = rawInput
      .replace(/^@+/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!cleanHandle) return;

    setAtLineStatus("loading");

    try {
      const discovery = await youniverseDiscovery.discover(cleanHandle);
      console.log(`[ENTRY FLOW] @${cleanHandle}:`, discovery.status);

      if (discovery.status === "found") {
        // ✅ Youniverse exists — warp to it
        playRandomWelcomeMessage();
        localStorage.setItem("active_youniverse_handle", cleanHandle);
        setPendingYouniverseSubdomain(`${cleanHandle}.itsyouonline.com`);
        setAtLineStatus("idle");
        skipMicPermission();

      } else if (discovery.status === "registration-required") {
        // 🆓 Handle is unclaimed — redirect to claim page
        playRandomWelcomeMessage();
        setAtLineStatus("idle");
        const currentHost = window.location.hostname;
        if (
          currentHost === "localhost" ||
          currentHost === "127.0.0.1" ||
          currentHost.includes("vercel.app")
        ) {
          // Dev/preview: use query param routing
          window.location.href = `/?claim=${encodeURIComponent(cleanHandle)}`;
        } else {
          window.location.href = `https://claim.itsyouonline.com/?handle=${encodeURIComponent(cleanHandle)}`;
        }

      } else {
        // ⚠️ Invalid or API error — still allow entry (graceful fallback)
        console.warn("[ENTRY FLOW] Could not resolve handle — entering as new user");
        playRandomWelcomeMessage();
        localStorage.setItem("active_youniverse_handle", cleanHandle);
        setPendingYouniverseSubdomain(`${cleanHandle}.itsyouonline.com`);
        setAtLineStatus("idle");
        skipMicPermission();
      }

    } catch (e) {
      // Network failure — graceful fallback: treat as found and enter
      console.warn("[ENTRY FLOW] Discovery error, entering anyway:", e);
      playRandomWelcomeMessage();
      localStorage.setItem("active_youniverse_handle", cleanHandle);
      setPendingYouniverseSubdomain(`${cleanHandle}.itsyouonline.com`);
      setAtLineStatus("idle");
      skipMicPermission();
    }
  };

  // HANDLER: Shatter Button Click
  // ------------------------------------------------------------------------
  // Explodes the button and shows the email field after animation completes
  const handleShatterClick = () => {
    setIsShatterAnimating(true);
    // Wait for shatter animation to complete before showing identity field
    setTimeout(() => {
      setShowIdentityEntry(true);
      setIsShatterAnimating(false);
    }, 1000); // 1 second delay matches shatter animation duration
  };

  // ------------------------------------------------------------------------
  // RENDER: Welcome Screen UI
  // ------------------------------------------------------------------------
  return (
    <motion.div
      className="h-screen w-screen bg-cover bg-center flex flex-col items-center justify-center p-2 welcome-screen-background relative"
      animate={{ opacity: isFadingOut ? 0 : 1 }}
      transition={{ duration: 6, ease: "easeOut" }}
      onAnimationComplete={isFadingOut ? onFadeOutComplete : undefined}
    >
      {/* ============ QUICK INSTALL PWA BUTTON ============ */}
      <div className="absolute top-4 right-4 z-40 flex items-center">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-pwa-install'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/80 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-xs font-medium backdrop-blur-md transition-all shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:scale-105 active:scale-95"
          title="Install The Youniverse (Offline PWA)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      </div>

      {/* ============ ASMR BACKGROUND - FULL SCREEN ============ */}
      {/* Animated particle effect covering entire screen */}
      <div
        className="absolute inset-0"
        style={{
          pointerEvents: 'none',
          zIndex: 1
        }}
      >
        <AsmrBackground />
      </div>

      {/* ============ PORTAL FRAME OVERLAY - FULL SCREEN ============ */}
      {/* Portal image on top of particles for depth effect */}
      <div
        className="absolute inset-0"
        style={{
          pointerEvents: 'none',
          zIndex: 10
        }}
      >
        <img
          src="/assets/images/you.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ mixBlendMode: 'screen' }}
        />
      </div>

      <div className="relative w-full max-w-md flex items-center justify-center" style={{ zIndex: 20 }}>
        {/* ============ SHATTER BUTTON ============ */}
        {/* Explodes to reveal email field */}
        {(!showIdentityEntry || isShatterAnimating) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="flex items-center justify-center"
          >
            <ShatterButton
              onClick={handleShatterClick}
              shatterColor="#00ffff"
              shardCount={30}
              className="!p-0 !w-8 !h-8 !rounded-full !border-none"
            >
              <LiquidMetalButton
                className="w-full h-full"
              />
            </ShatterButton>
          </motion.div>
        )}

        {/* ============ @ LINE COLLECTION SECTION & TITLE ============ */}
        {/* Interactive identity field and title - shows after button click */}
        {showIdentityEntry && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center w-full"
          >
            <AtLineComponent
              placeholder="Creator Of The Youniverse"
              onSubmit={handleEmailSubmit}
              disabled={false}
            />
            
            {/* Brand name title that appears after clicking */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ duration: 2, delay: 0.2, ease: "easeOut" }}
              className="absolute top-96 left-0 right-0 text-center pointer-events-none"
            >
              <h1 className="text-4xl font-bold text-white" style={{ letterSpacing: '0.3em' }}>The Youniverse</h1>
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default WelcomeScreen;
