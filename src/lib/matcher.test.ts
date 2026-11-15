import { describe, expect, it } from "vitest";
import { gpsCheck, matchSegment, type Stream } from "./matcher";
import { makeLineIndex, type LatLng } from "./geo";

// --- Synthetic trail near Fairfax -------------------------------------------------
const ORIGIN: LatLng = [37.9862, -122.6113];
const m = (dx: number, dy: number): LatLng => [
  ORIGIN[0] + dy / 111_320,
  ORIGIN[1] + dx / (111_320 * Math.cos((ORIGIN[0] * Math.PI) / 180)),
];

/** A ~900 m descent with four switchbacks, one point every 10 m. */
function switchbackTrail(): LatLng[] {
  const pts: LatLng[] = [];
  const legs = 5;
  const legLen = 150;
  for (let leg = 0; leg < legs; leg++) {
    for (let s = 0; s < legLen; s += 10) {
      const x = leg % 2 === 0 ? s : legLen - s;
      pts.push(m(x, -leg * 40 - (s / legLen) * 40));
    }
  }
  pts.push(m(legs % 2 === 0 ? 0 : legLen, -legs * 40));
  return pts;
}

// Deterministic noise so tests never flake.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type RideOpts = { speed?: number; sampleEvery?: number; noise?: number; seed?: number };

/**
 * Rides along `path` (a polyline) at `speed` m/s, recording a GPS sample every
 * `sampleEvery` seconds with up to `noise` meters of error. Returns the stream and
 * the true time each path vertex was reached.
 */
function ride(path: LatLng[], { speed = 5, sampleEvery = 1, noise = 4, seed = 1 }: RideOpts = {}) {
  const line = makeLineIndex(path);
  const rand = rng(seed);
  const duration = line.length / speed;
  const stream: Stream = { latlng: [], time: [] };
  for (let t = 0; t <= duration; t += sampleEvery) {
    const [lat, lng] = line.pointAt(t * speed);
    const jitter = (rand() - 0.5) * 2 * noise;
    const jitter2 = (rand() - 0.5) * 2 * noise;
    stream.latlng.push([lat + jitter / 111_320, lng + jitter2 / 88_000]);
    stream.time.push(t);
  }
  return { stream, line };
}

const trail = switchbackTrail();
const trailLength = makeLineIndex(trail).length;
const approach = [m(-200, 60), m(-100, 30), m(0, 0)];
const exit = [m(150, -260), m(150, -400)];

describe("matchSegment", () => {
  it("times a clean descent within a second", () => {
    const path = [...approach, ...trail.slice(1), ...exit];
    const { stream, line } = ride(path, { speed: 5 });
    const efforts = matchSegment(trail, stream);
    expect(efforts).toHaveLength(1);
    // True time on the trail is the trail length at 5 m/s.
    expect(efforts[0].elapsed).toBeGreaterThan(trailLength / 5 - 1);
    expect(efforts[0].elapsed).toBeLessThan(trailLength / 5 + 1);
    expect(line.length).toBeGreaterThan(trailLength);
  });

  it("handles sparse phone/Garmin recording (one point every 8 s)", () => {
    const path = [...approach, ...trail.slice(1), ...exit];
    const { stream } = ride(path, { speed: 4, sampleEvery: 8, seed: 7 });
    const efforts = matchSegment(trail, stream);
    expect(efforts).toHaveLength(1);
    expect(Math.abs(efforts[0].elapsed - trailLength / 4)).toBeLessThan(3);
  });

  it("builds a ghost track that only moves forward and ends at the finish", () => {
    const { stream } = ride([...approach, ...trail.slice(1), ...exit], { speed: 6, noise: 8, seed: 3 });
    const [effort] = matchSegment(trail, stream);
    const t = effort.track;
    for (let i = 1; i < t.length; i++) {
      expect(t[i][0]).toBeGreaterThanOrEqual(t[i - 1][0]);
      expect(t[i][1]).toBeGreaterThan(t[i - 1][1]);
    }
    expect(t[t.length - 1][0]).toBeCloseTo(trailLength, 0);
    expect(t[t.length - 1][1]).toBe(effort.elapsed);
  });

  it("rejects a ride that cuts out the switchbacks", () => {
    // Straight down the fall line from the start to the finish.
    const cut = [...approach, trail[trail.length - 1], ...exit];
    const { stream } = ride(cut, { speed: 5 });
    expect(matchSegment(trail, stream)).toHaveLength(0);
  });

  it("rejects a ride that skips one switchback", () => {
    // Leaves the trail at the end of leg 1 and rejoins at the end of leg 3.
    const skipped = [...trail.slice(0, 15), ...trail.slice(45)];
    const { stream } = ride([...approach, ...skipped.slice(1), ...exit], { speed: 5 });
    expect(matchSegment(trail, stream)).toHaveLength(0);
  });

  it("rejects riding the trail backwards", () => {
    const { stream } = ride([...exit].reverse().concat([...trail].reverse(), [...approach].reverse()), { speed: 3 });
    expect(matchSegment(trail, stream)).toHaveLength(0);
  });

  it("counts two laps as two efforts", () => {
    const climbBack = [m(0, -150), m(-100, 0), ...approach.slice(1)];
    const lap = [...trail.slice(1), ...climbBack];
    const { stream } = ride([...approach, ...lap, ...lap.slice(0, trail.length - 1), ...exit], { speed: 5 });
    expect(matchSegment(trail, stream)).toHaveLength(2);
  });

  it("ignores a ride that never goes near the trail", () => {
    const elsewhere = [m(2000, 2000), m(2500, 2500)];
    const { stream } = ride(elsewhere);
    expect(matchSegment(trail, stream)).toHaveLength(0);
  });
});

describe("timing like a race gate", () => {
  /** Joins recordings end to end, continuing the clock. */
  function join(...parts: Stream[]): Stream {
    const out: Stream = { latlng: [], time: [] };
    for (const p of parts) {
      const offset = out.time.length ? out.time[out.time.length - 1] + 1 : 0;
      out.latlng.push(...p.latlng);
      out.time.push(...p.time.map((t) => t + offset));
    }
    return out;
  }
  /** Standing still near a spot for `seconds`, with GPS wander. */
  function wait(at: LatLng, seconds: number, seed = 5): Stream {
    const rand = rng(seed);
    const s: Stream = { latlng: [], time: [] };
    for (let t = 0; t < seconds; t++) {
      s.latlng.push([at[0] + ((rand() - 0.5) * 6) / 111_320, at[1] + ((rand() - 0.5) * 6) / 88_000]);
      s.time.push(t);
    }
    return s;
  }

  const onTrail = trailLength / 5; // true time at 5 m/s

  it("doesn't count waiting for friends just before the start", () => {
    // Regrouping right at the trailhead, a step behind the start marker.
    const top = m(-1.5, 0.5);
    const stream = join(
      ride([...approach.slice(0, 2), top], { speed: 5, seed: 2 }).stream,
      wait(top, 25),
      ride([top, ...trail, ...exit], { speed: 5, noise: 3, seed: 4 }).stream,
    );
    const [e] = matchSegment(trail, stream);
    expect(Math.abs(e.elapsed - onTrail)).toBeLessThan(1.5);
  });

  it("doesn't count stopping just past the finish", () => {
    const end = trail[trail.length - 1];
    // Rolls 8 m on past the finish, then pulls over to wait.
    const past = m(150 + 7.7, -200 - 2);
    const stream = join(
      ride([...approach, ...trail.slice(1), past], { speed: 5, noise: 3, seed: 6 }).stream,
      wait(past, 30, 9),
      ride([past, ...exit], { speed: 5, seed: 8 }).stream,
    );
    const [e] = matchSegment(trail, stream);
    expect(end).toBeDefined();
    expect(Math.abs(e.elapsed - onTrail)).toBeLessThan(1.5);
  });

  it("times sparse 5-second recording within about a second", () => {
    const errors = [11, 12, 13, 14, 15].map((seed) => {
      const { stream } = ride([...approach, ...trail.slice(1), ...exit], { speed: 6, sampleEvery: 5, noise: 4, seed });
      return Math.abs(matchSegment(trail, stream)[0].elapsed - trailLength / 6);
    });
    expect(Math.max(...errors)).toBeLessThan(1.5);
  });
});

describe("passing the trailhead more than once", () => {
  it("times from the pass where the rider actually dropped in", () => {
    // Rides past the top of the trail, does a ~600 m loop on the fire road (about
    // 2 minutes), comes back to the top and drops in.
    const loop = [m(30, 20), m(150, 120), m(-50, 220), m(-150, 80), m(-100, 30)];
    const path = [...approach, m(10, -1), ...loop, ...approach.slice(1), ...trail.slice(1), ...exit];
    const { stream } = ride(path, { speed: 5, noise: 3, seed: 21 });
    const [e] = matchSegment(trail, stream);
    expect(Math.abs(e.elapsed - trailLength / 5)).toBeLessThan(1.5);
  });
});

describe("GPS glitch flags", () => {
  // Time on the trail at 5 m/s, trail starts at t = 0.
  const clean = (seed: number, noise = 4) => ride(trail, { speed: 5, noise, seed }).stream;
  const elapsed = trailLength / 5;

  it("doesn't flag normal rides, even with noisy GPS", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) expect(gpsCheck(trail, clean(seed, 8), 0, elapsed)).toBeNull();
  });

  it("flags a GPS jump ahead down the trail", () => {
    const s = clean(3);
    // From 40 s on, the GPS reads 250 m further down the trail than the rider really is.
    const line = makeLineIndex(trail);
    for (let i = 40; i < s.time.length; i++) {
      const [lat, lng] = line.pointAt(Math.min(line.length, s.time[i] * 5 + 250));
      s.latlng[i] = [lat, lng];
    }
    expect(gpsCheck(trail, s, 0, elapsed)).toMatch(/GPS (jumped|skipped)/);
  });

  it("doesn't flag a dropout under the trees (time keeps passing)", () => {
    const s = clean(4);
    s.latlng.splice(60, 30);
    s.time.splice(60, 30); // 30 s with no GPS
    expect(gpsCheck(trail, s, 0, elapsed)).toBeNull();
  });

  it("doesn't flag a ride with no GPS on the trail (privacy zone)", () => {
    expect(gpsCheck(trail, { latlng: [], time: [] }, 0, elapsed)).toBeNull();
  });

  it("doesn't flag one stray point that lands on the switchback below", () => {
    const s = clean(5);
    s.latlng[50] = m(140, -75); // on the next leg down, ~40 m away
    expect(gpsCheck(trail, s, 0, elapsed)).toBeNull();
  });

  it("flags an impossible average speed", () => {
    expect(gpsCheck(trail, clean(6), 0, trailLength / 20)).toMatch(/mph/);
  });
});
