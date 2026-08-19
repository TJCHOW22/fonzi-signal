import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { seedThomasFeed } from "../../scripts/seed-thomas-feed.mjs";

test("Thomas seed is isolated, evidence-driven, and idempotent", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE sources (id INTEGER PRIMARY KEY,handle TEXT UNIQUE,display_name TEXT,tier TEXT,archetype TEXT,why_we_watch TEXT,active INTEGER DEFAULT 1,notes TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE gather_saves (id TEXT PRIMARY KEY,creator TEXT,source_url TEXT,tags TEXT,hidden INTEGER DEFAULT 0);
    CREATE TABLE feed_profiles (id INTEGER PRIMARY KEY,slug TEXT UNIQUE,name TEXT,description TEXT,weights_json TEXT,lenses_json TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE feed_topics (id INTEGER PRIMARY KEY,slug TEXT UNIQUE,label TEXT,keywords TEXT);
    CREATE TABLE feed_profile_topics (profile_id INTEGER,topic_id INTEGER,weight REAL,PRIMARY KEY(profile_id,topic_id));
    CREATE TABLE feed_profile_sources (profile_id INTEGER,source_id INTEGER,weight REAL,PRIMARY KEY(profile_id,source_id));
    CREATE TABLE feed_profile_scores (profile_id INTEGER,post_id INTEGER,PRIMARY KEY(profile_id,post_id));
  `);
  db.exec(`INSERT INTO sources(handle,active) VALUES ('shared-fonzi',1),('shared-brett',1),('hiiinternet',1),('d4nielpark',0);
    INSERT INTO gather_saves VALUES ('1','d4nielpark','https://x.com/d4nielpark/status/1','bookmark',0),
      ('2','d4nielpark','https://x.com/d4nielpark/status/2','bookmark',0),
      ('3','hiiinternet','https://x.com/hiiinternet/status/3','bookmark',0);`);
  // Create profiles first, then establish company-owned memberships.
  seedThomasFeed(db);
  const fonzi = db.prepare("SELECT id FROM feed_profiles WHERE slug='fonzi'").get().id;
  const brett = db.prepare("SELECT id FROM feed_profiles WHERE slug='brett'").get().id;
  db.prepare("INSERT INTO feed_profile_sources VALUES (?,?,1)").run(fonzi,1);
  db.prepare("INSERT INTO feed_profile_sources VALUES (?,?,1)").run(brett,2);

  const first = seedThomasFeed(db);
  const second = seedThomasFeed(db);
  assert.equal(first.memberships,second.memberships);
  assert.equal(second.after.fonzi,1);
  assert.equal(second.after.brett,1);
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM feed_profile_sources ps JOIN feed_profiles fp ON fp.id=ps.profile_id
    JOIN sources s ON s.id=ps.source_id WHERE fp.slug='thomas' AND lower(s.handle)='hiiinternet'`).get().count,0);
  assert.equal(db.prepare("SELECT active FROM sources WHERE lower(handle)='d4nielpark'").get().active,1);
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM feed_profile_sources ps JOIN feed_profiles fp ON fp.id=ps.profile_id
    WHERE fp.slug='thomas'`).get().count,6); // one Gather source plus five personal-X sources
  db.close();
});
