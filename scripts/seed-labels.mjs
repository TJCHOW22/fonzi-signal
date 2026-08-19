#!/usr/bin/env node
// seed:labels — import the X Engine seed labels (scripts/data/labels.json,
// Seb's 168/477/$203k positive) into the `labels` table. Idempotent: a seed
// row already present (same join key + label) is skipped.
// Usage: npm run seed:labels [-- /path/to/labels.json]

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH =
  process.env.SIGNAL_DB_PATH ?? path.join(APP_ROOT, "data", "signal.db");
const DEFAULT_LABELS =
  "/Users/thomaschow/100M_Hub/Fonzi/Workspaces/X Engine/scripts/data/labels.json";
const labelsPath = process.argv[2] ?? DEFAULT_LABELS;

if (!fs.existsSync(labelsPath)) {
  console.error(`error: no labels file at ${labelsPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.exec(fs.readFileSync(path.join(APP_ROOT, "schema.sql"), "utf8"));

const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8")).labels ?? [];
const findPost = db.prepare("SELECT id FROM posts WHERE tweet_id = ?");
const exists = db.prepare(
  `SELECT 1 FROM labels
   WHERE label = ? AND source = 'seed'
     AND ((post_id IS NOT NULL AND post_id = ?) OR (tweet_url = ?))`
);
const insert = db.prepare(
  "INSERT INTO labels (post_id, tweet_url, label, source, note) VALUES (?, ?, ?, 'seed', ?)"
);

let imported = 0;
let skipped = 0;
for (const l of labels) {
  if (!l.label) continue;
  const post = l.id ? findPost.get(String(l.id)) : undefined;
  // join key for not-yet-scraped posts: the url when present, else the raw id
  // string so eval_harness can still match on the /status/<id> segment later.
  const tweetUrl = l.url ?? (l.id ? String(l.id) : null);
  if (exists.get(l.label, post?.id ?? -1, tweetUrl)) {
    skipped++;
    continue;
  }
  insert.run(post?.id ?? null, tweetUrl, l.label, l.note ?? null);
  imported++;
}

console.log(
  `seed:labels -> ${DB_PATH}\n${imported} imported, ${skipped} already present (${labels.length} in ${labelsPath})`
);
