import Link from "next/link";
import { redirect } from "next/navigation";
import { BackIcon } from "@/components/Icons";
import InviteLink from "@/components/InviteLink";
import SubmitButton from "@/components/SubmitButton";
import { BottomNav, KindTag } from "@/components/ui";
import { isAdmin, requireRider } from "@/lib/auth";
import { all } from "@/lib/db";
import { feet, formatTime, miles } from "@/lib/format";
import { STARTER_SEGMENTS } from "@/lib/starter-segments";
import type { Segment } from "@/lib/segments";
import { getWebhook } from "@/lib/strava";
import { flaggedEfforts, riderName } from "@/lib/queries";
import {
  checkAnyRide, connectWebhook, createInvite, reviewEffort, deleteInvite, deleteSegment, importFromLink, importStarterSegments, syncNow, updateSegment,
} from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  link: "That doesn’t look like a Strava segment link.",
  exists: "That segment is already in Trail Club.",
  webhook: "Couldn’t connect to Strava. Check STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN and APP_URL in Vercel, then redeploy.",
};

const CHECK_ERRORS: Record<string, string> = {
  "bad-link": "That doesn’t look like a Strava ride link.",
  "not-member": "Couldn’t match that ride to a Trail Club member. Is the rider signed up, and is the ride visible to Followers or Everyone?",
  "not-found": "Strava says that ride doesn’t exist or is set to “Only you”.",
  private: "That ride is set to “Only you” on Strava, so it can’t count.",
  "not-a-ride": "That activity isn’t a bike ride.",
  "too-old": "That ride is from before Nov 1, 2025.",
  "outside-marin": "That ride isn’t in Marin.",
  "not-yours": "That ride doesn’t belong to the rider it was checked for.",
  busy: "Strava’s rate limit is maxed out. Try again in 15 minutes.",
  error: "Something went wrong talking to Strava. Try again in a minute.",
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; webhook?: string; synced?: string; stopped?: string; check?: string; ride?: string }> }) {
  const me = await requireRider();
  if (!isAdmin(me.id)) redirect("/");
  const sp = await searchParams;
  const [segments, invites, riders, jobs] = await Promise.all([
    all<Segment>("SELECT * FROM segments ORDER BY name COLLATE NOCASE, id"),
    all<{ code: string; note: string | null; uses: number; max_uses: number }>("SELECT code, note, uses, max_uses FROM invites ORDER BY created_at DESC"),
    all<{ id: number; first_name: string; last_name: string; backfill_done: number; rides: number; efforts: number; waiting: number }>(
      `SELECT r.id, r.first_name, r.last_name, r.backfill_done,
         (SELECT COUNT(*) FROM activities a WHERE a.rider_id = r.id) AS rides,
         (SELECT COUNT(*) FROM efforts e WHERE e.rider_id = r.id) AS efforts,
         (SELECT COUNT(*) FROM jobs j WHERE j.rider_id = r.id) AS waiting
       FROM riders r ORDER BY r.joined_at`,
    ),
    all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM jobs GROUP BY kind"),
  ]);
  const webhook = await getWebhook().catch(() => undefined);
  const webhookOk = webhook?.callback_url === `${process.env.APP_URL}/api/strava/webhook`;
  const checked = sp.check === "ok" && sp.ride
    ? await all<{ name: string; elapsed_s: number; start_local: string; first_name: string; last_name: string }>(
        `SELECT s.name, e.elapsed_s, e.start_local, r.first_name, r.last_name FROM efforts e
         JOIN segments s ON s.id = e.segment_id JOIN riders r ON r.id = e.rider_id
         WHERE e.activity_id = ? ORDER BY e.start_local`,
        [Number(sp.ride)],
      )
    : null;
  const flagged = await flaggedEfforts();
  const waitingReview = flagged.filter((f) => !f.review);
  const imported = new Set(segments.map((s) => s.strava_segment_id));
  // Only offered on first setup, so a segment you replaced (like Solstice) never comes back.
  const missingStarters = segments.length === 0 ? STARTER_SEGMENTS.filter((s) => !imported.has(s.stravaId)) : [];
  const appUrl = process.env.APP_URL ?? "";

  return (
    <main style={{ paddingBottom: 100 }}>
      <header className="page-head">
        <Link href="/me" className="icon-btn" aria-label="Back"><BackIcon /></Link>
        <h1 className="display" style={{ fontSize: 28, flex: 1 }}>ADMIN</h1>
      </header>
      {sp.error && <p className="notice warn">{ERRORS[sp.error] ?? "Something went wrong."}</p>}
      {sp.synced !== undefined && (
        <p className="notice">
          ✓ Imported {sp.synced} ride{sp.synced === "1" ? "" : "s"}.{" "}
          {sp.stopped === "rate-limit"
            ? "Strava’s 15-minute limit reached. The background sync picks up again automatically."
            : sp.stopped === "empty"
              ? "Everything is caught up."
              : "More waiting. Tap again or let the background sync handle it."}
        </p>
      )}
      {sp.added && <p className="notice">Segment added. Riders’ past rides near it are being rechecked.</p>}

      <section id="gps" style={{ padding: "20px 20px 8px" }}>
        <h2 className="section-title">GPS flags {waitingReview.length > 0 && <span style={{ color: "var(--gold)" }}>({waitingReview.length})</span>}</h2>
        <p className="small muted" style={{ lineHeight: 1.5, margin: "6px 0 10px" }}>
          Times where the GPS seems to jump ahead, which can make a run look faster than it was. They show a ⚠ on the
          leaderboard until you decide. Open the ride on Strava to look at the map.
        </p>
        {flagged.length === 0 && <p className="small muted">Nothing flagged. 👍</p>}
      </section>
      {flagged.length > 0 && (
        <ul className="list">
          {flagged.map((f) => (
            <li key={f.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6, opacity: f.review === "removed" ? 0.6 : 1 }}>
              <div className="row-between">
                <span className="name">{riderName(f)} · {f.segment_name}</span>
                <span className="time" style={{ fontSize: 18 }}>{formatTime(f.elapsed_s)}</span>
              </div>
              <span className="small" style={{ color: "var(--gold)" }}>⚠ {f.gps_flag}</span>
              <span className="small muted">
                {f.start_local.slice(0, 10)} ·{" "}
                <a href={`https://www.strava.com/activities/${f.activity_id}`} target="_blank" rel="noreferrer">Open ride on Strava ↗</a>
                {f.review === "removed" && " · removed from the boards"}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {f.review === "removed" ? (
                  <form action={reviewEffort}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="review" value="" /><button className="pill" style={{ cursor: "pointer" }}>Restore</button></form>
                ) : (
                  <>
                    <form action={reviewEffort}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="review" value="ok" /><button className="pill" style={{ cursor: "pointer" }}>Looks fine</button></form>
                    <form action={reviewEffort}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="review" value="removed" /><button className="pill" style={{ cursor: "pointer", color: "var(--redwood-hi)" }}>Remove time</button></form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section style={{ padding: "8px 20px" }}>
        <h2 className="section-title">Strava connection</h2>
        {webhookOk ? (
          <p className="notice" style={{ margin: "10px 0 0" }}>✓ New rides sync automatically.</p>
        ) : (
          <form action={connectWebhook} className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              {webhook === undefined ? "Couldn’t check the Strava connection." : "New rides aren’t syncing yet."} Connect once after deploying.
            </p>
            <SubmitButton className="btn" pendingText="Connecting to Strava…">Connect ride sync</SubmitButton>
          </form>
        )}
      </section>

      <section style={{ padding: "8px 20px" }}>
        <h2 className="section-title">Segments ({segments.length})</h2>
        {missingStarters.length > 0 && (
          <form action={importStarterSegments} className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              Import the group’s starter segments from Strava: {missingStarters.map((s) => s.name).join(", ")}.
            </p>
            <SubmitButton className="btn" pendingText="Importing from Strava…">Import {missingStarters.length} segments</SubmitButton>
          </form>
        )}
        <form action={importFromLink} className="card" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field">Strava segment link
            <input name="link" placeholder="https://www.strava.com/segments/17969543" required />
          </label>
          <label className="field">Name in Trail Club (optional)
            <input name="name" placeholder="Uses the Strava name if blank" />
          </label>
          <SubmitButton pendingText="Adding…">Add segment</SubmitButton>
        </form>
      </section>

      <ul className="list">
        {segments.map((s, i) => (
          <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div className="row-between">
              <span className="name">{i + 1}. {s.name} <KindTag kind={s.kind} />{!s.active && <span className="tag">hidden</span>}</span>
            </div>
            <span className="small muted">
              {miles(s.distance_m)} · +{feet(s.elev_gain_m)} / −{feet(s.elev_loss_m)}
              {s.strava_segment_id && <> · <a href={`https://www.strava.com/segments/${s.strava_segment_id}`} target="_blank" rel="noreferrer">Strava {s.strava_segment_id}</a></>}
            </span>
            <form action={updateSegment} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input type="hidden" name="id" value={s.id} />
              <label className="field" style={{ flex: "1 1 140px" }}>Name<input name="name" defaultValue={s.name} /></label>
              <label className="field">Type
                <select name="kind" defaultValue={s.kind}>
                  <option value="descent">Descent</option>
                  <option value="climb">Climb</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="small" style={{ display: "flex", alignItems: "center", gap: 6, height: 44 }}>
                <input type="checkbox" name="active" defaultChecked={!!s.active} /> Shown
              </label>
              <button className="pill" style={{ cursor: "pointer" }}>Save</button>
            </form>
            <form action={deleteSegment}>
              <input type="hidden" name="id" value={s.id} />
              <button className="small" style={{ background: "none", border: "none", color: "var(--redwood-hi)", padding: 0, cursor: "pointer" }}>
                Delete segment and all its times
              </button>
            </form>
          </li>
        ))}
      </ul>

      <section style={{ padding: "20px 20px 8px" }}>
        <h2 className="section-title">Invites</h2>
        <form action={createInvite} className="card" style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 160px" }}>Who’s it for?<input name="note" placeholder="e.g. Kyle" /></label>
          <label className="field" style={{ width: 90 }}>Uses<input name="uses" type="number" min={1} max={50} defaultValue={1} /></label>
          <button className="btn" style={{ height: 44 }}>Create</button>
        </form>
      </section>
      <ul className="list">
        {invites.map((inv) => (
          <li key={inv.code} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div className="row-between">
              <span className="name">{inv.note ?? "Invite"} <span className="small muted">{inv.uses}/{inv.max_uses} used</span></span>
              <form action={deleteInvite}><input type="hidden" name="code" value={inv.code} /><button className="pill" style={{ cursor: "pointer" }}>Revoke</button></form>
            </div>
            <InviteLink url={`${appUrl}/join?invite=${inv.code}`} name={inv.note} />
          </li>
        ))}
      </ul>

      <section id="check" style={{ padding: "20px 20px 8px" }}>
        <h2 className="section-title">Check a member’s ride</h2>
        <p className="small muted" style={{ lineHeight: 1.5, margin: "6px 0 10px" }}>
          Someone says a time is wrong or a ride is missing? Paste their Strava ride link to re-import it and see what Trail Club found.
        </p>
        {checked && (
          <div className="notice" style={{ margin: "0 0 10px" }}>
            {checked.length === 0 ? (
              "✓ Ride re-imported. It doesn’t include any of our segments (according to Strava)."
            ) : (
              <>
                ✓ Re-imported {checked[0].first_name}’s ride:
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {checked.map((c, i) => (
                    <li key={i}>{c.name}: <b>{formatTime(c.elapsed_s)}</b></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {sp.check && sp.check !== "ok" && (
          <p className="notice warn" style={{ margin: "0 0 10px" }}>{CHECK_ERRORS[sp.check] ?? CHECK_ERRORS.error}</p>
        )}
        <form action={checkAnyRide} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field">Strava ride link<input name="link" inputMode="url" placeholder="https://www.strava.com/activities/…" required /></label>
          <SubmitButton pendingText="Re-importing…">Check ride</SubmitButton>
        </form>
      </section>

      <section style={{ padding: "20px 20px 8px" }}>
        <h2 className="section-title" id="sync">Riders &amp; sync</h2>
        <p className="small muted">
          Strava allows this app {riders.length}/10 connected riders right now. Waiting: {jobs.map((j) => `${j.n} ${j.kind}`).join(", ") || "nothing"}.
        </p>
        <form action={syncNow}><SubmitButton pendingText="Syncing… (up to 40 seconds)">Run sync now</SubmitButton></form>
      </section>
      <ul className="list">
        {riders.map((r) => (
          <li key={r.id}>
            <span className="grow">
              <span className="name">{r.first_name} {r.last_name}</span>
              <span className="small muted">{r.rides} Marin rides · {r.efforts} segment times · {r.waiting ? `${r.waiting} waiting to import` : r.backfill_done ? "all caught up" : "starting import…"}</span>
            </span>
          </li>
        ))}
      </ul>
      <BottomNav active="me" />
    </main>
  );
}
