import Link from "next/link";
import { notFound } from "next/navigation";
import Leaderboard from "@/components/Leaderboard";
import TrailMap from "@/components/TrailMap";
import { BackIcon } from "@/components/Icons";
import { BikeToggle, BottomNav, KindTag, RangeTabs, parseBike, withParams } from "@/components/ui";
import { requireRider } from "@/lib/auth";
import { feet, miles } from "@/lib/format";
import { leaderboard, riderName } from "@/lib/queries";
import { defaultTabs, parseRange, todayInMarin } from "@/lib/seasons";
import { getSegmentById, pointsOf } from "@/lib/segments";

export const dynamic = "force-dynamic";

const TOP = 10;

export default async function SegmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; bike?: string; everyone?: string }> }) {
  const me = await requireRider();
  const { id } = await params;
  const sp = await searchParams;
  const seg = await getSegmentById(Number(id));
  if (!seg) notFound();
  const today = todayInMarin();
  const range = parseRange(sp.range, today);
  const bike = parseBike(sp.bike);
  const board = await leaderboard(seg.id, range, bike);
  const everyone = sp.everyone === "1";
  // Top 10 by default, plus your row if you're further down.
  const shown = everyone ? board : board.filter((r) => r.rank <= TOP || r.rider_id === me.id);
  const path = `/segments/${seg.id}`;
  const current = { range: sp.range, bike: sp.bike, everyone: sp.everyone };
  const elev = seg.kind === "climb" ? `+${feet(seg.elev_gain_m)}` : seg.kind === "descent" ? `−${feet(seg.elev_loss_m)}` : `+${feet(seg.elev_gain_m)} / −${feet(seg.elev_loss_m)}`;

  return (
    <>
      <div className="map-header">
        <TrailMap className="map-fill" segments={[{ id: seg.id, name: seg.name, number: 1, points: pointsOf(seg) }]} highlightId={seg.id} padding={{ top: 70, bottom: 30, left: 40, right: 40 }} />
        <Link href="/segments" className="icon-btn back" aria-label="Back to segments"><BackIcon /></Link>
      </div>
      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KindTag kind={seg.kind} />
          <span className="small muted">{miles(seg.distance_m)} · {elev}</span>
        </div>
        <h1 className="display" style={{ fontSize: 36, lineHeight: 1 }}>{seg.name}</h1>
      </div>
      <div style={{ marginTop: 14 }}>
        <RangeTabs tabs={defaultTabs(today)} active={range.key} href={(k) => withParams(path, current, { range: k })} />
      </div>
      <div className="row-between" style={{ padding: "12px 20px 4px" }}>
        <BikeToggle bike={bike} href={(b) => withParams(path, current, { bike: b === "all" ? undefined : b })} />
        <span className="small muted">Tap riders to race</span>
      </div>
      <Leaderboard
        key={`${range.key}-${bike}`}
        rows={shown.map((r) => ({
          id: r.id, rank: r.rank, rider_id: r.rider_id, name: riderName(r), first_name: r.first_name, last_name: r.last_name,
          avatar_url: r.avatar_url, ebike: r.ebike, elapsed_s: r.elapsed_s, gap: r.gap, start_local: r.start_local,
        }))}
        meId={me.id}
        today={today}
        total={board.length}
        showAllHref={!everyone && board.length > shown.length ? withParams(path, current, { everyone: "1" }) : null}
      />
      <BottomNav active="segments" />
    </>
  );
}
