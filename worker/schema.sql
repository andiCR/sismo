-- Push notifications (src/push.js). Apply with `npm run db:init` (or db:init:local for wrangler dev).

-- One row per browser: its push endpoint and choices. No location.
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- SHA-256 of the endpoint, hex; the service worker computes the same
  endpoint TEXT NOT NULL,
  regions TEXT NOT NULL,        -- comma-separated keys of Places.REGIONS, e.g. "vc,pc"
  level INTEGER NOT NULL,       -- 3 or 4: the Mercalli level that counts as felt
  lang TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  test_at INTEGER               -- last test notification
);

-- One row per quake worth a notification, and how far sending has got.
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,          -- app event id, e.g. emsc:20260929_0000123
  t INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, mag REAL, depth REAL, place TEXT,
  levels TEXT NOT NULL,         -- JSON: estimated intensity per region
  created INTEGER NOT NULL,
  cursor TEXT NOT NULL DEFAULT '',  -- last subscriber id handled
  sent INTEGER NOT NULL DEFAULT 0,
  finished INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_created ON jobs (created);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
