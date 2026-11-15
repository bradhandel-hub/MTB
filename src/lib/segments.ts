import polyline from "@mapbox/polyline";
import { all, one, run } from "./db";
import { bboxOf, cumulativeDistance, type LatLng } from "./geo";
import type { StravaSegment } from "./strava";

export type SegmentKind = "descent" | "climb" | "mixed";

export type Segment = {
  id: number;
  name: string;
  kind: SegmentKind;
  kind_overridden: number;
  strava_segment_id: number | null;
  polyline: string;
  distance_m: number;
  elev_gain_m: number;
  elev_loss_m: number;
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
  sort_order: number;
  active: number;
  hazardous: number;
};

/**
 * Climb if it averages 3% up or more, descent if 3% down or more, otherwise mixed.
 * Net change only: a trail that drops 100 m and climbs 100 m is mixed.
 */
export function classify(distanceM: number, netElevationM: number): SegmentKind {
  const grade = distanceM > 0 ? (netElevationM / distanceM) * 100 : 0;
  if (grade >= 3) return "climb";
  if (grade <= -3) return "descent";
  return "mixed";
}

export const pointsOf = (s: Pick<Segment, "polyline">): LatLng[] => JSON.parse(s.polyline);

export function fromStrava(s: StravaSegment) {
  const points = polyline.decode(s.map.polyline) as LatLng[];
  const distance = s.distance || cumulativeDistance(points).at(-1)!;
  // Strava gives elevation_high/low and gain; net change sign comes from the grade.
  const net = (s.average_grade / 100) * distance;
  const gain = s.total_elevation_gain ?? Math.max(0, net);
  const loss = Math.max(0, gain - net);
  return { name: s.name, points, distance, gain, loss, kind: classify(distance, net), hazardous: !!s.hazardous };
}

export async function insertSegment(input: {
  name: string;
  points: LatLng[];
  distance: number;
  gain: number;
  loss: number;
  kind: SegmentKind;
  stravaId?: number | null;
  hazardous?: boolean;
}) {
  const b = bboxOf(input.points);
  const order = (await one<{ n: number }>("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM segments"))!.n;
  const r = await run(
    `INSERT INTO segments (name, kind, strava_segment_id, polyline, distance_m, elev_gain_m, elev_loss_m,
       min_lat, min_lng, max_lat, max_lng, sort_order, hazardous)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      input.name,
      input.kind,
      input.stravaId ?? null,
      JSON.stringify(input.points.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)])),
      input.distance,
      input.gain,
      input.loss,
      b.minLat,
      b.minLng,
      b.maxLat,
      b.maxLng,
      order,
      input.hazardous ? 1 : 0,
    ],
  );
  return Number(r.rows[0].id);
}

export const activeSegments = () =>
  all<Segment>("SELECT * FROM segments WHERE active = 1 ORDER BY name COLLATE NOCASE, id");

export const getSegmentById = (id: number) => one<Segment>("SELECT * FROM segments WHERE id = ?", [id]);

/** Pulls the numeric id out of a Strava segment link or a bare number. */
export function parseStravaSegmentId(input: string): number | null {
  const m = /(?:segments\/)?(\d{3,})/.exec(input.trim());
  return m ? Number(m[1]) : null;
}
