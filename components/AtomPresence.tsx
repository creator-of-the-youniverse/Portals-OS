import { useEffect, useRef } from "react";
import { showSpeechBubble } from "./speechBubbleUtils";
import { attendTo } from "./atomAttention";
import { generateOneAiHint } from "../lib/oneai";

/**
 * AtomPresence: Atom's attention on the interface.
 *
 * Ontology (locked 2026-11-14/19): Atom is the intelligence; FlowingLight is its embodiment.
 * Everything that decides *when* Atom speaks or *what* it says lives here, not in FlowingLight.
 * Mount exactly once, in the Portals OS shell (Desktop). Renders nothing.
 *
 * Hint context is read from data-atom (preferred), data-one (legacy), title, aria-label,
 * or short button/link text.
 */

const WELCOME_SESSION_KEY = "atom_welcomed_session";
const WELCOME_TEXT = "I'm Atom. Welcome to your Youniverse.";
const HOVER_DELAY_MS = 800;
const TAP_CONFIRM_MS = 3000;
const MAX_EXPLAINED = 50;

interface AtomPresenceProps {
    /**
     * Mobile only: intercept the first tap on an interactive element to show a hint,
     * letting a second tap within 3s go through. Kept on by default to preserve current
     * behaviour; spec step 9 will turn this into an owner setting, default off.
     */
    interceptMobileTaps?: boolean;
}

const readContext = (start: HTMLElement | null, allowAnyText: boolean): string => {
    let el: HTMLElement | null = start;
    for (let i = 0; i < 5 && el; i++) {
        if (el.dataset.atom) return el.dataset.atom;
        if (el.dataset.one) return el.dataset.one;
        if (el.title) return el.title;
        const aria = el.getAttribute("aria-label");
        if (aria) return aria;
        if (el.tagName === "BUTTON" || el.tagName === "A") {
            const text = el.innerText?.trim();
            if (text && (allowAnyText || text.length < 50)) return text;
        }
        el = el.parentElement;
    }
    return "";
};

const findInteractive = (start: HTMLElement | null): HTMLElement | null => {
    let el: HTMLElement | null = start;
    for (let i = 0; i < 5 && el; i++) {
        if (
            el.dataset.atom || el.dataset.one ||
            el.tagName === "BUTTON" || el.tagName === "A" ||
            el.classList.contains("cursor-pointer") ||
            el.getAttribute("role") === "button"
        ) return el;
        el = el.parentElement;
    }
    return null;
};

export const AtomPresence: React.FC<AtomPresenceProps> = ({ interceptMobileTaps = true }) => {
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastHoveredElementRef = useRef<HTMLElement | null>(null);
    const explainedContextsRef = useRef<Set<string>>(new Set());
    const isProcessingRef = useRef(false);
    const lastTappedElementRef = useRef<HTMLElement | null>(null);
    const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Welcome, once per browser session (Arrival owns the first-ever greeting).
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (sessionStorage.getItem(WELCOME_SESSION_KEY)) return;
        const timer = setTimeout(() => {
            sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
            showSpeechBubble(WELCOME_TEXT);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const remember = (context: string) => {
            explainedContextsRef.current.add(context);
            if (explainedContextsRef.current.size > MAX_EXPLAINED) {
                const first = explainedContextsRef.current.values().next().value;
                if (first) explainedContextsRef.current.delete(first);
            }
        };

        const explain = async (context: string) => {
            if (explainedContextsRef.current.has(context)) return; // no repeats
            const hint = await generateOneAiHint(context);
            remember(context);
            showSpeechBubble(hint);
        };

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Ignore Atom's own embodiment and bubbles.
            if (target.closest("canvas") || target.closest(".bg-primary")) return;

            const context = readContext(target, false);
            if (!context) {
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                lastHoveredElementRef.current = null;
                return;
            }
            if (lastHoveredElementRef.current === target) return;

            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            lastHoveredElementRef.current = target;

            hoverTimerRef.current = setTimeout(async () => {
                if (isProcessingRef.current || lastHoveredElementRef.current !== target) return;
                isProcessingRef.current = true;
                try {
                    await explain(context);
                } catch (error) {
                    console.error("Atom hover hint failed", error);
                } finally {
                    isProcessingRef.current = false;
                    lastHoveredElementRef.current = null;
                }
            }, HOVER_DELAY_MS);
        };

        const handleMouseOut = () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
                lastHoveredElementRef.current = null;
            }
        };

        const handleMobileTapCapture = async (e: MouseEvent) => {
            if (!interceptMobileTaps) return;
            if (typeof window === "undefined" || window.innerWidth >= 768) return;

            const interactiveEl = findInteractive(e.target as HTMLElement);
            if (!interactiveEl) return;

            // Second tap on the same element within the window: let it through.
            if (lastTappedElementRef.current === interactiveEl) {
                lastTappedElementRef.current = null;
                if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            lastTappedElementRef.current = interactiveEl;
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = setTimeout(() => { lastTappedElementRef.current = null; }, TAP_CONFIRM_MS);

            // Atom turns its attention to the tap; the embodiment follows.
            attendTo({ x: e.clientX, y: e.clientY });

            const context =
                interactiveEl.dataset.atom || interactiveEl.dataset.one || interactiveEl.title ||
                interactiveEl.getAttribute("aria-label") || interactiveEl.innerText?.trim() || "";
            if (!context) return;
            try {
                await explain(context);
            } catch (err) {
                console.error("Atom tap hint failed", err);
            }
        };

        window.addEventListener("mouseover", handleMouseOver);
        window.addEventListener("mouseout", handleMouseOut);
        window.addEventListener("click", handleMobileTapCapture, { capture: true });

        return () => {
            window.removeEventListener("mouseover", handleMouseOver);
            window.removeEventListener("mouseout", handleMouseOut);
            window.removeEventListener("click", handleMobileTapCapture, { capture: true });
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        };
    }, [interceptMobileTaps]);

    return null;
};

export default AtomPresence;
