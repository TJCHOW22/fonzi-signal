#!/usr/bin/env node
// Fetch one saved X post by tweet id, write it into the canonical posts table,
// link the GatherOS save, and score it against that creator's real baseline.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.SIGNAL_DB_PATH ?? path.join(ROOT, "data", "signal.db");
const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "xquik~x-tweet-scraper";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const saveId = arg("--save-id");
if (!saveId) throw new Error("usage: hydrate-gather-x.mjs --save-id <id>");
if (!process.env.APIFY_TOKEN) throw new Error("APIFY_TOKEN is not set");

function applySchema(db) {
  const schema = fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8");
  for (const stmt of schema.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
    const body = stmt.replace(/^\s*--.*$/gm, "").trim();
    if (!body) continue;
    const alter = body.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alter && db.pragma(`table_info(${alter[1]})`).some((c) => c.name === alter[2])) continue;
    db.exec(body);
  }
}

async function actor(input) {
  const token = process.env.APIFY_TOKEN;
  const started = await fetch(`${APIFY_BASE}/acts/${ACTOR}/runs?token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
  if (!started.ok) throw new Error(`Apify start failed (${started.status}): ${(await started.text()).slice(0, 500)}`);
  let run = (await started.json()).data;
  const deadline = Date.now() + 240_000;
  while (["READY", "RUNNING"].includes(run.status)) {
    if (Date.now() > deadline) throw new Error("Apify scrape timed out after 4 minutes");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const polled = await fetch(`${APIFY_BASE}/actor-runs/${run.id}?token=${encodeURIComponent(token)}`);
    if (!polled.ok) throw new Error(`Apify poll failed (${polled.status})`);
    run = (await polled.json()).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Apify scrape ended ${run.status}`);
  const result = await fetch(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`);
  if (!result.ok) throw new Error(`Apify dataset failed (${result.status})`);
  return (await result.json()).filter((row) => row.resultType !== "diagnostic");
}

const get = (obj, ...paths) => {
  for (const p of paths) {
    let v = obj;
    for (const key of p.split(".")) v = v?.[key];
    if (v !== undefined && v !== null) return v;
  }
  return null;
};
const num = (v) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const median = (xs) => {
  const values = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!values.length) return null;
  const m = Math.floor(values.length / 2);
  return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
};

function normalize(raw) {
  const author = String(get(raw, "author.userName", "author.username", "user.userName", "user.username", "userName", "username") ?? "").replace(/^@/, "").toLowerCase() || null;
  const id = String(get(raw, "id", "id_str", "tweetId", "tweet_id", "rest_id") ?? "") || null;
  const media = get(raw, "media", "extendedEntities.media", "entities.media");
  const first = Array.isArray(media) ? media[0] : null;
  return {
    id, author,
    url: get(raw, "url", "twitterUrl", "tweetUrl", "tweet_url") ?? (id && author ? `https://x.com/${author}/status/${id}` : null),
    text: get(raw, "text", "fullText", "full_text", "noteTweet.text"),
    created_at: get(raw, "createdAt", "created_at", "date"),
    impressions: num(get(raw, "viewCount", "views", "impressions", "view_count")),
    likes: num(get(raw, "likeCount", "likes", "favorite_count", "favoriteCount")),
    replies: num(get(raw, "replyCount", "replies", "reply_count")),
    reposts: num(get(raw, "retweetCount", "reposts", "retweets", "retweet_count")),
    bookmarks: num(get(raw, "bookmarkCount", "bookmarks", "bookmark_count")),
    quotes: num(get(raw, "quoteCount", "quotes", "quote_count")),
    is_quote: Boolean(get(raw, "isQuoteStatus", "isQuote", "is_quote")),
    is_reply: Boolean(get(raw, "isReply", "is_reply")),
    media_type: get(first ?? {}, "type", "mediaType"),
    media_url: get(first ?? {}, "mediaUrlHttps", "media_url_https", "url", "previewImageUrl", "preview_image_url"),
    raw,
  };
}

function baselineFrom(rows) {
  const eligible = rows.filter((r) => r.impressions > 0 && (r.likes ?? 0) <= r.impressions);
  return {
    median_save_rate: median(eligible.map((r) => (r.bookmarks ?? 0) / r.impressions)),
    median_engagement_rate: median(eligible.map((r) => ((r.likes ?? 0) + 2 * (r.replies ?? 0) + 3 * (r.reposts ?? 0) + 5 * (r.quotes ?? 0)) / r.impressions)),
    median_save_proxy: median(rows.filter((r) => (r.likes ?? 0) > 0).map((r) => (r.bookmarks ?? 0) / r.likes)),
    post_count: rows.length, valid_count: eligible.length,
  };
}

const db = new Database(DB_PATH);
applySchema(db);
const save = db.prepare("SELECT * FROM gather_saves WHERE id = ?").get(saveId);
if (!save) throw new Error("GatherOS save not found");
if (!save.tweet_id || !["x", "twitter"].includes(String(save.source ?? "").toLowerCase())) throw new Error("This save is not a valid X post URL");

const exact = (await actor({ tweetIds: [String(save.tweet_id)], maxItems: 20, outputVariant: "rich", fieldStyle: "camelCase" })).map(normalize);
const post = exact.find((r) => r.id === String(save.tweet_id));
if (!post) throw new Error("X returned no post data. The post may be deleted, private, or unavailable");

const handle = post.author ?? save.creator;
if (!handle) throw new Error("X returned the post without a creator handle");
db.prepare(`INSERT INTO sources (handle, platform, active) VALUES (?, 'x', 0)
  ON CONFLICT(handle) DO NOTHING`).run(handle);
const source = db.prepare("SELECT id FROM sources WHERE handle = ?").get(handle);
let baseline = db.prepare("SELECT * FROM baselines WHERE source_id = ?").get(source.id);
if (!baseline) {
  const history = (await actor({ twitterHandles: [handle], maxItems: 30, outputVariant: "rich", fieldStyle: "camelCase" })).map(normalize);
  const computed = baselineFrom(history);
  if (computed.post_count) {
    db.prepare(`INSERT INTO baselines (source_id, computed_at, median_save_rate, median_engagement_rate,
      median_save_proxy, post_count, valid_count) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET computed_at=CURRENT_TIMESTAMP,
      median_save_rate=excluded.median_save_rate, median_engagement_rate=excluded.median_engagement_rate,
      median_save_proxy=excluded.median_save_proxy, post_count=excluded.post_count, valid_count=excluded.valid_count`)
      .run(source.id, computed.median_save_rate, computed.median_engagement_rate, computed.median_save_proxy, computed.post_count, computed.valid_count);
    baseline = { ...computed };
  }
}

const imp = post.impressions;
const validFull = imp > 0 && (post.likes ?? 0) <= imp;
const saveRate = validFull ? (post.bookmarks ?? 0) / imp : null;
const multiple = saveRate !== null && baseline?.median_save_rate > 0 ? saveRate / baseline.median_save_rate : null;
let heat = null;
let heatBasis = "deferred";
if (validFull && baseline?.median_save_rate !== null && baseline?.median_save_rate !== undefined && baseline?.median_engagement_rate !== null && baseline?.median_engagement_rate !== undefined) {
  const eng = ((post.likes ?? 0) + 2 * (post.replies ?? 0) + 3 * (post.reposts ?? 0) + 5 * (post.quotes ?? 0)) / imp;
  const ratio = (value, base) => base > 0 ? Math.min(value / base, 10) : value > 0 ? 10 : 0;
  heat = Math.min(10, 5 * ratio(saveRate, baseline.median_save_rate) + 3 * ratio(eng, baseline.median_engagement_rate) + 2 * Math.min((post.quotes ?? 0) / Math.max(post.reposts ?? 0, 1), 10));
  heatBasis = "full";
} else if ((post.likes ?? 0) > 0 && baseline?.median_save_proxy > 0) {
  heat = Math.min(10, 5 * Math.min(((post.bookmarks ?? 0) / post.likes) / baseline.median_save_proxy, 10) + 2 * Math.min((post.quotes ?? 0) / Math.max(post.reposts ?? 0, 1), 10));
  heatBasis = "proxy";
}

db.prepare(`INSERT INTO posts (tweet_id, source_id, url, text, posted_at, scraped_at, impressions, likes, replies,
  reposts, bookmarks, quotes, is_quote, is_reply, media_type, media_url, save_rate, baseline_multiple, heat, heat_basis, status, raw)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'archived', ?)
  ON CONFLICT(tweet_id) DO UPDATE SET source_id=excluded.source_id, url=excluded.url, text=excluded.text,
  posted_at=excluded.posted_at, scraped_at=excluded.scraped_at, impressions=excluded.impressions, likes=excluded.likes,
  replies=excluded.replies, reposts=excluded.reposts, bookmarks=excluded.bookmarks, quotes=excluded.quotes,
  is_quote=excluded.is_quote, is_reply=excluded.is_reply, media_type=excluded.media_type, media_url=excluded.media_url,
  save_rate=excluded.save_rate, baseline_multiple=excluded.baseline_multiple, heat=excluded.heat, heat_basis=excluded.heat_basis,
  raw=excluded.raw`).run(post.id, source.id, post.url, post.text, post.created_at, post.impressions, post.likes,
  post.replies, post.reposts, post.bookmarks, post.quotes, post.is_quote ? 1 : 0, post.is_reply ? 1 : 0,
  post.media_type, post.media_url, saveRate, multiple, heat === null ? null : Math.round(heat * 100) / 100,
  heatBasis, JSON.stringify(post.raw));
const stored = db.prepare("SELECT id FROM posts WHERE tweet_id = ?").get(post.id);
db.prepare("UPDATE gather_saves SET matched_post_id = ?, creator = COALESCE(creator, ?) WHERE id = ?").run(stored.id, handle, saveId);
db.close();

console.log(JSON.stringify({ ok: true, tweet_id: post.id, metrics_captured: [post.impressions, post.likes, post.replies, post.reposts, post.bookmarks].filter((v) => v !== null).length, baseline_available: multiple !== null, baseline_posts: baseline?.post_count ?? 0 }));
