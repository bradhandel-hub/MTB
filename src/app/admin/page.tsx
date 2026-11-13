import Link from "next/link";
import { redirect } from "next/navigation";
import { BackIcon } from "@/components/Icons";
import InviteLink from "@/components/InviteLink";
import { KindTag } from "@/components/ui";
import { isAdmin, requireRider } from "@/lib/auth";
import { all } from "@/lib/db";
import { feet, miles } from "@/lib/format";
import { STARTER_SEGMENTS } from "@/lib/starter-segments";
import type { Segment } from "@/lib/segments";
import { getWebhook } from "@/lib/strava";
import {
  connectWebhook, createInvite, deleteInvite, deleteSegment, importFromLink, importStarterSegments, moveSegment, syncNow, updateSegment,
} from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  link: "That doesn’t look like a Strava segment link.",
  exists: "That segment is already in Trail Club.",
  webhook: "Couldn’t connect to Strava. Check STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN and APP_URL in Vercel, then redeploy.",
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; webhook?: string }> }) {
  const me = await requireRider();
  if (!isAdmin(me.id)) redirect("/");
  const sp = await searchParams;
  const [segments, invites, riders, jobs] = await Promise.all([
    all<Segment>("SELECT * FROM segments ORDER BY sort_order, id"),
    all<{ code: string; note: string | null; uses: number; max_uses: number }>("SELECT code, note, uses, max_uses FROM invites ORDER BY created_at DESC"),
    all<{ id: number; first_name: string; last_name: string; backfill_done: number; rides: number; efforts: number }>(
      `SELECT r.id, r.first_name, r.last_name, r.backfill_done,
         (SELECT COUNT(*) FROM activities a WHERE a.rider_id = r.id) AS rides,
         (SELECT COUNT(*) FROM efforts e WHERE e.rider_id = r.id) AS efforts
       FROM riders r ORDER BY r.joined_at`,
    ),
    all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM jobs GROUP BY kind"),
  ]);
  const webhook = await getWebhook().catch(() => undefined);
  const webhookOk = webhook?.callback_url === `${process.env.APP_URL}/api/strava/webhook`;
  const imported = new Set(segments.map((s) => s.strava_segment_id));
  const missingStarters = STARTER_SEGMENTS.filter((s) => !imported.has(s.stravaId));
  const appUrl = process.env.APP_URL ?? "";

  return (
    <main style={{ paddingBottom: 40 }}>
      <header className="page-head">
        <Link href="/me" className="icon-btn" aria-label="Back"><BackIcon /></Link>
        <h1 className="display" style={{ fontSize: 28, flex: 1 }}>ADMIN</h1>
      </header>
      {sp.error && <p className="notice warn">{ERRORS[sp.error] ?? "Something went wrong."}</p>}
      {sp.added && <p className="notice">Segment added. Riders’ past rides near it are being rechecked.</p>}

      <section style={{ padding: "8px 20px" }}>
        <h2 className="section-title">Strava connection</h2>
        {webhookOk ? (
          <p className="notice" style={{ margin: "10px 0 0" }}>✓ New rides sync automatically.</p>
        ) : (
          <form action={connectWebhook} className="card" style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              {webhook === undefined ? "Couldn’t check the Strava connection." : "New rides aren’t syncing yet."} Connect once after deploying.
            </p>
            <button className="btn" style={{ width: "100%" }}>Connect ride sync</button>
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
            <button className="btn" style={{ width: "100%" }}>Import {missingStarters.length} segments</button>
          </form>
        )}
        <form action={importFromLink} className="card" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field">Strava segment link
            <input name="link" placeholder="https://www.strava.com/segments/17969543" required />
          </label>
          <label className="field">Name in Trail Club (optional)
            <input name="name" placeholder="Uses the Strava name if blank" />
          </label>
          <button className="btn secondary">Add segment</button>
        </form>
      </section>

      <ul className="list">
        {segments.map((s, i) => (
          <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div className="row-between">
              <span className="name">{i + 1}. {s.name} <KindTag kind={s.kind} />{!s.active && <span className="tag">hidden</span>}</span>
              <span style={{ display: "flex", gap: 4 }}>
                <form action={moveSegment}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="icon-btn" aria-label={`Move ${s.name} up`}>↑</button></form>
                <form action={moveSegment}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="icon-btn" aria-label={`Move ${s.name} down`}>↓</button></form>
              </span>
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

      <section style={{ padding: "20px 20px 8px" }}>
        <h2 className="section-title">Riders &amp; sync</h2>
        <p className="small muted">
          Strava allows this app {riders.length}/10 connected riders right now. Waiting: {jobs.map((j) => `${j.n} ${j.kind}`).join(", ") || "nothing"}.
        </p>
        <form action={syncNow}><button className="btn secondary" style={{ width: "100%" }}>Run sync now</button></form>
      </section>
      <ul className="list">
        {riders.map((r) => (
          <li key={r.id}>
            <span className="grow">
              <span className="name">{r.first_name} {r.last_name}</span>
              <span className="small muted">{r.rides} Marin rides · {r.efforts} segment times · {r.backfill_done ? "history imported" : "importing history…"}</span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
