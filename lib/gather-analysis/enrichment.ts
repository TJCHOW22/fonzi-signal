import { getDb, type GatherSave } from "@/lib/db";

/** Contract for the future exact-URL X enrichment worker. It is deliberately
 * separate from roster scoring: a bookmark can have real post metrics/media
 * while having no creator baseline and therefore no baseline multiple. */
export type GatherSourceEnrichment = {
  save_id: string;
  source_url: string;
  status: "pending" | "complete" | "error";
  error?: string;
  enriched_at?: string;
  metrics?: {
    impressions: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    bookmarks: number | null;
    quotes: number | null;
  };
  caption?: string | null;
  media_url?: string | null;
  transcript?: string | null;
  baseline_available: false;
};

/** Queue marker only. A URL-fetching worker can consume pending rows later. */
export function requestGatherSourceEnrichment(saveId: string): GatherSave {
  const db = getDb();
  const save = db.prepare("SELECT * FROM gather_saves WHERE id = ?").get(saveId) as GatherSave | undefined;
  if (!save?.source_url) throw new Error("bookmark has no exact source URL");
  db.prepare(`UPDATE gather_saves SET enrichment_status = 'pending',
    enrichment_error = NULL WHERE id = ?`).run(saveId);
  return { ...save, enrichment_status: "pending", enrichment_error: null };
}
