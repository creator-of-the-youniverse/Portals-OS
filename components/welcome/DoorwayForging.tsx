/**
 * @file DoorwayForging
 *
 * The three-stage onboarding ritual inside @welcome.
 *   I.   Threshold Signal — speak a name; the world tunes to it.
 *   II.  Foundation Values — set 1–3 laws of your universe.
 *   III. Ignition Key — hold to forge; the gate parts.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isValidHandle, normalizeHandle } from "../../types/onboarding";
import {
  FOUNDATION_LAWS,
  MAX_LAWS,
  toggleLaw,
  handleEnergy,
  youniverseUrl,
  type ArrivalPayload,
  type FoundationLawId,
} from "../../lib/welcomeWorld";
import { checkRoom, igniteYouniverse } from "../../services/welcomeService";

type Stage = "threshold" | "laws" | "ignition";

interface Props {
  /** Live handle as it is being spoken — drives the atmosphere. */
  onSignal: (handle: string | null) => void;
  /** Forging succeeded — parent opens the gate. */
  onIgnited: (payload: ArrivalPayload) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOLD_MS = 1400;

const stageMotion = {
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -18, filter: "blur(8px)" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

// ─────────────────────────────────────────────────────────────
// Hold-to-ignite: progress written straight to a CSS var.
// ─────────────────────────────────────────────────────────────
function useHold(onComplete: () => void, disabled: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);

  const set = (p: number) => ref.current?.style.setProperty("--p", String(p));

  const cancel = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (done.current) return;
    // Spring back gently.
    const from = Number(ref.current?.style.getPropertyValue("--p") || 0);
    const t0 = performance.now();
    const back = (now: number) => {
      const p = Math.max(0, from - (now - t0) / 400);
      set(p);
      if (p > 0) raf.current = requestAnimationFrame(back);
    };
    raf.current = requestAnimationFrame(back);
  }, []);

  const begin = useCallback(() => {
    if (disabled || done.current) return;
    cancelAnimationFrame(raf.current);
    start.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start.current) / HOLD_MS);
      set(p);
      if (p >= 1) {
        done.current = true;
        navigator.vibrate?.(40);
        onComplete();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [disabled, onComplete]);

  const reset = useCallback(() => {
    done.current = false;
    set(0);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const bind = {
    ref,
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); begin(); },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") cancel();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { bind, reset };
}

const DoorwayForging: React.FC<Props> = ({ onSignal, onIgnited }) => {
  const [stage, setStage] = useState<Stage>("threshold");

  // Stage I
  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [signal, setSignal] = useState<{ text: string; warn?: boolean } | null>(null);
  const handleInputRef = useRef<HTMLInputElement>(null);

  // Stage II
  const [laws, setLaws] = useState<FoundationLawId[]>([]);

  // Stage III
  const [email, setEmail] = useState("");
  const [igniting, setIgniting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = normalizeHandle(raw);
  const forged = acknowledged ?? handle;

  // ── Stage I: live atmospheric tuning (debounced) ──────────
  useEffect(() => {
    if (acknowledged) return;
    const t = setTimeout(() => onSignal(handle.length ? handle : null), 140);
    return () => clearTimeout(t);
  }, [handle, acknowledged, onSignal]);

  useEffect(() => {
    if (stage === "threshold" && !acknowledged) {
      const t = setTimeout(() => handleInputRef.current?.focus(), 600);
      return () => clearTimeout(t);
    }
  }, [stage, acknowledged]);

  const speakName = async () => {
    if (checking) return;
    setExisting(null);
    if (!isValidHandle(handle)) {
      setSignal({ text: "3–32 characters · letters, numbers, hyphens", warn: true });
      return;
    }
    setChecking(true);
    setSignal({ text: "listening for an echo…" });
    const status = await checkRoom(handle).catch(() => "unknown" as const);
    setChecking(false);

    if (status === "system") {
      setSignal({ text: `@${handle} belongs to the network itself. Speak your own name.`, warn: true });
      return;
    }
    if (status === "invalid") {
      setSignal({ text: "That signal won't hold. Try another name.", warn: true });
      return;
    }
    if (status === "exists") {
      setSignal(null);
      setExisting(handle);
      return;
    }

    // Open (or unverifiable — the claim step remains authoritative).
    setSignal(null);
    setAcknowledged(handle);
    onSignal(handle);
    setTimeout(() => setStage("laws"), 2100);
  };

  const resetThreshold = () => {
    setAcknowledged(null);
    setExisting(null);
    setSignal(null);
    setRaw("");
    setStage("threshold");
    onSignal(null);
  };

  // ── Stage III ─────────────────────────────────────────────
  const emailValid = EMAIL_RE.test(email.trim());

  const ignite = useCallback(async () => {
    setIgniting(true);
    setError(null);
    const energy = handleEnergy(forged);
    const result = await igniteYouniverse({
      handle: forged,
      email: email.trim(),
      foundation: laws,
      energyHue: energy.hue,
    });

    if (result.ok) {
      onIgnited({
        handle: result.handle,
        laws,
        hue: energy.hue,
        forgedAt: new Date().toISOString(),
        handoffToken: result.handoffToken,
        redirectUrl: result.redirectUrl,
      });
      return;
    }

    setIgniting(false);
    holdReset();
    if (result.reason === "taken" || result.reason === "reserved") {
      resetThreshold();
      setSignal({ text: result.message, warn: true });
      return;
    }
    setError(result.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forged, email, laws, onIgnited]);

  const { bind: holdBind, reset: holdReset } = useHold(ignite, !emailValid || igniting);

  const stepIndex = stage === "threshold" ? 0 : stage === "laws" ? 1 : 2;

  return (
    <div className="ww-ritual">
      <AnimatePresence mode="wait">
        {/* ───────────── STAGE I · THE THRESHOLD SIGNAL ───────────── */}
        {stage === "threshold" && !acknowledged && (
          <motion.div key="threshold" {...stageMotion} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="ww-stage-label">I · The Threshold Signal</div>
            <h1 className="ww-prompt">Speak the name you want the web to <em>recognize</em>.</h1>

            <form
              className="ww-at"
              style={{ ["--fill" as string]: Math.min(1, handle.length / 8) }}
              onSubmit={(e) => { e.preventDefault(); speakName(); }}
            >
              <span className="ww-at__sym" aria-hidden="true">@</span>
              <input
                id="welcome-handle-input"
                ref={handleInputRef}
                className="ww-at__input"
                value={raw}
                onChange={(e) => { setRaw(e.target.value.replace(/^@+/, "").replace(/\s/g, "")); setSignal(null); setExisting(null); }}
                placeholder="yourname"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                aria-label="Your handle"
                disabled={checking}
              />
              <span className="ww-at__line" />
            </form>
            <div className="ww-at__domain">
              {handle ? <><b>{handle}</b>.itsyouonline.com</> : "\u00a0"}
            </div>

            <div className={`ww-signal ${signal?.warn ? "ww-signal--warn" : ""}`} role="status">
              {signal?.text ?? (handle.length >= 3 ? "press enter to cross the threshold" : "\u00a0")}
            </div>

            <AnimatePresence>
              {existing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
                >
                  <div className="ww-signal">A room already stands at @{existing}.</div>
                  <div className="ww-row">
                    <a id="welcome-visit-existing" className="ww-btn" href={youniverseUrl(existing)}>
                      Visit @{existing} →
                    </a>
                  </div>
                  <button className="ww-back" onClick={() => { setRaw(""); setExisting(null); handleInputRef.current?.focus(); }}>
                    speak a different name
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Stage I · acknowledgement ── */}
        {stage === "threshold" && acknowledged && (
          <motion.div key="ack" {...stageMotion} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="ww-stage-label">The threshold recognizes you</div>
            <motion.p
              className="ww-ack"
              initial={{ letterSpacing: "0.4em", opacity: 0 }}
              animate={{ letterSpacing: "0em", opacity: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            >
              @{acknowledged}
            </motion.p>
            <motion.p className="ww-ack-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
              this frequency is unclaimed · the air is tuning to you
            </motion.p>
          </motion.div>
        )}

        {/* ───────────── STAGE II · THE FOUNDATION VALUES ───────────── */}
        {stage === "laws" && (
          <motion.div key="laws" {...stageMotion} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="ww-stage-label">II · The Foundation Values</div>
            <h2 className="ww-prompt">Every universe has laws. Choose <em>up to three</em> for yours.</h2>

            <div className="ww-laws" role="group" aria-label="Foundation laws">
              {FOUNDATION_LAWS.map((law, i) => {
                const rank = laws.indexOf(law.id);
                const on = rank >= 0;
                return (
                  <motion.button
                    key={law.id}
                    id={`welcome-law-${law.id}`}
                    type="button"
                    className="ww-law"
                    aria-pressed={on}
                    title={law.whisper}
                    onClick={() => setLaws((cur) => toggleLaw(cur, law.id))}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * i, duration: 0.5 }}
                  >
                    {on && <span className="ww-law__rank">{["I", "II", "III"][rank]}</span>}
                    <span className="ww-law__glyph" aria-hidden="true">{law.glyph}</span>
                    <span className="ww-law__label">{law.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="ww-law-whispers" aria-live="polite">
              <AnimatePresence>
                {laws.map((id) => {
                  const law = FOUNDATION_LAWS.find((l) => l.id === id)!;
                  return (
                    <motion.span key={id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      {law.whisper}
                    </motion.span>
                  );
                })}
              </AnimatePresence>
              {laws.length === 0 && <span style={{ opacity: 0.5 }}>{`${MAX_LAWS} laws at most · some laws cannot coexist`}</span>}
            </div>

            <button id="welcome-laws-confirm" className="ww-btn" disabled={laws.length === 0} onClick={() => setStage("ignition")}>
              Inscribe these laws
            </button>
            <button className="ww-back" onClick={resetThreshold}>← speak a different name</button>
          </motion.div>
        )}

        {/* ───────────── STAGE III · THE IGNITION KEY ───────────── */}
        {stage === "ignition" && (
          <motion.div key="ignition" {...stageMotion} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="ww-stage-label">III · The Ignition Key</div>

            <div className="ww-sigil">
              <span className="ww-sigil__handle">@{forged}</span>
              <div className="ww-sigil__laws">
                {laws.map((id) => {
                  const law = FOUNDATION_LAWS.find((l) => l.id === id)!;
                  return <span key={id}>{law.glyph} {law.label}</span>;
                })}
              </div>
            </div>

            <div className="ww-field">
              <input
                id="welcome-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="where should your key be kept?"
                autoComplete="email"
                aria-label="Email"
                disabled={igniting}
                autoFocus
              />
              <div className="ww-field__hint">your email is the only spare key · never shown publicly</div>
            </div>

            <button
              id="welcome-ignite"
              type="button"
              className="ww-key"
              disabled={!emailValid || igniting}
              aria-label={`Hold to ignite ${forged}.itsyouonline.com`}
              {...holdBind}
            >
              <span className="ww-key__ring" />
              <span className="ww-key__core">
                <span className="ww-key__glyph">{igniting ? "✦" : "⟡"}</span>
                <span className="ww-key__label">{igniting ? "forging" : "hold"}</span>
              </span>
            </button>

            <div className="ww-signal">
              {igniting ? `forging ${forged}.itsyouonline.com…` : emailValid ? "press and hold to ignite" : "\u00a0"}
            </div>
            {error && <div className="ww-error" role="alert">{error}</div>}

            {!igniting && <button className="ww-back" onClick={() => setStage("laws")}>← revisit your laws</button>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ww-steps" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} data-on={i <= stepIndex} />)}
      </div>
    </div>
  );
};

export default DoorwayForging;
