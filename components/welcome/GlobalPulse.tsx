/**
 * @file GlobalPulse
 *
 * The collective energy of the network, rendered as quiet scenery:
 * three living numbers and a slow river of moments along the floor.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WelcomePulse } from "../../services/welcomeService";
import { THESIS, getMilestone, type SeasonalMoment } from "../../lib/welcomeWorld";

function useCountUp(target: number, ms = 1600): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function ago(iso: string, now: number): string {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

interface Props {
  pulse: WelcomePulse | null;
  season: SeasonalMoment;
}

const Stat: React.FC<{ n: number; label: string }> = ({ n, label }) => {
  const v = useCountUp(n);
  return (
    <div className="ww-stat">
      <span className="ww-stat__n">{v.toLocaleString()}</span>
      <span className="ww-stat__l">{label}</span>
    </div>
  );
};

const GlobalPulse: React.FC<Props> = ({ pulse, season }) => {
  const items = useMemo(() => {
    const now = pulse ? new Date(pulse.now).getTime() : Date.now();
    const out: { key: string; text: string; hue?: number | null }[] = [];

    pulse?.broadcasts.forEach((b) => out.push({ key: `b-${b.id}`, text: b.message, hue: b.hue }));

    const milestone = pulse ? getMilestone(pulse.total) : null;
    if (milestone) out.push({ key: "milestone", text: milestone });

    if (pulse && pulse.sparkedToday > 0) {
      out.push({
        key: "today",
        text: `${pulse.sparkedToday.toLocaleString()} new Youniverse${pulse.sparkedToday === 1 ? "" : "s"} sparked today`,
      });
    }

    pulse?.recent.forEach((r) =>
      out.push({ key: `r-${r.handle}`, text: `@${r.handle} stepped through the gate · ${ago(r.at, now)}`, hue: r.hue })
    );

    out.push({ key: "season", text: `${season.label} — ${season.line}` });
    out.push({ key: "thesis", text: `${THESIS.primary} ${THESIS.secondary}` });

    if (pulse && pulse.presence > 1) {
      out.push({ key: "presence", text: `${pulse.presence} people are standing at the threshold with you` });
    }
    return out;
  }, [pulse, season]);

  // Keep the river's speed constant regardless of how many moments it carries.
  const duration = Math.max(40, items.reduce((n, i) => n + i.text.length, 0) * 0.22);

  return (
    <section className="ww-pulse" aria-label="Global pulse of the network">
      {pulse && (
        <div className="ww-pulse__stats">
          <Stat n={pulse.presence} label="here now" />
          <Stat n={pulse.sparkedToday} label="sparked today" />
          <Stat n={pulse.total} label="youniverses" />
        </div>
      )}
      <div className="ww-ticker" aria-live="off">
        <div className="ww-ticker__track" style={{ ["--ww-ticker-dur" as string]: `${duration}s` }}>
          {items.map((i) => (
            <span key={i.key} className="ww-ticker__item">
              <span
                className="ww-ticker__dot"
                style={i.hue != null ? ({ ["--dot" as string]: `hsl(${i.hue} 90% 65%)` }) : undefined}
              />
              {i.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GlobalPulse;
