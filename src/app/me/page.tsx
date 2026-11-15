import Link from "next/link";
import { BottomNav, EBadge, KindTag } from "@/components/ui";
import { ordinal } from "@/components/FeedList";
import { isAdmin, requireRider } from "@/lib/auth";
import { formatGap, formatTime } from "@/lib/format";
import { profile } from "@/lib/queries";
import { seasonOf, todayInMarin } from "@/lib/seasons";
import SubmitButton from "@/components/SubmitButton";
import { leaveTrailClub, recheckRide } from "./actions";

export const dynamic = "force-dynamic";

const RIDE_MESSAGES: Record<string, string> = {
  "bad-link": "That doesn’t look like a Strava ride link. Open the ride in Strava, tap Share → Copy link.",
  "not-found": "Strava says that ride doesn’t exist or is set to “Only you”. Make it visible to Followers or Everyone, then try again.",
  "not-yours": "That ride belongs to someone else. Each rider adds their own rides.",
  private: "That ride is set to “Only you” on Strava. Change it to Followers or Everyone, then try again.",
  "not-a-ride": "That activity isn’t a bike ride, so it can’t count.",
  "too-old": "Trail Club only counts rides since Nov 1, 2025.",
  "outside-marin": "That ride didn’t start in Marin, so it can’t touch our segments.",
  busy: "Strava’s rate limit is maxed out right now. Try again in 15 minutes.",
  error: "Something went wrong talking to Strava. Try again in a minute.",
};

export default async function Me({ searchParams }: { searchParams: Promise<{ ride?: string }> }) {
  const { ride } = await searchParams;
  const saved = ride?.startsWith("saved-") ? Number(ride.slice(6)) : null;
  const me = await requireRider();
  const season = seasonOf(todayInMarin());
  const rows = await profile(me.id, season);
  const crowns = rows.filter((r) => r.analog?.rank === 1 || r.ebike?.rank === 1).length;
  const podiums = rows.filter((r) => (r.analog && r.analog.rank <= 3) || (r.ebike && r.ebike.rank <= 3)).length;
  const ridden = rows.filter((r) => r.analog || r.ebike).length;
  const both = rows.filter((r) => r.allTimeAnalog != null && r.allTimeEbike != null);

  return (
    <>
      <header className="page-head">
        <h1 className="display" style={{ fontSize: 30 }}>{me.first_name.toUpperCase()}</h1>
        <span className="pill">{season.label}</span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: "8px 20px 0" }}>
        {[
          { n: crowns, label: "Crowns", color: "var(--gold)" },
          { n: podiums, label: "Top 3s" },
          { n: `${ridden}/${rows.length}`, label: "Segments ridden" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: 12 }}>
            <div className="time" style={{ fontSize: 30, lineHeight: 1, color: s.color }}>{s.n}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className="section-title" style={{ padding: "24px 20px 4px" }}>This season</h2>
      <ul className="list">
        {rows.map(({ segment, analog, ebike }) => (
          <li key={segment.id}>
            <Link href={`/segments/${segment.id}?bike=all`} className="grow" style={{ color: "inherit", textDecoration: "none" }}>
              <span className="name"><span className="ellipsis">{segment.name}</span> <KindTag kind={segment.kind} /></span>
              <span className="small muted">
                {!analog && !ebike && "Not ridden yet this season"}
                {analog && `Analog ${formatTime(analog.elapsed_s)} (${ordinal(analog.rank)})`}
                {analog && ebike && "  ·  "}
                {ebike && `E-bike ${formatTime(ebike.elapsed_s)} (${ordinal(ebike.rank)})`}
              </span>
            </Link>
            {(analog?.rank === 1 || ebike?.rank === 1) && <span style={{ color: "var(--gold)" }} aria-label="Crown">♛</span>}
          </li>
        ))}
      </ul>

      <h2 className="section-title" style={{ padding: "24px 20px 4px" }}>You vs. you</h2>
      {both.length === 0 ? (
        <p className="empty" style={{ textAlign: "left" }}>Ride a segment on both your analog and e-bike to see how they compare.</p>
      ) : (
        <ul className="list">
          {both.map((r) => {
            const diff = r.allTimeEbike! - r.allTimeAnalog!;
            return (
              <li key={r.segment.id}>
                <span className="grow">
                  <span className="name">{r.segment.name}</span>
                  <span className="small muted">
                    Analog {formatTime(r.allTimeAnalog!)} · <EBadge /> {formatTime(r.allTimeEbike!)}
                  </span>
                </span>
                <span className="time" style={{ fontSize: 18, color: diff < 0 ? "var(--ebike)" : "var(--fog)" }}>
                  {diff < 0 ? "E" : "Analog"} {formatGap(Math.abs(diff)).replace("+", "−")}
                </span>
                {r.analog && r.ebike && (
                  <Link href={`/ghost?e=${r.analog.id},${r.ebike.id}`} className="pill">Race</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section id="missing" style={{ padding: "24px 20px 0" }}>
        <h2 className="section-title">Missing a ride?</h2>
        <p className="small muted" style={{ lineHeight: 1.5, margin: "6px 0 10px" }}>
          Made a ride public or fixed its bike type on Strava? Paste the ride link and it’s re-checked right away.
        </p>
        {saved !== null && (
          <p className="notice" style={{ margin: "0 0 10px" }}>
            {saved > 0 ? `✓ Ride checked. Found ${saved} segment time${saved === 1 ? "" : "s"}.` : "✓ Ride checked, but it doesn’t include any of our segments."}
          </p>
        )}
        {ride && saved === null && <p className="notice warn" style={{ margin: "0 0 10px" }}>{RIDE_MESSAGES[ride] ?? RIDE_MESSAGES.error}</p>}
        <form action={recheckRide} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field">
            Strava ride link
            <input name="link" inputMode="url" placeholder="https://www.strava.com/activities/…" required />
          </label>
          <SubmitButton pendingText="Checking with Strava…">Check this ride</SubmitButton>
        </form>
      </section>

      <div style={{ padding: "28px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {isAdmin(me.id) && <Link href="/admin" className="btn secondary">Admin</Link>}
        <form action="/api/auth/logout" method="post">
          <button className="btn secondary" style={{ width: "100%" }}>Sign out</button>
        </form>
        <form action={leaveTrailClub}>
          <button className="btn secondary" style={{ width: "100%", color: "var(--redwood-hi)" }}>Leave Trail Club and delete my data</button>
        </form>
        <p className="small muted" style={{ lineHeight: 1.5 }}>
          Trail Club keeps only your segment times and a one-line summary of each Marin ride (distance, time, climbing). GPS tracks are not stored.
        </p>
      </div>
      <BottomNav active="me" />
    </>
  );
}
