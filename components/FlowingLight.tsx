"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
// import { card } from "@/components/ui/card"; // Assuming 'card' is a shadcn/ui component - Unused in provided code
import { MessageSquareText } from 'lucide-react'; // Using lucide-react for icons
import { cn } from "@/lib/utils";
import { registerBubbleCallback } from "./speechBubbleUtils";
import { useDiagnosticObserver } from "@/hooks/useDiagnosticObserver";
import { useBREStore } from "@/store/breStore";

interface LightParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
}

interface FlowingLightProps {
    className?: string;
    lightIntensity?: number;
    fogDensity?: number;
    particleCount?: number;
    lockTarget?: { x: number; y: number };
}

interface ChatMessage {
    id: string;
    text: string;
    x: number;
    y: number;
    opacity: number;
    life: number;
}

export const FlowingLight: React.FC<FlowingLightProps> = ({
    className = "",
    lightIntensity = 1,
    fogDensity = 0.8,
    particleCount = 80,
    lockTarget
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | undefined>(undefined);
    const mouseRef = useRef({ x: 0, y: 0 });
    const targetRef = useRef({ x: 0, y: 0 });
    const lightRef = useRef({ x: 400, y: 300 });
    const particlesRef = useRef<LightParticle[]>([]);
    const [isHovered, setIsHovered] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const lastChatTimeRef = useRef(0);
    const currentElementRef = useRef<HTMLElement | null>(null);

    // Global Hover Context Logic for ONE
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastHoveredElementRef = useRef<HTMLElement | null>(null);
    const explainedContextsRef = useRef<Set<string>>(new Set());
    const isProcessingRef = useRef(false);
    const lastTappedElementRef = useRef<HTMLElement | null>(null);
    const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Skip if hovering over the canvas or chat messages (ONE's container)
            if (target.closest('canvas') || target.closest('.bg-primary')) return;

            // Try to find a meaningful description for the element
            let context = '';

            let el: HTMLElement | null = target;
            for (let i = 0; i < 5 && el; i++) {
                if (el.dataset.one) { context = el.dataset.one; break; }
                if (el.title) { context = el.title; break; }
                if (el.getAttribute('aria-label')) { context = el.getAttribute('aria-label')!; break; }
                if (el.tagName === 'BUTTON' || el.tagName === 'A') {
                    const text = el.innerText?.trim();
                    if (text && text.length < 50) { context = text; break; }
                }
                el = el.parentElement;
            }

            if (!context) {
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                lastHoveredElementRef.current = null;
                return;
            }

            if (lastHoveredElementRef.current === target) return;

            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            lastHoveredElementRef.current = target;

            // 0.8-Second Delay — quick enough ONE feels responsive
            hoverTimerRef.current = setTimeout(async () => {
                if (!isProcessingRef.current && lastHoveredElementRef.current === target) {
                    isProcessingRef.current = true;

                    try {
                        const { showSpeechBubble } = await import('./speechBubbleUtils');
                        
                        // Check if we've already explained this exact context
                        if (explainedContextsRef.current.has(context)) {
                            // Don't repeat the same hint if we've already done it, to avoid spam
                            return; 
                        }

                        // We import the AI generator
                        const { generateOneAiHint } = await import('../lib/oneai');
                        
                        // Show a thinking indicator? Not necessary if fast.
                        const aiHint = await generateOneAiHint(context);
                        
                        explainedContextsRef.current.add(context);
                        // Prevent the cache from growing infinitely
                        if (explainedContextsRef.current.size > 50) {
                            const firstItem = explainedContextsRef.current.values().next().value;
                            if (firstItem) explainedContextsRef.current.delete(firstItem);
                        }

                        showSpeechBubble(aiHint);
                    } catch (error) {
                        console.error("Hover generation failed", error);
                    } finally {
                        isProcessingRef.current = false;
                        lastHoveredElementRef.current = null;
                    }
                }
            }, 800);
        };

        const handleMouseOut = () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
                lastHoveredElementRef.current = null;
            }
        };

        const handleMobileTapCapture = async (e: MouseEvent) => {
            if (typeof window === 'undefined' || window.innerWidth >= 768) return;

            const target = e.target as HTMLElement;
            // Find the nearest interactive ancestor
            let interactiveEl: HTMLElement | null = null;
            let el: HTMLElement | null = target;
            for (let i = 0; i < 5 && el; i++) {
                if (el.dataset.one || el.tagName === 'BUTTON' || el.tagName === 'A' || el.classList.contains('cursor-pointer') || el.getAttribute('role') === 'button') {
                    interactiveEl = el;
                    break;
                }
                el = el.parentElement;
            }

            if (!interactiveEl) return;

            // If it's the same element as last time, let the click through
            if (lastTappedElementRef.current === interactiveEl) {
                lastTappedElementRef.current = null;
                if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
                return;
            }

            // Otherwise, intercept and show hint
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            lastTappedElementRef.current = interactiveEl;
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = setTimeout(() => {
                lastTappedElementRef.current = null;
            }, 3000); // 3 seconds to confirm the tap

            // Move orb immediately to tap location
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                mouseRef.current = { x: e.clientX, y: e.clientY };
                lightRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }

            // Trigger hint immediately
            let context = interactiveEl.dataset.one || interactiveEl.title || interactiveEl.getAttribute('aria-label') || interactiveEl.innerText?.trim() || "";
            if (context) {
                try {
                    if (explainedContextsRef.current.has(context)) {
                        return;
                    }
                    const { generateOneAiHint } = await import('../lib/oneai');
                    const aiHint = await generateOneAiHint(context);
                    
                    explainedContextsRef.current.add(context);
                    if (explainedContextsRef.current.size > 50) {
                        const firstItem = explainedContextsRef.current.values().next().value;
                        if (firstItem) explainedContextsRef.current.delete(firstItem);
                    }

                    const { showSpeechBubble } = await import('./speechBubbleUtils');
                    showSpeechBubble(aiHint);
                } catch (err) {
                    console.error("Mobile hint failed", err);
                }
            }
        };

        window.addEventListener('mouseover', handleMouseOver);
        window.addEventListener('mouseout', handleMouseOut);
        // Using capture: true to intercept clicks before they reach component handlers
        window.addEventListener('click', handleMobileTapCapture, { capture: true });

        return () => {
            window.removeEventListener('mouseover', handleMouseOver);
            window.removeEventListener('mouseout', handleMouseOut);
            window.removeEventListener('click', handleMobileTapCapture, { capture: true });
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        };
    }, []);

    // Activate BRE Diagnostic Layer
    useDiagnosticObserver();
    const alignment = useBREStore((state) => state.alignment);

    const createParticle = useCallback((x: number, y: number): LightParticle => {
        const angle = Math.random() * Math.PI * 2;
        // Speed increases with chaos (negative score)
        const chaosMultiplier = alignment.score < 0 ? 1 + (Math.abs(alignment.score) / 20) : 1;
        const speed = (Math.random() * 2 + 1) * chaosMultiplier;

        return {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: Math.random() * 60 + 30,
            maxLife: Math.random() * 60 + 30,
            size: Math.random() * 3 + 1
        };
    }, [alignment.score]);

    const initializeParticles = useCallback(() => {
        particlesRef.current = [];
        if (canvasRef.current) {
            for (let i = 0; i < particleCount; i++) {
                particlesRef.current.push(createParticle(
                    Math.random() * canvasRef.current.width,
                    Math.random() * canvasRef.current.height
                ));
            }
        }
    }, [particleCount, createParticle]);

    const getElementEdges = useCallback((element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return [];

        const x = rect.left - containerRect.left;
        const y = rect.top - containerRect.top;
        const width = rect.width;
        const height = rect.height;

        return [
            { x: x, y: y },
            { x: x + width, y: y },
            { x: x + width, y: y + height },
            { x: x, y: y + height }
        ];
    }, []);

    const getDistanceToElementEdge = useCallback((x: number, y: number, element: HTMLElement) => {
        const edges = getElementEdges(element);
        if (edges.length === 0) return Infinity;

        let minDistance = Infinity;

        for (let i = 0; i < edges.length; i++) {
            const p1 = edges[i];
            const p2 = edges[(i + 1) % edges.length];

            const A = x - p1.x;
            const B = y - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;
            if (param < 0) {
                xx = p1.x;
                yy = p1.y;
            } else if (param > 1) {
                xx = p2.x;
                yy = p2.y;
            } else {
                xx = p1.x + param * C;
                yy = p1.y + param * D;
            }

            const dx = x - xx;
            const dy = y - yy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            minDistance = Math.min(minDistance, distance);
        }

        return minDistance;
    }, [getElementEdges]);

    const getClosestPointOnElementEdge = useCallback((x: number, y: number, element: HTMLElement) => {
        const edges = getElementEdges(element);
        if (edges.length === 0) return { x, y };

        let minDist = Infinity;
        let closestPoint = { x, y };

        for (let i = 0; i < edges.length; i++) {
            const p1 = edges[i];
            const p2 = edges[(i + 1) % edges.length];

            const A = x - p1.x;
            const B = y - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;
            if (param < 0) {
                xx = p1.x;
                yy = p1.y;
            } else if (param > 1) {
                xx = p2.x;
                yy = p2.y;
            } else {
                xx = p1.x + param * C;
                yy = p1.y + param * D;
            }

            const dist = Math.sqrt((x - xx) ** 2 + (y - yy) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closestPoint = { x: xx, y: yy };
            }
        }
        return closestPoint;
    }, [getElementEdges]);

    // ONE's personality - customize messages here or connect to API
    const getONEMessage = useCallback((element: HTMLElement): string => {
        // Disabled hardcoded messages to prevent confusion with actual AI
        return "";
    }, []);

    const generateChat = useCallback((element: HTMLElement) => {
        const now = Date.now();
        if (now - lastChatTimeRef.current < 2500) return; // Shortened to 2.5 seconds

        const message = getONEMessage(element);

        if (message) {
            const rect = element.getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!containerRect) return;

            const chatX = (rect.left - containerRect.left) + rect.width / 2;
            const chatY = (rect.top - containerRect.top) - 60; // Further from element

            setChatMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    text: message,
                    x: chatX,
                    y: chatY,
                    opacity: 0.7, // 70% transparent
                    life: 150 // Slightly shorter duration
                }
            ]);
            lastChatTimeRef.current = now;
        }
    }, [getONEMessage]);

    const [isIdle, setIsIdle] = useState(false);

    // Idle Detection
    useEffect(() => {
        let idleTimer: NodeJS.Timeout;
        const setIdle = () => setIsIdle(true);
        const resetIdle = (e?: any) => {
            setIsIdle(false);
            if (e && (e.type === 'mousemove' && canvasRef.current)) {
                const rect = canvasRef.current.getBoundingClientRect();
                mouseRef.current = { x: e.clientX, y: e.clientY };
            }
            clearTimeout(idleTimer);
            idleTimer = setTimeout(setIdle, 5000); // 5 seconds to idle
        };

        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('mousedown', resetIdle);
        window.addEventListener('keypress', resetIdle);

        idleTimer = setTimeout(setIdle, 5000);

        return () => {
            window.removeEventListener('mousemove', resetIdle);
            window.removeEventListener('mousedown', resetIdle);
            window.removeEventListener('keypress', resetIdle);
            clearTimeout(idleTimer);
        };
    }, []);

    const interactiveElementsRef = useRef<HTMLElement[]>([]);

    // Periodically update the list of interactive elements to avoid DOM scanning on every frame
    useEffect(() => {
        const scanElements = () => {
            // Focus on common interactive tags and elements with specific data/role attributes
            // Scanning 'body *' on every frame was the source of the performance drop
            const allElements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [data-one], .cursor-pointer')) as HTMLElement[];
            interactiveElementsRef.current = allElements.filter(el => {
                const elRect = el.getBoundingClientRect();
                // For fixed/absolute elements, offsetParent might be null, so we check if it has dimensions
                // and isn't explicitly hidden by CSS.
                const style = window.getComputedStyle(el);
                return elRect.width > 2 && elRect.height > 2 &&
                    style.display !== 'none' &&
                    style.opacity !== '0' &&
                    style.visibility !== 'hidden';
            });
        };

        const interval = setInterval(scanElements, 1000); // Scan once per second
        scanElements();
        return () => clearInterval(interval);
    }, []);

    const updateLight = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let targetX, targetY;

        if (lockTarget) {
            targetX = lockTarget.x;
            targetY = lockTarget.y;
        } else if (isIdle) {
            // Settle perfectly in the center of the portal
            targetX = canvas.width / 2;
            targetY = canvas.height / 2;
        } else {
            // Follow mouse
            const rect = canvas.getBoundingClientRect();
            targetX = mouseRef.current.x - rect.left;
            targetY = mouseRef.current.y - rect.top;
        }

        targetRef.current.x = targetX;
        targetRef.current.y = targetY;

        let closestDistance = Infinity;
        let closestPoint = { x: targetRef.current.x, y: targetRef.current.y };
        let newCurrentElement: HTMLElement | null = null;

        // Use the cached list of elements instead of scanning the DOM
        interactiveElementsRef.current.forEach(el => {
            const distance = getDistanceToElementEdge(targetRef.current.x, targetRef.current.y, el);
            if (distance < 80 && distance < closestDistance) { // Check proximity
                closestDistance = distance;
                closestPoint = getClosestPointOnElementEdge(targetRef.current.x, targetRef.current.y, el);
                newCurrentElement = el;
            }
        });

        // If the light is close to an element, update currentElementRef
        // BUT ONLY IF NOT IDLE - We don't want the ghost activating things randomly
        if (!isIdle && newCurrentElement && closestDistance < 80) {
            if (currentElementRef.current !== newCurrentElement) {
                currentElementRef.current = newCurrentElement;
                generateChat(newCurrentElement);
            }
        } else {
            currentElementRef.current = null;
        }

        // Smooth movement towards target or closest edge
        // Slower lerp when idle for drift effect
        const lerpFactor = isIdle ? 0.04 : 0.08;

        // If sticky to an element (and consistent), snap to edge
        // Otherwise drift to target
        const destX = (!isIdle && closestDistance < 80) ? closestPoint.x : targetRef.current.x;
        const destY = (!isIdle && closestDistance < 80) ? closestPoint.y : targetRef.current.y;

        lightRef.current.x += (destX - lightRef.current.x) * lerpFactor;
        lightRef.current.y += (destY - lightRef.current.y) * lerpFactor;
    }, [getDistanceToElementEdge, getClosestPointOnElementEdge, generateChat, isIdle, lockTarget]);

    const updateParticles = useCallback(() => {
        particlesRef.current.forEach((particle) => {
            // Attract particles to light
            const dx = lightRef.current.x - particle.x;
            const dy = lightRef.current.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                const force = 0.02;
                particle.vx += (dx / distance) * force;
                particle.vy += (dy / distance) * force;
            }

            // Apply velocity with damping
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            particle.x += particle.vx;
            particle.y += particle.vy;

            // Update life
            particle.life--;

            // Respawn particle if dead or too far
            if (particle.life <= 0 || distance > 200) {
                const angle = Math.random() * Math.PI * 2;
                const spawnDistance = 100 + Math.random() * 50;
                particle.x = lightRef.current.x + Math.cos(angle) * spawnDistance;
                particle.y = lightRef.current.y + Math.sin(angle) * spawnDistance;
                particle.life = particle.maxLife;
                particle.vx = (Math.random() - 0.5) * 2;
                particle.vy = (Math.random() - 0.5) * 2;
            }
        });
    }, []);

    const updateChatMessages = useCallback(() => {
        setChatMessages(prev =>
            prev
                .map(msg => ({
                    ...msg,
                    life: msg.life - 3, // Faster decay — 3x speed
                    opacity: Math.min((msg.life / 100) * 0.8, 0.8) // Fade quickly
                }))
                .filter(msg => msg.life > 0)
        );
    }, []);

    // Listen to system/Oracle messages
    useEffect(() => {
        const unregister = registerBubbleCallback((text) => {
            // Clear ALL previous hover hints, keep only the newest one
            setChatMessages([{
                    id: `oracle-${Date.now()}`,
                    text: text,
                    x: lightRef.current.x,
                    y: lightRef.current.y - 60, // Above the orb
                    opacity: 0.9,
                    life: Math.min(180 + text.length * 1.5, 300) // Capped at ~5 seconds max
                }]);
            lastChatTimeRef.current = Date.now();
        });
        return () => { unregister(); };
    }, []);

    // Monitor Alignment for ONE's Commentary
    useEffect(() => {
        if (Math.abs(alignment.score) > 30) {
            const isChaos = alignment.score < 0;
            const comment = isChaos
                ? "You seem agitated. Shall we focus?"
                : "Your mind is clear. We are evolving.";

            // Only comment occasionally
            if (Math.random() > 0.7) {
                setChatMessages(prev => [
                    ...prev,
                    {
                        id: `bre-${Date.now()}`,
                        text: comment,
                        x: lightRef.current.x,
                        y: lightRef.current.y - 60,
                        opacity: 0.8,
                        life: 300
                    }
                ]);
            }
        }
    }, [alignment.score]);

    // ONE's welcome message on load
    useEffect(() => {
        const timer = setTimeout(() => {
            setChatMessages([{
                id: 'welcome',
                text: "I am ONE. Welcome to your OS.",
                x: window.innerWidth / 2,
                y: window.innerHeight / 2 - 100,
                opacity: 0.7,
                life: 300 // 5 seconds for welcome message, starts fading immediately
            }]);
        }, 500); // Show after half a second

        return () => clearTimeout(timer);
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw fog effect (will invert based on background due to difference blend mode)
        // Fog color shifts based on alignment (Redish for Chaos, Blue/White for Order)
        // Note: Since we use difference blend mode, this is tricky, but size changes work well.
        const fogSize = alignment.score < -20 ? 180 : 120;

        const fogGradient = ctx.createRadialGradient(
            lightRef.current.x, lightRef.current.y, 0,
            lightRef.current.x, lightRef.current.y, fogSize * fogDensity
        );
        fogGradient.addColorStop(0, `rgba(255, 255, 255, ${0.4 * lightIntensity})`);
        fogGradient.addColorStop(0.3, `rgba(255, 255, 255, ${0.2 * lightIntensity})`);
        fogGradient.addColorStop(0.6, `rgba(255, 255, 255, ${0.08 * lightIntensity})`);
        fogGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = fogGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw particles (will invert based on background)
        particlesRef.current.forEach(particle => {
            const alpha = (particle.life / particle.maxLife) * lightIntensity;
            const distance = Math.sqrt(
                (particle.x - lightRef.current.x) ** 2 +
                (particle.y - lightRef.current.y) ** 2
            );
            const proximityAlpha = Math.max(0, 1 - distance / 100);

            ctx.save();
            ctx.globalAlpha = alpha * proximityAlpha * 0.9;
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Draw main light core (will invert based on background)
        if (!lockTarget) {
            const coreGradient = ctx.createRadialGradient(
                lightRef.current.x, lightRef.current.y, 0,
                lightRef.current.x, lightRef.current.y, 15
            );
            coreGradient.addColorStop(0, `rgba(255, 255, 255, ${1 * lightIntensity})`);
            coreGradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.8 * lightIntensity})`);
            coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.save();
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(lightRef.current.x, lightRef.current.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }, [lightIntensity, fogDensity, lockTarget]);

    const animate = useCallback(() => {
        updateLight();
        updateParticles();
        updateChatMessages();
        draw();
        animationRef.current = requestAnimationFrame(animate);
    }, [updateLight, updateParticles, updateChatMessages, draw]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const resizeCanvas = () => {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            initializeParticles(); // Re-initialize particles on resize
        };

        resizeCanvas();
        initializeParticles();

        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current.x = e.clientX;
            mouseRef.current.y = e.clientY;
        };

        const handleMouseEnter = () => setIsHovered(true);
        const handleMouseLeave = () => setIsHovered(false);

        window.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseenter', handleMouseEnter);
        container.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('resize', resizeCanvas);

        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseenter', handleMouseEnter);
            container.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('resize', resizeCanvas);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [animate, initializeParticles]);

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full h-screen bg-transparent overflow-hidden", className)}
        >
            <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none z-9999"
                style={{ mixBlendMode: 'difference' }}
            />

            {chatMessages.map(msg => (
                <div
                    key={msg.id}
                    className="fixed z-10000 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 py-1.5 text-xs shadow-lg transition-opacity duration-300"
                    style={{
                        left: msg.x,
                        top: msg.y,
                        opacity: msg.opacity,
                        transform: 'translateX(-50%) translateY(-100%)',
                        pointerEvents: 'none',
                        maxWidth: '400px',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word'
                    }}
                >
                    <MessageSquareText className="h-3 w-3 shrink-0" />
                    <span>{msg.text}</span>
                </div>
            ))}


        </div>
    );
};

export default function FlowingLightDemo() {
    return (
        <div className="relative w-full h-screen flex flex-col items-center justify-center bg-linear-to-br from-slate-900 via-blue-900 to-slate-800">
            <FlowingLight />
            {/* Example elements for the light to interact with */}
            <div className="absolute top-1/4 left-1/4 w-64 h-40 bg-background/10 backdrop-blur-md border border-border/20 rounded-xl shadow-2xl p-6 text-foreground z-30" id="example-card-1">
                <h3 className="text-xl font-bold mb-2">Welcome Card</h3>
                <p className="text-sm text-muted-foreground">This is a sample card. The light orb will interact with its edges.</p>
                <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Learn More</button>
            </div>
            <div className="absolute top-1/2 right-1/4 w-56 h-32 bg-background/10 backdrop-blur-md border border-border/20 rounded-lg shadow-xl p-4 text-foreground z-30" id="example-card-2">
                <h4 className="font-semibold">Stats Overview</h4>
                <p className="text-xs text-muted-foreground mt-1">Users: 1.2M</p>
                <p className="text-xs text-muted-foreground">Revenue: $500K</p>
            </div>
            <button className="absolute bottom-1/4 left-1/2 -translate-x-1/2 px-6 py-3 bg-green-500 text-white rounded-full shadow-lg hover:bg-green-600 transition-colors z-30" id="signup-button">
                Sign Up Now!
            </button>
            <a href="#" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg text-blue-400 hover:text-blue-300 transition-colors z-30" id="about-link">
                About Us
            </a>
            <input type="text" placeholder="Enter your email" className="absolute bottom-1/3 left-1/4 p-2 rounded-md bg-background/20 border border-border/40 text-foreground placeholder-muted-foreground z-30" id="email-input" />
        </div>
    );
}
