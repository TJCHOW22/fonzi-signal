export const INTERVIEW_QUESTION_IDS = ["surprise", "position", "livedProof", "misunderstoodPoint", "concreteExample", "audienceAction"] as const;
export type InterviewQuestionId = (typeof INTERVIEW_QUESTION_IDS)[number];
export type InterviewAnswers = Record<InterviewQuestionId, string>;
export type InterviewQuestion = { id: InterviewQuestionId; eyebrow: string; prompt: string; helper: string; placeholder: string };
export type InterviewResult = { answers: InterviewAnswers; skipped: InterviewQuestionId[]; completedAt: string };
