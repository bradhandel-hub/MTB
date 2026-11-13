/** 141.3 → "2:21", 3725 → "1:02:05". */
export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Gap like "+4s", "+1:05", or "" for the leader. */
export function formatGap(seconds: number): string {
  if (seconds < 0.5) return "";
  return seconds < 60 ? `+${Math.round(seconds)}s` : `+${formatTime(seconds)}`;
}

export const miles = (m: number) => `${(m / 1609.344).toFixed(m < 1609 ? 2 : 1)} mi`;
export const feet = (m: number) => `${Math.round(m * 3.28084).toLocaleString("en-US")} ft`;

/** "2h ago", "Yesterday", "Nov 8" from a Marin-local timestamp. */
export function when(local: string, today: string, nowLocal?: string): string {
  const day = local.slice(0, 10);
  if (day === today && nowLocal) {
    const mins = (Date.parse(`${nowLocal}Z`) - Date.parse(`${local}Z`)) / 60000;
    if (mins < 60) return `${Math.max(1, Math.round(mins))}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }
  if (day === today) return "Today";
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (day === y.toISOString().slice(0, 10)) return "Yesterday";
  const d = new Date(`${day}T12:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" });
}

/** Current Marin local time as "YYYY-MM-DDTHH:MM:SS". */
export function nowInMarin(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}
