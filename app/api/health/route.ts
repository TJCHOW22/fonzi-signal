import { NextResponse } from "next/server";
import { getDb, dbPath } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return NextResponse.json({
    ok: true,
    db: dbPath(),
    counts: {
      sources: count("sources"),
      posts: count("posts"),
      labels: count("labels"),
      briefs: count("briefs"),
    },
  });
}
