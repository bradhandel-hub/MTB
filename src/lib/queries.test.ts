import { describe, expect, it } from "vitest";
import { rankBoard, type EffortRow } from "./queries";
import { classify, parseStravaSegmentId } from "./segments";

let id = 0;
const e = (rider: number, ebike: number, elapsed: number): EffortRow => ({
  id: ++id, segment_id: 1, rider_id: rider, first_name: `R${rider}`, last_name: "", avatar_url: null,
  ebike, elapsed_s: elapsed, start_local: "2026-11-08T10:00:00", activity_distance_m: 0, activity_id: id, gps_flag: null, review: null,
});

const efforts = [e(1, 0, 190), e(1, 0, 185), e(1, 1, 180), e(2, 0, 178), e(3, 1, 175), e(3, 1, 200)];

describe("rankBoard", () => {
  it("keeps each rider's best analog time", () => {
    const b = rankBoard(efforts, "analog");
    expect(b.map((r) => [r.rider_id, r.elapsed_s, r.rank, r.gap])).toEqual([[2, 178, 1, 0], [1, 185, 2, 7]]);
  });

  it("keeps each rider's best e-bike time", () => {
    expect(rankBoard(efforts, "ebike").map((r) => [r.rider_id, r.elapsed_s])).toEqual([[3, 175], [1, 180]]);
  });

  it("shows a rider once per bike type on the combined board", () => {
    const b = rankBoard(efforts, "all");
    expect(b.map((r) => [r.rider_id, r.ebike, r.elapsed_s])).toEqual([[3, 1, 175], [2, 0, 178], [1, 1, 180], [1, 0, 185]]);
  });
});

describe("segments", () => {
  it("classifies by average grade", () => {
    expect(classify(1000, -80)).toBe("descent");
    expect(classify(1000, 60)).toBe("climb");
    expect(classify(1000, -10)).toBe("mixed");
  });

  it("reads segment ids from Strava links", () => {
    expect(parseStravaSegmentId("https://www.strava.com/segments/17969543")).toBe(17969543);
    expect(parseStravaSegmentId("https://www.strava.com/segments/925819?filter=overall")).toBe(925819);
    expect(parseStravaSegmentId("39824583")).toBe(39824583);
    expect(parseStravaSegmentId("hello")).toBeNull();
  });
});
