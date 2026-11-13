// Ghost-race math. A track is [meters along segment, seconds since start] pairs,
// with meters never decreasing.

export type Track = [number, number][];

/** Seconds it took to reach `along` meters (linear between samples). */
export function timeAt(track: Track, along: number): number {
  if (along <= track[0][0]) return track[0][1];
  const last = track[track.length - 1];
  if (along >= last[0]) return last[1];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][0] <= along) lo = mid;
    else hi = mid;
  }
  const [d0, t0] = track[lo];
  const [d1, t1] = track[hi];
  return d1 === d0 ? t0 : t0 + ((along - d0) / (d1 - d0)) * (t1 - t0);
}

/** Meters covered after `t` seconds (linear between samples). */
export function distanceAt(track: Track, t: number): number {
  if (t <= track[0][1]) return track[0][0];
  const last = track[track.length - 1];
  if (t >= last[1]) return last[0];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][1] <= t) lo = mid;
    else hi = mid;
  }
  const [d0, t0] = track[lo];
  const [d1, t1] = track[hi];
  return t1 === t0 ? d0 : d0 + ((t - t0) / (t1 - t0)) * (d1 - d0);
}

/**
 * How far ahead `rival` is of `you` at each point along the segment, in seconds.
 * Positive = rival is ahead (got there sooner).
 */
export function gapSeries(you: Track, rival: Track, length: number, step = 10): { along: number; gap: number }[] {
  const out = [];
  for (let d = 0; d <= length + 0.001; d += step) {
    const along = Math.min(d, length);
    out.push({ along, gap: timeAt(you, along) - timeAt(rival, along) });
  }
  return out;
}

/** The stretch (about `window` meters long) where the rival gains the most time on you. */
export function biggestGain(you: Track, rival: Track, length: number, window = 100) {
  const series = gapSeries(you, rival, length, 10);
  const span = Math.max(1, Math.round(window / 10));
  let best = { from: 0, to: Math.min(window, length), seconds: 0 };
  for (let i = 0; i + span < series.length; i++) {
    const gained = series[i + span].gap - series[i].gap;
    if (gained > best.seconds) best = { from: series[i].along, to: series[i + span].along, seconds: gained };
  }
  return best;
}
