import { redirect } from "next/navigation";
import { currentRider } from "@/lib/auth";

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

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "40px 24px 48px", gap: 20, background: "radial-gradient(120% 70% at 70% 10%, #1b2a21 0%, #0e1311 60%)" }}>
      <svg width="100%" height="140" viewBox="0 0 350 140" aria-hidden="true" style={{ marginBottom: "auto" }}>
        <g fill="none" stroke="#22302a" strokeWidth="1.2">
          <path d="M-10 120 C60 90 110 130 180 100 S300 60 360 80" />
          <path d="M-10 95 C50 65 120 105 190 75 S290 35 360 53" />
          <path d="M-10 70 C60 42 120 80 200 52 S290 14 360 28" />
        </g>
        <path d="M20 118 C90 80 140 110 200 70 S290 30 330 24" fill="none" stroke="#D0703F" strokeWidth="5" strokeLinecap="round" />
        <circle cx="330" cy="24" r="8" fill="#DCE3DE" />
      </svg>
      <div>
        <div className="display" style={{ fontSize: 48, lineHeight: 0.95 }}>TRAIL CLUB</div>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.5, margin: "12px 0 0" }}>
          Seasonal leaderboards for our Marin crew. Wet season, dry season, this year and all-time, analog and e-bike, on the
          trails we actually ride.
        </p>
      </div>
      {sp.left && <p className="notice" style={{ margin: 0 }}>You’ve left Trail Club and your data has been deleted.</p>}
      {sp.error && <p className="notice warn" style={{ margin: 0 }}>{ERRORS[sp.error] ?? "Something went wrong. Please try again."}</p>}
      {sp.invite && !sp.error && <p className="notice" style={{ margin: 0 }}>You’ve been invited! Connect Strava and your rides will sync automatically. No uploading.</p>}
      <a href={connect} className="btn" style={{ background: "#FC5200", color: "#fff", height: 52 }}>
        Connect with Strava
      </a>
      <p className="small muted" style={{ lineHeight: 1.5, margin: 0 }}>
        We read rides you share with Everyone or Followers, only keep times on our segments, and you can leave and delete your data at
        any time. Rides set to “Only you” stay private.
      </p>
    </main>
  );
}
