import Link from "next/link";
import { getDb, type Brief } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Briefs() {
  const rows = getDb()
    .prepare("SELECT id, date, stats, created_at FROM briefs ORDER BY date DESC LIMIT 90")
    .all() as Omit<Brief, "markdown">[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Briefs</h1>
      {rows.length === 0 && (
        <p className="text-sm text-neutral-500">no briefs stored yet — /story-brief writes one per day.</p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((b) => {
          let stats = "";
          try {
            const s = b.stats ? (JSON.parse(b.stats) as Record<string, unknown>) : null;
            if (s) stats = Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(" · ");
          } catch {
            /* unparseable stats stay blank */
          }
          return (
            <li key={b.id} className="py-3">
              <Link href={`/briefs/${b.date}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                {b.date}
              </Link>
              {stats && <p className="text-xs text-neutral-500">{stats}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
