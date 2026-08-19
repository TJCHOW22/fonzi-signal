"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { getDb } from "@/lib/db";
import { ensureFeedDefaults } from "@/lib/feed/config";

// ---------------------------------------------------------------- items

function firstLine(text: string | null | undefined, max = 80): string {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

/** Existing item for this post/save via item_sources, or a fresh one. */
function findOrCreateItem(postId: number | null, gatherId: string | null): number | null {
  const db = getDb();
  if (postId) {
    const hit = db
      .prepare("SELECT item_id FROM item_sources WHERE post_id = ? LIMIT 1")
      .get(postId) as { item_id: number } | undefined;
    if (hit) return hit.item_id;
  }
  if (gatherId) {
    const hit = db
      .prepare("SELECT item_id FROM item_sources WHERE gather_save_id = ? LIMIT 1")
      .get(gatherId) as { item_id: number } | undefined;
    if (hit) return hit.item_id;
  }

  let title = "";
  let angle: string | null = null;
  let lane: string | null = null;
  let url: string | null = null;
  if (postId) {
    const p = db
      .prepare("SELECT text, angle, lane, url FROM posts WHERE id = ?")
      .get(postId) as { text: string | null; angle: string | null; lane: string | null; url: string | null } | undefined;
    if (!p) return null;
    title = firstLine(p.text) || `post ${postId}`;
    angle = p.angle;
    lane = p.lane;
    url = p.url;
  } else if (gatherId) {
    const g = db
      .prepare("SELECT title, source_url, notes FROM gather_saves WHERE id = ?")
      .get(gatherId) as { title: string | null; source_url: string | null; notes: string | null } | undefined;
    if (!g) return null;
    title = firstLine(g.title) || firstLine(g.notes) || `save ${gatherId.slice(0, 8)}`;
    url = g.source_url;
  } else {
    return null;
  }

  const itemId = db
    .prepare("INSERT INTO items (title, stage, angle, lane) VALUES (?, 'inbox', ?, ?)")
    .run(title, angle, lane).lastInsertRowid as number;
  if (postId) {
    db.prepare(`INSERT INTO item_sources
      (item_id, post_id, url, source_type, source_title, source_text, media_url,
       thumb_path, why_it_worked)
      SELECT ?, id, url, 'creative_feed', '@' || COALESCE((SELECT handle FROM sources WHERE id = posts.source_id), 'source'),
        text, media_url, thumb_path, why_it_worked FROM posts WHERE id = ?`)
      .run(itemId, postId);
  } else {
    db.prepare(`INSERT INTO item_sources
      (item_id, gather_save_id, url, source_type, source_title, media_url,
       thumb_path, saved_note)
      SELECT ?, id, source_url, 'saved_by_me', title, source_url, thumb_path, notes
      FROM gather_saves WHERE id = ?`).run(itemId, gatherId);
  }
  return itemId;
}

// ------------------------------------------------------ creative feed actions

export async function saveAsIdea(formData: FormData) {
  const postId = Number(formData.get("post_id")) || null;
  const gatherId = String(formData.get("gather_id") ?? "").trim() || null;
  const itemId = findOrCreateItem(postId, gatherId);
  if (itemId === null) return;
  if (postId) {
    getDb().prepare("UPDATE posts SET status = 'idea' WHERE id = ? AND status != 'taken'").run(postId);
  }
  // gather-only cards stay visible in the feed with an "idea" chip.
  revalidatePath("/");
  revalidatePath("/ideas");
}

export async function developThis(formData: FormData) {
  const postId = Number(formData.get("post_id")) || null;
  const gatherId = String(formData.get("gather_id") ?? "").trim() || null;
  const itemId = findOrCreateItem(postId, gatherId);
  if (itemId === null) return;
  if (postId) {
    getDb()
      .prepare("UPDATE posts SET status = 'developing' WHERE id = ? AND status != 'taken'")
      .run(postId);
  }
  revalidatePath("/");
  revalidatePath("/ideas");
  getDb().prepare("UPDATE items SET stage = 'exploring', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(itemId);
  redirect(`/ideas/${itemId}`);
}

export async function notForUs(formData: FormData) {
  const db = getDb();
  const postId = Number(formData.get("post_id")) || null;
  const gatherId = String(formData.get("gather_id") ?? "").trim() || null;
  if (postId) {
    const p = db.prepare("SELECT url FROM posts WHERE id = ?").get(postId) as
      | { url: string | null }
      | undefined;
    db.prepare(
      "INSERT INTO labels (post_id, tweet_url, label, source, note) VALUES (?, ?, 'negative', 'tj', 'creative feed: not for us')"
    ).run(postId, p?.url ?? null);
    db.prepare("UPDATE posts SET status = 'not_for_us' WHERE id = ?").run(postId);
  } else if (gatherId) {
    const g = db.prepare("SELECT source_url FROM gather_saves WHERE id = ?").get(gatherId) as
      | { source_url: string | null }
      | undefined;
    if (g?.source_url) {
      db.prepare(
        "INSERT INTO labels (post_id, tweet_url, label, source, note) VALUES (NULL, ?, 'negative', 'tj', 'creative feed: not for us')"
      ).run(g.source_url);
    }
    db.prepare("UPDATE gather_saves SET hidden = 1 WHERE id = ?").run(gatherId);
  }
  revalidatePath("/");
}

export async function syncGatherOS() {
  const script = path.join(process.cwd(), "scripts", "import-gatheros.mjs");
  await new Promise<void>((resolve) => {
    execFile(process.execPath, [script], { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) console.error("gatheros sync failed:", stderr || err.message);
      else console.log("gatheros sync:", stdout.trim());
      resolve(); // never crash the page on importer failure
    });
  });
  // Analysis is deliberately detached so a large swipefile never blocks the
  // sync request. The worker claims idempotent queue rows from signal.db.
  const worker = path.join(process.cwd(), "scripts", "analyze-gather-queue.mjs");
  const child = spawn(process.execPath, [worker], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  revalidatePath("/");
}

// ------------------------------------------------------------------- roster

export async function toggleSourceActive(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb()
    .prepare(
      "UPDATE sources SET active = 1 - active, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(id);
  revalidatePath("/roster");
}

export async function addSource(formData: FormData) {
  const handle = String(formData.get("handle") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!handle) return;
  const tier = String(formData.get("tier") ?? "") || null;
  const archetype = String(formData.get("archetype") ?? "").trim() || null;
  const why = String(formData.get("why_we_watch") ?? "").trim() || null;
  const platform = String(formData.get("platform") ?? "x").toLowerCase();
  if (!["x", "instagram"].includes(platform)) return;
  getDb()
    .prepare(
      `INSERT INTO sources (handle, platform, tier, archetype, why_we_watch, active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT (handle) DO UPDATE SET
         platform = excluded.platform, tier = excluded.tier, archetype = excluded.archetype,
         why_we_watch = excluded.why_we_watch,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(handle, platform, tier, archetype, why);
  revalidatePath("/roster");
}

export async function toggleSourceProfile(formData: FormData) {
  const sourceId = Number(formData.get("source_id"));
  const slug = String(formData.get("profile") ?? "");
  if (!sourceId || !["thomas", "fonzi", "brett"].includes(slug)) return;
  const db = getDb();
  ensureFeedDefaults(db);
  const profile = db.prepare("SELECT id FROM feed_profiles WHERE slug = ? AND active = 1")
    .get(slug) as { id: number } | undefined;
  if (!profile || !db.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId)) return;
  const existing = db.prepare("SELECT 1 FROM feed_profile_sources WHERE profile_id = ? AND source_id = ?")
    .get(profile.id, sourceId);
  if (existing) {
    db.prepare("DELETE FROM feed_profile_sources WHERE profile_id = ? AND source_id = ?")
      .run(profile.id, sourceId);
  } else {
    db.prepare("INSERT INTO feed_profile_sources (profile_id, source_id, weight) VALUES (?, ?, 1.5)")
      .run(profile.id, sourceId);
  }
  revalidatePath("/roster");
}

// -------------------------------------------------------------------- label

export async function addLabel(formData: FormData) {
  const db = getDb();
  const label = String(formData.get("label"));
  if (!["positive", "negative"].includes(label)) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  const postId = Number(formData.get("post_id")) || null;
  const tweetUrl = String(formData.get("tweet_url") ?? "").trim() || null;
  const manualText = String(formData.get("manual_text") ?? "").trim() || null;

  if (postId) {
    db.prepare(
      "INSERT INTO labels (post_id, tweet_url, label, source, note) VALUES (?, ?, ?, 'tj', ?)"
    ).run(
      postId,
      (db.prepare("SELECT url FROM posts WHERE id = ?").get(postId) as { url: string | null } | undefined)?.url ?? null,
      label,
      note
    );
  } else if (tweetUrl) {
    // label on a post not yet scraped — keep the pasted text in the note so
    // the context survives until the post shows up in `posts`.
    const fullNote = manualText ? [note, `text: ${manualText}`].filter(Boolean).join(" · ") : note;
    db.prepare(
      "INSERT INTO labels (post_id, tweet_url, label, source, note) VALUES (NULL, ?, ?, 'tj', ?)"
    ).run(tweetUrl, label, fullNote);
  } else {
    return;
  }
  revalidatePath("/label");
}
