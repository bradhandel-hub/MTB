// Read-side queries for the screens. The group is small (dozens of riders, ten
// segments), so we load efforts for a range and rank them in code: simpler to
// read than window-function SQL, and fast enough.
import { all } from "./db";
import { inRange, seasonOf, type DateRange } from "./seasons";
import { activeSegments, type Segment } from "./segments";

export type Bike = "analog" | "ebike" | "all";

export type EffortRow = {
  id: number;
  segment_id: number;
  rider_id: number;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  ebike: number;
  elapsed_s: number;
  start_local: string;
  activity_distance_m: number;
};

const EFFORT_SELECT = `
  SELECT e.id, e.segment_id, e.rider_id, r.first_name, r.last_name, r.avatar_url,
         COALESCE(a.ebike_override, a.is_ebike) AS ebike, e.elapsed_s, e.start_local,
         a.distance_m AS activity_distance_m
  FROM efforts e
  JOIN activities a ON a.id = e.activity_id
  JOIN riders r ON r.id = e.rider_id`;

export function riderName(r: { first_name: string; last_name: string }) {
  return r.last_name ? `${r.first_name} ${r.last_name[0]}.` : r.first_name;
}

export function initials(r: { first_name: string; last_name: string }) {
  return (r.first_name[0] ?? "") + (r.last_name[0] ?? "");
}

async function effortsIn(range: DateRange, segmentId?: number): Promise<EffortRow[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (segmentId) {
    where.push("e.segment_id = ?");
    args.push(segmentId);
  }
  if (range.from) {
    where.push("e.start_local >= ?");
    args.push(range.from);
  }
  if (range.to) {
    where.push("e.start_local < ?");
    args.push(range.to);
  }
  return all<EffortRow>(`${EFFORT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}`, args);
}

const bikeMatches = (bike: Bike, ebike: number) => bike === "all" || (bike === "ebike") === (ebike === 1);

export type BoardRow = EffortRow & { rank: number; gap: number };

/** Each rider's best time on each bike type, fastest first. With "all", a rider can appear twice. */
export function rankBoard(efforts: EffortRow[], bike: Bike): BoardRow[] {
  const best = new Map<string, EffortRow>();
  for (const e of efforts) {
    if (!bikeMatches(bike, e.ebike)) continue;
    const k = `${e.rider_id}:${e.ebike}`;
    const cur = best.get(k);
    if (!cur || e.elapsed_s < cur.elapsed_s) best.set(k, e);
  }
  const rows = [...best.values()].sort((a, b) => a.elapsed_s - b.elapsed_s || a.start_local.localeCompare(b.start_local));
  const top = rows[0]?.elapsed_s ?? 0;
  return rows.map((r, i) => ({ ...r, rank: i + 1, gap: r.elapsed_s - top }));
}

export async function leaderboard(segmentId: number, range: DateRange, bike: Bike) {
  return rankBoard(await effortsIn(range, segmentId), bike);
}

export type FeedItem = EffortRow & {
  segment_name: string;
  kind: "crown" | "pr" | "first" | "effort";
  seasonRank: number;
  boardSize: number;
};

/**
 * Recent efforts, each tagged with what it means right now: a crown (fastest this
 * season on that bike type), a PR (rider's best this season, beating an earlier
 * effort), or a first effort of the season.
 */
export async function feed(today: string, bike: Bike = "all", limit = 25): Promise<FeedItem[]> {
  const season = seasonOf(today);
  const segments = new Map((await activeSegments()).map((s) => [s.id, s]));
  const seasonEfforts = (await effortsIn(season)).filter((e) => segments.has(e.segment_id));
  const recent = [...seasonEfforts]
    .filter((e) => bikeMatches(bike, e.ebike))
    .sort((a, b) => b.start_local.localeCompare(a.start_local))
    .slice(0, limit);

  return recent.map((e) => {
    const sameBoard = seasonEfforts.filter((x) => x.segment_id === e.segment_id && x.ebike === e.ebike);
    const board = rankBoard(sameBoard, e.ebike ? "ebike" : "analog");
    const mine = sameBoard.filter((x) => x.rider_id === e.rider_id);
    const myBest = Math.min(...mine.map((x) => x.elapsed_s));
    const earlier = mine.filter((x) => x.start_local < e.start_local);
    const row = board.find((r) => r.rider_id === e.rider_id)!;
    let kind: FeedItem["kind"] = "effort";
    if (e.elapsed_s === myBest) {
      if (row.rank === 1 && board.length > 1) kind = "crown";
      else if (earlier.length === 0) kind = "first";
      else kind = "pr";
    }
    return { ...e, segment_name: segments.get(e.segment_id)!.name, kind, seasonRank: row.rank, boardSize: board.length };
  });
}

export type SegmentSummary = Segment & {
  crown: BoardRow | null;
  riders: number;
  mine: BoardRow | null;
};

/** Every segment with this season's crown and the signed-in rider's position. */
export async function segmentSummaries(range: DateRange, bike: Bike, riderId?: number): Promise<SegmentSummary[]> {
  const segments = await activeSegments();
  const efforts = await effortsIn(range);
  return segments.map((s) => {
    const board = rankBoard(
      efforts.filter((e) => e.segment_id === s.id),
      bike,
    );
    return {
      ...s,
      crown: board[0] ?? null,
      riders: new Set(board.map((r) => r.rider_id)).size,
      mine: riderId ? board.find((r) => r.rider_id === riderId) ?? null : null,
    };
  });
}

export type ProfileRow = {
  segment: Segment;
  analog: BoardRow | null;
  ebike: BoardRow | null;
  allTimeAnalog: number | null;
  allTimeEbike: number | null;
};

/** One rider's season standing and all-time bests on every segment, per bike type. */
export async function profile(riderId: number, season: DateRange): Promise<ProfileRow[]> {
  const segments = await activeSegments();
  const seasonEfforts = await effortsIn(season);
  const mineAllTime = await all<{ segment_id: number; ebike: number; best: number }>(
    `SELECT e.segment_id, COALESCE(a.ebike_override, a.is_ebike) AS ebike, MIN(e.elapsed_s) AS best
     FROM efforts e JOIN activities a ON a.id = e.activity_id WHERE e.rider_id = ? GROUP BY 1, 2`,
    [riderId],
  );
  return segments.map((segment) => {
    const onSeg = seasonEfforts.filter((e) => e.segment_id === segment.id);
    const at = (eb: number) => mineAllTime.find((m) => m.segment_id === segment.id && m.ebike === eb)?.best ?? null;
    return {
      segment,
      analog: rankBoard(onSeg, "analog").find((r) => r.rider_id === riderId) ?? null,
      ebike: rankBoard(onSeg, "ebike").find((r) => r.rider_id === riderId) ?? null,
      allTimeAnalog: at(0),
      allTimeEbike: at(1),
    };
  });
}

export type GhostEffort = EffortRow & { track: [number, number][] };

export async function ghostEfforts(ids: number[]): Promise<GhostEffort[]> {
  if (!ids.length) return [];
  const rows = await all<EffortRow & { track: string }>(
    `${EFFORT_SELECT.replace("e.start_local,", "e.start_local, e.track,")} WHERE e.id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return rows.map((r) => ({ ...r, track: JSON.parse(r.track) }));
}

export { inRange };
