import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await signOut();
  return NextResponse.redirect(new URL("/join", process.env.APP_URL || req.nextUrl.origin), 303);
}
