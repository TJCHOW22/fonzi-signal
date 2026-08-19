import { getDb, type Post } from "@/lib/db";
import { addLabel } from "../actions";

export const dynamic = "force-dynamic";

export default function Label() {
  const db = getDb();

  const next = db
    .prepare(
      `SELECT p.*, src.handle AS handle
       FROM posts p
       LEFT JOIN sources src ON src.id = p.source_id
       WHERE p.id NOT IN (SELECT post_id FROM labels WHERE post_id IS NOT NULL)
       ORDER BY p.posted_at DESC
       LIMIT 1`
    )
    .get() as (Post & { handle: string | null }) | undefined;

  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN label = 'positive' THEN 1 ELSE 0 END) AS positive
       FROM labels`
    )
    .get() as { total: number; positive: number | null };

  const btn =
    "rounded px-6 py-3 text-base font-semibold text-white disabled:opacity-40";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Label</h1>
        <span className="text-sm text-neutral-500">
          {counts.total} labeled · {counts.positive ?? 0} positive
        </span>
      </div>

      {next ? (
        <div className="space-y-4 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-baseline gap-3 text-sm">
            <span className="font-medium">@{next.handle ?? "unknown"}</span>
            <span className="text-xs text-neutral-500">{next.posted_at?.slice(0, 16)}</span>
            <span className="text-xs text-neutral-500">heat {next.heat ?? "–"} · fit {next.fit ?? "–"}</span>
            {next.url && (
              <a href={next.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                open tweet ↗
              </a>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">{next.text}</p>
          <form action={addLabel} className="space-y-3">
            <input type="hidden" name="post_id" value={next.id} />
            <input
              name="note"
              placeholder="why (one line, optional)"
              className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
            />
            <div className="flex gap-3">
              <button name="label" value="positive" className={`${btn} bg-green-700 hover:bg-green-600`}>
                positive
              </button>
              <button name="label" value="negative" className={`${btn} bg-red-800 hover:bg-red-700`}>
                negative
              </button>
            </div>
          </form>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">no unlabeled posts in the DB. paste one below or run the scrape.</p>
      )}

      <div className="space-y-3 rounded border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
        <h2 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          manual label (post not scraped yet)
        </h2>
        <form action={addLabel} className="space-y-3">
          <input
            name="tweet_url"
            required
            placeholder="https://x.com/…/status/…"
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          />
          <textarea
            name="manual_text"
            rows={2}
            placeholder="post text (optional)"
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          />
          <input
            name="note"
            placeholder="why (one line, optional)"
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          />
          <div className="flex gap-3">
            <button name="label" value="positive" className={`${btn} bg-green-700 hover:bg-green-600`}>
              positive
            </button>
            <button name="label" value="negative" className={`${btn} bg-red-800 hover:bg-red-700`}>
              negative
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
