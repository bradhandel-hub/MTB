"use server";

import { redirect } from "next/navigation";
import { requireRider, signOut } from "@/lib/auth";
import { run } from "@/lib/db";
import { deauthorize } from "@/lib/strava";

/** Disconnects Strava and deletes everything Trail Club stored for this rider. */
export async function leaveTrailClub() {
  const me = await requireRider();
  await deauthorize(me.id).catch(() => undefined);
  for (const table of ["efforts", "activities", "jobs"]) await run(`DELETE FROM ${table} WHERE rider_id = ?`, [me.id]);
  await run("DELETE FROM riders WHERE id = ?", [me.id]);
  await signOut();
  redirect("/join?left=1");
}
