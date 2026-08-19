#!/usr/bin/env node
// Queue current creative teardowns after metric hydration changes the input.
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.SIGNAL_DB_PATH ?? path.join(ROOT, "data", "signal.db");
const VERSION = "gather-multimodal-v2";
const MODEL = process.env.GATHER_ANALYSIS_MODEL?.trim() || "gemini-3.1-pro-preview";
const db = new Database(DB_PATH);

function fingerprint(relativePath) {
  if (!relativePath) return null;
  const file = path.join(path.dirname(DB_PATH), "media", relativePath);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return { name: path.basename(file), bytes: stat.size, modified_ms: stat.mtimeMs };
}

const saves = db.prepare(`SELECT g.*,p.impressions,p.likes,p.replies,p.reposts,p.bookmarks,p.quotes
  FROM gather_saves g LEFT JOIN posts p ON p.id=g.matched_post_id
  WHERE g.tweet_id IS NOT NULL AND lower(g.source) IN ('x','twitter')
    AND (g.media_path IS NOT NULL OR g.thumb_path IS NOT NULL)`).all();
const enqueue = db.prepare(`INSERT INTO gather_save_analyses
  (gather_save_id,analysis_version,input_hash,status,next_attempt_at)
  VALUES (?,?,?,'pending',CURRENT_TIMESTAMP)
  ON CONFLICT(gather_save_id,analysis_version,input_hash) DO NOTHING`);
let queued = 0;
for (const save of saves) {
  const input = {
    version: VERSION, provider: "gemini", model: MODEL, id: save.id,
    source_url: save.source_url, creator: save.creator,
    caption: save.content_text ?? save.title,
    media: fingerprint(save.media_path), thumbnail: fingerprint(save.thumb_path),
    metrics: save.matched_post_id ? {
      impressions: save.impressions, likes: save.likes, replies: save.replies,
      reposts: save.reposts, bookmarks: save.bookmarks, quotes: save.quotes,
    } : null,
  };
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  queued += enqueue.run(save.id, VERSION, hash).changes;
}
db.close();
console.log(JSON.stringify({ eligible: saves.length, queued }));
