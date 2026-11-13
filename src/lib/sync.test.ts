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
