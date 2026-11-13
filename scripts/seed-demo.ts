// Fills a LOCAL database with made-up riders, segments and rides so the screens can
// be reviewed before real Strava data arrives. Rides go through the real matcher.
// Usage: DATABASE_URL=file:demo.db npm run seed:demo
import { run } from "../src/lib/db";
import { makeLineIndex, type LatLng } from "../src/lib/geo";
import { classify, insertSegment } from "../src/lib/segments";
import { saveRide } from "../src/lib/sync";

if (!(process.env.DATABASE_URL ?? "file:local.db").startsWith("file:")) {
  throw new Error("Refusing to seed demo data into a non-local database.");
}

const O: LatLng = [37.9935, -122.6125]; // above Fairfax
const m = (dx: number, dy: number): LatLng => [O[0] + dy / 111_320, O[1] + dx / 88_000];

function wiggle(points: [number, number][], step = 10): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push(m(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n));
  }
  out.push(m(...points[points.length - 1]));
  return out;
}

const DEMO = [
  { name: "Demo Switchbacks", net: -120, pts: [[0, 0], [220, -60], [40, -140], [260, -220], [80, -300], [300, -380]] },
  { name: "Demo Fire Road Climb", net: 150, pts: [[300, -380], [520, -300], [700, -120], [820, 80]] },
  { name: "Demo Ridge Flow", net: -20, pts: [[820, 80], [1000, 40], [1150, 160], [1350, 100], [1500, 220]] },
] as const;

const RIDERS = [
  { id: 1, first: "Demo", last: "You", pace: 1.0 },
  { id: 2, first: "Kyle", last: "Jamison", pace: 0.94 },
  { id: 3, first: "Ryan", last: "Milhous", pace: 0.97 },
  { id: 4, first: "Jack", last: "Hogan", pace: 0.96 },
  { id: 5, first: "Roee", last: "Gilron", pace: 1.03 },
  { id: 6, first: "Aaron", last: "V", pace: 1.08 },
];

// Deterministic randomness.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

async function main() {
  for (const t of ["efforts", "activities", "jobs", "segments", "riders", "invites"]) await run(`DELETE FROM ${t}`);

  const segs: { points: LatLng[]; net: number }[] = [];
  for (const d of DEMO) {
    const points = wiggle(d.pts.map((p) => [...p] as [number, number]));
    const distance = makeLineIndex(points).length;
    await insertSegment({ name: d.name, points, distance, gain: Math.max(0, d.net), loss: Math.max(0, -d.net), kind: classify(distance, d.net) });
    segs.push({ points, net: d.net });
  }
  const route: LatLng[] = [m(-150, 80), ...segs.flatMap((s) => s.points), m(1600, 260)];
  const routeLine = makeLineIndex(route);

  for (const r of RIDERS) {
    await run("INSERT INTO riders (id, first_name, last_name, refresh_token, access_token, token_expires_at, backfill_done) VALUES (?, ?, ?, 'demo', 'demo', 0, 1)", [r.id, r.first, r.last]);
  }

  const dates = ["2025-06-14", "2025-09-20", "2026-01-10", "2026-03-22", "2026-07-04", "2026-09-27", "2026-11-02", "2026-11-08", "2026-11-11"];
  let activityId = 1000;
  for (const r of RIDERS) {
    for (const date of dates) {
      if (rand() < 0.35) continue;
      const ebike = (r.id === 3 || r.id === 1) && rand() < 0.4;
      const form = r.pace * (0.92 + rand() * 0.16) * (ebike ? 0.93 : 1);
      // Speed varies along the route: faster downhill, slower on the climb.
      const latlng: LatLng[] = [];
      const time: number[] = [];
      let d = 0;
      let t = 0;
      while (d < routeLine.length) {
        const climbing = d > makeLineIndex(segs[0].points).length + 150 && d < makeLineIndex(segs[0].points).length + 150 + makeLineIndex(segs[1].points).length;
        const speed = (climbing ? (ebike ? 4.2 : 2.6) : 6.2) / form;
        const [lat, lng] = routeLine.pointAt(d);
        latlng.push([lat + (rand() - 0.5) * 6e-5, lng + (rand() - 0.5) * 7e-5]);
        time.push(t);
        t += 1;
        d += speed;
      }
      const hour = 7 + Math.floor(rand() * 9);
      await saveRide(
        r.id,
        {
          id: activityId++,
          name: "Demo ride",
          sport_type: ebike ? "EMountainBikeRide" : "MountainBikeRide",
          start_date_local: `${date}T${String(hour).padStart(2, "0")}:15:00Z`,
          distance: 15000 + rand() * 20000,
          moving_time: 5000 + Math.round(rand() * 4000),
          total_elevation_gain: 600 + rand() * 400,
        },
        { latlng, time },
      );
    }
  }
  await run("INSERT INTO invites (code, note, max_uses) VALUES ('demo-invite', 'Demo', 5)");
  console.log(`Seeded ${RIDERS.length} riders, ${DEMO.length} segments, ${activityId - 1000} rides.`);
}

main().then(() => process.exit(0));
