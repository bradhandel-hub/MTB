import Link from "next/link";
import { formatTime, when } from "@/lib/format";
import { riderName, type FeedItem } from "@/lib/queries";
import { CrownIcon, DotIcon, TrendIcon } from "./Icons";
import { EBadge } from "./ui";

const describe = (f: FeedItem) => {
  const pos = `${ordinal(f.seasonRank)} this season`;
  if (f.kind === "crown") return "New season crown";
  if (f.kind === "pr") return `PR · ${pos}`;
  if (f.kind === "first") return `First run this season · ${pos}`;
  return pos;
};

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function FeedList({ items, today, now, meId }: { items: FeedItem[]; today: string; now: string; meId: number }) {
  if (!items.length) {
    return <p className="empty">No segment times yet this season. Go ride — results show up here a few minutes after your ride syncs to Strava.</p>;
  }
  return (
    <ul className="list">
      {items.map((f) => (
        <li key={f.id}>
          {f.kind === "crown" ? <CrownIcon /> : f.kind === "pr" || f.kind === "first" ? <TrendIcon /> : <DotIcon />}
          <Link href={`/segments/${f.segment_id}?bike=${f.ebike ? "ebike" : "analog"}`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="name">
              <span className="ellipsis">
                {f.rider_id === meId ? "You" : riderName(f)} · {f.segment_name}
              </span>
              {f.ebike ? <EBadge /> : null}
            </span>
            <span className="small muted">
              {describe(f)} · {when(f.start_local, today, now)}
            </span>
          </Link>
          <span className="time" style={{ fontSize: 22 }}>{formatTime(f.elapsed_s)}</span>
        </li>
      ))}
    </ul>
  );
}
