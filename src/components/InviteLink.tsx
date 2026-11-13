"use client";

import { useEffect, useState } from "react";

/** An invite link with Copy and (on phones) Share buttons. */
export default function InviteLink({ url, name }: { url: string; name: string | null }) {
  const [copied, setCopied] = useState(false);
  const message = `${name ? `${name}, you're` : "You're"} invited to Trail Club, our Marin MTB leaderboard. Connect Strava here:`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers: fall back to a hidden text box.
      const t = document.createElement("textarea");
      t.value = url;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Checked after loading so the server-rendered page matches the first browser render.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare("share" in navigator), []);
  const share = () => navigator.share({ title: "Trail Club invite", text: message, url }).catch(() => undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <code className="small" style={{ wordBreak: "break-all", userSelect: "all", color: "var(--muted)", lineHeight: 1.4 }}>{url}</code>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="pill" onClick={copy} style={{ cursor: "pointer" }} aria-live="polite">
          {copied ? "✓ Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" className="pill" onClick={share} style={{ cursor: "pointer" }}>
            Share…
          </button>
        )}
      </div>
    </div>
  );
}
