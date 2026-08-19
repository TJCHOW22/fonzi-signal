import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, type Brief } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const brief = getDb()
    .prepare("SELECT * FROM briefs WHERE date = ?")
    .get(date) as Brief | undefined;
  if (!brief) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-lg font-semibold">brief · {brief.date}</h1>
        <Link href="/briefs" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← all briefs
        </Link>
      </div>
      {/* briefs are markdown; v1 renders them as preformatted text on purpose —
          no md-renderer dependency until someone actually needs styled output */}
      <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-neutral-200 p-4 font-mono text-sm leading-6 dark:border-neutral-800">
        {brief.markdown}
      </pre>
    </div>
  );
}
