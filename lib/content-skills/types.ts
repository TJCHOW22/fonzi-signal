export const VOICES = ["thomas", "brett", "seb", "fonzi"] as const;
export type Voice = (typeof VOICES)[number];
export const PLATFORMS = ["universal", "x", "linkedin", "short-video"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type SkillId = "channel-learning" | "idea-evaluation" | "interview" | "short-form-script" | "x-post" | "linkedin-post" | "shot-list" | "repurposing" | "ai-writing-detection";
export interface ResearchProtocol { sampleSize: 50; inspect: readonly ("copy" | "media" | "context" | "performance")[]; compareToAccountBaseline: true; dimensions: readonly string[]; separateUniversalAndPlatformPatterns: true }
export interface ContentSkill { id: SkillId; version: `${number}.${number}.${number}`; title: string; purpose: string; platform: Platform; research: ResearchProtocol; rules: readonly string[]; output: readonly string[] }
export const SCORE_DIMENSIONS = ["accuracy", "voice", "originality", "clarity", "attention", "platformFit", "speakability"] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type DraftScores = Record<ScoreDimension, number>;
export interface DraftCandidate { id: string; text: string; scores: DraftScores }
export type ScoreWeights = Record<ScoreDimension, number>;
export interface RankedDraft extends DraftCandidate { total: number; rank: number }
