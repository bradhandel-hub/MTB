// Turns Strava rides into segment efforts. Every Strava call goes through the job
// queue so the backfill of old rides never blows the API rate limit; new rides
// jump the queue.
import { all, one, run } from "./db";
import { bboxIntersects, bboxOf, MARIN_BBOX, type BBox, type LatLng } from "./geo";
import { matchSegment } from "./matcher";
import { HISTORY_START, historyStartEpoch } from "./seasons";
import { activeSegments, pointsOf, type Segment } from "./segments";
import {
  EBIKE_TYPES,
  getActivity,
  getStreams,
  hasBudget,
  listActivities,
  localTime,
  NotFoundError,
  RateLimitError,
  RIDE_TYPES,
  type StravaActivity,
} from "./strava";

type JobKind = "activity" | "backfill";
type Job = { id: number; kind: JobKind; rider_id: number; ref: number; attempts: number };

export async function enqueue(kind: JobKind, riderId: number, ref: number, delaySeconds = 0) {
  await run(
    `INSERT INTO jobs (kind, rider_id, ref, run_after) VALUES (?, ?, ?, datetime('now', ?))
     ON CONFLICT (kind, rider_id, ref) DO UPDATE SET run_after = excluded.run_after, attempts = 0`,
    [kind, riderId, ref, `+${delaySeconds} seconds`],
  );
}

function startsInMarin(a: Pick<StravaActivity, "start_latlng">) {
  const p = a.start_latlng;
  if (!p || p.length !== 2) return false;
  return bboxIntersects(bboxOf([p as LatLng]), MARIN_BBOX);
}

export function isCandidateRide(a: Pick<StravaActivity, "sport_type" | "start_latlng">) {
  return RIDE_TYPES.has(a.sport_type) && startsInMarin(a);
}

export async function deleteActivity(activityId: number) {
  await run("DELETE FROM efforts WHERE activity_id = ?", [activityId]);
  await run("DELETE FROM activities WHERE id = ?", [activityId]);
}

/**
 * Matches one ride against the segments. Exported separately from the Strava
 * fetch so the demo seed and tests can feed in tracks directly.
 */
export async function saveRide(
  riderId: number,
  a: Pick<StravaActivity, "id" | "name" | "sport_type" | "start_date_local" | "distance" | "moving_time" | "total_elevation_gain">,
  stream: { latlng: LatLng[]; time: number[] },
  segments?: Segment[],
) {
  const segs = segments ?? (await activeSegments());
  const box: BBox | null = stream.latlng.length ? bboxOf(stream.latlng, 50) : null;
  const start = localTime(a.start_date_local);
  const startMs = Date.parse(`${start}Z`);

  await run(
    `INSERT INTO activities (id, rider_id, name, sport_type, is_ebike, start_local, distance_m, moving_s, elev_gain_m,
       min_lat, min_lng, max_lat, max_lng, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, sport_type = excluded.sport_type, is_ebike = excluded.is_ebike,
       start_local = excluded.start_local, distance_m = excluded.distance_m, moving_s = excluded.moving_s,
       elev_gain_m = excluded.elev_gain_m, min_lat = excluded.min_lat, min_lng = excluded.min_lng,
       max_lat = excluded.max_lat, max_lng = excluded.max_lng, processed_at = excluded.processed_at`,
    [
      a.id, riderId, a.name, a.sport_type, EBIKE_TYPES.has(a.sport_type) ? 1 : 0, start,
      a.distance, a.moving_time, a.total_elevation_gain,
      box?.minLat ?? null, box?.minLng ?? null, box?.maxLat ?? null, box?.maxLng ?? null,
    ],
  );

  let found = 0;
  for (const seg of segs) {
    if (!box || !bboxIntersects(box, { minLat: seg.min_lat, minLng: seg.min_lng, maxLat: seg.max_lat, maxLng: seg.max_lng })) {
      continue;
    }
    await run("DELETE FROM efforts WHERE segment_id = ? AND activity_id = ?", [seg.id, a.id]);
    for (const e of matchSegment(pointsOf(seg), stream)) {
      const effortStart = new Date(startMs + e.startOffset * 1000).toISOString().slice(0, 19);
      await run(
        `INSERT OR REPLACE INTO efforts (segment_id, activity_id, rider_id, start_local, elapsed_s, track)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [seg.id, a.id, riderId, effortStart, e.elapsed, JSON.stringify(e.track)],
      );
      found++;
    }
  }
  return found;
}

async function processActivity(riderId: number, activityId: number, segments?: Segment[]) {
  let a: StravaActivity;
  try {
    a = await getActivity(riderId, activityId);
  } catch (err) {
    if (err instanceof NotFoundError) return deleteActivity(activityId); // deleted or made private
    throw err;
  }
  if (!isCandidateRide(a) || a.private || localTime(a.start_date_local) < HISTORY_START) return deleteActivity(activityId);
  const stream = await getStreams(riderId, activityId);
  await saveRide(riderId, a, stream, segments);
}

async function processBackfill(riderId: number, page: number) {
  // Only rides since HISTORY_START. (With `after`, Strava lists oldest first; the
  // queue still imports each rider's newest rides first.)
  const list = await listActivities(riderId, page, historyStartEpoch());
  for (const a of list) {
    if (!isCandidateRide(a) || a.private || localTime(a.start_date_local) < HISTORY_START) continue;
    const exists = await one("SELECT 1 FROM activities WHERE id = ?", [a.id]);
    if (!exists) await enqueue("activity", riderId, a.id);
  }
  if (list.length === 100) await enqueue("backfill", riderId, page + 1);
  else await run("UPDATE riders SET backfill_done = 1 WHERE id = ?", [riderId]);
}

/** When a segment is added, recheck stored rides that pass near it. */
export async function queueRecheckForSegment(seg: Segment) {
  const rides = await all<{ id: number; rider_id: number }>(
    `SELECT id, rider_id FROM activities
     WHERE max_lat >= ? AND min_lat <= ? AND max_lng >= ? AND min_lng <= ?`,
    [seg.min_lat, seg.max_lat, seg.min_lng, seg.max_lng],
  );
  for (const r of rides) await enqueue("activity", r.rider_id, r.id, 30);
  return rides.length;
}

/**
 * When HISTORY_START is new or has changed: drop rides from before it and restart
 * every rider's history import with the new start date. Runs once per change.
 */
export async function applyHistoryStart() {
  const current = await one<{ value: string }>("SELECT value FROM settings WHERE key = 'history_start'");
  if (current?.value === HISTORY_START) return;
  await run("DELETE FROM efforts WHERE start_local < ?", [HISTORY_START]);
  await run("DELETE FROM activities WHERE start_local < ?", [HISTORY_START]);
  await run("DELETE FROM jobs");
  await run("UPDATE riders SET backfill_done = 0");
  for (const r of await all<{ id: number }>("SELECT id FROM riders WHERE refresh_token IS NOT NULL")) {
    await enqueue("backfill", r.id, 1);
  }
  await run(
    "INSERT INTO settings (key, value) VALUES ('history_start', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [HISTORY_START],
  );
}

/**
 * Picks the next job fairly: riders take turns (whoever has had the fewest jobs this
 * run goes next), so one rider's long history never blocks a new member. Within a
 * rider, listing their history comes first (one cheap call that finds their rides),
 * then rides newest-first, so brand-new rides and recent seasons fill in soonest.
 */
export async function nextJob(perRider: Map<number, number>): Promise<Job | undefined> {
  const riders = await all<{ rider_id: number }>(
    "SELECT DISTINCT rider_id FROM jobs WHERE run_after <= datetime('now') ORDER BY rider_id",
  );
  if (!riders.length) return undefined;
  const rider = riders.reduce((a, b) => ((perRider.get(b.rider_id) ?? 0) < (perRider.get(a.rider_id) ?? 0) ? b : a));
  return one<Job>(
    `SELECT id, kind, rider_id, ref, attempts FROM jobs WHERE rider_id = ? AND run_after <= datetime('now')
     ORDER BY CASE kind WHEN 'backfill' THEN 0 ELSE 1 END, ref DESC LIMIT 1`,
    [rider.rider_id],
  );
}

/**
 * Works through due jobs until `deadlineMs`, the rate-limit budget runs low, or
 * the queue is empty. Safe to call from the cron endpoint and after webhooks.
 */
export async function runJobs({ deadlineMs = Date.now() + 50_000, max = 50 } = {}) {
  const done = { processed: 0, failed: 0, stoppedFor: "empty" as "empty" | "rate-limit" | "time" | "max" };
  await applyHistoryStart();
  const segments = await activeSegments();
  const perRider = new Map<number, number>();
  while (true) {
    if (Date.now() > deadlineMs) return { ...done, stoppedFor: "time" as const };
    if (done.processed >= max) return { ...done, stoppedFor: "max" as const };
    if (!hasBudget()) return { ...done, stoppedFor: "rate-limit" as const };
    const job = await nextJob(perRider);
    if (!job) return done;
    perRider.set(job.rider_id, (perRider.get(job.rider_id) ?? 0) + 1);
    try {
      if (job.kind === "activity") await processActivity(job.rider_id, job.ref, segments);
      else await processBackfill(job.rider_id, job.ref);
      await run("DELETE FROM jobs WHERE id = ?", [job.id]);
      done.processed++;
    } catch (err) {
      if (err instanceof RateLimitError) {
        await run("UPDATE jobs SET run_after = datetime('now', ?) WHERE id = ?", [`+${err.retryAfterSeconds} seconds`, job.id]);
        return { ...done, stoppedFor: "rate-limit" as const };
      }
      done.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempts >= 4) {
        await run("DELETE FROM jobs WHERE id = ?", [job.id]);
        console.error(`Giving up on job ${job.kind} ${job.ref}: ${msg}`);
      } else {
        await run(
          "UPDATE jobs SET attempts = attempts + 1, last_error = ?, run_after = datetime('now', ?) WHERE id = ?",
          [msg, `+${60 * 2 ** job.attempts} seconds`, job.id],
        );
      }
    }
  }
}
