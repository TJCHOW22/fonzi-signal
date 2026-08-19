import type { Post } from "../db.ts";
import type { FeedWeights, ProfileSlug } from "./config.ts";

export type RankingContext = {
  slug: ProfileSlug; weights: FeedWeights; lenses: string[];
  topics: Array<{ slug: string; keywords: string[]; weight: number }>;
  learned: Array<{ interest: string; weight: number }>;
  sourceWeight?: number; targetWeight?: number; interacted?: boolean; now?: Date;
};

export type RankedPost = {
  postId: number; score: number; components: Record<string, number>;
  bestAngle: string; stableLenses: string[]; wildcardFrame: string;
};

const cap = (n: number, max = 1) => Math.max(0, Math.min(max, n));
const words = (value: string) => value.toLowerCase();
const hash = (value: string) => [...value].reduce((n, c) => ((n * 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const countMatches = (text: string, patterns: RegExp[]) => patterns.reduce((n, pattern) => n + Number(pattern.test(text)), 0);

function thomasDownrank(text: string) {
  const penalties = [
    /\b(?:new|latest|frontier) (?:ai )?(?:model|llm)|\b(?:openai|anthropic|google|meta) (?:released|announced|launched)|\bbenchmark(?:s|ing)?\b/i,
    /\b(?:hiring|recruiting|recruiter|candidate|interview process|job market|talent acquisition)\b/i,
    /\b(?:grind|hustle|never give up|founder mindset|motivation|work harder|wake up at)\b/i,
    /\b(?:growth hack|grow your audience|10x|scale to|mrr|arr|lead generation|sales funnel|personal brand)\b/i,
  ];
  const aiTechWithoutCreativeMechanism = /\b(?:ai|llm|model|claude|gpt|software engineer|coding tool|vibecod)/i.test(text)
    && !/\b(?:video|design|visual|motion|animation|edit|creative|camera|cinematography|art direction|film|image|audio|music|workflow|prototype)\b/i.test(text);
  return cap(countMatches(text, penalties) * .45 + (aiTechWithoutCreativeMechanism ? .45 : 0), .72);
}

function brettSignals(text: string) {
  const pillars = [
    /\b(?:founded|origin|started as|early days|company history|before it became)\b/i,
    /\b(?:founder|cofounder|ceo)\b.{0,80}\b(?:decided|refused|fired|left|bet|risked|disagreed|tension)\b|\b(?:decision|conflict|tension)\b.{0,80}\bfounder\b/i,
    /\b(?:business model|revenue model|pricing|distribution|go-to-market|monetization|wedge)\b/i,
    /\b(?:pivot|nearly failed|almost died|crisis|bankrupt|survived|turnaround|runway)\b/i,
    /\b(?:funding|venture capital|vc|term sheet|valuation|series [a-z]|investor|dilution|cap table)\b/i,
    /\b(?:talent strategy|hiring strategy|ai strategy|company strategy|organization design|competitive advantage)\b/i,
    /\b(?:surprisingly|little-known|overlooked|nobody talks about|actually|contrary to)\b.{0,100}\b(?:\d+[a-z%]?|because|source|filing|reported)\b/i,
  ];
  return cap(countMatches(text, pillars) * .2);
}

function brettDownrank(text: string) {
  return cap(countMatches(text, [
    /\b(?:top|best) \d+ (?:ai )?tools|\b\d+ (?:ai )?tools (?:you|every)|\btools you need\b/i,
    /\b(?:breaking|just in|latest ai news|daily ai news|this week in ai)\b/i,
    /\b(?:grind|hustle|rise and grind|founder mindset|motivation|work harder|10x your)\b/i,
  ]) * .38, .76);
}

export function rankPost(post: Post, ctx: RankingContext): RankedPost {
  const angleOwner = post.angle_for?.trim().toLowerCase();
  const sharedAnalysisFitsProfile = ctx.slug !== "thomas" || angleOwner === "tj" || angleOwner === "thomas";
  const profileAnalysis = sharedAnalysisFitsProfile ? [post.lane, post.angle, post.why_it_worked] : [];
  const text = words([post.text, post.topic, ...profileAnalysis].filter(Boolean).join(" "));
  const topicMatches = ctx.topics.filter(t => t.keywords.some(k => text.includes(k)));
  const topicStrength = cap(topicMatches.reduce((n, t) => n + t.weight * .32, 0));
  const sourceStrength = cap((ctx.sourceWeight ?? 0) * .45);
  const targetMatch = cap(ctx.targetWeight ?? 0);
  const profileFit = cap(topicStrength + sourceStrength * .4 + targetMatch * .35);
  const engagement = (post.likes ?? 0) + 2 * (post.reposts ?? 0) + 1.5 * (post.replies ?? 0) + 3 * (post.bookmarks ?? 0);
  const momentum = cap(Math.log10(engagement + 1) / 5 + cap(post.baseline_multiple ?? 0, 5) / 10);
  const ageHours = Math.max(0, ((ctx.now ?? new Date()).getTime() - new Date(post.posted_at ?? post.scraped_at ?? 0).getTime()) / 36e5);
  const freshness = Number.isFinite(ageHours) ? cap(Math.exp(-ageHours / 120)) : 0;
  const storySignals = [...profileAnalysis, post.is_quote ? "quote" : null].filter(Boolean).length;
  const story = cap(storySignals * .2 + (text.length > 220 ? .18 : 0) + (post.fit ?? 0) / 200);
  const novelty = ctx.interacted ? 0 : cap(.55 + ((hash(`${ctx.slug}:${post.tweet_id}`) % 40) / 100));
  const learned = cap(ctx.learned.reduce((n, i) => n + (text.includes(i.interest.toLowerCase()) ? i.weight : 0), 0));
  const tokenList = text.match(/[a-z0-9][a-z0-9'-]+/g) ?? [];
  const lexicalDiversity = tokenList.length ? new Set(tokenList).size / tokenList.length : 0;
  const specificity = countMatches(text, [/\b\d+[a-z%]?\b/i, /\b(?:because|instead|until|after|before|behind|why)\b/i, /[“”"']/]);
  const rabbitHole = cap(topicStrength * .52 + (text.length > 260 ? .18 : 0) + (text.includes("?") ? .08 : 0)
    + countMatches(text, [/\b(?:history|archive|origin|process|breakdown|deep dive|story behind|how|why)\b/i, /\b(?:forgotten|overlooked|unexpected|weird|rabbit hole)\b/i]) * .13);
  const hiddenCompanyStory = cap(countMatches(text, [
    /\b(?:brand|company|business|manufacturer|founded|campaign|marketing)\b/i,
    /\b(?:archive|vintage|artifact|packaging|merchandise|product extension|refrigerator|clock|furniture|object)\b/i,
    /\b(?:behind|origin|decision|designed|made|why)\b/i,
  ]) * .24 + (profileAnalysis.some(Boolean) ? .12 : 0));
  const experimentability = cap(countMatches(text, [
    /\b(?:workflow|process|tool|prototype|experiment|template|technique|tutorial|step-by-step)\b/i,
    /\b(?:make|build|try|test|create|design|edit|animate|shoot|write)\b/i,
    /\b(?:remotion|after effects|davinci|figma|camera|prompt)\b/i,
  ]) * .24 + (post.media_type ? .08 : 0));
  const originality = cap(.18 + lexicalDiversity * .42 + specificity * .10
    + countMatches(text, [/\b(?:counterintuitive|unusual|original|nobody|overlooked|strange|specific)\b/i]) * .12);
  const tasteMatch = cap(topicStrength * .55 + sourceStrength * .55 + learned * .35);
  const brettPillars = ctx.slug === "brett" ? brettSignals(text) : 0;
  const brettAngle = ctx.slug === "brett" && post.angle_for?.trim().toLowerCase() === "brett" ? 1 : 0;
  const downrankPenalty = ctx.slug === "thomas" ? thomasDownrank(text) : ctx.slug === "brett" ? brettDownrank(text) : 0;
  const components = { profileFit, momentum, freshness, story, novelty, learned,
    tasteMatch, rabbitHole, hiddenCompanyStory, experimentability, originality,
    brettPillars, brettAngle, targetMatch, downrankPenalty };
  const weightedScore = Object.entries(ctx.weights).reduce((n, [key, weight]) =>
    n + (components[key as keyof typeof components] ?? 0) * (weight ?? 0), 0);
  const score = weightedScore * (1 - downrankPenalty);
  const bestTopic = [...topicMatches].sort((a, b) => b.weight - a.weight)[0]?.slug.replaceAll("-", " ");
  const sharedAngle = post.angle?.trim();
  const bestAngle = (sharedAnalysisFitsProfile ? sharedAngle : null)
    || (bestTopic ? `${bestTopic}: ${ctx.lenses[0]}` : ctx.lenses[0]);
  const wildcardTemplates = [
    "argue the opposite and find where it becomes true",
    "turn the overlooked detail into the opening scene",
    "follow the second-order effect nobody is discussing",
    "explain this through one person's real decision",
  ];
  const wildcardFrame = wildcardTemplates[hash(`${post.tweet_id}:${ctx.slug}`) % wildcardTemplates.length];
  return { postId: post.id, score: Number(cap(score).toFixed(6)), components, bestAngle, stableLenses: ctx.lenses, wildcardFrame };
}
