import { beforeEach, describe, expect, it } from "vitest";
import { run, useDatabase } from "./db";
import { enqueue, nextJob } from "./sync";

describe("job queue fairness", () => {
  beforeEach(() => useDatabase(":memory:"));

  it("lets a new rider's import start even when another rider has a big backlog", async () => {
    // Rider 1 has 50 old rides waiting; rider 2 just joined.
    for (let id = 1; id <= 50; id++) await enqueue("activity", 1, 1000 + id);
    await enqueue("backfill", 2, 1);

    const perRider = new Map<number, number>();
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const job = (await nextJob(perRider))!;
      order.push(`${job.rider_id}:${job.kind}`);
      perRider.set(job.rider_id, (perRider.get(job.rider_id) ?? 0) + 1);
      await run("DELETE FROM jobs WHERE id = ?", [job.id]);
      // Listing rider 2's history finds two rides to import.
      if (job.kind === "backfill") {
        await enqueue("activity", 2, 5001);
        await enqueue("activity", 2, 5002);
      }
    }
    expect(order).toEqual(["1:activity", "2:backfill", "1:activity", "2:activity"]);
  });

  it("imports a rider's newest rides first", async () => {
    await enqueue("activity", 1, 100);
    await enqueue("activity", 1, 300);
    await enqueue("activity", 1, 200);
    expect((await nextJob(new Map()))!.ref).toBe(300);
  });
});

describe("history start date", () => {
  beforeEach(() => useDatabase(":memory:"));

  it("drops rides before the start date once and restarts every rider's import", async () => {
    const { applyHistoryStart } = await import("./sync");
    const { all } = await import("./db");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'A', 't'), (2, 'B', 't')");
    await run("INSERT INTO segments (id, name, kind, polyline, distance_m, min_lat, min_lng, max_lat, max_lng) VALUES (1, 'S', 'descent', '[]', 1, 0, 0, 0, 0)");
    for (const [id, date] of [[1, "2024-06-01T09:00:00"], [2, "2026-02-01T09:00:00"]] as const) {
      await run("INSERT INTO activities (id, rider_id, sport_type, is_ebike, start_local) VALUES (?, 1, 'MountainBikeRide', 0, ?)", [id, date]);
      await run("INSERT INTO efforts (segment_id, activity_id, rider_id, start_local, elapsed_s, track) VALUES (1, ?, 1, ?, 100, '[]')", [id, date]);
    }
    await enqueue("activity", 1, 999);

    await applyHistoryStart();
    expect(await all("SELECT activity_id FROM efforts")).toEqual([{ activity_id: 2 }]);
    expect(await all("SELECT kind, rider_id FROM jobs ORDER BY rider_id")).toEqual([
      { kind: "backfill", rider_id: 1 },
      { kind: "backfill", rider_id: 2 },
    ]);

    // Second run does nothing: the date hasn't changed.
    await enqueue("activity", 1, 1234);
    await applyHistoryStart();
    expect((await all("SELECT * FROM jobs")).length).toBe(3);
  });
});

describe("timing rule changes", () => {
  beforeEach(() => useDatabase(":memory:"));

  it("re-imports every ride once, then never again", async () => {
    const { applyMatcherVersion } = await import("./sync");
    const { all } = await import("./db");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'A', 't')");
    await run("INSERT INTO segments (id, name, kind, polyline, distance_m, min_lat, min_lng, max_lat, max_lng) VALUES (1, 'S', 'descent', '[]', 1, 0, 0, 0, 0)");
    await run("INSERT INTO activities (id, rider_id, sport_type, is_ebike, start_local) VALUES (7, 1, 'MountainBikeRide', 0, '2026-11-14T09:00:00')");
    await run("INSERT INTO efforts (segment_id, activity_id, rider_id, start_local, elapsed_s, track) VALUES (1, 7, 1, '2026-11-14T09:10:00', 120, '[]')");

    await applyMatcherVersion();
    // Every imported ride is re-timed and every rider's history is listed again.
    expect(await all("SELECT kind, ref FROM jobs ORDER BY kind")).toEqual([
      { kind: "activity", ref: 7 },
      { kind: "backfill", ref: 1 },
    ]);
    await run("DELETE FROM jobs");
    await applyMatcherVersion();
    expect(await all("SELECT * FROM jobs")).toEqual([]);
  });
});

describe("saving a ride", () => {
  beforeEach(() => useDatabase(":memory:"));

  const ride = { id: 42, name: "Ride", sport_type: "MountainBikeRide", start_date_local: "2026-07-11T08:00:00Z", start_date: "2026-07-11T15:00:00Z", distance: 20000, moving_time: 5000, total_elevation_gain: 600 };
  const line = [[37.99, -122.6], [37.98, -122.59]];

  async function addSegment(stravaId: number | null, hazardous = 0) {
    await run(
      `INSERT INTO segments (name, kind, strava_segment_id, polyline, distance_m, min_lat, min_lng, max_lat, max_lng, hazardous)
       VALUES ('Split Rock', 'descent', ?, ?, 1400, 37.98, -122.6, 37.99, -122.59, ?)`,
      [stravaId, JSON.stringify(line), hazardous],
    );
  }

  it("uses Strava's own time when Strava timed the segment", async () => {
    const { saveRide } = await import("./sync");
    const { all } = await import("./db");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'G', 't')");
    await addSegment(9087084);
    const saved = await saveRide(
      1,
      { ...ride, segment_efforts: [{ segment: { id: 9087084 }, elapsed_time: 729, start_date: "2026-07-11T15:20:00Z", start_date_local: "2026-07-11T08:20:00Z" }] },
      { latlng: [], time: [] }, // e.g. GPS hidden by a privacy zone
    );
    expect(saved).toEqual([{ segment: "Split Rock", elapsed: 729, source: "strava", gpsFlag: null }]);
    expect(await all("SELECT elapsed_s, start_local FROM efforts")).toEqual([{ elapsed_s: 729, start_local: "2026-07-11T08:20:00" }]);
  });

  it("trusts Strava when it says the ride didn't include the segment", async () => {
    const { saveRide } = await import("./sync");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'G', 't')");
    await addSegment(9087084);
    expect(await saveRide(1, { ...ride, segment_efforts: [] }, { latlng: [], time: [] })).toEqual([]);
  });

  it("keeps rides whose start point Strava hides (privacy zones)", async () => {
    const { isCandidateRide } = await import("./sync");
    expect(isCandidateRide({ sport_type: "MountainBikeRide", start_latlng: [] })).toBe(true);
    expect(isCandidateRide({ sport_type: "MountainBikeRide", start_latlng: null })).toBe(true);
    expect(isCandidateRide({ sport_type: "MountainBikeRide", start_latlng: [37.98, -122.59] })).toBe(true);
    expect(isCandidateRide({ sport_type: "MountainBikeRide", start_latlng: [34.05, -118.24] })).toBe(false);
    expect(isCandidateRide({ sport_type: "Run", start_latlng: [37.98, -122.59] })).toBe(false);
  });
});

describe("GPS review decisions", () => {
  beforeEach(() => useDatabase(":memory:"));

  it("removed times disappear from the boards and stay removed after a re-import", async () => {
    const { saveRide } = await import("./sync");
    const { leaderboard } = await import("./queries");
    const { ALL_TIME } = await import("./seasons");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'G', 't')");
    await run(
      `INSERT INTO segments (id, name, kind, strava_segment_id, polyline, distance_m, min_lat, min_lng, max_lat, max_lng)
       VALUES (1, 'Split Rock', 'descent', 9087084, '[[37.99,-122.6],[37.98,-122.59]]', 1400, 37.98, -122.6, 37.99, -122.59)`,
    );
    const ride = {
      id: 42, name: "Ride", sport_type: "MountainBikeRide", start_date_local: "2026-07-11T08:00:00Z", start_date: "2026-07-11T15:00:00Z",
      distance: 20000, moving_time: 5000, total_elevation_gain: 600,
      segment_efforts: [{ segment: { id: 9087084 }, elapsed_time: 400, start_date: "2026-07-11T15:20:00Z", start_date_local: "2026-07-11T08:20:00Z" }],
    };
    await saveRide(1, ride, { latlng: [], time: [] });
    expect(await leaderboard(1, ALL_TIME, "all")).toHaveLength(1);

    await run("UPDATE efforts SET review = 'removed'");
    expect(await leaderboard(1, ALL_TIME, "all")).toHaveLength(0);

    await saveRide(1, ride, { latlng: [], time: [] }); // e.g. the rider edits the ride on Strava
    expect(await leaderboard(1, ALL_TIME, "all")).toHaveLength(0);
  });
});

describe("adding a segment", () => {
  beforeEach(() => useDatabase(":memory:"));

  it("rechecks rides near it and rides whose route area isn't known", async () => {
    const { queueRecheckForSegment } = await import("./sync");
    const { all } = await import("./db");
    await run("INSERT INTO riders (id, first_name, refresh_token) VALUES (1, 'A', 't')");
    const add = (id: number, box: [number, number, number, number] | null) =>
      run(
        "INSERT INTO activities (id, rider_id, sport_type, is_ebike, start_local, min_lat, min_lng, max_lat, max_lng) VALUES (?, 1, 'MountainBikeRide', 0, '2026-10-01', ?, ?, ?, ?)",
        [id, ...(box ?? [null, null, null, null])],
      );
    await add(1, [37.97, -122.62, 38.0, -122.58]); // passes the new segment
    await add(2, [37.85, -122.55, 37.88, -122.5]); // Mill Valley, nowhere near
    await add(3, null); // saved without a route area
    const seg = { min_lat: 37.98, min_lng: -122.61, max_lat: 37.99, max_lng: -122.6 } as never;
    expect(await queueRecheckForSegment(seg)).toBe(2);
    expect((await all<{ ref: number }>("SELECT ref FROM jobs ORDER BY ref")).map((j) => j.ref)).toEqual([1, 3]);
  });
});
