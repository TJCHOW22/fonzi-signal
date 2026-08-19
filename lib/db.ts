import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// data/signal.db lives next to the app (gitignored). SIGNAL_DB_PATH overrides
// for tests. schema.sql at the repo root is the single source of truth and is
// applied idempotently on every open. CREATE statements are IF NOT EXISTS;
// ALTER TABLE ADD COLUMN has no IF NOT EXISTS in sqlite, so applySchema()
// checks PRAGMA table_info before each ALTER instead of exec-ing the file raw.
const DB_PATH =
  process.env.SIGNAL_DB_PATH ?? path.join(process.cwd(), "data", "signal.db");

let db: Database.Database | null = null;

export function applySchema(database: Database.Database, schema: string) {
  // Split on statement-terminating semicolons (schema.sql keeps semicolons
  // out of comments and string literals on purpose — see its header note).
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    const body = stmt.replace(/^\s*--.*$/gm, "").trim();
    if (!body) continue;
    const alter = body.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alter) {
      const cols = database.pragma(`table_info(${alter[1]})`) as { name: string }[];
      if (cols.some((c) => c.name === alter[2])) continue;
    }
    database.exec(body);
  }
}

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  const schema = fs.readFileSync(path.join(process.cwd(), "schema.sql"), "utf8");
  applySchema(db, schema);
  return db;
}

export function dbPath(): string {
  return DB_PATH;
}

export function mediaDir(): string {
  return path.join(path.dirname(DB_PATH), "media");
}

export type Source = {
  id: number;
  handle: string;
  display_name: string | null;
  platform: string;
  tier: string | null;
  archetype: string | null;
  why_we_watch: string | null;
  followers: number | null;
  active: number;
  yield_pct: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: number;
  tweet_id: string;
  source_id: number | null;
  url: string | null;
  text: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  bookmarks: number | null;
  quotes: number | null;
  is_quote: number;
  is_reply: number;
  media_type: string | null;
  save_rate: number | null;
  baseline_multiple: number | null;
  heat: number | null;
  heat_basis: string | null;
  fit: number | null;
  fit_subscores: string | null;
  angle: string | null;
  angle_for: string | null;
  why_it_worked: string | null;
  lane: string | null;
  status: string;
  raw: string | null;
  media_url: string | null;
  thumb_path: string | null;
  media_width: number | null;
  media_height: number | null;
  topic: string | null;
  platform: string;
  external_id: string | null;
};

export type GatherSave = {
  id: string;
  kind: string | null;
  source: string | null;
  title: string | null;
  source_url: string | null;
  tweet_id: string | null;
  creator: string | null;
  thumb_path: string | null;
  media_width: number | null;
  media_height: number | null;
  notes: string | null;
  tags: string | null;
  saved_at: string | null;
  imported_at: string | null;
  matched_post_id: number | null;
  hidden: number;
  content_text: string | null;
  media_path: string | null;
  media_type: string | null;
  enrichment_status: "not_requested" | "pending" | "complete" | "error" | null;
  enrichment_error: string | null;
  enriched_at: string | null;
};

export type GatherAnalysisStatus = "pending" | "running" | "complete" | "error";

export type GatherContentAnalysis = {
  thumbnail_opening_frame: { description: string; effectiveness: string; evidence: string[] };
  visible_text_hook: { text: string | null; analysis: string; evidence: string[] };
  spoken_text_hook: { text: string | null; analysis: string; evidence: string[] };
  transcript_or_summary: string;
  format: string;
  pacing_structure: string;
  why_likely_worked: { analysis: string; evidence: string[]; performance_claim: boolean };
  reusable_pattern: string;
  possible_fonzi_angle: { angle: string | null; grounding: string; needs_founder_input: boolean };
  confidence: "low" | "medium" | "high";
  limitations: string[];
};

export type GatherSaveAnalysis = {
  id: number;
  gather_save_id: string;
  analysis_version: string;
  input_hash: string;
  status: GatherAnalysisStatus;
  result_json: string | null;
  error: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  started_at: string | null;
  analyzed_at: string | null;
  created_at: string;
};

export function getLatestGatherAnalysis(saveId: string):
  (GatherSaveAnalysis & { result: GatherContentAnalysis | null }) | undefined {
  const row = getDb().prepare(`
    SELECT * FROM gather_save_analyses WHERE gather_save_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(saveId) as GatherSaveAnalysis | undefined;
  if (!row) return undefined;
  let result: GatherContentAnalysis | null = null;
  if (row.result_json) {
    try { result = JSON.parse(row.result_json) as GatherContentAnalysis; } catch { result = null; }
  }
  return { ...row, result };
}

export type Item = {
  id: number;
  title: string;
  stage: string;
  person: string | null;
  lane: string | null;
  angle: string | null;
  notes: string | null;
  format: string | null;
  target_platform: string | null;
  owner: string | null;
  research_status: string;
  research_summary: string | null;
  research_priority: number;
  created_at: string;
  updated_at: string;
};

export type ItemSource = {
  id: number;
  item_id: number;
  post_id: number | null;
  gather_save_id: string | null;
  url: string | null;
  source_type: string | null;
  source_title: string | null;
  source_text: string | null;
  media_url: string | null;
  thumb_path: string | null;
  why_it_worked: string | null;
  saved_note: string | null;
  created_at: string;
};

export type ItemSection = {
  id: number;
  item_id: number;
  section: string;
  content_md: string | null;
  updated_at: string;
};

export const ITEM_STAGES = [
  "inbox", "exploring", "drafting", "ready_to_record", "editing",
  "ready_to_publish", "published",
] as const;

export type ItemStage = (typeof ITEM_STAGES)[number];

export const ITEM_SECTION_DEFINITIONS = [
  { key: "source_notes", label: "My read + notes", hint: "What stood out while reading or watching the source?" },
  { key: "agree_disagree", label: "Where we agree / disagree", hint: "Take a position. Separate the useful truth from what we would challenge." },
  { key: "evidence_questions", label: "Questions + evidence to pull", hint: "Facts to verify, related articles, examples, customer proof, and open questions." },
  { key: "why_it_worked", label: "Why it worked", hint: "The useful mechanism, not just the metric." },
  { key: "pattern", label: "Reusable pattern", hint: "What can we borrow without copying the source?" },
  { key: "founder_takes", label: "Founder takes", hint: "Real Thomas, Brett, or Seb opinions and evidence." },
  { key: "raw_material", label: "Interview + raw material", hint: "Voice dump, interview answers, stories, proof, and quotes." },
  { key: "concepts", label: "Concepts + drafts", hint: "Candidate directions and working drafts." },
  { key: "final_script", label: "Final script", hint: "The approved, record-ready version." },
  { key: "shot_list", label: "Shot list + assets", hint: "A-roll, B-roll, graphics, links, and production notes." },
  { key: "platform_variants", label: "Platform variants", hint: "X, LinkedIn, Instagram, TikTok, and YouTube versions." },
  { key: "publication", label: "Publication", hint: "Destinations, URLs, dates, and status." },
  { key: "performance", label: "Performance", hint: "Results against the account baseline." },
  { key: "lessons", label: "Lessons", hint: "What the system and team should repeat or change." },
] as const;

export type ItemSectionKey = (typeof ITEM_SECTION_DEFINITIONS)[number]["key"];
export type ItemWithCounts = Item & { source_count: number; section_count: number };

export function listAngleFeedItems(): ItemWithCounts[] {
  return getDb().prepare(`
    SELECT i.*, COUNT(DISTINCT s.id) AS source_count,
      COUNT(DISTINCT sec.id) AS section_count
    FROM items i
    LEFT JOIN item_sources s ON s.item_id = i.id
    LEFT JOIN item_sections sec ON sec.item_id = i.id AND COALESCE(sec.content_md, '') != ''
    WHERE i.stage = 'exploring' OR i.research_status IN ('queued','researching','research_ready','needs_input')
    GROUP BY i.id
    ORDER BY CASE i.research_status WHEN 'research_ready' THEN 1 WHEN 'needs_input' THEN 2 WHEN 'researching' THEN 3 WHEN 'queued' THEN 4 ELSE 5 END,
      i.research_priority DESC, i.updated_at DESC
  `).all() as ItemWithCounts[];
}

export function listItems(): ItemWithCounts[] {
  return getDb().prepare(`
    SELECT i.*, COUNT(DISTINCT s.id) AS source_count,
      COUNT(DISTINCT sec.id) AS section_count
    FROM items i
    LEFT JOIN item_sources s ON s.item_id = i.id
    LEFT JOIN item_sections sec ON sec.item_id = i.id AND COALESCE(sec.content_md, '') != ''
    GROUP BY i.id
    ORDER BY CASE i.stage
      WHEN 'inbox' THEN 1 WHEN 'idea' THEN 1
      WHEN 'exploring' THEN 2 WHEN 'developing' THEN 2
      WHEN 'drafting' THEN 3 WHEN 'scripting' THEN 3
      WHEN 'ready_to_record' THEN 4 WHEN 'production' THEN 4
      WHEN 'editing' THEN 5 WHEN 'ready_to_publish' THEN 6
      WHEN 'published' THEN 7 ELSE 8 END, i.updated_at DESC
  `).all() as ItemWithCounts[];
}

export function getItem(id: number): Item | undefined {
  return getDb().prepare("SELECT * FROM items WHERE id = ?").get(id) as Item | undefined;
}

export function getItemSources(itemId: number): ItemSource[] {
  return getDb().prepare("SELECT * FROM item_sources WHERE item_id = ? ORDER BY id")
    .all(itemId) as ItemSource[];
}

export function getItemSections(itemId: number): Record<string, string> {
  const rows = getDb().prepare("SELECT section, content_md FROM item_sections WHERE item_id = ?")
    .all(itemId) as ItemSection[];
  return Object.fromEntries(rows.map((row) => [row.section, row.content_md ?? ""]));
}

export type Brief = {
  id: number;
  date: string;
  markdown: string;
  stats: string | null;
  created_at: string;
};
