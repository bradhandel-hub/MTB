import Link from "next/link";
import FeedList from "@/components/FeedList";
import HomeMap from "@/components/HomeMap";
import { ChevronIcon } from "@/components/Icons";
import { BikeToggle, BottomNav, parseBike, withParams } from "@/components/ui";
import { requireRider } from "@/lib/auth";
import { formatTime } from "@/lib/format";
import { nowInMarin } from "@/lib/format";
import { feed, riderName, segmentSummaries } from "@/lib/queries";
import { seasonOf, todayInMarin } from "@/lib/seasons";
import { pointsOf } from "@/lib/segments";

export const dynamic = "force-dynamic";

type Search = Promise<{ seg?: string; bike?: string; welcome?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const me = await requireRider();
  const sp = await searchParams;
  const bike = parseBike(sp.bike);
  const today = todayInMarin();
  const season = seasonOf(today);
  const [segments, items] = await Promise.all([segmentSummaries(season, bike === "all" ? "analog" : bike, me.id), feed(today, bike)]);
  const mapSegments = segments.map((s, i) => ({ id: s.id, name: s.name, number: i + 1, points: pointsOf(s) }));
  const selected = segments.find((s) => String(s.id) === sp.seg) ?? null;
  const selectedIndex = selected ? segments.indexOf(selected) + 1 : 0;

  return (
    <>
      <div className="home-map">
        <HomeMap segments={mapSegments} selected={selected?.id ?? null} bike={bike} />
      </div>
      <header className="home-head page-head">
        <span className="wordmark chip-dark">TRAIL CLUB</span>
        <Link href="/segments" className="pill">{season.label}</Link>
      </header>

      {selected && (
        <Link href={`/segments/${selected.id}`} className="seg-callout">
          <span className="grow">
            <span className="small" style={{ color: "var(--redwood-hi)", fontWeight: 600, letterSpacing: "0.06em" }}>
              SEGMENT {selectedIndex}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</span>
            <span className="small muted">
              {selected.crown ? `Crown: ${selected.crown.rider_id === me.id ? "You" : riderName(selected.crown)} · ${formatTime(selected.crown.elapsed_s)}` : "No times yet this season"}
            </span>
          </span>
          <ChevronIcon />
        </Link>
      )}

      <section className="sheet" aria-label="Latest results">
        <div className="sheet-handle" />
        {sp.welcome && (
          <p className="notice">
            Welcome to Trail Club, {me.first_name}! We’re pulling in your past rides from Strava. Your times will fill in over the next day or so.
          </p>
        )}
        {!sp.welcome && !me.backfill_done && (
          <p className="notice">Still importing your older rides from Strava. Leaderboards will keep filling in.</p>
        )}
        <div className="row-between" style={{ padding: "14px 20px 4px" }}>
          <h2 className="section-title" style={{ fontSize: 22 }}>Latest</h2>
          <BikeToggle bike={bike} href={(b) => withParams("/", { seg: sp.seg }, { bike: b === "all" ? undefined : b })} />
        </div>
        <FeedList items={items} today={today} now={nowInMarin()} meId={me.id} />
      </section>
      <BottomNav active="map" />
    </>
  );
}
