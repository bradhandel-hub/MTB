import { describe, expect, it } from "vitest";
import { biggestGain, distanceAt, gapSeries, timeAt, type Track } from "./ghost";

// 300 m segment. "You" ride a steady 5 m/s. The rival matches you except for a
// rock garden between 100 and 200 m, which they ride twice as fast.
const you: Track = [[0, 0], [100, 20], [200, 40], [300, 60]];
const rival: Track = [[0, 0], [100, 20], [200, 30], [300, 50]];

describe("ghost race", () => {
  it("interpolates time and distance", () => {
    expect(timeAt(you, 150)).toBe(30);
    expect(distanceAt(rival, 25)).toBe(150);
    expect(timeAt(you, 999)).toBe(60);
  });

  it("shows the gap growing only where the rival is faster", () => {
    const s = gapSeries(you, rival, 300, 50);
    expect(s.map((p) => p.gap)).toEqual([0, 0, 0, 5, 10, 10, 10]);
  });

  it("finds where the time was won", () => {
    const g = biggestGain(you, rival, 300, 100);
    expect(g.from).toBe(100);
    expect(g.to).toBe(200);
    expect(g.seconds).toBeCloseTo(10);
  });
});
