"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, randomCode, requireRider } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { fromStrava, getSegmentById, insertSegment, parseStravaSegmentId, type SegmentKind } from "@/lib/segments";
import { STARTER_SEGMENTS } from "@/lib/starter-segments";
import { createWebhook, deleteWebhook, getSegment, getWebhook } from "@/lib/strava";
import { queueRecheckForSegment, runJobs } from "@/lib/sync";

async function requireAdmin() {
  const me = await requireRider();
  if (!isAdmin(me.id)) redirect("/");
  return me;
}

async function importOne(adminId: number, stravaId: number, nameOverride?: string) {
  const existing = await all("SELECT id FROM segments WHERE strava_segment_id = ?", [stravaId]);
  if (existing.length) return "exists" as const;
  const s = fromStrava(await getSegment(adminId, stravaId));
  const id = await insertSegment({ ...s, name: nameOverride ?? s.name, stravaId });
  await queueRecheckForSegment((await getSegmentById(id))!);
  return "added" as const;
}

export async function importStarterSegments() {
  const me = await requireAdmin();
  for (const s of STARTER_SEGMENTS) await importOne(me.id, s.stravaId, s.name);
  revalidatePath("/admin");
}

export async function importFromLink(form: FormData) {
  const me = await requireAdmin();
  const id = parseStravaSegmentId(String(form.get("link") ?? ""));
  if (!id) redirect("/admin?error=link");
  const name = String(form.get("name") ?? "").trim() || undefined;
  const result = await importOne(me.id, id, name);
  redirect(`/admin?${result === "exists" ? "error=exists" : "added=1"}`);
}

export async function updateSegment(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind")) as SegmentKind;
  if (name) await run("UPDATE segments SET name = ? WHERE id = ?", [name, id]);
  if (["descent", "climb", "mixed"].includes(kind)) {
    await run("UPDATE segments SET kind = ?, kind_overridden = 1 WHERE id = ? AND kind != ?", [kind, id, kind]);
  }
  await run("UPDATE segments SET active = ? WHERE id = ?", [form.get("active") ? 1 : 0, id]);
  revalidatePath("/admin");
}

export async function moveSegment(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const segs = await all<{ id: number }>("SELECT id FROM segments ORDER BY sort_order, id");
  const i = segs.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= segs.length) return;
  [segs[i], segs[j]] = [segs[j], segs[i]];
  for (let k = 0; k < segs.length; k++) await run("UPDATE segments SET sort_order = ? WHERE id = ?", [k + 1, segs[k].id]);
  revalidatePath("/admin");
}

export async function deleteSegment(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  await run("DELETE FROM efforts WHERE segment_id = ?", [id]);
  await run("DELETE FROM segments WHERE id = ?", [id]);
  revalidatePath("/admin");
}

export async function createInvite(form: FormData) {
  const me = await requireAdmin();
  const uses = Math.max(1, Math.min(50, Number(form.get("uses")) || 1));
  await run("INSERT INTO invites (code, note, max_uses, created_by) VALUES (?, ?, ?, ?)", [
    randomCode(6),
    String(form.get("note") ?? "").trim() || null,
    uses,
    me.id,
  ]);
  revalidatePath("/admin");
}

export async function deleteInvite(form: FormData) {
  await requireAdmin();
  await run("DELETE FROM invites WHERE code = ?", [String(form.get("code"))]);
  revalidatePath("/admin");
}

export async function syncNow() {
  await requireAdmin();
  await runJobs({ deadlineMs: Date.now() + 40_000, max: 60 });
  revalidatePath("/admin");
}

/** Points Strava's ride notifications at this deployment (replacing any old address). */
export async function connectWebhook() {
  await requireAdmin();
  try {
    const existing = await getWebhook();
    const wanted = `${process.env.APP_URL}/api/strava/webhook`;
    if (existing && existing.callback_url !== wanted) await deleteWebhook(existing.id);
    if (!existing || existing.callback_url !== wanted) await createWebhook();
  } catch (err) {
    console.error(err);
    redirect("/admin?error=webhook");
  }
  redirect("/admin?webhook=1");
}
