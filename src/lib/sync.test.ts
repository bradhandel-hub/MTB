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
