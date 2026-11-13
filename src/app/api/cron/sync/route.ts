import { NextResponse, type NextRequest } from "next/server";
import { runJobs } from "@/lib/sync";

export const maxDuration = 60;

// Called every 15 minutes (see README) to work through the ride-history backfill
// within Strava's rate limits.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await runJobs({ deadlineMs: Date.now() + 50_000, max: 150 });
  return NextResponse.json(result);
}
