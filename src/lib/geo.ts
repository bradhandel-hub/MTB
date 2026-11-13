// Small geometry helpers. All distances are in meters, coordinates are [lat, lng].

export type LatLng = [number, number];

const R = 6371008.8; // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two points. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Local flat projection around a reference latitude. Over a few kilometres the
 * error is far below GPS noise, and it makes point-to-line math simple.
 */
export function makeProjector(refLat: number) {
  const kx = (Math.PI / 180) * R * Math.cos(toRad(refLat));
  const ky = (Math.PI / 180) * R;
  return (p: LatLng): [number, number] => [p[1] * kx, p[0] * ky];
}

/** Cumulative distance along a polyline; result[i] = meters from start to point i. */
export function cumulativeDistance(line: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversine(line[i - 1], line[i]));
  return out;
}

export type Projection = {
  /** Distance from the point to the line (m). */
  offset: number;
  /** Distance along the line of the closest point (m). */
  along: number;
};

/**
 * Precomputes a polyline so many points can be projected onto it quickly.
 * `project(p, minAlong, maxAlong)` restricts the search to a stretch of the line,
 * which stops a point on one switchback snapping to the switchback below it.
 */
export function makeLineIndex(line: LatLng[]) {
  const proj = makeProjector(line[0][0]);
  const xy = line.map(proj);
  const cum = cumulativeDistance(line);
  const length = cum[cum.length - 1];

  function project(p: LatLng, minAlong = -Infinity, maxAlong = Infinity): Projection {
    const [px, py] = proj(p);
    let best: Projection = { offset: Infinity, along: 0 };
    for (let i = 0; i < xy.length - 1; i++) {
      if (cum[i + 1] < minAlong || cum[i] > maxAlong) continue;
      const [ax, ay] = xy[i];
      const [bx, by] = xy[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best.offset) best = { offset: d, along: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
  }

  /** The point at a given distance along the line (for drawing ghost dots). */
  function pointAt(along: number): LatLng {
    if (along <= 0) return line[0];
    if (along >= length) return line[line.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= along) lo = mid;
      else hi = mid;
    }
    const f = (along - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [
      line[lo][0] + f * (line[hi][0] - line[lo][0]),
      line[lo][1] + f * (line[hi][1] - line[lo][1]),
    ];
  }

  return { project, pointAt, length, cum };
}

export type BBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function bboxOf(points: LatLng[], padMeters = 0): BBox {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const dLat = padMeters / 111_320;
  const dLng = padMeters / (111_320 * Math.cos(toRad((minLat + maxLat) / 2)));
  return { minLat: minLat - dLat, maxLat: maxLat + dLat, minLng: minLng - dLng, maxLng: maxLng + dLng };
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
}

/** Rough Marin County bounds, used to skip rides that can't touch any segment. */
export const MARIN_BBOX: BBox = { minLat: 37.8, maxLat: 38.33, minLng: -123.05, maxLng: -122.4 };
