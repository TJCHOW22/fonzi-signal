# fonzi-signal

Local-first store + UI for Fonzi's content operating system. The scrape/score
scripts and the GatherOS importer write here, TJ triages the Creative Feed,
develops ideas on the item page, labels taste, and the morning `/story-brief`
reads survivors and stores its rendered brief here. Built as a real Next.js
codebase so Fonzi devs can lift it into the product later.

- **Stack**: Next.js (app router, TypeScript, server components + server
  actions) + better-sqlite3 + Tailwind. No ORM, no auth (local-only v1), no UI
  kit, no charts. The app itself stays LLM-free — the item page's "Interview
  me" / "Generate concepts" buttons shell out one `claude -p` call each.
- **DB**: `data/signal.db` (gitignored, created on first run).
  `SIGNAL_DB_PATH` env var overrides — used by tests.
- **Media**: `data/media/x/` (post thumbs downloaded by `x_scrape.py`) and
  `data/media/gather/` (thumbs + assets copied from GatherOS). Served
  read-only by `GET /api/media/<path>` with traversal protection. Never
  reference a GatherOS path directly.
- **Schema**: `schema.sql` at the repo root is the **single source of truth**.
  The app (`lib/db.ts`), the importer, and the python scripts all apply it
  idempotently on start. CREATEs are `IF NOT EXISTS`; sqlite has no
  `ALTER ... IF NOT EXISTS`, so each applier splits the file into statements
  and checks `PRAGMA table_info` before every `ALTER TABLE ADD COLUMN` —
  never run the file with a bare `executescript`. Change the schema there and
  nowhere else, and keep semicolons out of comments.

## Pages

| route | what |
|---|---|
| `/` | Creative feed — union of outlier posts (`status IN new/idea/developing`) and unmatched GatherOS saves. Cards / gallery / list views, search + platform/creator/topic/source/status filters. Media cards keep stored aspect ratio; text-only cards render a tweet-embed block (with nested quote-tweet when the payload carries it). Matched pairs render one card with both badges. Actions: save as idea, develop this, not for us, sync gatheros. Scoring detail lives only in the collapsed "why this appeared" block. |
| `/creative-feed/[id]`, `/creative-feed/saved/[id]` | Per-card detail pages (post / gather save). |
| `/ideas` | Items pipeline — every idea with stage, sources, sections; inline "New idea". |
| `/ideas/[id]` | The develop page: editable properties, source lineage with media + full text, performance context in plain prose, take-bank suggestions, "Interview me" and "Generate concepts" (one claude CLI call each, 120s timeout, failures land as a one-line error in the section), and inline-editable sections. `/items/[id]` redirects here. |
| `/roster` | X + Instagram creator roster with tier, archetype, followers, yield, baseline medians, per-profile T/F/B weighting, inline add form, and active toggle. |
| `/label` | One unlabeled post at a time (or paste a tweet URL manually), positive/negative + note. Feeds the eval harness. |
| `/briefs` | Stored story briefs by date, rendered as preformatted markdown. |
| `GET /api/health` | `{ok, db, counts}` |
| `GET /api/media/[...path]` | Read-only file server for `data/media/` (jpg/png/gif/webp). |
| `POST /api/ingest` | General signal upsert for X and Instagram. X accepts `tweet_id`; other platforms accept `external_id` or get a deterministic synthetic id. `target_profile` or weighted `target_profiles` routes a signal without leaking it into another profile. |

Example Research Reels payload:

```json
{
  "posts": [{
    "platform": "instagram",
    "external_id": "<notion-page-id>",
    "handle": "stephthefounder",
    "url": "https://www.instagram.com/reel/...",
    "text": "<transcript + caption>",
    "posted_at": "2026-08-19T12:00:00Z",
    "angle_for": "Brett",
    "target_profiles": [{ "profile": "brett", "weight": 1.6 }]
  }]
}
```

## GatherOS importer

`npm run import:gatheros` (also the feed's "sync gatheros" button) mirrors the
GatherOS library into `gather_saves`:

- source db `~/Library/Application Support/GatherOS/libraries/library_default/moodmark.db`
  opened **strictly read-only** (`GATHEROS_DB_PATH` overrides for tests)
- every non-deleted save upserted (skipped when unchanged); thumbs and assets
  **copied** into `data/media/gather/`
- creator + tweet_id parsed from `tweet_meta` json, else from the source URL;
  tags joined comma-separated; tweet captions become the title fallback
- after import, saves are matched to `posts` by tweet_id first, then by
  canonical URL (query stripped, twitter.com unified to x.com)
- `hidden` and `matched_post_id` are app-owned — re-imports never touch them

## Schema overview

- `sources` — the roster. One row per watched account (tier: Lab / Creator /
  Network / Competitor, archetype, why_we_watch, active, yield_pct).
  `x_scrape.py` reads its scrape list from here (`active=1 AND platform='x'`).
- `baselines` — per-account medians over the last N posts, one current row per
  source, replaced on every scrape (replaces `data/baselines.json`).
  `median_save_proxy` backs the null-impressions proxy-Heat guard.
- `posts` — every scored post (replaces the Notion X Signal DB and
  `survivors-*.json`). AI writes the scores (`heat`, `fit`, `angle`,
  `why_it_worked`…) plus first-media info (`media_url`, `thumb_path`,
  `media_width/height`); humans write `status`
  (`new / idea / developing / not_for_us / taken / archived`) and `topic`.
  Survivors (fit ≥ gate) land as `new`; below-gate posts are stored `archived`
  so the label UI still sees them. Re-runs never overwrite a human-set status.
  `baseline_multiple` is NULL when the account had no real baseline — the UI
  prints heat instead, never a fake multiple.
- `feed_profile_sources` / `feed_post_profiles` — weighted creator and
  individual-signal routing for Thomas, Fonzi, and Brett. A targeted signal is
  exclusive to its selected profiles; untagged signals remain shared and are
  ranked independently for each profile.
- `gather_saves` — the GatherOS mirror (see importer above), plus enrichment
  fields owned by the analyzer.
- `items` / `item_sources` / `item_sections` — the content spine
  (DIRECTION.md §3): one item per piece of content moving through the
  pipeline, source lineage snapshots, and the develop page's editable
  markdown sections (`interview` uses a `### Q: … / A: …` format).
- `labels` — taste calibration (positive/negative + note), by `post_id` or by
  bare `tweet_url` for posts not yet scraped. Read by `eval_harness.py`.
  "Not for us" in the feed writes a negative label here.
- `briefs` — one rendered morning brief per date, markdown + stats json.

## How the scripts write into it

The X Engine scripts (`/Users/thomaschow/100M_Hub/Fonzi/Workspaces/X Engine/scripts/`)
open `data/signal.db` directly via python's stdlib `sqlite3` (path from their
`config.json` → `db_path`, `SIGNAL_DB_PATH` overrides) and apply `schema.sql`
first:

- `x_scrape.py` — reads the roster from `sources`, writes `baselines`,
  downloads first-media thumbs into `data/media/x/<tweet_id>.jpg` (10s
  timeout, never fatal; local fixture paths are copied, so fixtures run
  without network).
- `x_score.py` — upserts all scored posts into `posts` incl. media fields
  (never touches a human-set `taken`/`idea`/`developing`/`not_for_us` status
  on re-run).
- `eval_harness.py` — reads `labels`.
- `/story-brief` — reads `posts WHERE status='new'`, inserts into `briefs`.

## Dev

```bash
cd /Users/thomaschow/100M_Hub/Fonzi/Tools/fonzi-signal
npm install
npm run dev          # http://localhost:3211 (also in .claude/launch.json as "fonzi-signal")
npm run build && npm run start
npm run seed:labels     # import the X Engine seed labels.json into `labels`
npm run import:gatheros # mirror the GatherOS library (read-only source)
```

The "Interview me" / "Generate concepts" buttons need a logged-in claude CLI
(`claude login`) — an expired OAuth token shows up as a one-line
"failed: … 401 …" note in the section, nothing crashes.

## Deploy-later plan

v1 is local-only, so no auth on purpose. When this deploys:

1. Vercel, with **deployment protection on** (Vercel Authentication) — that is
   the auth layer, do not ship it open.
2. Swap better-sqlite3 for Postgres (Neon). `schema.sql` is deliberately
   portable — standard SQL, no sqlite-only syntax beyond the pragmas at the
   top; booleans are INTEGER 0/1 and ids are plain INTEGER PRIMARY KEY, both
   of which map mechanically.
3. The python scripts then write through `POST /api/ingest` instead of the
   local file — the route already speaks the same upsert.
