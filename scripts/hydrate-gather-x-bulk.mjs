#!/usr/bin/env node
// Safely hydrate legitimate GatherOS X saves. Sequential by design: each
// item writes SQLite and may seed a creator baseline, so concurrency would
// buy little while introducing lock contention and avoidable API bursts.

import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = process.env.SIGNAL_DB_PATH ?? path.join(ROOT, "data", "signal.db");
const ONE = path.join(ROOT, "scripts", "hydrate-gather-x.mjs");
const maxArg = process.argv.indexOf("--max");
const max = maxArg >= 0 ? Math.max(1, Number(process.argv[maxArg + 1]) || 1) : Infinity;
const staleHoursArg = process.argv.indexOf("--stale-hours");
const staleHours = staleHoursArg >= 0 ? Math.max(1, Number(process.argv[staleHoursArg + 1]) || 24) : 24;
const force = process.argv.includes("--force");
const includeHidden = process.argv.includes("--include-hidden");
const dryRun = process.argv.includes("--dry-run");

if (!process.env.APIFY_TOKEN && !dryRun) throw new Error("APIFY_TOKEN is not set");

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
const all = db.prepare(`SELECT g.id,g.source,g.source_url,g.tweet_id,g.matched_post_id,g.hidden,p.scraped_at
  FROM gather_saves g LEFT JOIN posts p ON p.id=g.matched_post_id
  ORDER BY g.saved_at DESC, g.id`).all();
db.close();

const validUrl = (row) => {
  if (!row.source_url || !row.tweet_id) return false;
  if (!["x", "twitter"].includes(String(row.source ?? "").toLowerCase())) return false;
  try {
    const url = new URL(row.source_url);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return ["x.com", "twitter.com"].includes(host) && /\/[^/]+\/status\/\d+/.test(url.pathname);
  } catch { return false; }
};
const cutoff = Date.now() - staleHours * 3600_000;
const candidates = [];
let invalidSkipped = 0;
let freshSkipped = 0;
let hiddenSkipped = 0;
for (const row of all) {
  if (row.hidden && !includeHidden) { hiddenSkipped++; continue; }
  if (!validUrl(row)) { invalidSkipped++; continue; }
  const scraped = row.scraped_at ? Date.parse(row.scraped_at) : NaN;
  if (!force && row.matched_post_id && Number.isFinite(scraped) && scraped >= cutoff) {
    freshSkipped++;
    continue;
  }
  candidates.push(row);
}
const selected = candidates.slice(0, max);

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, scanned: all.length, eligible: candidates.length,
    selected: selected.length, skipped_invalid_or_non_x: invalidSkipped,
    skipped_hidden: hiddenSkipped, skipped_fresh: freshSkipped }, null, 2));
  process.exit(0);
}

const summary = { scanned: all.length, eligible: candidates.length, selected: selected.length,
  hydrated: 0, failed: 0, skipped_invalid_or_non_x: invalidSkipped,
  skipped_hidden: hiddenSkipped, skipped_fresh: freshSkipped,
  metrics_captured: 0, full_baselines: 0, failures: [] };

for (let i = 0; i < selected.length; i++) {
  const row = selected[i];
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await execFileAsync(process.execPath, [ONE, "--save-id", row.id], {
        cwd: ROOT, timeout: 300_000, maxBuffer: 1024 * 1024,
      });
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      summary.hydrated++;
      summary.metrics_captured += result.metrics_captured ?? 0;
      if (result.baseline_available) summary.full_baselines++;
      lastError = null;
      break;
    } catch (error) {
      lastError = String(error?.stderr || error?.message || error).trim().slice(0, 500);
      const retryable = /429|rate|timed out|ECONNRESET|fetch failed/i.test(lastError);
      if (!retryable || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
    }
  }
  if (lastError) {
    summary.failed++;
    summary.failures.push({ id: row.id, tweet_id: row.tweet_id, error: lastError });
  }
  if (i < selected.length - 1) await new Promise((resolve) => setTimeout(resolve, 500));
  process.stderr.write(`[${i + 1}/${selected.length}] hydrated=${summary.hydrated} failed=${summary.failed}\n`);
}

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failed ? 1 : 0);
