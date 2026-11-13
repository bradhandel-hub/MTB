// Trail Club database schema. Applied on startup; every statement must be idempotent.
export const SCHEMA = `

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY,                 -- Strava athlete id
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,               -- unix seconds
  backfill_done INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  invited_with TEXT
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  note TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('descent', 'climb', 'mixed')),
  kind_overridden INTEGER NOT NULL DEFAULT 0,
  strava_segment_id INTEGER,
  polyline TEXT NOT NULL,                 -- JSON [[lat,lng],...]
  distance_m REAL NOT NULL,
  elev_gain_m REAL NOT NULL DEFAULT 0,
  elev_loss_m REAL NOT NULL DEFAULT 0,
  min_lat REAL NOT NULL, min_lng REAL NOT NULL, max_lat REAL NOT NULL, max_lng REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Only a summary of each ride is kept; the GPS track is discarded after matching.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,                 -- Strava activity id
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  name TEXT,
  sport_type TEXT NOT NULL,
  is_ebike INTEGER NOT NULL,              -- from Strava sport type...
  ebike_override INTEGER,                 -- ...unless the rider corrected it (0/1)
  start_local TEXT NOT NULL,              -- "YYYY-MM-DDTHH:MM:SS" Marin time
  distance_m REAL NOT NULL DEFAULT 0,
  moving_s INTEGER NOT NULL DEFAULT 0,
  elev_gain_m REAL NOT NULL DEFAULT 0,
  -- Bounding box of the ride, so a newly added segment can find rides to recheck.
  min_lat REAL, min_lng REAL, max_lat REAL, max_lng REAL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS activities_rider ON activities(rider_id, start_local);

CREATE TABLE IF NOT EXISTS efforts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  start_local TEXT NOT NULL,              -- when the segment started, Marin time
  elapsed_s REAL NOT NULL,
  track TEXT NOT NULL,                    -- JSON [[meters, seconds],...] for ghost races
  UNIQUE (segment_id, activity_id, start_local)
);
CREATE INDEX IF NOT EXISTS efforts_board ON efforts(segment_id, start_local, elapsed_s);
CREATE INDEX IF NOT EXISTS efforts_rider ON efforts(rider_id, segment_id);

-- Work waiting for the Strava API (new rides, history backfill, rematching).
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                     -- 'activity' | 'backfill' | 'delete_activity'
  rider_id INTEGER NOT NULL,
  ref INTEGER,                            -- activity id, or backfill page number
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  UNIQUE (kind, rider_id, ref)
);
`;
