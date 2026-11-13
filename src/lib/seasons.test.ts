import { describe, expect, it } from "vitest";
import { defaultTabs, inRange, parseRange, previousSeason, seasonOf } from "./seasons";

describe("seasons", () => {
  it("puts November through April in the wet season that started in the fall", () => {
    expect(seasonOf("2026-11-13").key).toBe("wet-2026");
    expect(seasonOf("2027-02-01").key).toBe("wet-2026");
    expect(seasonOf("2027-04-30T18:00:00").key).toBe("wet-2026");
    expect(seasonOf("2027-05-01").key).toBe("dry-2027");
    expect(seasonOf("2026-10-31").key).toBe("dry-2026");
  });

  it("labels seasons the way riders say them", () => {
    expect(seasonOf("2026-12-01").label).toBe("Wet ’26–27");
    expect(seasonOf("2026-07-04").label).toBe("Dry ’26");
  });

  it("steps back one season at a time", () => {
    expect(previousSeason(seasonOf("2026-11-13")).key).toBe("dry-2026");
    expect(previousSeason(seasonOf("2026-07-01")).key).toBe("wet-2025");
  });

  it("gives this season, last season, this year and all-time as tabs", () => {
    expect(defaultTabs("2026-11-13").map((t) => t.key)).toEqual(["wet-2026", "dry-2026", "year-2026", "all"]);
  });

  it("filters dates by range with an exclusive end", () => {
    const wet = parseRange("wet-2026", "2026-11-13");
    expect(inRange("2026-11-01T06:00:00", wet)).toBe(true);
    expect(inRange("2027-05-01T06:00:00", wet)).toBe(false);
    expect(inRange("1999-01-01", parseRange("all", "2026-11-13"))).toBe(true);
  });

  it("falls back to the current season for unknown keys", () => {
    expect(parseRange("nonsense", "2026-08-01").key).toBe("dry-2026");
  });
});
