import crypto from "node:crypto";
import { getDb, type Post } from "../db.ts";
import { ensureFeedDefaults, isProfileSlug, type FeedWeights, type ProfileSlug } from "./config.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { rankPost } from "./ranking.ts";

type ProfileRow = { id: number; slug: ProfileSlug; name: string; weights_json: string; lenses_json: string };
type FeedPost = Post & { source_handle: string | null; source_name: string | null };

function profileFor(slug: string): ProfileRow {
  if (!isProfileSlug(slug)) throw new Error("unknown profile");
  const db = getDb(); ensureFeedDefaults(db);
  return db.prepare("SELECT id,slug,name,weights_json,lenses_json FROM feed_profiles WHERE slug=? AND active=1").get(slug) as ProfileRow;
}

function recompute(profile: ProfileRow) {
  const db = getDb();
  const topics = db.prepare(`SELECT t.slug,t.keywords,pt.weight FROM feed_profile_topics pt JOIN feed_topics t ON t.id=pt.topic_id WHERE pt.profile_id=?`).all(profile.id) as Array<{slug:string;keywords:string;weight:number}>;
  const learned = db.prepare("SELECT interest,weight FROM feed_learned_interests WHERE profile_id=? AND weight>0 ORDER BY weight DESC LIMIT 100").all(profile.id) as Array<{interest:string;weight:number}>;
  const interacted = new Set((db.prepare("SELECT DISTINCT post_id FROM feed_interactions WHERE profile_id=?").all(profile.id) as Array<{post_id:number}>).map(x => x.post_id));
  const sourceWeights = new Map((db.prepare("SELECT source_id,weight FROM feed_profile_sources WHERE profile_id=?").all(profile.id) as Array<{source_id:number;weight:number}>).map(x => [x.source_id,x.weight]));
  const targetWeights = new Map((db.prepare("SELECT post_id,weight FROM feed_post_profiles WHERE profile_id=?").all(profile.id) as Array<{post_id:number;weight:number}>).map(x => [x.post_id,x.weight]));
  const posts = db.prepare(`SELECT p.* FROM posts p
    WHERE p.status NOT IN ('not_for_us','archived') AND COALESCE(p.is_reply,0)=0
      AND (EXISTS (SELECT 1 FROM feed_post_profiles own_target
            WHERE own_target.post_id=p.id AND own_target.profile_id=?)
        OR (NOT EXISTS (SELECT 1 FROM feed_post_profiles any_target WHERE any_target.post_id=p.id)
          AND EXISTS (SELECT 1 FROM feed_profile_sources own_source
            WHERE own_source.source_id=p.source_id AND own_source.profile_id=?)))`).all(profile.id, profile.id) as Post[];
  const write = db.prepare(`INSERT INTO feed_profile_scores
    (profile_id,post_id,score,components_json,best_angle,stable_lenses_json,wildcard_frame,computed_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(profile_id,post_id) DO UPDATE SET
    score=excluded.score,components_json=excluded.components_json,best_angle=excluded.best_angle,
    stable_lenses_json=excluded.stable_lenses_json,wildcard_frame=excluded.wildcard_frame,computed_at=CURRENT_TIMESTAMP`);
  const weights = JSON.parse(profile.weights_json) as FeedWeights;
  const lenses = JSON.parse(profile.lenses_json) as string[];
  db.transaction(() => {
    // Eligibility can change when editorial targeting is added or replaced.
    // Clear this profile's snapshot so a formerly untargeted post cannot leak
    // back through a stale score row.
    db.prepare("DELETE FROM feed_profile_scores WHERE profile_id=?").run(profile.id);
    for (const post of posts) {
      const ranked = rankPost(post, { slug: profile.slug, weights, lenses,
        topics: topics.map(t => ({ ...t, keywords: t.keywords.split(",").map(k => k.trim().toLowerCase()) })),
        learned, sourceWeight: post.source_id ? sourceWeights.get(post.source_id) : 0,
        targetWeight: targetWeights.get(post.id), interacted: interacted.has(post.id) });
      write.run(profile.id, post.id, ranked.score, JSON.stringify(ranked.components), ranked.bestAngle,
        JSON.stringify(ranked.stableLenses), ranked.wildcardFrame);
    }
  })();
}

function createSession(profile: ProfileRow): string {
  const db = getDb(); recompute(profile);
  const id = crypto.randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO feed_sessions (id,profile_id,expires_at) VALUES (?,?,datetime('now','+24 hours'))").run(id, profile.id);
    db.prepare(`INSERT INTO feed_session_items (session_id,post_id,position,score)
      SELECT ?,post_id,ROW_NUMBER() OVER (ORDER BY score DESC,post_id DESC)-1,score
      FROM feed_profile_scores WHERE profile_id=?`).run(id, profile.id);
  })();
  return id;
}

function createAngleItem(profile: ProfileRow, postId: number): number {
  const db = getDb();
  const existing = db.prepare(`SELECT i.id FROM items i
    JOIN item_sources item_source ON item_source.item_id=i.id
    WHERE item_source.post_id=? AND lower(COALESCE(i.person,''))=lower(?) LIMIT 1`)
    .get(postId, profile.name) as { id: number } | undefined;
  if (existing) return existing.id;
  const post = db.prepare(`SELECT p.*,s.handle source_handle FROM posts p
    LEFT JOIN sources s ON s.id=p.source_id WHERE p.id=?`).get(postId) as
    (Post & { source_handle: string | null }) | undefined;
  if (!post) throw new Error("unknown post");
  const title = (post.text ?? "").split("\n").find(line => line.trim())?.trim().slice(0, 80) || `post ${postId}`;
  const itemId = Number(db.prepare(`INSERT INTO items
    (title,stage,person,lane,angle,research_status,updated_at)
    VALUES (?,'exploring',?,?,?,'not_researched',CURRENT_TIMESTAMP)`)
    .run(title, profile.name, post.lane, post.angle).lastInsertRowid);
  db.prepare(`INSERT INTO item_sources
    (item_id,post_id,url,source_type,source_title,source_text,media_url,thumb_path,why_it_worked)
    VALUES (?,?,?,'signal_feed',?,?,?,?,?)`)
    .run(itemId, post.id, post.url, post.source_handle ? `@${post.source_handle}` : "source",
      post.text, post.media_url, post.thumb_path, post.why_it_worked);
  db.prepare("UPDATE posts SET status='developing' WHERE id=? AND status NOT IN ('taken','archived')").run(postId);
  return itemId;
}

export function getFeed(input: { profile: string; cursor?: string | null; limit?: number }) {
  const profile = profileFor(input.profile);
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const decoded = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !decoded) throw new Error("invalid cursor");
  const db = getDb();
  const existing = decoded && db.prepare(`SELECT id FROM feed_sessions WHERE id=? AND profile_id=? AND expires_at>CURRENT_TIMESTAMP`).get(decoded.sessionId, profile.id);
  if (decoded && !existing) throw new Error("expired cursor");
  const sessionId = decoded?.sessionId ?? createSession(profile);
  const offset = decoded?.offset ?? 0;
  const rows = db.prepare(`SELECT p.*,s.handle source_handle,s.display_name source_name,
      ps.score,ps.best_angle,ps.stable_lenses_json,ps.wildcard_frame
    FROM feed_session_items si JOIN posts p ON p.id=si.post_id
    LEFT JOIN sources s ON s.id=p.source_id
    JOIN feed_profile_scores ps ON ps.profile_id=? AND ps.post_id=p.id
    WHERE si.session_id=? AND si.position>=? ORDER BY si.position LIMIT ?`).all(profile.id, sessionId, offset, limit + 1) as Array<FeedPost & {score:number;best_angle:string;stable_lenses_json:string;wildcard_frame:string}>;
  const hasMore = rows.length > limit; const page = rows.slice(0, limit);
  const today = new Date().toISOString().slice(0, 10);
  if (page.length) {
    const markServed = db.prepare("UPDATE feed_session_items SET served_at=COALESCE(served_at,CURRENT_TIMESTAMP) WHERE session_id=? AND post_id=?");
    db.transaction(() => page.forEach(post => markServed.run(sessionId, post.id)))();
  }
  return {
    profile: { slug: profile.slug, name: profile.name }, sessionId,
    items: page.map(p => ({ ...p, stableLenses: JSON.parse(p.stable_lenses_json) as string[], stable_lenses_json: undefined,
      freshToday: Boolean(p.posted_at?.startsWith(today)) })),
    nextCursor: hasMore ? encodeCursor({ sessionId, offset: offset + limit }) : null,
  };
}

const MOVES = ["sharpen angle", "research", "draft"] as const;
function suggestedMove(profile: ProfileSlug, postId: number, body: string) {
  if (/source|proof|data|true|verify|why/i.test(body)) return "research";
  if (/draft|write|script|post/i.test(body)) return "draft";
  const n = [...`${profile}:${postId}:${body}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  return MOVES[n % MOVES.length];
}

export function recordInteraction(input: { profile: string; postId: number; action: string; sessionId?: string; comment?: string; metadata?: unknown }) {
  const allowed = new Set(["save", "comment", "open_thread", "skip", "create_angle"]);
  if (!allowed.has(input.action)) throw new Error("invalid action");
  const profile = profileFor(input.profile); const db = getDb();
  const post = db.prepare("SELECT id FROM posts WHERE id=?").get(input.postId);
  if (!post) throw new Error("unknown post");
  if (input.sessionId && !db.prepare("SELECT id FROM feed_sessions WHERE id=? AND profile_id=?").get(input.sessionId, profile.id)) throw new Error("invalid session");
  let suggestion: string | null = null;
  let itemId: number | null = null;
  db.transaction(() => {
    db.prepare(`INSERT INTO feed_interactions (profile_id,post_id,session_id,action,metadata_json) VALUES (?,?,?,?,?)`)
      .run(profile.id, input.postId, input.sessionId ?? null, input.action, input.metadata === undefined ? null : JSON.stringify(input.metadata));
    if (input.action === "comment") {
      const body = input.comment?.trim(); if (!body) throw new Error("comment required");
      suggestion = suggestedMove(profile.slug, input.postId, body);
      db.prepare(`INSERT INTO feed_comments (profile_id,post_id,session_id,body,suggested_next_move) VALUES (?,?,?,?,?)`)
        .run(profile.id, input.postId, input.sessionId ?? null, body, suggestion);
    }
    // Immediate session effect: skip removes the card; positive actions lift
    // same-topic unseen cards slightly while preserving deterministic order.
    if (input.sessionId && input.action === "skip") db.prepare("DELETE FROM feed_session_items WHERE session_id=? AND post_id=?").run(input.sessionId, input.postId);
    if (input.action === "create_angle") itemId = createAngleItem(profile, input.postId);
    if (input.sessionId && input.action !== "skip") db.prepare(`UPDATE feed_session_items SET score=score+0.015 WHERE session_id=? AND served_at IS NULL AND post_id IN
      (SELECT p2.id FROM posts p1 JOIN posts p2 ON p2.topic=p1.topic WHERE p1.id=? AND p2.id<>p1.id)`).run(input.sessionId, input.postId);
    if (input.sessionId) {
      const ordered = db.prepare("SELECT post_id FROM feed_session_items WHERE session_id=? AND served_at IS NULL ORDER BY score DESC,post_id DESC").all(input.sessionId) as Array<{post_id:number}>;
      const start = (db.prepare("SELECT COALESCE(MAX(position),-1)+1 start FROM feed_session_items WHERE session_id=? AND served_at IS NOT NULL").get(input.sessionId) as {start:number}).start;
      const setPosition = db.prepare("UPDATE feed_session_items SET position=? WHERE session_id=? AND post_id=?");
      ordered.forEach((row, index) => setPosition.run(-index - 1, input.sessionId, row.post_id));
      ordered.forEach((row, index) => setPosition.run(start + index, input.sessionId, row.post_id));
    }
  })();
  return { ok: true, suggestedNextMove: suggestion, itemId };
}
