import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDb, dbPath } from "../lib/db.ts";
import { ensureFeedDefaults } from "../lib/feed/config.ts";

// Strong/weak classification comes from the current Gather bookmark audit.
// The SQL below still discovers creators dynamically, so future saves enter
// Thomas's membership without reading from or writing to the GatherOS DB.
export const STRONG_GATHER_CREATORS = new Set([
  "d4nielpark", "amirmushich", "mustafyof", "neilcybart", "hipcityreg",
  "rauchg", "covacut", "oprydai", "businessbarista", "tranmautritam",
  "meganejon", "alexaperios", "beechinour",
]);

export const EXCLUDED_GATHER_CREATORS = new Set([
  "ansonlin", "hiiinternet", "milksandmatcha", "contraben", "domirosari0",
  "ntfabiano", "alexhormozi", "spc", "youralphamom", "nycmayor", "fonziai",
]);

// Explicit sources named in Thomas's own @ProducingMedia_ post corpus.
export const PERSONAL_X_SOURCES = ["NickDabasDP", "_gregorylugo", "krea_ai", "MistralAI", "MistralDevs"];

function cleanHandle(value) {
  const direct = String(value ?? "").trim().replace(/^@/, "");
  return /^[a-z0-9_]{1,15}$/i.test(direct) ? direct : null;
}

function handleFromUrl(value) {
  const match = String(value ?? "").match(/(?:x|twitter)\.com\/([a-z0-9_]{1,15})(?:\/|$)/i);
  return cleanHandle(match?.[1]);
}

export function seedThomasFeed(db) {
  ensureFeedDefaults(db);
  const thomas = db.prepare("SELECT id FROM feed_profiles WHERE slug='thomas'").get();
  if (!thomas) throw new Error("Thomas profile is missing");

  const gatherRows = db.prepare(`SELECT creator,source_url,COUNT(*) save_count
    FROM gather_saves WHERE hidden=0 AND COALESCE(tags,'') LIKE '%bookmark%'
    GROUP BY lower(COALESCE(NULLIF(creator,''),source_url))`).all();
  const gathered = new Map();
  for (const row of gatherRows) {
    const handle = cleanHandle(row.creator) ?? handleFromUrl(row.source_url);
    if (!handle || EXCLUDED_GATHER_CREATORS.has(handle.toLowerCase())) continue;
    const key = handle.toLowerCase();
    gathered.set(key, { handle, saves: Number(row.save_count) + (gathered.get(key)?.saves ?? 0) });
  }

  const before = Object.fromEntries(db.prepare(`SELECT fp.slug,COUNT(*) count
    FROM feed_profile_sources ps JOIN feed_profiles fp ON fp.id=ps.profile_id
    GROUP BY fp.slug`).all().map(row => [row.slug, row.count]));

  const result = db.transaction(() => {
    db.prepare("DELETE FROM feed_profile_sources WHERE profile_id=?").run(thomas.id);
    db.prepare("DELETE FROM feed_profile_scores WHERE profile_id=?").run(thomas.id);

    const findSource = db.prepare("SELECT id FROM sources WHERE lower(handle)=lower(?) LIMIT 1");
    const insertSource = db.prepare(`INSERT INTO sources
      (handle,display_name,tier,archetype,why_we_watch,active,notes)
      VALUES (?,?, 'Creator','Thomas taste',?, ?,?)`);
    const activate = db.prepare(`UPDATE sources SET active=1,updated_at=CURRENT_TIMESTAMP,
      archetype=COALESCE(archetype,'Thomas taste'),why_we_watch=COALESCE(why_we_watch,?) WHERE id=?`);
    const addMembership = db.prepare(`INSERT INTO feed_profile_sources (profile_id,source_id,weight)
      VALUES (?,?,?) ON CONFLICT(profile_id,source_id) DO UPDATE SET weight=excluded.weight`);

    const add = (handle, weight, activateSource, evidence) => {
      let source = findSource.get(handle);
      if (!source) {
        source = { id: Number(insertSource.run(handle, handle, evidence, activateSource ? 1 : 0,
          "Seeded only for the Thomas feed; evidence stays in the local signal corpus.").lastInsertRowid) };
      } else if (activateSource) {
        activate.run(evidence, source.id);
      }
      addMembership.run(thomas.id, source.id, weight);
    };

    for (const { handle, saves } of gathered.values()) {
      const strong = STRONG_GATHER_CREATORS.has(handle.toLowerCase()) || saves > 1;
      add(handle, strong ? Math.min(1.45, 1.1 + (saves - 1) * .15) : .62, strong,
        `Thomas saved ${saves} post${saves === 1 ? "" : "s"} from this creator in GatherOS.`);
    }
    for (const handle of PERSONAL_X_SOURCES) {
      add(handle, 1.05, true, "Named in Thomas's own @ProducingMedia_ post corpus as a creative tool or collaborator.");
    }

    return { gatherCreators: gathered.size, personalXSources: PERSONAL_X_SOURCES.length,
      memberships: db.prepare("SELECT COUNT(*) count FROM feed_profile_sources WHERE profile_id=?").get(thomas.id).count };
  })();

  const after = Object.fromEntries(db.prepare(`SELECT fp.slug,COUNT(*) count
    FROM feed_profile_sources ps JOIN feed_profiles fp ON fp.id=ps.profile_id
    GROUP BY fp.slug`).all().map(row => [row.slug, row.count]));
  for (const slug of ["fonzi", "brett"]) {
    if ((before[slug] ?? 0) !== (after[slug] ?? 0)) throw new Error(`${slug} memberships changed during Thomas seed`);
  }
  return { ...result, before, after };
}

async function main() {
  const db = getDb();
  const target = dbPath();
  const backupDir = path.join(path.dirname(target), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backup = path.join(backupDir, `signal-before-thomas-feed-${stamp}.db`);
  await db.backup(backup);
  const result = seedThomasFeed(db);
  console.log(JSON.stringify({ ok: true, db: target, backup, ...result }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
