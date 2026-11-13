import { after, NextResponse, type NextRequest } from "next/server";
import { run } from "@/lib/db";
import { deleteActivity, enqueue, runJobs } from "@/lib/sync";

// Strava calls GET once to verify the subscription...
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": p.get("hub.challenge") });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type Event = {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
};

// ...then POSTs an event whenever a connected rider saves, edits or deletes a ride.
export async function POST(req: NextRequest) {
  const ev = (await req.json()) as Event;
  if (String(ev.subscription_id) !== (process.env.STRAVA_SUBSCRIPTION_ID ?? String(ev.subscription_id))) {
    return new NextResponse("Unknown subscription", { status: 403 });
  }
  if (ev.object_type === "activity") {
    if (ev.aspect_type === "delete") await deleteActivity(ev.object_id);
    else await enqueue("activity", ev.owner_id, ev.object_id);
  } else if (ev.object_type === "athlete" && ev.updates?.authorized === "false") {
    // Rider disconnected Trail Club in Strava: remove everything we hold for them.
    for (const table of ["efforts", "activities", "jobs"]) await run(`DELETE FROM ${table} WHERE rider_id = ?`, [ev.owner_id]);
    await run("DELETE FROM riders WHERE id = ?", [ev.owner_id]);
  }
  // Answer Strava right away (it expects a reply within 2 s); match the ride afterwards.
  after(() => runJobs({ deadlineMs: Date.now() + 20_000, max: 10 }));
  return NextResponse.json({ ok: true });
}
