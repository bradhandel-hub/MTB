// Finds every time a ride completes a segment, and times it.
//
// A segment is our own official line for a trail. A ride counts when its GPS track:
//   1. passes the start (within START_GATE meters),
//   2. then stays on the line: checkpoints every CHECKPOINT_SPACING meters along the
//      segment must each be passed in order, within CORRIDOR meters,
//   3. then passes the finish.
// The clock runs from the last time the rider crosses the start line to the first
// time they cross the finish line, like timing beams at a race. Waiting for friends
// at the top isn't counted. Crossing times are interpolated between GPS samples so
// a 1 s watch and a sparse phone recording are timed fairly.

/** Bump when timing rules change; stored times are then recalculated from Strava. */
export const MATCHER_VERSION = 2;

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

/** A visit to a gate: the closest sample, plus the first and last samples inside it. */
type Gate = { index: number; dist: number; from: number; to: number };

/** Groups consecutive samples within `radius` of `target` and returns each group's closest sample. */
function gatePasses(latlng: LatLng[], target: LatLng, radius: number, from = 0): Gate[] {
  const out: Gate[] = [];
  let current: Gate | null = null;
  for (let i = from; i < latlng.length; i++) {
    const d = haversine(latlng[i], target);
    if (d <= radius) {
      if (!current) current = { index: i, dist: d, from: i, to: i };
      current.to = i;
      if (d < current.dist) {
        current.index = i;
        current.dist = d;
      }
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

type XY = [number, number];

/**
 * When the rider crossed the timing line: an imaginary line through `point`, square
 * to the trail's direction `dir` there, like the beam at a race start. Looks at the
 * GPS legs in and just around the gate visit. For the start we take the LAST forward
 * crossing (so waiting for friends at the top, or rolling back and forth, isn't
 * timed); for the finish the FIRST one. Returns null if no leg crosses the line.
 */
function lineCrossingTime(
  stream: Stream,
  gate: Gate,
  point: LatLng,
  dir: XY,
  which: "first" | "last",
  proj: (q: LatLng) => XY,
): number | null {
  const { latlng, time } = stream;
  const [ox, oy] = proj(point);
  const along = (k: number) => {
    const [x, y] = proj(latlng[k]);
    return [(x - ox) * dir[0] + (y - oy) * dir[1], (x - ox) * -dir[1] + (y - oy) * dir[0]] as const;
  };
  let found: number | null = null;
  const lo = Math.max(0, gate.from - 1);
  const hi = Math.min(latlng.length - 2, gate.to);
  for (let k = lo; k <= hi; k++) {
    const [s0, l0] = along(k);
    const [s1, l1] = along(k + 1);
    if (!(s0 < 0 && s1 >= 0)) continue;
    const f = -s0 / (s1 - s0);
    if (Math.abs(l0 + f * (l1 - l0)) > START_GATE) continue; // crossed the line, but off to the side
    const t = time[k] + f * (time[k + 1] - time[k]);
    if (which === "first") return t;
    found = t;
  }
  return found;
}

/** Unit direction of travel along the line between two distances. */
function directionAt(line: ReturnType<typeof makeLineIndex>, from: number, to: number, proj: (q: LatLng) => XY): XY {
  const [ax, ay] = proj(line.pointAt(from));
  const [bx, by] = proj(line.pointAt(to));
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / len, (by - ay) / len];
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
  const look = Math.min(20, line.length / 4);
  const startDir = directionAt(line, 0, look, proj);
  const endDir = directionAt(line, line.length - look, line.length, proj);

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
      const tStart = lineCrossingTime(stream, s, start, startDir, "last", proj) ?? crossingTime(stream, s.index, start, proj);
      const tEnd = lineCrossingTime(stream, e, end, endDir, "first", proj) ?? crossingTime(stream, e.index, end, proj);
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
