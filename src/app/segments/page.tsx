import Link from "next/link";
import { ChevronIcon } from "@/components/Icons";
import { BikeToggle, BottomNav, KindTag, RangeTabs, parseBike, withParams } from "@/components/ui";
import { ordinal } from "@/components/FeedList";
import { requireRider } from "@/lib/auth";
import { feet, formatTime, miles } from "@/lib/format";
import { riderName, segmentSummaries } from "@/lib/queries";
import { defaultTabs, parseRange, todayInMarin } from "@/lib/seasons";

export const dynamic = "force-dynamic";

type Search = Promise<{ range?: string; bike?: string; kind?: string }>;

export default async function Segments({ searchParams }: { searchParams: Search }) {
  const me = await requireRider();
  const sp = await searchParams;
  const today = todayInMarin();
  const range = parseRange(sp.range, today);
  const bike = parseBike(sp.bike);
  const kind = ["descent", "climb", "mixed"].includes(sp.kind ?? "") ? sp.kind : undefined;
  const all = await segmentSummaries(range, bike, me.id);
  const list = kind ? all.filter((s) => s.kind === kind) : all;
  const current = { range: sp.range, bike: sp.bike, kind };

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 30 }}>SEGMENTS</h1>
        <BikeToggle bike={bike} href={(b) => withParams("/segments", current, { bike: b === "all" ? undefined : b })} />
      </header>
      <RangeTabs tabs={defaultTabs(today)} active={range.key} href={(k) => withParams("/segments", current, { range: k })} />
      <div className="pills" role="group" aria-label="Segment type" style={{ marginTop: 8 }}>
        {[undefined, "descent", "climb", "mixed"].map((k) => (
          <Link key={k ?? "any"} className="pill" href={withParams("/segments", current, { kind: k })} aria-current={kind === k ? "true" : undefined}>
            {k ? { descent: "Descents", climb: "Climbs", mixed: "Mixed" }[k] : "All types"}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="empty">No segments yet. An admin can add them from the admin page.</p>
      ) : (
        <ol className="list" style={{ marginTop: 8 }}>
          {list.map((s) => (
            <li key={s.id}>
              <span className="time muted" style={{ width: 22, fontSize: 18 }}>{all.indexOf(s) + 1}</span>
              <Link href={withParams(`/segments/${s.id}`, {}, { range: sp.range, bike: sp.bike })} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
                <span className="name">
                  <span className="ellipsis">{s.name}</span>
                  <KindTag kind={s.kind} />
                </span>
                <span className="small muted">
                  {miles(s.distance_m)} · {s.kind === "climb" ? "+" : s.kind === "descent" ? "−" : "±"}
                  {feet(s.kind === "climb" ? s.elev_gain_m : s.kind === "descent" ? s.elev_loss_m : Math.max(s.elev_gain_m, s.elev_loss_m))} · {s.riders} rider{s.riders === 1 ? "" : "s"}
                </span>
                <span className="small">
                  {s.crown ? (
                    <>
                      <span style={{ color: "var(--gold)" }}>♛ {s.crown.rider_id === me.id ? "You" : riderName(s.crown)} {formatTime(s.crown.elapsed_s)}</span>
                      {s.mine && s.mine.rank > 1 && (
                        <span className="muted"> · You {ordinal(s.mine.rank)}, {formatTime(s.mine.elapsed_s)}</span>
                      )}
                    </>
                  ) : (
                    <span className="muted">No times yet</span>
                  )}
                </span>
              </Link>
              <ChevronIcon />
            </li>
          ))}
        </ol>
      )}
      <BottomNav active="segments" />
    </>
  );
}
