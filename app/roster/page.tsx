import { getDb, type Source } from "@/lib/db";
import { ensureFeedDefaults } from "@/lib/feed/config";
import { addSource, toggleSourceActive, toggleSourceProfile } from "../actions";

export const dynamic = "force-dynamic";

type Row = Source & {
  median_save_rate: number | null;
  median_engagement_rate: number | null;
  post_count: number | null;
  profile_slugs: string | null;
};

export default function Roster() {
  const db = getDb();
  ensureFeedDefaults(db);
  const rows = db
    .prepare(
      `SELECT s.*, b.median_save_rate, b.median_engagement_rate, b.post_count,
         GROUP_CONCAT(fp.slug) profile_slugs
       FROM sources s LEFT JOIN baselines b ON b.source_id = s.id
       LEFT JOIN feed_profile_sources fps ON fps.source_id = s.id
       LEFT JOIN feed_profiles fp ON fp.id = fps.profile_id
       GROUP BY s.id
       ORDER BY s.active DESC, s.tier, s.handle`
    )
    .all() as Row[];

  const pct = (v: number | null) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(2)}%`);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Roster</h1>

      <form action={addSource} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">platform</span>
          <select name="platform" className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950">
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">handle</span>
          <input name="handle" required placeholder="@handle" className="w-36 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">tier</span>
          <select name="tier" className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950">
            <option value="">–</option>
            <option>Lab</option>
            <option>Creator</option>
            <option>Network</option>
            <option>Competitor</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">archetype</span>
          <input name="archetype" className="w-36 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-neutral-500">why we watch</span>
          <input name="why_we_watch" className="w-full min-w-48 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" />
        </label>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900">
          add
        </button>
      </form>

      {rows.length === 0 && <p className="text-sm text-neutral-500">roster is empty — add the first handle above.</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-2 pr-3">handle</th>
                <th className="py-2 pr-3">platform</th>
                <th className="py-2 pr-3">for</th>
                <th className="py-2 pr-3">tier</th>
                <th className="py-2 pr-3">archetype</th>
                <th className="py-2 pr-3">followers</th>
                <th className="py-2 pr-3">yield</th>
                <th className="py-2 pr-3">med save</th>
                <th className="py-2 pr-3">med eng</th>
                <th className="py-2 pr-3">n</th>
                <th className="py-2 pr-3">why we watch</th>
                <th className="py-2">active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-neutral-100 dark:border-neutral-900 ${r.active ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-3 font-medium">@{r.handle}</td>
                  <td className="py-2 pr-3 text-xs text-neutral-500">{r.platform}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      {["thomas", "fonzi", "brett"].map((slug) => {
                        const selected = (r.profile_slugs ?? "").split(",").includes(slug);
                        return (
                          <form action={toggleSourceProfile} key={slug}>
                            <input type="hidden" name="source_id" value={r.id} />
                            <input type="hidden" name="profile" value={slug} />
                            <button aria-pressed={selected} title={`show @${r.handle} heavier for ${slug}`}
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${selected ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900" : "border-neutral-300 text-neutral-500 dark:border-neutral-700"}`}>
                              {slug === "thomas" ? "T" : slug === "fonzi" ? "F" : "B"}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{r.tier ?? "–"}</td>
                  <td className="py-2 pr-3">{r.archetype ?? "–"}</td>
                  <td className="py-2 pr-3">{r.followers ?? "–"}</td>
                  <td className="py-2 pr-3">{r.yield_pct !== null ? `${r.yield_pct}%` : "–"}</td>
                  <td className="py-2 pr-3">{pct(r.median_save_rate)}</td>
                  <td className="py-2 pr-3">{pct(r.median_engagement_rate)}</td>
                  <td className="py-2 pr-3">{r.post_count ?? "–"}</td>
                  <td className="max-w-64 truncate py-2 pr-3 text-neutral-600 dark:text-neutral-400">{r.why_we_watch ?? ""}</td>
                  <td className="py-2">
                    <form action={toggleSourceActive}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className={`rounded-full border px-2 py-0.5 text-xs ${r.active ? "border-green-600 text-green-700 dark:text-green-400" : "border-neutral-400 text-neutral-500"}`}>
                        {r.active ? "active" : "off"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
