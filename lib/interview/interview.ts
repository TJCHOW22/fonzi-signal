import { INTERVIEW_QUESTION_IDS, type InterviewAnswers, type InterviewQuestion, type InterviewQuestionId, type InterviewResult } from "./types";

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  { id: "surprise", eyebrow: "Find the spark", prompt: "What surprised you most about this?", helper: "Start with the detail that made you stop, save it, or rethink something.", placeholder: "The part I did not expect was..." },
  { id: "position", eyebrow: "Take a position", prompt: "Where do you agree or disagree?", helper: "Say what you believe in plain language. A mixed or nuanced take is useful too.", placeholder: "I agree with... but I think they miss..." },
  { id: "livedProof", eyebrow: "Ground the take", prompt: "What have you seen or lived that proves your point?", helper: "Use direct experience, a decision you made, or something you watched happen.", placeholder: "I saw this firsthand when..." },
  { id: "misunderstoodPoint", eyebrow: "Name the misconception", prompt: "What would most people misunderstand about this?", helper: "Call out the tempting conclusion that is incomplete, wrong, or too simple.", placeholder: "Most people will assume... but actually..." },
  { id: "concreteExample", eyebrow: "Make it tangible", prompt: "What is the clearest concrete example?", helper: "A person, moment, number, comparison, or before-and-after is better than a general claim.", placeholder: "For example..." },
  { id: "audienceAction", eyebrow: "Land the idea", prompt: "What should the audience do differently after hearing this?", helper: "Give them one change in behavior, decision, or way of thinking.", placeholder: "The next time you..." },
] as const;

export function createEmptyInterviewAnswers(): InterviewAnswers {
  return Object.fromEntries(INTERVIEW_QUESTION_IDS.map((id) => [id, ""])) as InterviewAnswers;
}
export function normalizeInterviewAnswers(answers: InterviewAnswers): InterviewAnswers {
  return Object.fromEntries(INTERVIEW_QUESTION_IDS.map((id) => [id, answers[id].trim()])) as InterviewAnswers;
}
export function getAnsweredQuestionIds(answers: InterviewAnswers): InterviewQuestionId[] {
  return INTERVIEW_QUESTION_IDS.filter((id) => answers[id].trim().length > 0);
}
export function validateInterviewResult(result: InterviewResult): string[] {
  const skipped = new Set(result.skipped);
  const errors = INTERVIEW_QUESTION_IDS.flatMap((id) => result.answers[id].trim() || skipped.has(id) ? [] : [`${id} must have an answer or be marked as skipped`]);
  if (Number.isNaN(Date.parse(result.completedAt))) errors.push("completedAt must be a valid ISO date");
  return errors;
}
