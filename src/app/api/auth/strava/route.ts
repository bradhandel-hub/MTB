import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { randomCode } from "@/lib/auth";
import { authorizeUrl } from "@/lib/strava";

// Step 1 of "Connect with Strava": remember the invite code, then send the rider to Strava.
export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get("invite") ?? "";
  const nonce = randomCode();
  (await cookies()).set("tc_oauth", JSON.stringify({ nonce, invite }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(nonce));
}
