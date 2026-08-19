import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ensureFeedDefaults } from "../../lib/feed/config.ts";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE sources (id INTEGER PRIMARY KEY, handle TEXT, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE feed_profiles (id INTEGER PRIMARY KEY,slug TEXT UNIQUE,name TEXT,description TEXT,weights_json TEXT,lenses_json TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE feed_topics (id INTEGER PRIMARY KEY,slug TEXT UNIQUE,label TEXT,keywords TEXT);
    CREATE TABLE feed_profile_topics (profile_id INTEGER,topic_id INTEGER,weight REAL,PRIMARY KEY(profile_id,topic_id));
    CREATE TABLE feed_profile_sources (profile_id INTEGER,source_id INTEGER,weight REAL,PRIMARY KEY(profile_id,source_id));
    CREATE TABLE feed_post_profiles (post_id INTEGER,profile_id INTEGER,weight REAL,PRIMARY KEY(post_id,profile_id));
  `);
  return db;
}

test("defaults never cross-join the shared source roster", () => {
  const db = database();
  db.exec("INSERT INTO sources(handle,active) VALUES ('fonzi-source',1),('other',1)");
  ensureFeedDefaults(db);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM feed_profile_sources").get().count, 0);
  db.close();
});

test("Brett defaults make editorial targeting and company pillars dominant", () => {
  const db = database();
  ensureFeedDefaults(db);
  const profile = db.prepare("SELECT id,weights_json FROM feed_profiles WHERE slug='brett'").get();
  const weights = JSON.parse(profile.weights_json);
  assert.ok(weights.brettPillars > weights.profileFit);
  assert.ok(weights.targetMatch > weights.momentum);
  const slugs = db.prepare(`SELECT t.slug FROM feed_profile_topics pt JOIN feed_topics t ON t.id=pt.topic_id
    WHERE pt.profile_id=?`).all(profile.id).map(row => row.slug);
  for (const slug of ["company-stories","founder-tension","business-model-wedges","capital-and-vc","company-strategy"]) {
    assert.ok(slugs.includes(slug), `missing ${slug}`);
  }
  db.close();
});

test("Thomas gets only the five taste lanes and exact requested weights", () => {
  const db = database();
  ensureFeedDefaults(db);
  const profile = db.prepare("SELECT id,weights_json FROM feed_profiles WHERE slug='thomas'").get();
  assert.deepEqual(JSON.parse(profile.weights_json), {
    tasteMatch:.30,rabbitHole:.22,hiddenCompanyStory:.16,experimentability:.14,
    originality:.10,freshness:.05,momentum:.03,
  });
  const slugs = db.prepare(`SELECT t.slug FROM feed_profile_topics pt JOIN feed_topics t ON t.id=pt.topic_id
    WHERE pt.profile_id=? ORDER BY t.slug`).all(profile.id).map(row => row.slug);
  assert.deepEqual(slugs, ["brand-archaeology","creative-craft","creative-philosophy","creative-systems","local-tactile-culture"]);
  db.close();
});

test("refreshing Thomas defaults preserves Fonzi and Brett source memberships", () => {
  const db = database();
  db.exec("INSERT INTO sources(handle,active) VALUES ('fonzi-source',1),('brett-source',1)");
  ensureFeedDefaults(db);
  const fonzi = db.prepare("SELECT id FROM feed_profiles WHERE slug='fonzi'").get().id;
  const brett = db.prepare("SELECT id FROM feed_profiles WHERE slug='brett'").get().id;
  db.prepare("INSERT INTO feed_profile_sources VALUES (?,?,?)").run(fonzi,1,1.2);
  db.prepare("INSERT INTO feed_profile_sources VALUES (?,?,?)").run(brett,2,.9);
  ensureFeedDefaults(db);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM feed_profile_sources WHERE profile_id IN (?,?)").get(fonzi,brett).count,2);
  db.close();
});
