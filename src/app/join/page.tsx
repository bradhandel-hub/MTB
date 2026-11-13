import { redirect } from "next/navigation";
import TrailMap from "@/components/TrailMap";
import { currentRider } from "@/lib/auth";
import { one } from "@/lib/db";
import { activeSegments, pointsOf, type Segment } from "@/lib/segments";

const HOBO_STRAVA_ID = 17969543;

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invite: "Trail Club is invite-only. Ask a member for an invite link.",
  denied: "Strava access wasn’t granted. Trail Club needs to read your rides to find your segment times.",
  scope: "Please leave “View data about your activities” ticked on the Strava screen. That’s how we find your segment times.",
  expired: "That sign-in took too long. Please try again.",
};

export default async function Join({ searchParams }: { searchParams: Promise<{ invite?: string; error?: string; left?: string }> }) {
  if (await currentRider()) redirect("/");
  const sp = await searchParams;
  const connect = `/api/auth/strava${sp.invite ? `?invite=${encodeURIComponent(sp.invite)}` : ""}`;

  // The sign-up screen opens on a real topo map of Hobo (or the first segment, before
  // segments are imported).
  const hero = (await one<Segment>("SELECT * FROM segments WHERE strava_segment_id = ? AND active = 1", [HOBO_STRAVA_ID])) ??
    (await activeSegments())[0];

  return (
    <main style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 24px 40px", gap: 18 }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: "62dvh" }} aria-hidden="true">
        {hero ? (
          <TrailMap
            className="map-fill"
            segments={[{ id: hero.id, name: hero.name, number: 1, points: pointsOf(hero) }]}
            highlightId={hero.id}
            interactive={false}
            padding={{ top: 70, bottom: 110, left: 50, right: 50 }}
          />
        ) : (
          <div className="map-fill" style={{ background: "radial-gradient(120% 70% at 70% 10%, #1b2a21 0%, #0e1311 60%)" }} />
        )}
        <div style={{ position: "absolute", inset: "auto 0 0 0", height: "45%", background: "linear-gradient(to bottom, rgba(14,19,17,0) 0%, #0e1311 92%)", pointerEvents: "none" }} />
        {hero && (
          <span className="chip-dark small" style={{ position: "absolute", left: 20, top: "calc(env(safe-area-inset-top) + 16px)", fontWeight: 600 }}>
            {hero.name} · Fairfax
          </span>
        )}
      </div>
      <div style={{ position: "relative", marginTop: "52dvh" }}>
        <div className="display" style={{ fontSize: 52, lineHeight: 0.95 }}>TRAIL CLUB</div>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: "12px 0 0", color: "var(--fog)" }}>
          Welcome to Trail Club, the hottest invite-only MTB leaderboard in all of Marin.
        </p>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, margin: "8px 0 0" }}>
          See how you stack up on the trails, season by season, and race your friends’ times with ghost mode.
        </p>
      </div>
      {sp.left && <p className="notice" style={{ margin: 0, position: "relative" }}>You’ve left Trail Club and your data has been deleted.</p>}
      {sp.error && <p className="notice warn" style={{ margin: 0, position: "relative" }}>{ERRORS[sp.error] ?? "Something went wrong. Please try again."}</p>}
      {sp.invite && !sp.error && (
        <p className="notice" style={{ margin: 0, position: "relative" }}>You’re invited! Connect Strava once and your rides sync automatically. No uploading.</p>
      )}
      <a href={connect} className="btn" style={{ position: "relative", background: "#FC5200", color: "#fff", height: 52 }}>
        Connect with Strava
      </a>
      <p className="small muted" style={{ position: "relative", lineHeight: 1.5, margin: 0 }}>
        We read rides you share with Everyone or Followers, only keep times on our segments, and you can leave and delete your data at
        any time. Rides set to “Only you” stay private.
      </p>
    </main>
  );
}
