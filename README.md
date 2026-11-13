# Trail Club

Invite-only mountain bike leaderboards for our Marin crew. Riders connect Strava once and
their rides sync automatically. Trail Club times them on our own official segments and ranks
them by **wet season, dry season, calendar year and all-time**, on **analog, e-bike or
both**. Ghost races replay up to five efforts down the trail together and show where time
was won or lost.

## How it works

1. A rider opens an invite link and taps **Connect with Strava**.
2. Strava sends a webhook whenever they save a ride. Their past rides are backfilled
   gradually so we stay inside Strava's API limits.
3. For each Marin ride we download the GPS track, look for our segments in it
   (`src/lib/matcher.ts`), and keep **only** the segment times, a short ghost-race track per
   segment, and a one-line ride summary. The full GPS track is thrown away.
4. Leaderboards are worked out from date ranges, so moving a season boundary
   (`src/lib/seasons.ts`) re-sorts history automatically.

### Segment matching rules

A ride counts on a segment when it passes within **30 m** of the start, then passes
checkpoints every **25 m** along our line, in order and within **40 m**, then passes the
finish. Up to 10% of checkpoints can be missed (GPS dropouts under trees), but never more
than **120 m** in a row, so cutting a switchback doesn't count. Start and finish times are
interpolated between GPS points, so a 1-second Apple Watch and a sparse phone recording
are timed fairly. Tests are in `src/lib/matcher.test.ts`.

### Seasons

Wet season runs **Nov 1 to Apr 30** and dry season **May 1 to Oct 31**. "Year" means the
calendar year. All dates use the ride's local Marin time.

## Running it locally

```bash
npm install
cp .env.example .env.local      # then fill in values (see below)
npm run dev
```

**Demo data, no Strava needed:** this creates made-up riders and three demo segments near
Fairfax, and runs fake rides through the real matcher:

```bash
DATABASE_URL=file:demo.db npm run seed:demo
# in .env.local: DATABASE_URL=file:demo.db, DEV_LOGIN=1, ADMIN_STRAVA_IDS=1
npm run dev   # then open http://localhost:3000/api/dev/login?as=1
```

`npm test` runs the matcher, season, ghost-race and leaderboard tests.

## Going live (about $0/month)

| Piece | Service | Cost |
|---|---|---|
| App hosting | Vercel (Hobby) | free |
| Database | Turso (libSQL) | free tier |
| Background sync | GitHub Actions, every 15 min | free |
| Maps | OpenFreeMap + AWS Terrain Tiles (no keys) | free |

1. **Turso:** create a database. Copy its URL into `DATABASE_URL` and a token into
   `DATABASE_AUTH_TOKEN`.
2. **Vercel:** import this repo and set every variable from `.env.example`.
   `APP_URL` is the Vercel URL. `ADMIN_STRAVA_IDS` is your Strava athlete id (the number in
   your Strava profile URL).
3. **Strava** (strava.com/settings/api): set *Authorization Callback Domain* to the Vercel
   domain, without `https://`.
4. **Ride sync:** sign in and press **Connect ride sync** at the top of Me → Admin.
5. **Sync:** in GitHub repo settings, add secrets `APP_URL` and `CRON_SECRET`, plus a
   repository variable `SYNC_ENABLED=true`.
6. Sign in, open **Me → Admin**, click **Import 10 segments**, then create invite links.

Strava currently allows this app **10 connected riders**. Request more from Strava once the
group outgrows it.

## Project layout

```
src/lib/matcher.ts     finds and times segment efforts in a GPS track
src/lib/seasons.ts     wet/dry seasons, year, all-time ranges
src/lib/ghost.ts       ghost-race math (gaps, where time was gained)
src/lib/sync.ts        Strava → efforts pipeline and rate-limited job queue
src/lib/strava.ts      Strava API client (OAuth, token refresh, rate limits)
src/lib/queries.ts     leaderboards, feed, profile
src/lib/starter-segments.ts  the group's first 10 segments
src/app/               screens: map home, segments, leaderboard, ghost, me, join, admin
src/components/        map (MapLibre + contour lines), ghost race, leaderboard UI
```

## Not built yet

- Dragging a segment's start/finish on a map in the admin page. Segments currently use
  Strava's line as-is.
- Letting riders mark a single ride as e-bike or analog when Strava has it wrong (the
  database already supports it).
- Proper app-store wrapper. It works today as a home-screen web app.
