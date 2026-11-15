"use server";

import { redirect } from "next/navigation";
import { requireRider, signOut } from "@/lib/auth";
import { run } from "@/lib/db";
import { deauthorize, RateLimitError } from "@/lib/strava";
import { processActivity } from "@/lib/sync";

/** Disconnects Strava and deletes everything Trail Club stored for this rider. */
export async function leaveTrailClub() {
  const me = await requireRider();
  await deauthorize(me.id).catch(() => undefined);
  for (const table of ["efforts", "activities", "jobs"]) await run(`DELETE FROM ${table} WHERE rider_id = ?`, [me.id]);
  await run("DELETE FROM riders WHERE id = ?", [me.id]);
  await signOut();
  redirect("/join?left=1");
}

/** Re-checks one of the rider's own rides from a Strava link (e.g. after making it public). */
export async function recheckRide(form: FormData) {
  const me = await requireRider();
  const id = await activityIdFrom(String(form.get("link") ?? ""));
  if (!id) redirect("/me?ride=bad-link#missing");
  let result: string;
  try {
    const r = await processActivity(me.id, id);
    result = r.status === "saved" ? `saved-${r.found}` : r.reason;
  } catch (err) {
    result = err instanceof RateLimitError ? "busy" : "error";
  }
  redirect(`/me?ride=${result}#missing`);
}

/**
 * Finds the ride number in a Strava link. Links copied from the Strava app are short
 * share links (strava.app.link/…) with no number in them, so those are followed to
 * see where they lead.
 */
async function activityIdFrom(input: string): Promise<number | null> {
  const text = input.trim();
  const direct = /activities\/(\d{6,})/.exec(text) ?? /^(\d{6,})$/.exec(text);
  if (direct) return Number(direct[1]);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/(^|\.)strava\.(app\.link|com)$/.test(url.hostname)) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000) });
    const found = /activities\/(\d{6,})/.exec(res.url) ?? /activities\/(\d{6,})/.exec((await res.text()).slice(0, 300_000));
    return found ? Number(found[1]) : null;
  } catch {
    return null;
  }
}
