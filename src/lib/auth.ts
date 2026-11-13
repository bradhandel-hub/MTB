import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "./db";

const COOKIE = "tc_session";
const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
};

export async function signIn(riderId: number) {
  const token = await new SignJWT({ sub: String(riderId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}

export type Rider = { id: number; first_name: string; last_name: string; avatar_url: string | null; backfill_done: number };

/** The signed-in rider, or null. */
export async function currentRider(): Promise<Rider | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const r = await one<Rider>(
      "SELECT id, first_name, last_name, avatar_url, backfill_done FROM riders WHERE id = ? AND refresh_token IS NOT NULL",
      [Number(payload.sub)],
    );
    return r ?? null;
  } catch {
    return null;
  }
}

export function isAdmin(riderId: number): boolean {
  return (process.env.ADMIN_STRAVA_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(String(riderId));
}

/** Short random code for invites and OAuth state. */
export function randomCode(bytes = 9): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(b).toString("base64url");
}

/** The signed-in rider; sends anyone else to the sign-up page. */
export async function requireRider(): Promise<Rider> {
  const r = await currentRider();
  if (!r) redirect("/join");
  return r;
}
