import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/lib/auth";

// Local development only: sign in as a demo rider without Strava.
// Disabled unless DEV_LOGIN=1 and never in production builds.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  await signIn(Number(req.nextUrl.searchParams.get("as") ?? 1));
  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}
