/**
 * @file WelcomeAtmosphere
 *
 * Procedural motes drifting through @welcome. Color follows the live
 * energy hue (read from a ref — zero React re-renders per frame).
 * `surge` pulls every mote toward the gate seam during ignition.
 */

import React, { useEffect, useRef } from "react";

interface Props {
  hueRef: React.MutableRefObject<number>;
  tempo: number;
  surge: boolean;
}

interface Mote {
  x: number; y: number; vx: number; vy: number;
  r: number; a: number; phase: number; hueOffset: number;
}

const WelcomeAtmosphere: React.FC<Props> = ({ hueRef, tempo, surge }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surgeRef = useRef(surge);
  const tempoRef = useRef(tempo);
  surgeRef.current = surge;
  tempoRef.current = tempo;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0;
    let drawnHue = hueRef.current;
    const motes: Mote[] = [];

    const spawn = (anywhere: boolean): Mote => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.08 + Math.random() * 0.35),
      r: 0.4 + Math.random() * 1.8,
      a: 0.15 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      hueOffset: (Math.random() - 0.5) * 50,
    });

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(160, (w * h) / 9000));
      while (motes.length < target) motes.push(spawn(true));
      motes.length = target;
    };
    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    const frame = () => {
      t += 0.016 * tempoRef.current;
      // Ease the drawn hue toward the live hue along the shortest arc.
      const diff = ((hueRef.current - drawnHue + 540) % 360) - 180;
      drawnHue = (drawnHue + diff * 0.03 + 360) % 360;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const cx = w / 2, cy = h / 2;
      const surging = surgeRef.current;

      for (const m of motes) {
        if (surging) {
          const dx = cx - m.x, dy = cy - m.y;
          const d = Math.hypot(dx, dy) || 1;
          m.vx += (dx / d) * 0.35;
          m.vy += (dy / d) * 0.35;
          m.vx *= 0.94; m.vy *= 0.94;
        } else {
          m.vx += Math.sin(t * 0.6 + m.phase) * 0.003;
        }
        m.x += m.vx * tempoRef.current * (surging ? 3 : 1);
        m.y += m.vy * tempoRef.current * (surging ? 3 : 1);

        if (!surging && (m.y < -10 || m.x < -10 || m.x > w + 10)) Object.assign(m, spawn(false));

        const twinkle = 0.6 + Math.sin(t * 2 + m.phase) * 0.4;
        const hue = (drawnHue + m.hueOffset + 360) % 360;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 6);
        g.addColorStop(0, `hsla(${hue}, 95%, 78%, ${m.a * twinkle})`);
        g.addColorStop(1, `hsla(${hue}, 95%, 60%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [hueRef]);

  return <canvas ref={canvasRef} className="ww-canvas" aria-hidden="true" />;
};

export default WelcomeAtmosphere;
