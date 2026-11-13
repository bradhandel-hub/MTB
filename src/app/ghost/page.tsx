import Link from "next/link";
import GhostRace, { type Racer } from "@/components/GhostRace";
import { BackIcon, ChevronIcon } from "@/components/Icons";
import { BottomNav, KindTag } from "@/components/ui";
import { requireRider } from "@/lib/auth";
import { ghostEfforts, riderName } from "@/lib/queries";
import { seasonOf, todayInMarin } from "@/lib/seasons";
import { activeSegments, getSegmentById, pointsOf } from "@/lib/segments";

export const dynamic = "force-dynamic";

export default async function Ghost({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const me = await requireRider();
  const ids = ((await searchParams).e ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5);
  const efforts = await ghostEfforts(ids);
  const segmentIds = new Set(efforts.map((e) => e.segment_id));

  // No race picked (or a mixed-up link): explain how to start one.
  if (efforts.length < 2 || segmentIds.size !== 1) {
    const segments = await activeSegments();
    return (
      <>
        <header className="page-head"><h1 className="display" style={{ fontSize: 30 }}>GHOST RACE</h1></header>
        <p className="notice">Pick a segment, tap 2–5 riders on its leaderboard, then hit Race. Their dots race down the trail together and the chart shows where time was won or lost.</p>
        <ul className="list">
          {segments.map((s) => (
            <li key={s.id}>
              <Link href={`/segments/${s.id}?range=${seasonOf(todayInMarin()).key}`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
                <span className="name">{s.name} <KindTag kind={s.kind} /></span>
              </Link>
              <ChevronIcon />
            </li>
          ))}
        </ul>
        <BottomNav active="ghost" />
      </>
    );
  }

  const seg = (await getSegmentById([...segmentIds][0]))!;
  // You first (the reference rider), then fastest to slowest.
  const ordered = [...efforts].sort((a, b) => (a.rider_id === me.id ? -1 : b.rider_id === me.id ? 1 : a.elapsed_s - b.elapsed_s));
  const racers: Racer[] = ordered.map((e) => ({
    id: e.id,
    label: e.rider_id === me.id ? "You" : riderName(e).split(" ")[0],
    ebike: e.ebike === 1,
    elapsed: e.elapsed_s,
    track: e.track,
  }));
  // Same rider twice (e.g. your analog vs e-bike run): tell them apart.
  for (const r of racers) {
    if (racers.filter((o) => o.label === r.label).length > 1) r.label += r.ebike ? " (E)" : " (analog)";
  }

  return (
    <>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", zIndex: 3, left: 16, right: 16, top: "calc(env(safe-area-inset-top) + 12px)", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/segments/${seg.id}`} className="icon-btn" aria-label="Back to leaderboard"><BackIcon /></Link>
          <div className="chip-dark">
            <div className="display" style={{ fontSize: 20, lineHeight: 1.1 }}>Ghost race · {seg.name}</div>
          </div>
        </div>
        <GhostRace segment={{ id: seg.id, name: seg.name, points: pointsOf(seg) }} racers={racers} />
      </div>
      <BottomNav active="ghost" />
    </>
  );
}
