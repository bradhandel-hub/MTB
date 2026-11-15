/**
 * Finds the ride number in a Strava link. Links copied from the Strava app are short
 * share links (strava.app.link/…) with no number in them, so those are followed to
 * see where they lead.
 */
export async function activityIdFrom(input: string): Promise<number | null> {
  const text = input.trim();
  const direct = /activities\/(\d{6,})/.exec(text) ?? /^(\d{6,})$/.exec(text);
  if (direct) return Number(direct[1]);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/(^|\.)strava\.(app\.link|com)$/.test(url.hostname)) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000) });
    const found = /activities\/(\d{6,})/.exec(res.url) ?? /activities\/(\d{6,})/.exec((await res.text()).slice(0, 300_000));
    return found ? Number(found[1]) : null;
  } catch {
    return null;
  }
}
