// Finds every time a ride completes a segment, and times it.
//
// A segment is our own official line for a trail. A ride counts when its GPS track:
//   1. passes the start (within START_GATE meters),
//   2. then stays on the line: checkpoints every CHECKPOINT_SPACING meters along the
//      segment must each be passed in order, within CORRIDOR meters,
//   3. then passes the finish.
// Times are interpolated between GPS samples so a 1 s watch and a sparse phone
// recording are timed fairly.

import { haversine, makeLineIndex, makeProjector, type LatLng } from "./geo";

export const START_GATE = 30;
export const CORRIDOR = 40;
export const CHECKPOINT_SPACING = 25;
/** Share of checkpoints that may be missed (GPS dropouts under trees). */
export const MAX_MISSED_SHARE = 0.1;
/** Longest stretch of consecutive missed checkpoints allowed (stops shortcuts). */
export const MAX_MISSED_RUN_METERS = 120;

export type Stream = {
  latlng: LatLng[];
  /** Seconds since the ride started, same length as latlng. */
  time: number[];
};

export type MatchedEffort = {
  startIndex: number;
  endIndex: number;
  /** Seconds since ride start when the rider crossed the start gate. */
  startOffset: number;
  /** Segment time in seconds (one decimal). */
  elapsed: number;
  /** [meters along the segment, seconds since crossing the start], for ghost races. */
  track: [number, number][];
};

type Gate = { index: number; dist: number };

/** Groups consecutive samples within `radius` of `target` and returns each group's closest sample. */
function gatePasses(latlng: LatLng[], target: LatLng, radius: number, from = 0): Gate[] {
  const out: Gate[] = [];
  let current: Gate | null = null;
  for (let i = from; i < latlng.length; i++) {
    const d = haversine(latlng[i], target);
    if (d <= radius) {
      if (!current || d < current.dist) current = { index: i, dist: d };
    } else if (current) {
      out.push(current);
      current = null;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Distance from point p to the GPS leg a→b, in a local flat projection. */
function distToLeg(p: LatLng, a: LatLng, b: LatLng, proj: (q: LatLng) => [number, number]) {
  const [px, py] = proj(p);
  const [ax, ay] = proj(a);
  const [bx, by] = proj(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/**
 * Time at which the rider was closest to `target`, interpolated on the GPS legs
 * either side of sample i.
 */
function crossingTime(stream: Stream, i: number, target: LatLng, proj: (q: LatLng) => [number, number]) {
  const { latlng, time } = stream;
  let bestD = haversine(latlng[i], target);
  let bestT = time[i];
  for (const [a, b] of [[i - 1, i], [i, i + 1]] as const) {
    if (a < 0 || b >= latlng.length) continue;
    const { d, t } = distToLeg(target, latlng[a], latlng[b], proj);
    if (d < bestD) {
      bestD = d;
      bestT = time[a] + t * (time[b] - time[a]);
    }
  }
  return bestT;
}

function checkpoints(segment: LatLng[], spacing: number): LatLng[] {
  const index = makeLineIndex(segment);
  const n = Math.max(2, Math.round(index.length / spacing));
  const out: LatLng[] = [];
  for (let k = 1; k < n; k++) out.push(index.pointAt((k / n) * index.length));
  return out;
}

/** True when the GPS samples s..e follow the segment closely enough. */
function followsLine(stream: Stream, s: number, e: number, cps: LatLng[], spacing: number, proj: (q: LatLng) => [number, number]) {
  const { latlng } = stream;
  let missed = 0;
  let missedRun = 0;
  let k = s; // GPS leg cursor, only moves forward so checkpoints must be passed in order
  for (const cp of cps) {
    let hit = -1;
    // Look ahead from the cursor for a leg that passes this checkpoint.
    for (let j = k; j < e; j++) {
      if (distToLeg(cp, latlng[j], latlng[j + 1], proj).d <= CORRIDOR) {
        hit = j;
        break;
      }
    }
    if (hit === -1) {
      missed++;
      missedRun++;
      if (missedRun * spacing > MAX_MISSED_RUN_METERS) return false;
    } else {
      missedRun = 0;
      k = hit;
    }
  }
  return missed <= Math.floor(cps.length * MAX_MISSED_SHARE);
}

/** Progress along the segment for each GPS sample, forced to only move forward. */
function buildTrack(stream: Stream, s: number, e: number, t0: number, elapsed: number, line: ReturnType<typeof makeLineIndex>) {
  const track: [number, number][] = [[0, 0]];
  let prev = 0;
  for (let i = s + 1; i < e; i++) {
    const t = stream.time[i] - t0;
    if (t <= 0 || t >= elapsed) continue;
    const { along } = line.project(stream.latlng[i], prev - 30, prev + 250);
    prev = Math.max(prev, Math.min(along, line.length));
    track.push([Math.round(prev * 10) / 10, Math.round(t * 10) / 10]);
  }
  track.push([Math.round(line.length * 10) / 10, elapsed]);
  return track;
}

export function matchSegment(segment: LatLng[], stream: Stream): MatchedEffort[] {
  if (segment.length < 2 || stream.latlng.length < 2) return [];
  const proj = makeProjector(segment[0][0]);
  const line = makeLineIndex(segment);
  const start = segment[0];
  const end = segment[segment.length - 1];
  const cps = checkpoints(segment, CHECKPOINT_SPACING);

  // Distance travelled on the ride up to each sample, to reject wildly long detours.
  const rideCum = [0];
  for (let i = 1; i < stream.latlng.length; i++) rideCum.push(rideCum[i - 1] + haversine(stream.latlng[i - 1], stream.latlng[i]));

  const efforts: MatchedEffort[] = [];
  let searchFrom = 0;
  for (const s of gatePasses(stream.latlng, start, START_GATE)) {
    if (s.index < searchFrom) continue;
    // The finish must come after real progress (handles loops where start = finish).
    const ends = gatePasses(stream.latlng, end, START_GATE, s.index + 1).filter((g) => {
      const travelled = rideCum[g.index] - rideCum[s.index];
      return travelled >= line.length * 0.7 && travelled <= line.length * 2 + 500;
    });
    for (const e of ends) {
      if (!followsLine(stream, s.index, e.index, cps, CHECKPOINT_SPACING, proj)) continue;
      const tStart = crossingTime(stream, s.index, start, proj);
      const tEnd = crossingTime(stream, e.index, end, proj);
      const elapsed = Math.round((tEnd - tStart) * 10) / 10;
      if (elapsed <= 0) continue;
      efforts.push({
        startIndex: s.index,
        endIndex: e.index,
        startOffset: Math.round(tStart * 10) / 10,
        elapsed,
        track: buildTrack(stream, s.index, e.index, tStart, elapsed, line),
      });
      searchFrom = e.index;
      break;
    }
  }
  return efforts;
}
