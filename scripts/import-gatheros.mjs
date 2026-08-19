#!/usr/bin/env node
// import-gatheros.mjs — mirror the GatherOS save library into gather_saves.
//
// Source db (STRICTLY READ-ONLY, opened with the readonly flag):
//   ~/Library/Application Support/GatherOS/libraries/library_default/moodmark.db
//
// - every non-deleted save -> upsert into gather_saves (skip when unchanged)
// - thumb files are COPIED into data/media/gather/<save_id><ext>; the
//   GatherOS path is never referenced after import
// - tags joined comma-separated; creator + tweet_id parsed from tweet_meta
//   json when present, else from source_url (x.com/<user>/status/<id>)
// - after import: match saves to posts by tweet_id first, then by canonical
//   source_url (query stripped, twitter.com unified to x.com)
// - hidden and matched_post_id are app-owned: never overwritten on re-import
//   (matched_post_id is only ever filled in when NULL)
//
// Run: npm run import:gatheros   (also called by the feed's "sync gatheros"
// server action). SIGNAL_DB_PATH / GATHEROS_DB_PATH override for tests.

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNAL_DB =
  process.env.SIGNAL_DB_PATH ?? path.join(ROOT, "data", "signal.db");
const GATHEROS_DB =
  process.env.GATHEROS_DB_PATH ??
  path.join(
    os.homedir(),
    "Library/Application Support/GatherOS/libraries/library_default/moodmark.db"
  );
const MEDIA_DIR = path.join(path.dirname(SIGNAL_DB), "media", "gather");
const ANALYSIS_VERSION = "gather-multimodal-v2";
const ANALYSIS_MODEL = process.env.GATHER_ANALYSIS_MODEL?.trim() || "gemini-3.1-pro-preview";

function fingerprint(relativePath) {
  if (!relativePath) return null;
  const file = path.join(path.dirname(SIGNAL_DB), "media", relativePath);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return { name: path.basename(file), bytes: stat.size, modified_ms: stat.mtimeMs };
}

function analysisInputHash(save, metrics) {
  return createHash("sha256").update(JSON.stringify({
    version: ANALYSIS_VERSION,
    provider: "gemini",
    model: ANALYSIS_MODEL,
    id: save.id,
    source_url: save.source_url,
    creator: save.creator,
    caption: save.content_text ?? save.title,
    media: fingerprint(save.media_path),
    thumbnail: fingerprint(save.thumb_path),
    metrics,
  })).digest("hex");
}

function applySchema(db, schema) {
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    const body = stmt.replace(/^\s*--.*$/gm, "").trim();
    if (!body) continue;
    const alter = body.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alter) {
      const cols = db.pragma(`table_info(${alter[1]})`);
      if (cols.some((c) => c.name === alter[2])) continue;
    }
    db.exec(body);
  }
}

// canonical tweet URL: strip query/hash, unify twitter.com -> x.com
function canonicalUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "").replace("twitter.com", "x.com");
    return `https://${host}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

function tweetIdFrom(sourceUrl) {
  const m = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/.exec(sourceUrl ?? "");
  return m ? m[1] : null;
}

function creatorFrom(sourceUrl) {
  const m = /(?:x|twitter)\.com\/([^/]+)\/status\//.exec(sourceUrl ?? "");
  return m ? m[1].toLowerCase() : null;
}

export function importGatherOS() {
  if (!fs.existsSync(GATHEROS_DB)) {
    return { ok: false, error: `GatherOS db not found at ${GATHEROS_DB}` };
  }

  const signal = new Database(SIGNAL_DB);
  applySchema(signal, fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8"));

  // READ-ONLY. Never open this db writable, ever.
  const gather = new Database(GATHEROS_DB, { readonly: true, fileMustExist: true });

  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  const saves = gather
    .prepare(
      `SELECT s.id, s.thumb_path AS src_thumb, s.file_path AS src_media,
              s.title, s.source_url, s.width,
              s.height, s.created_at, s.notes, s.kind, s.tweet_meta, s.source,
              (SELECT group_concat(t.name, ',') FROM save_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.save_id = s.id) AS tags
       FROM saves s WHERE s.deleted_at IS NULL`
    )
    .all();
  gather.close();

  const existing = new Map(
    signal
      .prepare(
        `SELECT id, kind, source, title, source_url, tweet_id, creator,
                thumb_path, media_width, media_height, notes, tags, saved_at,
                content_text, media_path, media_type
         FROM gather_saves`
      )
      .all()
      .map((r) => [r.id, r])
  );

  const upsert = signal.prepare(
    `INSERT INTO gather_saves (id, kind, source, title, source_url, tweet_id,
        creator, thumb_path, media_width, media_height, notes, tags, saved_at,
        imported_at, content_text, media_path, media_type)
     VALUES (@id, @kind, @source, @title, @source_url, @tweet_id, @creator,
        @thumb_path, @media_width, @media_height, @notes, @tags, @saved_at,
        @imported_at, @content_text, @media_path, @media_type)
     ON CONFLICT (id) DO UPDATE SET
        kind = excluded.kind, source = excluded.source, title = excluded.title,
        source_url = excluded.source_url, tweet_id = excluded.tweet_id,
        creator = excluded.creator, thumb_path = excluded.thumb_path,
        media_width = excluded.media_width, media_height = excluded.media_height,
        notes = excluded.notes, tags = excluded.tags,
        saved_at = excluded.saved_at, imported_at = excluded.imported_at,
        content_text = excluded.content_text, media_path = excluded.media_path,
        media_type = excluded.media_type`
    // hidden + matched_post_id deliberately untouched — app-owned.
  );

  let imported = 0;
  let unchanged = 0;
  let thumbsCopied = 0;
  let mediaCopied = 0;
  const changedIds = [];

  for (const s of saves) {
    // tweet_meta json when present: {authorName, authorHandle: "@x", caption,
    // media: [{type,url}], imageUrls, videoUrl, posterUrl, quoted}
    let meta = null;
    if (s.tweet_meta) {
      try {
        meta = JSON.parse(s.tweet_meta);
      } catch {
        meta = null;
      }
    }
    const creator =
      (meta?.authorHandle ? String(meta.authorHandle).replace(/^@/, "").toLowerCase() : null) ??
      creatorFrom(s.source_url);
    const tweetId = tweetIdFrom(s.source_url);
    // tweet-kind saves often have no title — fall back to the tweet caption
    // so the feed card has a hook line.
    const title =
      (s.title && s.title.trim()) ||
      (meta?.caption ? String(meta.caption).slice(0, 200) : null);

    let thumbRel = null;
    if (s.src_thumb && fs.existsSync(s.src_thumb)) {
      const ext = path.extname(s.src_thumb) || ".jpg";
      thumbRel = `gather/${s.id}${ext}`;
      const dest = path.join(MEDIA_DIR, `${s.id}${ext}`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(s.src_thumb, dest);
        thumbsCopied++;
      }
    }

    // Copy the saved asset into app-owned storage. Never pass a GatherOS path
    // to the analyzer and never mutate the source file.
    let mediaRel = null;
    if (s.src_media && fs.existsSync(s.src_media)) {
      const ext = path.extname(s.src_media) || (s.kind === "video" ? ".mp4" : ".jpg");
      mediaRel = `gather/${s.id}-media${ext}`;
      const dest = path.join(MEDIA_DIR, `${s.id}-media${ext}`);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(s.src_media, dest);
        mediaCopied++;
      }
    }

    const row = {
      id: s.id,
      kind: s.kind ?? null,
      source: s.source ?? null,
      title: title ?? null,
      source_url: s.source_url ?? null,
      tweet_id: tweetId,
      creator,
      thumb_path: thumbRel,
      media_width: s.width ?? null,
      media_height: s.height ?? null,
      notes: s.notes ?? null,
      tags: s.tags ?? null,
      saved_at: s.created_at ? new Date(Number(s.created_at)).toISOString() : null,
      content_text: meta?.caption ? String(meta.caption) : title ?? null,
      media_path: mediaRel,
      media_type: s.kind ?? meta?.media?.[0]?.type ?? null,
    };

    const prev = existing.get(s.id);
    const same =
      prev &&
      ["kind", "source", "title", "source_url", "tweet_id", "creator",
        "thumb_path", "media_width", "media_height", "notes", "tags", "saved_at",
        "content_text", "media_path", "media_type",
      ].every((k) => (prev[k] ?? null) === (row[k] ?? null));
    if (same) {
      unchanged++;
      continue;
    }
    upsert.run({ ...row, imported_at: new Date().toISOString() });
    imported++;
    changedIds.push(s.id);
  }

  // -------- match saves to posts: tweet_id first, then canonical url
  const byTweetId = signal
    .prepare(
      `UPDATE gather_saves SET matched_post_id =
          (SELECT p.id FROM posts p WHERE p.tweet_id = gather_saves.tweet_id)
       WHERE matched_post_id IS NULL AND tweet_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM posts p WHERE p.tweet_id = gather_saves.tweet_id)`
    )
    .run().changes;

  let byUrl = 0;
  const unmatched = signal
    .prepare(
      `SELECT id, source_url FROM gather_saves
       WHERE matched_post_id IS NULL AND source_url IS NOT NULL`
    )
    .all();
  if (unmatched.length > 0) {
    const postUrls = new Map();
    for (const p of signal.prepare(`SELECT id, url FROM posts WHERE url IS NOT NULL`).all()) {
      const c = canonicalUrl(p.url);
      if (c) postUrls.set(c, p.id);
    }
    const setMatch = signal.prepare(`UPDATE gather_saves SET matched_post_id = ? WHERE id = ?`);
    for (const g of unmatched) {
      const c = canonicalUrl(g.source_url);
      if (c && postUrls.has(c)) {
        setMatch.run(postUrls.get(c), g.id);
        byUrl++;
      }
    }
  }

  let queuedForAnalysis = 0;
  const loadSave = signal.prepare(`SELECT * FROM gather_saves WHERE id = ?`);
  const loadMetrics = signal.prepare(`SELECT impressions, likes, replies, reposts, bookmarks, quotes FROM posts WHERE id = ?`);
  const enqueue = signal.prepare(`INSERT INTO gather_save_analyses
      (gather_save_id, analysis_version, input_hash, status, next_attempt_at)
    VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(gather_save_id, analysis_version, input_hash) DO NOTHING`);
  const supersede = signal.prepare(`UPDATE gather_save_analyses
    SET status = 'error', error = 'superseded by newer bookmark input', analyzed_at = CURRENT_TIMESTAMP
    WHERE gather_save_id = ? AND analysis_version = ? AND input_hash <> ?
      AND status IN ('pending', 'error')`);
  for (const id of changedIds) {
    const save = loadSave.get(id);
    if (!save) continue;
    const metrics = save.matched_post_id ? loadMetrics.get(save.matched_post_id) ?? null : null;
    const hash = analysisInputHash(save, metrics);
    supersede.run(id, ANALYSIS_VERSION, hash);
    queuedForAnalysis += enqueue.run(id, ANALYSIS_VERSION, hash).changes;
  }

  const total = signal.prepare(`SELECT COUNT(*) AS n FROM gather_saves`).get().n;
  signal.close();

  return {
    ok: true,
    scanned: saves.length,
    imported,
    unchanged,
    thumbsCopied,
    mediaCopied,
    queuedForAnalysis,
    matchedByTweetId: byTweetId,
    matchedByUrl: byUrl,
    total,
  };
}

// CLI entry
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = importGatherOS();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
