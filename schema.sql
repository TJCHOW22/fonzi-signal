-- fonzi-signal schema — SINGLE SOURCE OF TRUTH.
-- Applied idempotently by the app (lib/db.ts) on start and by the X Engine
-- python scripts (x_scrape.py / x_score.py) before writes.
-- Keep it portable: standard SQL only, no sqlite-only syntax beyond pragmas,
-- so the eventual Postgres swap is mechanical. Booleans are INTEGER 0/1.
--
-- NOTE ON ALTERs: sqlite has no ALTER TABLE ... IF NOT EXISTS, so this file
-- must NOT be run with a bare executescript. Both appliers (applySchema in
-- lib/db.ts, apply_schema in the python scripts) split the file into
-- statements and check PRAGMA table_info before each ALTER TABLE ADD COLUMN.
-- Keep semicolons out of comments so the statement splitter stays trivial.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Roster. One row per watched account (replaces the config.json roster and
-- the Notion Sources X rows). tier: Lab | Creator | Network | Competitor.
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  platform      TEXT NOT NULL DEFAULT 'x',
  tier          TEXT,
  archetype     TEXT,
  why_we_watch  TEXT,
  followers     INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  yield_pct     REAL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-account medians over the last N posts (replaces data/baselines.json).
-- One current row per source, replaced on every recompute by x_scrape.py.
-- median_save_proxy backs the guard-3 (null impressions) proxy Heat path.
CREATE TABLE IF NOT EXISTS baselines (
  id                     INTEGER PRIMARY KEY,
  source_id              INTEGER NOT NULL UNIQUE REFERENCES sources(id),
  computed_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  median_save_rate       REAL,
  median_engagement_rate REAL,
  median_save_proxy      REAL,
  post_count             INTEGER,
  valid_count            INTEGER
);

-- Every scored post (replaces the Notion X Signal DB and survivors-*.json).
-- status is the human review field: new | idea | developing | not_for_us |
-- taken | archived. AI writes the scores, humans write status — keep that
-- separation. new/idea/developing are the active Creative Feed states,
-- not_for_us removes a post from the feed (paired with a negative label).
-- heat_basis: full | proxy | deferred | NULL. baseline_multiple is NULL when
-- the account had no real baseline (batch-fallback or proxy heat) — never
-- print a multiple for those rows.
CREATE TABLE IF NOT EXISTS posts (
  id                INTEGER PRIMARY KEY,
  tweet_id          TEXT NOT NULL UNIQUE,
  source_id         INTEGER REFERENCES sources(id),
  url               TEXT,
  text              TEXT,
  posted_at         TEXT,
  scraped_at        TEXT,
  impressions       INTEGER,
  likes             INTEGER,
  replies           INTEGER,
  reposts           INTEGER,
  bookmarks         INTEGER,
  quotes            INTEGER,
  is_quote          INTEGER NOT NULL DEFAULT 0,
  is_reply          INTEGER NOT NULL DEFAULT 0,
  media_type        TEXT,
  save_rate         REAL,
  baseline_multiple REAL,
  heat              REAL,
  heat_basis        TEXT,
  fit               INTEGER,
  fit_subscores     TEXT,
  angle             TEXT,
  angle_for         TEXT,
  why_it_worked     TEXT,
  lane              TEXT,
  status            TEXT NOT NULL DEFAULT 'new',
  raw               TEXT
);

-- Taste calibration for the eval harness. post_id when the post is in the
-- DB; tweet_url for labels on posts not (yet) scraped. label: positive |
-- negative. source: tj | seed.
CREATE TABLE IF NOT EXISTS labels (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER REFERENCES posts(id),
  tweet_url  TEXT,
  label      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'tj',
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Rendered story briefs, one per day.
CREATE TABLE IF NOT EXISTS briefs (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL UNIQUE,
  markdown   TEXT NOT NULL,
  stats      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_heat      ON posts(heat);
CREATE INDEX IF NOT EXISTS idx_posts_source    ON posts(source_id);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_labels_post     ON labels(post_id);

-- ------------------------------------------------------------------------
-- Creative Feed additions (2026-08-17). ALTERs below are guarded by the
-- appliers (see the note at the top of this file).

-- posts gain first-media info (captured by x_scrape.py, thumb downloaded to
-- data/media/x/<tweet_id>.jpg) and a topic tag for feed filtering.
ALTER TABLE posts ADD COLUMN media_url TEXT;
ALTER TABLE posts ADD COLUMN thumb_path TEXT;
ALTER TABLE posts ADD COLUMN media_width INTEGER;
ALTER TABLE posts ADD COLUMN media_height INTEGER;
ALTER TABLE posts ADD COLUMN topic TEXT;
ALTER TABLE posts ADD COLUMN platform TEXT NOT NULL DEFAULT 'x';
ALTER TABLE posts ADD COLUMN external_id TEXT;

-- Mirror of the GatherOS save library ("saved by me" cards in the feed).
-- Imported by scripts/import-gatheros.mjs — the GatherOS db is STRICTLY
-- read-only, thumbs are COPIED into data/media/gather/<save_id><ext>.
-- hidden and matched_post_id are app-owned, the importer never overwrites
-- them. matched_post_id links a save to the same tweet in posts.
CREATE TABLE IF NOT EXISTS gather_saves (
  id              TEXT PRIMARY KEY,
  kind            TEXT,
  source          TEXT,
  title           TEXT,
  source_url      TEXT,
  tweet_id        TEXT,
  creator         TEXT,
  thumb_path      TEXT,
  media_width     INTEGER,
  media_height    INTEGER,
  notes           TEXT,
  tags            TEXT,
  saved_at        TEXT,
  imported_at     TEXT,
  matched_post_id INTEGER REFERENCES posts(id),
  hidden          INTEGER NOT NULL DEFAULT 0
);

-- Media-aware teardown of a personal bookmark. Analyses are app-owned and
-- never written back to GatherOS. One cached result per prompt/input version.
-- `result_json` contains only the structured creative analysis; it must not
-- contain credentials or a dump of GatherOS application metadata.
CREATE TABLE IF NOT EXISTS gather_save_analyses (
  id               INTEGER PRIMARY KEY,
  gather_save_id   TEXT NOT NULL REFERENCES gather_saves(id),
  analysis_version TEXT NOT NULL,
  input_hash       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  result_json      TEXT,
  error            TEXT,
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT,
  started_at       TEXT,
  analyzed_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (gather_save_id, analysis_version, input_hash)
);

-- The content spine (DIRECTION.md section 3). One row per piece of content
-- moving through the pipeline. stage: idea | scripting | production |
-- published | learned.
CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  stage      TEXT NOT NULL DEFAULT 'idea',
  person     TEXT,
  lane       TEXT,
  angle      TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Source material behind an item, many per item. Exactly one of post_id /
-- gather_save_id / url is expected per row (not enforced, keep it portable).
CREATE TABLE IF NOT EXISTS item_sources (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  post_id        INTEGER REFERENCES posts(id),
  gather_save_id TEXT REFERENCES gather_saves(id),
  url            TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Editable sections on the develop page (/items/<id>). section: pattern |
-- takes | interview | concepts | notes. One row per item+section.
CREATE TABLE IF NOT EXISTS item_sections (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  section    TEXT NOT NULL,
  content_md TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (item_id, section)
);

-- Canonical content model additions. `items` carries the workflow state and
-- editorial identity. Long-form/editable artifacts stay in item_sections so
-- v1 can evolve without a column migration for every new creative step.
-- stage: inbox | exploring | drafting | ready_to_record | editing |
-- ready_to_publish | published.
ALTER TABLE items ADD COLUMN format TEXT;
ALTER TABLE items ADD COLUMN target_platform TEXT;
ALTER TABLE items ADD COLUMN owner TEXT;
ALTER TABLE items ADD COLUMN research_status TEXT NOT NULL DEFAULT 'not_researched';
ALTER TABLE items ADD COLUMN research_summary TEXT;
ALTER TABLE items ADD COLUMN research_priority INTEGER NOT NULL DEFAULT 0;

-- Snapshot useful source context when an idea is created. Foreign keys keep
-- local lineage, while snapshots survive changes to upstream/external data.
ALTER TABLE item_sources ADD COLUMN source_type TEXT;
ALTER TABLE item_sources ADD COLUMN source_title TEXT;
ALTER TABLE item_sources ADD COLUMN source_text TEXT;
ALTER TABLE item_sources ADD COLUMN media_url TEXT;
ALTER TABLE item_sources ADD COLUMN thumb_path TEXT;
ALTER TABLE item_sources ADD COLUMN why_it_worked TEXT;
ALTER TABLE item_sources ADD COLUMN saved_note TEXT;

-- Selected content fields mirrored by the read-only GatherOS importer. The
-- source file itself is copied into fonzi-signal's media directory.
ALTER TABLE gather_saves ADD COLUMN content_text TEXT;
ALTER TABLE gather_saves ADD COLUMN media_path TEXT;
ALTER TABLE gather_saves ADD COLUMN media_type TEXT;
ALTER TABLE gather_saves ADD COLUMN enrichment_status TEXT;
ALTER TABLE gather_saves ADD COLUMN enrichment_error TEXT;
ALTER TABLE gather_saves ADD COLUMN enriched_at TEXT;
ALTER TABLE gather_save_analyses ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gather_save_analyses ADD COLUMN next_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_gather_saves_tweet ON gather_saves(tweet_id);
CREATE INDEX IF NOT EXISTS idx_items_stage        ON items(stage);
CREATE INDEX IF NOT EXISTS idx_item_sources_item  ON item_sources(item_id);
CREATE INDEX IF NOT EXISTS idx_item_sections_item ON item_sections(item_id);
CREATE INDEX IF NOT EXISTS idx_item_sources_post ON item_sources(post_id);
CREATE INDEX IF NOT EXISTS idx_item_sources_gather ON item_sources(gather_save_id);
CREATE INDEX IF NOT EXISTS idx_gather_analysis_save ON gather_save_analyses(gather_save_id, analyzed_at);
CREATE INDEX IF NOT EXISTS idx_gather_analysis_queue ON gather_save_analyses(status, next_attempt_at, created_at);

-- Three-profile signal feed. Posts remain canonical; every other table is
-- profile-scoped so Thomas, Fonzi, and Brett can learn independently.
CREATE TABLE IF NOT EXISTS feed_profiles (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  weights_json TEXT NOT NULL,
  lenses_json  TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_topics (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  label    TEXT NOT NULL,
  keywords TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_profile_topics (
  profile_id INTEGER NOT NULL REFERENCES feed_profiles(id),
  topic_id   INTEGER NOT NULL REFERENCES feed_topics(id),
  weight     REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (profile_id, topic_id)
);

CREATE TABLE IF NOT EXISTS feed_profile_sources (
  profile_id INTEGER NOT NULL REFERENCES feed_profiles(id),
  source_id  INTEGER NOT NULL REFERENCES sources(id),
  weight     REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (profile_id, source_id)
);

-- Editorial targeting is post-specific and profile-scoped. A targeted post is
-- eligible only for the named profiles. weight is an explicit ranking lift,
-- independent of the broader source membership above.
CREATE TABLE IF NOT EXISTS feed_post_profiles (
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  profile_id INTEGER NOT NULL REFERENCES feed_profiles(id),
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, profile_id)
);

CREATE TABLE IF NOT EXISTS feed_profile_scores (
  profile_id    INTEGER NOT NULL REFERENCES feed_profiles(id),
  post_id       INTEGER NOT NULL REFERENCES posts(id),
  score         REAL NOT NULL,
  components_json TEXT NOT NULL,
  best_angle    TEXT,
  stable_lenses_json TEXT NOT NULL,
  wildcard_frame TEXT NOT NULL,
  computed_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, post_id)
);

CREATE TABLE IF NOT EXISTS feed_sessions (
  id          TEXT PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES feed_profiles(id),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_session_items (
  session_id TEXT NOT NULL REFERENCES feed_sessions(id),
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  position   INTEGER NOT NULL,
  score      REAL NOT NULL,
  PRIMARY KEY (session_id, post_id),
  UNIQUE (session_id, position)
);

ALTER TABLE feed_session_items ADD COLUMN served_at TEXT;

CREATE TABLE IF NOT EXISTS feed_interactions (
  id          INTEGER PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES feed_profiles(id),
  post_id     INTEGER NOT NULL REFERENCES posts(id),
  session_id  TEXT REFERENCES feed_sessions(id),
  action      TEXT NOT NULL,
  metadata_json TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_comments (
  id          INTEGER PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES feed_profiles(id),
  post_id     INTEGER NOT NULL REFERENCES posts(id),
  session_id  TEXT REFERENCES feed_sessions(id),
  body        TEXT NOT NULL,
  suggested_next_move TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_learned_interests (
  profile_id INTEGER NOT NULL REFERENCES feed_profiles(id),
  interest   TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, interest)
);

CREATE INDEX IF NOT EXISTS idx_feed_scores_profile ON feed_profile_scores(profile_id, score);
CREATE INDEX IF NOT EXISTS idx_feed_sessions_profile ON feed_sessions(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feed_session_items_page ON feed_session_items(session_id, position);
CREATE INDEX IF NOT EXISTS idx_feed_interactions_learning ON feed_interactions(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feed_comments_profile ON feed_comments(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feed_post_profiles_profile ON feed_post_profiles(profile_id, post_id);

-- ------------------------------------------------------------------------
-- Media -> Drafts writing room (2026-08-26). media_items are permanent
-- source records. A source leaves the active Media grid when a linked draft
-- exists, but the source row is never deleted and remains available in the
-- side-by-side draft workspace.
CREATE TABLE IF NOT EXISTS media_items (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  creator         TEXT NOT NULL,
  source_account  TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  posted_at       TEXT,
  duration        TEXT,
  thumbnail_url   TEXT NOT NULL,
  video_url       TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  thumbnail_text  TEXT,
  transcript      TEXT NOT NULL,
  caption         TEXT,
  summary         TEXT,
  likes           TEXT,
  comments        TEXT,
  reposts         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE media_items ADD COLUMN posted_at TEXT;
ALTER TABLE media_items ADD COLUMN killed_at TEXT;

-- One draft per source and workflow. The unique pair makes Create safe to
-- retry and protects against duplicate requests at the database boundary.
CREATE TABLE IF NOT EXISTS drafts (
  id                      INTEGER PRIMARY KEY,
  source_media_id         TEXT NOT NULL REFERENCES media_items(id),
  workflow_key            TEXT NOT NULL,
  speaker                 TEXT NOT NULL,
  source_platform         TEXT NOT NULL,
  publishing_account      TEXT NOT NULL,
  publishing_platform     TEXT NOT NULL,
  generation_status       TEXT NOT NULL DEFAULT 'generating',
  production_stage        TEXT NOT NULL DEFAULT 'drafting'
    CHECK (production_stage IN ('drafting', 'ready_to_record', 'editing', 'ready_to_publish')),
  thumbnail_hook          TEXT,
  generated_thumbnail_url TEXT,
  script_hook             TEXT,
  script_body             TEXT,
  cta                     TEXT,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at            TEXT,
  UNIQUE (source_media_id, workflow_key)
);

-- Completion history remains visible after read. One completion notification
-- per draft keeps repeated generation requests idempotent.
CREATE TABLE IF NOT EXISTS draft_notifications (
  id           INTEGER PRIMARY KEY,
  draft_id     INTEGER NOT NULL UNIQUE REFERENCES drafts(id),
  event_status TEXT NOT NULL DEFAULT 'ready',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at      TEXT
);

-- One durable Codex conversation per draft. A provisioning row reserves the
-- only slot before the SDK starts a local thread, so concurrent retries cannot
-- bind two thread IDs to the same draft. Claim metadata is server-only.
CREATE TABLE IF NOT EXISTS draft_codex_threads (
  draft_id         INTEGER PRIMARY KEY REFERENCES drafts(id),
  thread_id        TEXT UNIQUE,
  model            TEXT,
  state            TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (state IN ('provisioning', 'ready', 'failed')),
  claim_token      TEXT,
  claimed_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claim_expires_at TEXT,
  ready_at         TEXT,
  failed_at        TEXT,
  error            TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Every generation attempt is durable and reports the real pipeline stage.
-- The partial unique index below prevents more than one live attempt for the
-- same draft while retaining completed attempts as history.
CREATE TABLE IF NOT EXISTS draft_generation_runs (
  id           INTEGER PRIMARY KEY,
  draft_id     INTEGER NOT NULL REFERENCES drafts(id),
  stage        TEXT NOT NULL DEFAULT 'preparing_source'
    CHECK (stage IN ('preparing_source', 'writing', 'verifying_facts', 'checking_voice', 'ready', 'failed')),
  pass_number  INTEGER NOT NULL DEFAULT 1 CHECK (pass_number >= 1),
  model        TEXT,
  prompt_version TEXT,
  prompt_hash  TEXT,
  error        TEXT,
  started_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- Immutable snapshots written as the verified pipeline changes a draft.
-- Candidate scores and private ranking notes never enter this table.
CREATE TABLE IF NOT EXISTS draft_revisions (
  id                      INTEGER PRIMARY KEY,
  draft_id                INTEGER NOT NULL REFERENCES drafts(id),
  generation_run_id       INTEGER NOT NULL REFERENCES draft_generation_runs(id),
  pass_number             INTEGER NOT NULL DEFAULT 1 CHECK (pass_number >= 1),
  event_key               TEXT,
  kind                    TEXT NOT NULL,
  summary                 TEXT NOT NULL,
  source_urls             TEXT NOT NULL DEFAULT '[]',
  thumbnail_hook          TEXT,
  generated_thumbnail_url TEXT,
  script_hook             TEXT,
  script_body             TEXT,
  cta                     TEXT,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Internal structured findings emitted by research and reviewer stages.
-- payload_json stores concise evidence and decisions, never chain-of-thought.
CREATE TABLE IF NOT EXISTS draft_generation_artifacts (
  id                INTEGER PRIMARY KEY,
  draft_id          INTEGER NOT NULL REFERENCES drafts(id),
  generation_run_id INTEGER NOT NULL REFERENCES draft_generation_runs(id),
  pass_number       INTEGER NOT NULL CHECK (pass_number >= 1),
  stage             TEXT NOT NULL
    CHECK (stage IN ('preparing_source', 'writing', 'verifying_facts', 'checking_voice', 'ready', 'failed')),
  kind              TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (generation_run_id, pass_number, stage, kind)
);

-- Existing databases gain the replay key without rebuilding revision history.
ALTER TABLE draft_revisions ADD COLUMN event_key TEXT;
ALTER TABLE drafts ADD COLUMN production_stage TEXT NOT NULL DEFAULT 'drafting';
ALTER TABLE draft_generation_runs ADD COLUMN model TEXT;
ALTER TABLE draft_generation_runs ADD COLUMN prompt_version TEXT;
ALTER TABLE draft_generation_runs ADD COLUMN prompt_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_drafts_source ON drafts(source_media_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(generation_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_drafts_production_stage ON drafts(production_stage, updated_at);
CREATE INDEX IF NOT EXISTS idx_draft_notifications_created ON draft_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_draft_generation_runs_draft ON draft_generation_runs(draft_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_generation_runs_one_active
  ON draft_generation_runs(draft_id)
  WHERE stage IN ('preparing_source', 'writing', 'verifying_facts', 'checking_voice');
CREATE INDEX IF NOT EXISTS idx_draft_revisions_history ON draft_revisions(draft_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_revisions_event
  ON draft_revisions(generation_run_id, event_key)
  WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_draft_artifacts_run
  ON draft_generation_artifacts(generation_run_id, pass_number, id);
PRAGMA optimize;
