"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeLineIndex, type LatLng } from "@/lib/geo";
import { biggestGain, distanceAt, gapSeries, timeAt, type Track } from "@/lib/ghost";
import { formatTime, miles } from "@/lib/format";
import { PauseIcon, PlayIcon } from "./Icons";
import TrailMap, { type MapDot } from "./TrailMap";

export type Racer = { id: number; label: string; ebike: boolean; elapsed: number; track: Track };

// You are always fog-white; rivals get colors that differ in lightness as well as hue.
const COLORS = ["#DCE3DE", "#E6B85C", "#8DB8CC", "#E58A58", "#B9A3E3"];
const SPEEDS = [1, 2, 4, 8];

export default function GhostRace({ segment, racers }: { segment: { id: number; name: string; points: LatLng[] }; racers: Racer[] }) {
  const line = useMemo(() => makeLineIndex(segment.points), [segment.points]);
  const length = line.length;
  const ref = racers[0]; // the reference rider ("You" when you're in the race)
  const end = Math.max(...racers.map((r) => r.elapsed));

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const dt = last.current == null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      last.current = null;
    };
  }, [playing, speed, end]);

  const dots: MapDot[] = racers
    .map((r, i) => {
      const [lat, lng] = line.pointAt(distanceAt(r.track, t));
      return { id: String(r.id), lat, lng, color: COLORS[i % COLORS.length], label: r.label };
    })
    .reverse(); // draw the reference rider on top

  // Live gap: where was each rival when the reference rider was at their current spot?
  const refAt = distanceAt(ref.track, t);
  const live = racers.map((r) => (t >= end || refAt >= length ? r.elapsed - ref.elapsed : timeAt(r.track, refAt) - timeAt(ref.track, refAt)));

  const rivals = racers.slice(1);
  // Light smoothing so GPS jitter doesn't make the chart look like a seismograph.
  const series = rivals.map((r) => smooth(gapSeries(ref.track, r.track, length, Math.max(5, length / 120)), 3));
  const fastest = rivals.length ? rivals.reduce((a, b) => (b.elapsed < a.elapsed ? b : a)) : null;
  const gain = fastest ? biggestGain(ref.track, fastest.track, length, Math.min(150, length / 4)) : null;

  // Chart scaling: gap (s) on y, distance along segment on x.
  const W = 350;
  const H = 120;
  const maxAbs = Math.max(3, ...series.flat().map((p) => Math.abs(p.gap)));
  const x = (d: number) => (d / length) * W;
  const y = (g: number) => H / 2 - (g / maxAbs) * (H / 2 - 10);

  const play = () => {
    if (t >= end) setT(0);
    setPlaying((p) => !p);
  };

  return (
    <>
      <div style={{ position: "relative", height: "46dvh", minHeight: 300 }}>
        <TrailMap className="map-fill" segments={[{ id: segment.id, name: segment.name, number: 1, points: segment.points }]} highlightId={segment.id} dots={dots} padding={{ top: 80, bottom: 40, left: 40, right: 40 }} />
        {gain && gain.seconds >= 0.5 && fastest && (
          <div style={{ position: "absolute", left: 16, bottom: 14, background: "rgba(14,19,17,0.92)", border: "1px solid #5a4a2a", borderRadius: 12, padding: "8px 10px", maxWidth: 240, fontSize: 12, lineHeight: 1.35 }}>
            <b style={{ color: COLORS[racers.indexOf(fastest) % COLORS.length], fontWeight: 600 }}>
              {fastest.label} gains {gain.seconds.toFixed(1)}s
            </b>{" "}
            between {miles(gain.from)} and {miles(gain.to)} (shaded on the chart)
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(racers.length, 3)}, minmax(0, 1fr))`, gap: 8, padding: "14px 20px 0" }}>
        {racers.map((r, i) => (
          <div key={r.id} className="card" style={{ padding: 10, ...(i === 0 ? { background: "var(--redwood-tint)", borderColor: "var(--redwood-line)" } : {}) }}>
            <div className="small" style={{ fontWeight: 600, color: COLORS[i % COLORS.length] }}>
              ● {r.label}{r.ebike ? " ⚡" : ""}
            </div>
            <div className="time" style={{ fontSize: 22 }}>
              {i === 0 ? formatTime(Math.min(t, r.elapsed)) : `${live[i] <= 0 ? "−" : "+"}${Math.abs(live[i]).toFixed(1)}s`}
            </div>
          </div>
        ))}
      </div>

      {rivals.length > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <div className="row-between small muted" style={{ fontWeight: 600, letterSpacing: "0.06em", paddingBottom: 6 }}>
            <span>GAP TO {ref.label.toUpperCase()}</span>
            <span>{miles(length)}</span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Time gap to ${ref.label} along the segment for each rider`}>
            {gain && gain.seconds >= 0.5 && <rect x={x(gain.from)} y={0} width={x(gain.to) - x(gain.from)} height={H} fill="#E6B85C" opacity={0.08} />}
            <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#3B4A41" strokeDasharray="4 4" />
            <text x={0} y={12} fontSize={10} fill="#93A399">ahead</text>
            <text x={0} y={H - 4} fontSize={10} fill="#93A399">behind</text>
            {series.map((s, i) => (
              <polyline
                key={rivals[i].id}
                points={s.map((p) => `${x(p.along).toFixed(1)},${y(p.gap).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={COLORS[(i + 1) % COLORS.length]}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
            <line x1={x(refAt)} y1={0} x2={x(refAt)} y2={H} stroke="#D0703F" strokeWidth={1.5} />
          </svg>
        </div>
      )}

      <div className="sticky-cta" style={{ boxShadow: "none", display: "flex", alignItems: "center", gap: 12, background: "var(--ground)", padding: "8px 0" }}>
        <button type="button" className="btn" onClick={play} aria-label={playing ? "Pause" : "Play"} style={{ width: 52, height: 52, padding: 0, borderRadius: 26, flex: "none" }}>
          {playing ? <PauseIcon /> : <PlayIcon size={18} />}
        </button>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Race position</span>
          <input type="range" min={0} max={end} step={0.1} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} style={{ width: "100%", accentColor: "#D0703F" }} />
          <span className="row-between small muted"><span>{formatTime(t)}</span><span>{formatTime(end)}</span></span>
        </label>
        <button type="button" className="pill" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label={`Playback speed ${speed}x`} style={{ flex: "none", cursor: "pointer" }}>
          {speed}×
        </button>
      </div>
    </>
  );
}

function smooth(points: { along: number; gap: number }[], radius: number) {
  return points.map((p, i) => {
    const win = points.slice(Math.max(0, i - radius), i + radius + 1);
    return { along: p.along, gap: win.reduce((a, q) => a + q.gap, 0) / win.length };
  });
}
