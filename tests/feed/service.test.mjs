import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `fonzi-feed-${process.pid}-${Date.now()}.db`);
process.env.SIGNAL_DB_PATH = dbPath;

const { getDb } = await import("../../lib/db.ts");
const { getFeed, recordInteraction } = await import("../../lib/feed/service.ts");

after(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch {}
  }
});

test("pagination stays stable while feedback promotes a profile-owned angle", () => {
  const db = getDb();
  const sourceId = Number(db.prepare("INSERT INTO sources(handle,active) VALUES (?,1)")
    .run("test-feed").lastInsertRowid);
  getFeed({ profile: "brett", limit: 1 });
  const brettProfileId = db.prepare("SELECT id FROM feed_profiles WHERE slug='brett'").get().id;
  db.prepare("INSERT INTO feed_profile_sources(profile_id,source_id,weight) VALUES (?,?,1)")
    .run(brettProfileId, sourceId);
  const add = db.prepare(`INSERT INTO posts
    (tweet_id,source_id,url,text,posted_at,likes,reposts,fit,angle,why_it_worked,topic,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'new')`);
  for (let index = 0; index < 45; index += 1) {
    add.run(`t${index}`, sourceId, `https://x.com/test/status/${index}`,
      index % 2 ? "founder nearly failed before a weird pivot" : "AI hiring workflow and candidate signal",
      new Date(Date.now() - index * 3_600_000).toISOString(), 100 + index, index, 8,
      index % 2 ? "the untold company turn" : "a useful hiring angle",
      "strong story mechanism", index % 2 ? "company" : "hiring");
  }

  const first = getFeed({ profile: "brett", limit: 20 });
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const created = recordInteraction({ profile: "brett", postId: first.items[0].id,
    action: "create_angle", sessionId: first.sessionId });
  assert.ok(created.itemId);
  const comment = recordInteraction({ profile: "brett", postId: first.items[1].id,
    action: "comment", comment: "verify the source", sessionId: first.sessionId });
  assert.equal(comment.suggestedNextMove, "research");

  const second = getFeed({ profile: "brett", cursor: first.nextCursor, limit: 20 });
  const served = new Set(first.items.map(item => item.id));
  assert.equal(second.items.some(item => served.has(item.id)), false);
  assert.deepEqual(db.prepare("SELECT person,stage FROM items WHERE id=?").get(created.itemId),
    { person: "Brett", stage: "exploring" });
});

test("post targeting is weighted for Brett and never leaks into Thomas", () => {
  const db = getDb();
  // Materialize profiles, then target a single canonical post only to Brett.
  getFeed({ profile:"brett", limit:1 });
  const sourceId = Number(db.prepare("INSERT INTO sources(handle,active) VALUES (?,1)").run("brett-only").lastInsertRowid);
  const thomasId = db.prepare("SELECT id FROM feed_profiles WHERE slug='thomas'").get().id;
  const brettId = db.prepare("SELECT id FROM feed_profiles WHERE slug='brett'").get().id;
  db.prepare("INSERT INTO feed_profile_sources(profile_id,source_id,weight) VALUES (?,?,1)").run(thomasId,sourceId);
  db.prepare("INSERT INTO feed_profile_sources(profile_id,source_id,weight) VALUES (?,?,1)").run(brettId,sourceId);
  const postId = Number(db.prepare(`INSERT INTO posts (tweet_id,source_id,text,posted_at,angle_for,status)
    VALUES (?,?,?,?,?,'new')`).run("brett-target",sourceId,"The founder pivoted the company after its pricing wedge failed",new Date().toISOString(),"Brett").lastInsertRowid);
  // Score it for Thomas while still untargeted, exercising stale-score cleanup.
  assert.ok(getFeed({ profile:"thomas", limit:50 }).items.some(item => item.id === postId));
  db.prepare("INSERT INTO feed_post_profiles(post_id,profile_id,weight) VALUES (?,?,?)").run(postId,brettId,1.6);

  const brett = getFeed({ profile:"brett", limit:50 });
  const targeted = brett.items.find(item => item.id === postId);
  assert.ok(targeted);
  assert.equal(targeted.angle_for,"Brett");
  const thomas = getFeed({ profile:"thomas", limit:50 });
  assert.equal(thomas.items.some(item => item.id === postId),false);
});
