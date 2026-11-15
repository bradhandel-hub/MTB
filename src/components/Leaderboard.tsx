"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGap, formatTime, when } from "@/lib/format";
import { PlayIcon } from "./Icons";
import { Avatar, EBadge } from "./ui";

export type LbRow = {
  id: number;
  rank: number;
  rider_id: number;
  name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  ebike: number;
  elapsed_s: number;
  gap: number;
  start_local: string;
  /** Set when the GPS looks glitchy and no admin has cleared it. */
  gpsWarning: string | null;
};

const MAX_GHOSTS = 5;

export default function Leaderboard({ rows, meId, today, showAllHref, total }: { rows: LbRow[]; meId: number; today: string; showAllHref: string | null; total: number }) {
  // Start with you and the leader picked, so "Race" works in one tap.
  const [picked, setPicked] = useState<number[]>(() => {
    const ids = [rows.find((r) => r.rank === 1)?.id, rows.find((r) => r.rider_id === meId)?.id].filter((x): x is number => !!x);
    return [...new Set(ids)];
  });
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_GHOSTS ? p : [...p, id]));

  if (!rows.length) return <p className="empty">No times in this range yet.</p>;

  return (
    <>
      <ol className="list" style={{ paddingBottom: 80 }}>
        {rows.map((r) => {
          const me = r.rider_id === meId;
          const on = picked.includes(r.id);
          return (
            <li
              key={r.id}
              style={me ? { background: "var(--redwood-tint)", border: "1px solid var(--redwood-line)", borderRadius: 12, margin: "2px -10px", padding: "10px" } : undefined}
            >
              <span className="time" style={{ width: 24, fontSize: 18, color: r.rank === 1 ? "var(--gold)" : "var(--muted)" }}>{r.rank}</span>
              <Avatar rider={r} />
              <span className="grow">
                <span className="name">
                  <span className="ellipsis">{me ? "You" : r.name}</span>
                  {r.ebike ? <EBadge /> : null}
                </span>
                <span className="small muted">{when(r.start_local, today)}</span>
                {r.gpsWarning && (
                  <span className="small" style={{ color: "var(--gold)" }} title={r.gpsWarning}>
                    ⚠ Possible GPS glitch ({r.gpsWarning})
                  </span>
                )}
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span className="time" style={{ fontSize: 20 }}>{formatTime(r.elapsed_s)}</span>
                <span className="small muted">{formatGap(r.gap)}</span>
              </span>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-pressed={on}
                aria-label={`${on ? "Remove" : "Add"} ${me ? "your" : `${r.name}'s`} time ${on ? "from" : "to"} the ghost race`}
                style={{
                  width: 44, height: 44, marginRight: -10, border: "none", background: "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    ...(on ? { background: "var(--redwood)", color: "var(--ground)" } : { border: "1.5px solid #3b4a41" }),
                  }}
                >
                  {on ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {showAllHref && (
        <p style={{ textAlign: "center", margin: "0 0 100px" }}>
          <Link href={showAllHref} className="pill">Show all {total} times</Link>
        </p>
      )}
      <Link
        href={`/ghost?e=${picked.join(",")}`}
        className="btn sticky-cta"
        aria-disabled={picked.length < 2}
      >
        <PlayIcon /> {picked.length < 2 ? "Pick 2+ riders to race" : `Race ${picked.length} ghosts`}
      </Link>
    </>
  );
}
