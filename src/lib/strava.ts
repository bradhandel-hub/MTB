// Strava API client: OAuth, token refresh and rate-limit-aware requests.
import { one, run } from "./db";
import type { LatLng } from "./geo";

const API = "https://www.strava.com/api/v3";
const OAUTH = "https://www.strava.com/oauth";

/** Ride types we look at. Everything else (runs, hikes, road rides off-dirt) is skipped. */
export const RIDE_TYPES = new Set(["MountainBikeRide", "EMountainBikeRide", "Ride", "EBikeRide", "GravelRide"]);
export const EBIKE_TYPES = new Set(["EMountainBikeRide", "EBikeRide"]);

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Strava rate limit reached");
  }
}
export class NotFoundError extends Error {}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env("STRAVA_CLIENT_ID"),
    redirect_uri: `${env("APP_URL")}/api/auth/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    // activity:read covers rides shared with Everyone or Followers. Rides marked
    // "Only you" stay private and never reach Trail Club.
    scope: "read,activity:read",
    state,
  });
  return `${OAUTH}/authorize?${p}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname: string; lastname: string; profile_medium?: string };
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env("STRAVA_CLIENT_ID"), client_secret: env("STRAVA_CLIENT_SECRET"), ...body }),
  });
  if (!res.ok) throw new Error(`Strava token request failed (${res.status})`);
  return res.json();
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: "authorization_code" });

/** A valid access token for a rider, refreshing it if it expires in the next 5 minutes. */
async function accessToken(riderId: number): Promise<string> {
  const r = await one<{ access_token: string; refresh_token: string; token_expires_at: number }>(
    "SELECT access_token, refresh_token, token_expires_at FROM riders WHERE id = ?",
    [riderId],
  );
  if (!r?.refresh_token) throw new Error(`Rider ${riderId} has not connected Strava`);
  if (r.token_expires_at - 300 > Date.now() / 1000) return r.access_token;
  const t = await tokenRequest({ refresh_token: r.refresh_token, grant_type: "refresh_token" });
  await run("UPDATE riders SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?", [
    t.access_token,
    t.refresh_token,
    t.expires_at,
    riderId,
  ]);
  return t.access_token;
}

// Last usage Strava reported, so we stop before hitting the limit rather than after.
const budget = { used15: 0, limit15: 200, usedDay: 0, limitDay: 2000 };

function readBudget(res: Response) {
  const usage = res.headers.get("x-readratelimit-usage") ?? res.headers.get("x-ratelimit-usage");
  const limit = res.headers.get("x-readratelimit-limit") ?? res.headers.get("x-ratelimit-limit");
  if (usage && limit) {
    [budget.used15, budget.usedDay] = usage.split(",").map(Number);
    [budget.limit15, budget.limitDay] = limit.split(",").map(Number);
  }
}

/** Seconds until the next 15-minute window (Strava resets at :00, :15, :30, :45). */
function secondsToNextWindow(now = new Date()) {
  return (15 - (now.getUTCMinutes() % 15)) * 60 - now.getUTCSeconds();
}

/** Whether there's room for another request, keeping a little headroom for new rides. */
export function hasBudget(reserve = 10): boolean {
  return budget.used15 < budget.limit15 - reserve && budget.usedDay < budget.limitDay - reserve * 5;
}

async function api<T>(riderId: number, pathAndQuery: string): Promise<T> {
  if (!hasBudget(2)) throw new RateLimitError(secondsToNextWindow());
  const token = await accessToken(riderId);
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
  readBudget(res);
  if (res.status === 429) throw new RateLimitError(secondsToNextWindow());
  if (res.status === 404) throw new NotFoundError(pathAndQuery);
  if (!res.ok) throw new Error(`Strava ${pathAndQuery} failed (${res.status})`);
  return res.json() as Promise<T>;
}

export type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string; // "2026-11-08T15:13:42Z" (local time, despite the Z)
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  start_latlng: LatLng | [] | null;
  private?: boolean;
};

export const getActivity = (riderId: number, id: number) => api<StravaActivity>(riderId, `/activities/${id}`);

export const listActivities = (riderId: number, page: number, perPage = 100) =>
  api<StravaActivity[]>(riderId, `/athlete/activities?page=${page}&per_page=${perPage}`);

export async function getStreams(riderId: number, id: number) {
  const s = await api<Record<string, { data: unknown[] }>>(
    riderId,
    `/activities/${id}/streams?keys=latlng,time&key_by_type=true`,
  );
  return {
    latlng: (s.latlng?.data ?? []) as LatLng[],
    time: (s.time?.data ?? []) as number[],
  };
}

export type StravaSegment = {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  elevation_high: number;
  elevation_low: number;
  total_elevation_gain: number;
  start_latlng: LatLng;
  end_latlng: LatLng;
  map: { polyline: string };
};

export const getSegment = (riderId: number, id: number) => api<StravaSegment>(riderId, `/segments/${id}`);

export async function deauthorize(riderId: number) {
  const token = await accessToken(riderId).catch(() => null);
  if (!token) return;
  await fetch(`${OAUTH}/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

/** "2026-11-08T15:13:42Z" → "2026-11-08T15:13:42" (Strava marks local time with a Z). */
export const localTime = (s: string) => s.replace(/Z$/, "").slice(0, 19);

// --- Webhook subscription (one per Strava app) ---------------------------------

type Subscription = { id: number; callback_url: string };

const appCreds = () => ({ client_id: env("STRAVA_CLIENT_ID"), client_secret: env("STRAVA_CLIENT_SECRET") });

/** The app's current webhook subscription, if any. */
export async function getWebhook(): Promise<Subscription | null> {
  const res = await fetch(`${API}/push_subscriptions?${new URLSearchParams(appCreds())}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Strava webhook lookup failed (${res.status})`);
  const list = (await res.json()) as Subscription[];
  return list[0] ?? null;
}

/**
 * Asks Strava to send ride events to this deployment. Strava immediately calls our
 * webhook's GET handler to verify it, so the app must already be live at APP_URL.
 */
export async function createWebhook(): Promise<Subscription> {
  const res = await fetch(`${API}/push_subscriptions`, {
    method: "POST",
    body: new URLSearchParams({
      ...appCreds(),
      callback_url: `${env("APP_URL")}/api/strava/webhook`,
      verify_token: env("STRAVA_WEBHOOK_VERIFY_TOKEN"),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Strava webhook setup failed (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

export async function deleteWebhook(id: number) {
  await fetch(`${API}/push_subscriptions/${id}?${new URLSearchParams(appCreds())}`, { method: "DELETE" });
}
