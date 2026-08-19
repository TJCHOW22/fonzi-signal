import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.SIGNAL_DB_PATH ?? path.join(process.cwd(), "data", "signal.db");
if (!fs.existsSync(dbPath)) throw new Error(`signal database not found: ${dbPath}`);
const db = new Database(dbPath);
const actionWeight = { save: .18, comment: .22, open_thread: .08, create_angle: .28, skip: -.2 };
const cutoff = process.argv.find(arg => arg.startsWith("--since="))?.slice(8) ?? "-1 day";

const interactions = db.prepare(`SELECT i.profile_id,i.action,i.metadata_json,p.topic,p.text
  FROM feed_interactions i JOIN posts p ON p.id=i.post_id
  WHERE i.created_at >= datetime('now', ?)`).all(cutoff);
const topicKeywords = db.prepare("SELECT slug,keywords FROM feed_topics").all();
const changes = new Map();
for (const row of interactions) {
  let metadata = {};
  try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { metadata = {}; }
  const skipWeight = row.action === "skip" && metadata.reason === "seen_it" ? 0
    : row.action === "skip" && metadata.reason === "wrong_profile" ? -.35
    : row.action === "skip" && metadata.reason === "not_interesting" ? -.25
    : row.action === "skip" && metadata.reason === "too_generic" ? -.2
    : actionWeight[row.action] ?? 0;
  const haystack = `${row.topic ?? ""} ${row.text ?? ""}`.toLowerCase();
  for (const topic of topicKeywords) {
    if (!topic.keywords.split(",").some(k => haystack.includes(k.trim().toLowerCase()))) continue;
    const key = `${row.profile_id}:${topic.slug}`;
    const current = changes.get(key) ?? { profileId: row.profile_id, interest: topic.slug.replaceAll("-", " "), weight: 0, count: 0 };
    current.weight += skipWeight;
    current.count += 1;
    changes.set(key, current);
  }
}
const upsert = db.prepare(`INSERT INTO feed_learned_interests (profile_id,interest,weight,evidence_count,updated_at)
  VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(profile_id,interest) DO UPDATE SET
  weight=MAX(-1,MIN(1,feed_learned_interests.weight+excluded.weight)),
  evidence_count=feed_learned_interests.evidence_count+excluded.evidence_count,updated_at=CURRENT_TIMESTAMP`);
db.transaction(() => { for (const change of changes.values()) upsert.run(change.profileId, change.interest, change.weight, change.count); })();
const touched = [...new Set([...changes.values()].map(change => change.profileId))];
const scoreRows = db.prepare(`SELECT s.profile_id,s.post_id,s.components_json,p.text,p.topic,p.lane,p.angle,p.why_it_worked,fp.weights_json
  FROM feed_profile_scores s JOIN posts p ON p.id=s.post_id JOIN feed_profiles fp ON fp.id=s.profile_id
  WHERE s.profile_id=?`);
const interestsFor = db.prepare("SELECT interest,weight FROM feed_learned_interests WHERE profile_id=? AND weight>0");
const updateScore = db.prepare("UPDATE feed_profile_scores SET score=?,components_json=?,computed_at=CURRENT_TIMESTAMP WHERE profile_id=? AND post_id=?");
let scoresRecomputed = 0;
db.transaction(() => {
  for (const profileId of touched) {
    const interests = interestsFor.all(profileId);
    for (const row of scoreRows.all(profileId)) {
      const haystack = `${row.text ?? ""} ${row.topic ?? ""} ${row.lane ?? ""} ${row.angle ?? ""} ${row.why_it_worked ?? ""}`.toLowerCase();
      const components = JSON.parse(row.components_json);
      components.learned = Math.max(0, Math.min(1, interests.reduce((sum, item) => sum + (haystack.includes(item.interest.toLowerCase()) ? item.weight : 0), 0)));
      const weights = JSON.parse(row.weights_json);
      const score = Object.entries(components).reduce((sum, [key, value]) => sum + value * (weights[key] ?? 0), 0);
      updateScore.run(Number(score.toFixed(6)), JSON.stringify(components), profileId, row.post_id);
      scoresRecomputed += 1;
    }
  }
})();
console.log(JSON.stringify({ interactions: interactions.length, interestsUpdated: changes.size, profilesUpdated: touched.length, scoresRecomputed }));
db.close();
