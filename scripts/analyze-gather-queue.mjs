#!/usr/bin/env node
// Background worker for GatherOS creative teardowns. Safe to start more than
// once: each row is atomically claimed in SQLite and unchanged inputs are
// protected by the queue's unique constraint.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.SIGNAL_DB_PATH ?? path.join(ROOT, "data", "signal.db");
const MEDIA_ROOT = path.join(path.dirname(DB_PATH), "media");
const VERSION = "gather-multimodal-v2";
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.GATHER_ANALYSIS_CONCURRENCY) || 2));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.GATHER_ANALYSIS_MAX_ATTEMPTS) || 3);
const MODEL = process.env.GATHER_ANALYSIS_MODEL?.trim() || "gemini-3.1-pro-preview";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com";
const REQUEST_TIMEOUT_MS = 10 * 60_000;

const db = new Database(DB_PATH);
db.pragma("busy_timeout = 5000");

// A killed worker must not strand a row forever.
db.prepare(`UPDATE gather_save_analyses
  SET status = 'error', error = 'analysis worker stopped before completion',
      next_attempt_at = CURRENT_TIMESTAMP
  WHERE status = 'running' AND started_at < datetime('now', '-10 minutes')`).run();

function safeMedia(relative) {
  if (!relative) return null;
  const candidate = path.resolve(MEDIA_ROOT, relative);
  if (!candidate.startsWith(`${path.resolve(MEDIA_ROOT)}${path.sep}`)) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

const claimNext = db.transaction(() => {
  const row = db.prepare(`SELECT a.id, a.gather_save_id, a.input_hash, a.attempt_count
    FROM gather_save_analyses a
    WHERE a.analysis_version = ?
      AND a.status IN ('pending', 'error')
      AND a.attempt_count < ?
      AND (a.next_attempt_at IS NULL OR a.next_attempt_at <= CURRENT_TIMESTAMP)
      AND (a.error IS NULL OR a.error <> 'superseded by newer bookmark input')
      AND NOT EXISTS (
        SELECT 1 FROM gather_save_analyses newer
        WHERE newer.gather_save_id = a.gather_save_id
          AND newer.analysis_version = a.analysis_version AND newer.id > a.id
      )
    ORDER BY a.created_at, a.id LIMIT 1`).get(VERSION, MAX_ATTEMPTS);
  if (!row) return null;
  const claimed = db.prepare(`UPDATE gather_save_analyses
    SET status = 'running', error = NULL, started_at = CURRENT_TIMESTAMP,
        attempt_count = attempt_count + 1, next_attempt_at = NULL
    WHERE id = ? AND status IN ('pending', 'error')`).run(row.id);
  return claimed.changes === 1 ? row : null;
});

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) throw new Error("media analysis needs GEMINI_API_KEY (or GOOGLE_API_KEY); no media was analyzed");
  return key;
}

function mimeType(file) {
  return ({
    ".avif":"image/avif", ".gif":"image/gif", ".heic":"image/heic", ".heif":"image/heif",
    ".jpeg":"image/jpeg", ".jpg":"image/jpeg", ".png":"image/png", ".webp":"image/webp",
    ".mp4":"video/mp4", ".mov":"video/quicktime", ".mpeg":"video/mpeg", ".mpg":"video/mpeg",
    ".webm":"video/webm", ".wmv":"video/x-ms-wmv", ".3gp":"video/3gpp",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function checkedFetch(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`Gemini API ${response.status}: ${detail || response.statusText}`);
  }
  return response;
}

async function uploadFile(file, key) {
  const stat = fs.statSync(file);
  const mime = mimeType(file);
  const start = await checkedFetch(`${GEMINI_API_ROOT}/upload/v1beta/files?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(stat.size),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: path.basename(file) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return a media upload URL");
  const uploaded = await checkedFetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(stat.size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: fs.readFileSync(file),
  });
  return (await uploaded.json()).file;
}

async function waitUntilActive(file, key) {
  let current = file;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (current.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    current = await (await checkedFetch(`${GEMINI_API_ROOT}/v1beta/${current.name}?key=${encodeURIComponent(key)}`)).json();
  }
  if (current.state !== "ACTIVE") throw new Error(current.error?.message || `Gemini media processing ended in ${current.state || "unknown state"}`);
  return current;
}

async function runGemini(prompt, files) {
  const key = apiKey();
  const uploaded = [];
  try {
    for (const file of [...new Set(files)]) uploaded.push(await waitUntilActive(await uploadFile(file, key), key));
    const parts = [
      ...uploaded.map((file) => ({ file_data: { mime_type: file.mimeType, file_uri: file.uri } })),
      { text: prompt },
    ];
    const response = await checkedFetch(`${GEMINI_API_ROOT}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
    });
    const payload = await response.json();
    const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!output) throw new Error(`Gemini returned no analysis${payload.promptFeedback?.blockReason ? `: ${payload.promptFeedback.blockReason}` : ""}`);
    return output;
  } finally {
    await Promise.all(uploaded.map(async (file) => {
      try { await checkedFetch(`${GEMINI_API_ROOT}/v1beta/${file.name}?key=${encodeURIComponent(key)}`, { method: "DELETE" }); } catch { /* expires server-side */ }
    }));
  }
}

function parseJson(output) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

async function processJob(job) {
  const save = db.prepare(`SELECT * FROM gather_saves WHERE id = ?`).get(job.gather_save_id);
  if (!save) throw new Error("saved bookmark not found");
  const metrics = save.matched_post_id
    ? db.prepare(`SELECT impressions, likes, replies, reposts, bookmarks, quotes FROM posts WHERE id = ?`).get(save.matched_post_id)
    : null;
  const media = safeMedia(save.media_path);
  const thumbnail = safeMedia(save.thumb_path);
  if (!media && !thumbnail) throw new Error("no saved media or thumbnail is available; no visual analysis was run");
  const metricsRule = metrics
    ? `Exact captured metrics (no creator baseline is available unless explicitly stated): ${JSON.stringify(metrics)}`
    : "No performance metrics are available. Do not say the post performed well or infer reach/engagement.";
  const prompt = `Analyze this personally bookmarked social post as a creative teardown. A bookmark is a taste signal, NOT evidence of performance.

Source URL: ${save.source_url ?? "unavailable"}
Creator: ${save.creator ? `@${save.creator}` : "unknown"}
Caption/text: ${save.content_text ?? save.title ?? "unavailable"}
${metricsRule}
Attached media: ${media ? `${mimeType(media)} (${path.basename(media)})` : "unavailable"}
Attached thumbnail/poster: ${thumbnail ? `${mimeType(thumbnail)} (${path.basename(thumbnail)})` : "unavailable"}

Inspect every attached file, not just the caption. For video, watch the full visual and audio streams. Study the thumbnail/opening frame, first spoken and visible hooks, delivery, edit rhythm, pacing changes, structure, payoff, and CTA. Quote only words you can verify from the media or caption. If any stream is absent or unintelligible, state that precisely in limitations. Distinguish direct observations from interpretation. Explain why it LIKELY works creatively; only make performance claims when exact metrics above support them. A possible Fonzi angle must be grounded in the source; if a real Fonzi/founder position is missing, set angle null and needs_founder_input true.

Return only valid JSON with exactly this shape:
{"thumbnail_opening_frame":{"description":"","effectiveness":"","evidence":[""]},"visible_text_hook":{"text":null,"analysis":"","evidence":[""]},"spoken_text_hook":{"text":null,"analysis":"","evidence":[""]},"transcript_or_summary":"","format":"","pacing_structure":"","why_likely_worked":{"analysis":"","evidence":[""],"performance_claim":false},"reusable_pattern":"","possible_fonzi_angle":{"angle":null,"grounding":"","needs_founder_input":true},"confidence":"low|medium|high","limitations":[""]}`;

  const result = parseJson(await runGemini(prompt, [media, thumbnail].filter(Boolean)));
  if (!metrics && result?.why_likely_worked) result.why_likely_worked.performance_claim = false;
  db.prepare(`UPDATE gather_save_analyses SET status = 'complete', result_json = ?,
    error = NULL, analyzed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL WHERE id = ?`)
    .run(JSON.stringify(result), job.id);
}

async function runSlot() {
  while (true) {
    const job = claimNext();
    if (!job) return;
    try {
      await processJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "unknown analysis error";
      const attempt = db.prepare(`SELECT attempt_count FROM gather_save_analyses WHERE id = ?`).get(job.id)?.attempt_count ?? MAX_ATTEMPTS;
      const retrySeconds = Math.min(300, 15 * (2 ** Math.max(0, attempt - 1)));
      db.prepare(`UPDATE gather_save_analyses SET status = 'error', error = ?, analyzed_at = CURRENT_TIMESTAMP,
        next_attempt_at = CASE WHEN attempt_count < ? THEN datetime('now', '+' || ? || ' seconds') ELSE NULL END
        WHERE id = ?`).run(message, MAX_ATTEMPTS, retrySeconds, job.id);
      // Keep this detached worker alive for its own bounded retry instead of
      // requiring the user to press sync again after a transient model error.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
      }
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => runSlot()));
db.close();
