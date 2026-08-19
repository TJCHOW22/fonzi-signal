import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { ensureFeedDefaults, isProfileSlug, type ProfileSlug } from "@/lib/feed/config";

export const dynamic = "force-dynamic";

type IngestPost = {
  tweet_id?: string;
  id?: string;
  external_id?: string;
  platform?: string;
  handle?: string;
  url?: string;
  text?: string;
  posted_at?: string;
  scraped_at?: string;
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  bookmarks?: number;
  quotes?: number;
  is_quote?: boolean;
  is_reply?: boolean;
  media_type?: string;
  save_rate?: number;
  baseline_multiple?: number;
  heat?: number;
  heat_basis?: string;
  fit?: number;
  fit_subscores?: unknown;
  angle?: string;
  angle_for?: string;
  why_it_worked?: string;
  lane?: string;
  status?: string;
  raw?: unknown;
  topic?: string;
  media_url?: string;
  thumb_path?: string;
  target_profile?: ProfileSlug;
  target_profiles?: Array<ProfileSlug | { profile: ProfileSlug; weight?: number }>;
};

function canonicalPostId(post: IngestPost): { canonicalId: string; externalId: string | null; platform: string } {
  const platform = (post.platform ?? (post.tweet_id ? "x" : "external")).trim().toLowerCase() || "external";
  const externalId = post.external_id ?? post.tweet_id ?? post.id ?? null;
  if (post.tweet_id) return { canonicalId: String(post.tweet_id), externalId: String(externalId), platform };
  if (externalId) return { canonicalId: `${platform}:${externalId}`, externalId: String(externalId), platform };
  const fingerprint = [platform, post.url, post.handle, post.posted_at, post.text].map(value => value ?? "").join("\u001f");
  return { canonicalId: `${platform}:synthetic:${crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24)}`, externalId: null, platform };
}

function targetsFor(post: IngestPost): Array<{ profile: ProfileSlug; weight: number }> | null {
  const raw = post.target_profiles ?? (post.target_profile ? [post.target_profile] : null);
  if (!raw) return null;
  const targets = raw.map(target => typeof target === "string" ? { profile: target, weight: 1 } : { profile: target.profile, weight: target.weight ?? 1 });
  if (targets.some(target => !isProfileSlug(target.profile) || !Number.isFinite(target.weight) || target.weight <= 0)) {
    throw new Error("invalid target_profiles");
  }
  return targets;
}

// Thin ingest surface for future non-python writers. The X Engine scripts
// write to sqlite directly in v1 — this route exists so devs lifting the tool
// into the product have an HTTP contract to start from.
export async function POST(req: Request) {
  let body: { posts?: IngestPost[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const posts = body.posts ?? [];
  if (!Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ ok: false, error: "posts[] required" }, { status: 400 });
  }

  const db = getDb();
  ensureFeedDefaults(db);
  const findSource = db.prepare("SELECT id FROM sources WHERE handle = ?");
  const createSource = db.prepare(`INSERT INTO sources (handle,platform,active) VALUES (?,?,1)
    ON CONFLICT(handle) DO UPDATE SET platform=excluded.platform,updated_at=CURRENT_TIMESTAMP`);
  const upsert = db.prepare(
    `INSERT INTO posts (tweet_id, source_id, url, text, posted_at, scraped_at,
       impressions, likes, replies, reposts, bookmarks, quotes, is_quote,
       is_reply, media_type, save_rate, baseline_multiple, heat, heat_basis,
       fit, fit_subscores, angle, angle_for, why_it_worked, lane, status, raw,
       topic, media_url, thumb_path, platform, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tweet_id) DO UPDATE SET
       url = excluded.url, text = excluded.text, posted_at = excluded.posted_at,
       scraped_at = excluded.scraped_at, impressions = excluded.impressions,
       likes = excluded.likes, replies = excluded.replies,
       reposts = excluded.reposts, bookmarks = excluded.bookmarks,
       quotes = excluded.quotes, save_rate = excluded.save_rate,
       baseline_multiple = excluded.baseline_multiple, heat = excluded.heat,
       heat_basis = excluded.heat_basis, fit = excluded.fit,
       fit_subscores = excluded.fit_subscores, angle = excluded.angle,
       angle_for = excluded.angle_for, why_it_worked = excluded.why_it_worked,
       lane = excluded.lane, topic = excluded.topic, media_url = excluded.media_url,
       thumb_path = excluded.thumb_path, platform = excluded.platform,
       external_id = excluded.external_id, raw = excluded.raw`
  );
  const findPost = db.prepare("SELECT id FROM posts WHERE tweet_id=?");
  const profileId = db.prepare("SELECT id FROM feed_profiles WHERE slug=? AND active=1");
  const clearTargets = db.prepare("DELETE FROM feed_post_profiles WHERE post_id=?");
  const addTarget = db.prepare(`INSERT INTO feed_post_profiles (post_id,profile_id,weight) VALUES (?,?,?)
    ON CONFLICT(post_id,profile_id) DO UPDATE SET weight=excluded.weight`);

  let written = 0;
  const errors: string[] = [];
  const tx = db.transaction((items: IngestPost[]) => {
    for (const p of items) {
      let identity: ReturnType<typeof canonicalPostId>;
      let targets: ReturnType<typeof targetsFor>;
      try { identity = canonicalPostId(p); targets = targetsFor(p); }
      catch (error) { errors.push(error instanceof Error ? error.message : "invalid row"); continue; }
      const handle = p.handle?.replace(/^@/, "").toLowerCase();
      if (handle) createSource.run(handle, identity.platform);
      const src = handle ? (findSource.get(handle) as { id: number } | undefined) : undefined;
      upsert.run(
        identity.canonicalId, src?.id ?? null, p.url ?? null, p.text ?? null,
        p.posted_at ?? null, p.scraped_at ?? null, p.impressions ?? null,
        p.likes ?? null, p.replies ?? null, p.reposts ?? null,
        p.bookmarks ?? null, p.quotes ?? null, p.is_quote ? 1 : 0,
        p.is_reply ? 1 : 0, p.media_type ?? null, p.save_rate ?? null,
        p.baseline_multiple ?? null, p.heat ?? null, p.heat_basis ?? null,
        p.fit ?? null,
        p.fit_subscores != null ? JSON.stringify(p.fit_subscores) : null,
        p.angle ?? null, p.angle_for ?? null, p.why_it_worked ?? null,
        p.lane ?? null, p.status ?? "new",
        p.raw != null ? JSON.stringify(p.raw) : null,
        p.topic ?? null, p.media_url ?? null, p.thumb_path ?? null,
        identity.platform, identity.externalId
      );
      if (targets) {
        const postId = (findPost.get(identity.canonicalId) as { id: number }).id;
        clearTargets.run(postId);
        for (const target of targets) {
          const profile = profileId.get(target.profile) as { id: number } | undefined;
          if (!profile) throw new Error(`unknown target profile: ${target.profile}`);
          addTarget.run(postId, profile.id, target.weight);
        }
      }
      written++;
    }
  });
  tx(posts);

  return NextResponse.json({ ok: errors.length === 0, written, errors });
}
