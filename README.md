# fonzi-signal

Local-first Media and Drafts workspace for Fonzi. Media is the immutable
source library; Drafts turns one source into one versioned script. SQLite
stores the source link, generation state, revisions, provenance, artifacts,
and notifications.

- **Stack:** Next.js App Router, TypeScript, React, better-sqlite3, and the OpenAI Responses API.
- **Database:** `data/signal.db` by default. `SIGNAL_DB_PATH` overrides it for tests.
- **Schema:** `schema.sql` is the single source of truth and is applied idempotently.
- **Media:** files under `data/media/` are served read-only by the media API.

## Pages

| route | what |
|---|---|
| `/` | Media and Drafts shell. Create starts or resumes the one linked draft without opening it automatically. |
| `/drafts/[id]` | Immutable source beside the editable draft, with autosave and revision history. |

## APIs

| route | what |
|---|---|
| `GET /api/health` | Database health and counts. |
| `POST /api/ingest` | Upserts external media signals. |
| `GET /api/media/[...path]` | Traversal-safe, read-only files from `data/media/`. |
| `GET, POST /api/drafts` | Lists drafts or creates the idempotent draft for a source. |
| `GET, PATCH /api/drafts/[id]` | Reads or updates a draft. |
| `POST /api/drafts/[id]/generate` | Runs isolated generation for the linked draft. |
| `PATCH /api/drafts/[id]/production-stage` | Updates the human-controlled production stage. |
| `GET /api/draft-notifications` | Lists draft completion notifications. |
| `PATCH /api/draft-notifications/[id]` | Marks a notification read or unread. |

## Runtime contract

The database is authoritative. One source and workflow map to one draft.
Generation can advance automatically after Create, but completion only creates
a notification. It never opens or publishes the result.

Draft generation needs `OPENAI_API_KEY` or `CODEX_API_KEY`.
`CODEX_DRAFT_MODEL` defaults to `gpt-5.6-sol`. Each request sends the Blueprint
skill as instructions, the selected transcript as input, no tools, and no
stored response. A copied hook gets one isolated retry before generation fails.

## Development

```bash
cd /Users/thomaschow/100M_Hub/Fonzi/Tools/fonzi-signal
npm install
npm run dev
npm run test:media-drafts
npm run build
```

The normal test suite uses a fake Responses API client. Run
`npm run test:media-drafts:live` only when you intend to make one live model
call.
