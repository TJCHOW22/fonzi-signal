import assert from "node:assert/strict";
import test from "node:test";
import { rankPost } from "../../lib/feed/ranking.ts";

const post = (overrides = {}) => ({
  id: 1,tweet_id:"1",source_id:1,url:null,text:"A founder explains the weird hiring wedge that nearly killed the company",
  posted_at:"2026-08-18T12:00:00Z",scraped_at:null,impressions:1000,likes:50,replies:5,reposts:10,bookmarks:8,quotes:0,
  is_quote:0,is_reply:0,media_type:null,save_rate:null,baseline_multiple:2,heat:1,heat_basis:"full",fit:80,
  fit_subscores:null,angle:null,angle_for:null,why_it_worked:"specific tension",lane:"company story",status:"new",raw:null,
  media_url:null,thumb_path:null,media_width:null,media_height:null,topic:"hiring",...overrides,
});
const weights = { profileFit:.3,momentum:.15,freshness:.15,story:.2,novelty:.1,learned:.1 };
const context = (slug, keywords) => ({ slug, weights, lenses:[`${slug} lens`],
  topics:[{slug,keywords,weight:1.5}],learned:[],now:new Date("2026-08-18T13:00:00Z") });

test("the same post ranks differently per profile", () => {
  const thomas = rankPost(post(), context("thomas", ["tutorial"]));
  const fonzi = rankPost(post(), context("fonzi", ["hiring"]));
  const brett = rankPost(post(), context("brett", ["founder"]));
  assert.notEqual(thomas.score, fonzi.score); assert.notEqual(fonzi.score, brett.score);
});
test("freshness, momentum, and story are capped", () => {
  const ranked = rankPost(post({likes:1_000_000_000,fit:10_000}), context("fonzi", ["hiring"]));
  for (const value of Object.values(ranked.components)) assert.ok(value >= 0 && value <= 1);
});
test("lenses and wildcard are stable", () => {
  const a = rankPost(post(), context("brett", ["founder"])); const b = rankPost(post(), context("brett", ["founder"]));
  assert.deepEqual(a.stableLenses,b.stableLenses); assert.equal(a.wildcardFrame,b.wildcardFrame);
});

const thomasWeights = { tasteMatch:.30,rabbitHole:.22,hiddenCompanyStory:.16,
  experimentability:.14,originality:.10,freshness:.05,momentum:.03 };
const thomasContext = () => ({ slug:"thomas",weights:thomasWeights,lenses:["rabbit-hole lens"],learned:[],sourceWeight:1.1,
  topics:[{slug:"brand-archaeology",keywords:["vintage","artifact","refrigerator","marketing history"],weight:1.6}],
  now:new Date("2026-08-18T13:00:00Z") });

test("Thomas favors an older designed-object story over generic viral news", () => {
  const artifact = rankPost(post({tweet_id:"artifact",posted_at:"2026-08-14T12:00:00Z",likes:40,reposts:2,bookmarks:12,
    text:"Why Coca-Cola designed vintage refrigerators and clocks: the overlooked marketing history behind each physical artifact",
    topic:"brand archaeology",fit:0}), thomasContext());
  const news = rankPost(post({tweet_id:"news",posted_at:"2026-08-18T12:55:00Z",likes:2_000_000,reposts:80_000,bookmarks:20_000,
    text:"OpenAI launched its latest frontier AI model with new benchmarks for recruiting and hiring",topic:"AI news",fit:100}), thomasContext());
  assert.ok(artifact.score > news.score, `${artifact.score} should beat ${news.score}`);
});

test("generic AI, recruiting, motivation, and growth advice are hard downranked for Thomas", () => {
  const base = post({tweet_id:"clean",text:"A visual creative workflow you can build and test through a specific design experiment"});
  const generic = post({tweet_id:"generic",text:`${base.text}. New AI model benchmarks for hiring, founder hustle motivation, and a 10x growth hack.`});
  const cleanRank = rankPost(base, thomasContext());
  const genericRank = rankPost(generic, thomasContext());
  assert.equal(genericRank.components.downrankPenalty,.72);
  assert.ok(genericRank.score < cleanRank.score * .55);
});

test("Thomas never inherits a Fonzi or Brett angle from the shared post", () => {
  const cleanPost = post({
    text:"A vintage Coca-Cola refrigerator reveals how brands entered the home",
    topic:null, angle_for:"Brett", angle:"Fonzi should argue this through hiring",
    lane:"hiring", why_it_worked:"candidate recruiting market",
  });
  const ranked = rankPost(cleanPost, thomasContext());
  const withoutSharedAnalysis = rankPost({...cleanPost,angle:null,lane:null,why_it_worked:null}, thomasContext());
  assert.notEqual(ranked.bestAngle,"Fonzi should argue this through hiring");
  assert.equal(ranked.score,withoutSharedAnalysis.score);
  assert.match(ranked.bestAngle,/brand archaeology|rabbit-hole/i);
});

const brettWeights = { brettPillars:.38,targetMatch:.22,brettAngle:.14,profileFit:.10,
  story:.08,learned:.04,novelty:.02,freshness:.01,momentum:.01 };
const brettContext = (overrides = {}) => ({ slug:"brett",weights:brettWeights,lenses:["hidden decision lens"],learned:[],
  topics:[{slug:"company-stories",keywords:["company","founder","business model","pivot"],weight:1.5}],
  now:new Date("2026-08-18T13:00:00Z"),...overrides });

test("Brett targeting and angle_for Brett materially lift a post", () => {
  const base = post({tweet_id:"base",text:"The company founder changed its business model after a crisis",angle_for:null});
  const untargeted = rankPost(base, brettContext());
  const targeted = rankPost({...base,tweet_id:"targeted",angle_for:"Brett"}, brettContext({targetWeight:1.5}));
  assert.equal(targeted.components.brettAngle,1);
  assert.equal(targeted.components.targetMatch,1);
  assert.ok(targeted.score > untargeted.score + .25, `${targeted.score} should materially beat ${untargeted.score}`);
});

test("Brett favors checkable company history and founder mechanics over generic virality", () => {
  const company = rankPost(post({tweet_id:"history",likes:20,reposts:2,fit:0,
    text:"Founded in 1998, the founder refused the first term sheet, then changed the business model after the company nearly failed. A filing shows revenue grew 40%."}), brettContext());
  const viral = rankPost(post({tweet_id:"viral",likes:2_000_000,reposts:90_000,fit:100,
    text:"Breaking: the top 10 AI tools every founder needs to 10x your hustle this week"}), brettContext());
  assert.ok(company.components.brettPillars >= .8);
  assert.ok(company.score > viral.score, `${company.score} should beat ${viral.score}`);
  assert.ok(viral.components.downrankPenalty >= .7);
});
