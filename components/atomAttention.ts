/**
 * Atom attention channel.
 * Atom (AtomPresence) decides where its attention goes; FlowingLight (the embodiment) only follows.
 * Module-level pub/sub so the renderer never has to own window listeners.
 */

export interface AttentionTarget {
    /** Viewport coordinates (clientX / clientY). */
    x: number;
    y: number;
}

const listeners = new Set<(target: AttentionTarget) => void>();

export const registerAttentionCallback = (callback: (target: AttentionTarget) => void) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
};

export const attendTo = (target: AttentionTarget) => {
    listeners.forEach(callback => callback(target));
};
