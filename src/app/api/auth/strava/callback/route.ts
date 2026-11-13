import { after } from "next/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin, signIn } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { exchangeCode } from "@/lib/strava";
import { enqueue, runJobs } from "@/lib/sync";

// Step 2: Strava sends the rider back here with a one-time code.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const back = (path: string) => NextResponse.redirect(new URL(path, process.env.APP_URL || url.origin));

  const jar = await cookies();
  const saved = JSON.parse(jar.get("tc_oauth")?.value ?? "{}") as { nonce?: string; invite?: string };
  jar.delete("tc_oauth");
  if (!saved.nonce || saved.nonce !== url.searchParams.get("state")) return back("/join?error=expired");
  if (url.searchParams.get("error")) return back("/join?error=denied");
  const scope = url.searchParams.get("scope") ?? "";
  if (!scope.includes("activity:read")) return back("/join?error=scope");

  const t = await exchangeCode(url.searchParams.get("code") ?? "");
  const athlete = t.athlete!;
  const existing = await one<{ id: number }>("SELECT id FROM riders WHERE id = ?", [athlete.id]);

  if (!existing) {
    // New riders need an invite with uses left (admins can always get in).
    const invite = saved.invite
      ? await one<{ code: string }>("SELECT code FROM invites WHERE code = ? AND uses < max_uses", [saved.invite])
      : undefined;
    if (!invite && !isAdmin(athlete.id)) return back("/join?error=invite");
    if (invite) await run("UPDATE invites SET uses = uses + 1 WHERE code = ?", [invite.code]);
    await run(
      `INSERT INTO riders (id, first_name, last_name, avatar_url, access_token, refresh_token, token_expires_at, invited_with)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [athlete.id, athlete.firstname, athlete.lastname ?? "", athlete.profile_medium ?? null,
        t.access_token, t.refresh_token, t.expires_at, invite?.code ?? null],
    );
    await enqueue("backfill", athlete.id, 1);
  } else {
    await run(
      `UPDATE riders SET first_name = ?, last_name = ?, avatar_url = ?, access_token = ?, refresh_token = ?, token_expires_at = ?
       WHERE id = ?`,
      [athlete.firstname, athlete.lastname ?? "", athlete.profile_medium ?? null, t.access_token, t.refresh_token, t.expires_at, athlete.id],
    );
  }

  await signIn(athlete.id);
  after(() => runJobs({ deadlineMs: Date.now() + 25_000, max: 20 }));
  return back(existing ? "/" : "/?welcome=1");
}
