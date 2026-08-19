import { SCORE_DIMENSIONS, type DraftCandidate, type RankedDraft, type ScoreWeights } from "./types";
export const DEFAULT_WEIGHTS: ScoreWeights = { accuracy: 0.2, voice: 0.17, originality: 0.15, clarity: 0.14, attention: 0.13, platformFit: 0.11, speakability: 0.1 };
export function scoreDraft(candidate: DraftCandidate, weights: ScoreWeights = DEFAULT_WEIGHTS): number {
  let weighted = 0, weightTotal = 0;
  for (const dimension of SCORE_DIMENSIONS) { const score = candidate.scores[dimension], weight = weights[dimension]; if (!Number.isFinite(weight) || weight < 0) throw new RangeError(`${dimension} weight must be a finite non-negative number`); if (!Number.isFinite(score) || score < 0 || score > 10) throw new RangeError(`${dimension} score must be between 0 and 10`); weighted += score * weight; weightTotal += weight; }
  if (weightTotal === 0) throw new RangeError("At least one score weight must be positive");
  return Math.round((weighted / weightTotal) * 100) / 100;
}
export function rankDrafts(candidates: readonly DraftCandidate[], weights: ScoreWeights = DEFAULT_WEIGHTS): RankedDraft[] {
  const ids = new Set<string>();
  for (const candidate of candidates) { if (!candidate.id.trim() || ids.has(candidate.id)) throw new Error(`Draft IDs must be unique and non-empty: ${candidate.id}`); ids.add(candidate.id); }
  return candidates.map((candidate, index) => ({ candidate, index, total: scoreDraft(candidate, weights) })).sort((a, b) => b.total - a.total || a.candidate.id.localeCompare(b.candidate.id) || a.index - b.index).map(({ candidate, total }, index) => ({ ...candidate, total, rank: index + 1 }));
}
