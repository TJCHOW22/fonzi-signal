import type Database from "better-sqlite3";

export const PROFILE_SLUGS = ["thomas", "fonzi", "brett"] as const;
export type ProfileSlug = (typeof PROFILE_SLUGS)[number];

export type RankingComponent =
  | "profileFit" | "momentum" | "freshness" | "story" | "novelty" | "learned"
  | "tasteMatch" | "rabbitHole" | "hiddenCompanyStory" | "experimentability" | "originality"
  | "brettPillars" | "brettAngle" | "targetMatch";
export type FeedWeights = Partial<Record<RankingComponent, number>>;

const PROFILES: Record<ProfileSlug, { name: string; description: string; weights: FeedWeights; lenses: string[] }> = {
  thomas: {
    name: "Thomas", description: "Creative craft, designed objects, useful experiments, and deep rabbit holes.",
    weights: { tasteMatch: .30, rabbitHole: .22, hiddenCompanyStory: .16, experimentability: .14, originality: .10, freshness: .05, momentum: .03 },
    lenses: ["what rabbit hole does this open?", "what can i make or test from this?", "what hidden decision or object makes the story?"],
  },
  fonzi: {
    name: "Fonzi", description: "Candidate truth, hiring shifts, brand relevance, and usable Fonzi angles.",
    weights: { profileFit: .31, momentum: .18, freshness: .16, story: .16, novelty: .08, learned: .11 },
    lenses: ["what does this reveal about candidates?", "what changed in hiring?", "what is the Fonzi angle?"],
  },
  brett: {
    name: "Brett", description: "Company origins, founder decisions, business-model wedges, crises, capital, talent, and checkable surprises.",
    weights: { brettPillars: .38, targetMatch: .22, brettAngle: .14, profileFit: .10, story: .08, learned: .04, novelty: .02, freshness: .01, momentum: .01 },
    lenses: ["what hidden decision changed the company?", "where did the founder, business model, or capital create tension?", "what surprising fact can we verify?"],
  },
};

const TOPICS: Array<[string, string, string, Partial<Record<ProfileSlug, number>>]> = [
  ["ai-tools", "AI tools", "ai,agent,model,llm,automation,prompt,workflow", { fonzi: .8 }],
  ["hiring", "Engineering hiring", "hiring,recruiting,candidate,interview,engineer,talent,job", { fonzi: 1.5 }],
  ["candidate-truth", "Candidate truth", "candidate,assessment,interview,resume,signal,screening", { fonzi: 1.45 }],
  ["company-stories", "Company stories", "company,startup,founded,origin,launch,grew,business", { brett: 1.4 }],
  ["founder-tension", "Founder tension", "founder,failed,pivot,nearly,crisis,controversy,wedge", { brett: 1.55 }],
  ["business-model-wedges", "Business-model wedges", "business model,revenue,pricing,distribution,wedge,go-to-market,monetization", { brett: 1.55 }],
  ["capital-and-vc", "Funding and VC mechanics", "funding,venture capital,vc,term sheet,valuation,round,investor,dilution,runway", { brett: 1.35 }],
  ["company-strategy", "Talent, AI, and company strategy", "talent,organization,hiring strategy,ai strategy,company strategy,competitive advantage", { brett: 1.25 }],
  ["content", "Content craft", "story,hook,content,video,write,creative,audience", { fonzi: 1.05, brett: .85 }],
  ["creative-craft", "Creative craft and visual experimentation", "art direction,design,motion,animation,editing,cinematography,visual,typography,photography,film,video format,storyboard", { thomas: 1.55 }],
  ["creative-systems", "Creative systems", "creative workflow,creative tool,prototype,build process,production system,editorial system,automation,remotion,experiment,steal like an artist", { thomas: 1.4 }],
  ["brand-archaeology", "Brand archaeology and designed objects", "brand history,marketing history,archive,vintage,artifact,packaging,merchandise,product extension,designed object,coca-cola,refrigerator,clock,furniture", { thomas: 1.6 }],
  ["local-tactile-culture", "Local and tactile culture", "neighborhood,local,street,shop,restaurant,material,printed,handmade,physical object,signage,city,nyc,texture", { thomas: 1.25 }],
  ["creative-philosophy", "Creative philosophy", "taste,originality,creative philosophy,craft,curiosity,inspiration,attention,observation,artist,idea", { thomas: 1.3 }],
];

export function isProfileSlug(value: string): value is ProfileSlug {
  return PROFILE_SLUGS.includes(value as ProfileSlug);
}

export function ensureFeedDefaults(db: Database.Database) {
  const profile = db.prepare(`INSERT INTO feed_profiles (slug,name,description,weights_json,lenses_json)
    VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description,
    weights_json=excluded.weights_json, lenses_json=excluded.lenses_json, updated_at=CURRENT_TIMESTAMP`);
  const topic = db.prepare(`INSERT INTO feed_topics (slug,label,keywords) VALUES (?,?,?)
    ON CONFLICT(slug) DO UPDATE SET label=excluded.label, keywords=excluded.keywords`);
  const profileTopic = db.prepare(`INSERT INTO feed_profile_topics (profile_id,topic_id,weight) VALUES (?,?,?)
    ON CONFLICT(profile_id,topic_id) DO UPDATE SET weight=excluded.weight`);
  const tx = db.transaction(() => {
    for (const slug of PROFILE_SLUGS) {
      const p = PROFILES[slug];
      profile.run(slug, p.name, p.description, JSON.stringify(p.weights), JSON.stringify(p.lenses));
    }
    // Thomas is intentionally isolated from the company feeds. Rebuild only
    // his configured topic lanes so old generic memberships cannot leak back.
    const thomasId = (db.prepare("SELECT id FROM feed_profiles WHERE slug='thomas'").get() as { id: number }).id;
    db.prepare("DELETE FROM feed_profile_topics WHERE profile_id=?").run(thomasId);
    for (const [slug, label, keywords, memberships] of TOPICS) {
      topic.run(slug, label, keywords);
      const topicId = (db.prepare("SELECT id FROM feed_topics WHERE slug=?").get(slug) as { id: number }).id;
      for (const [profileSlug, weight] of Object.entries(memberships)) {
        const profileId = (db.prepare("SELECT id FROM feed_profiles WHERE slug=?").get(profileSlug) as { id: number }).id;
        profileTopic.run(profileId, topicId, weight);
      }
    }
    // Source membership is seeded explicitly per profile. Never cross-join the
    // shared roster into every feed: that was the source of Thomas feed drift.
  });
  tx();
}
