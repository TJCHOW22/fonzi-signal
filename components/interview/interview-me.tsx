"use client";

import { useId, useState } from "react";
import { createEmptyInterviewAnswers, INTERVIEW_QUESTIONS, normalizeInterviewAnswers, validateInterviewResult } from "@/lib/interview/interview";
import type { InterviewAnswers, InterviewQuestionId, InterviewResult } from "@/lib/interview/types";

type InterviewMeProps = { onComplete: (result: InterviewResult) => void | Promise<void>; initialAnswers?: Partial<InterviewAnswers>; title?: string };

export function InterviewMe({ onComplete, initialAnswers, title = "Interview me" }: InterviewMeProps) {
  const [answers, setAnswers] = useState<InterviewAnswers>(() => ({ ...createEmptyInterviewAnswers(), ...initialAnswers }));
  const [skipped, setSkipped] = useState<InterviewQuestionId[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaId = useId();
  const question = INTERVIEW_QUESTIONS[currentIndex];
  const isLast = currentIndex === INTERVIEW_QUESTIONS.length - 1;

  function updateAnswer(value: string) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setSkipped((current) => current.filter((id) => id !== question.id));
    setError(null);
  }

  async function complete(skippedIds = skipped) {
    const result: InterviewResult = { answers: normalizeInterviewAnswers(answers), skipped: [...new Set(skippedIds)], completedAt: new Date().toISOString() };
    if (validateInterviewResult(result).length) { setError("Answer this question or skip it before finishing."); return; }
    setIsSubmitting(true); setError(null);
    try { await onComplete(result); }
    catch { setError("This interview could not be saved. Your answers are still here."); }
    finally { setIsSubmitting(false); }
  }

  function proceed() {
    if (!answers[question.id].trim()) { setError("Add an answer or choose Skip for now."); return; }
    if (isLast) void complete(); else { setError(null); setCurrentIndex((index) => index + 1); }
  }

  function skip() {
    const nextSkipped = skipped.includes(question.id) ? skipped : [...skipped, question.id];
    setSkipped(nextSkipped); setError(null);
    if (isLast) void complete(nextSkipped); else setCurrentIndex((index) => index + 1);
  }

  const helperId = `${textareaId}-helper`;
  const errorId = `${textareaId}-error`;
  return (
    <section aria-labelledby={`${textareaId}-title`} className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="border-b border-zinc-100 px-6 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${textareaId}-title`} className="text-sm font-medium text-zinc-900">{title}</h2>
          <p className="text-xs tabular-nums text-zinc-500" aria-live="polite">{currentIndex + 1} of {INTERVIEW_QUESTIONS.length}</p>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label="Interview progress" aria-valuemin={1} aria-valuemax={INTERVIEW_QUESTIONS.length} aria-valuenow={currentIndex + 1}>
          <div className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((currentIndex + 1) / INTERVIEW_QUESTIONS.length) * 100}%` }} />
        </div>
      </header>
      <div className="px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{question.eyebrow}</p>
        <label htmlFor={textareaId} className="mt-3 block text-pretty text-2xl font-medium leading-tight tracking-tight text-zinc-950 sm:text-3xl">{question.prompt}</label>
        <p id={helperId} className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">{question.helper}</p>
        <textarea id={textareaId} value={answers[question.id]} onChange={(event) => updateAnswer(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); proceed(); } }} rows={7} autoFocus placeholder={question.placeholder} aria-describedby={`${helperId}${error ? ` ${errorId}` : ""}`} aria-invalid={error ? true : undefined} className="mt-6 block w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base leading-7 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100" />
        <div className="mt-3 min-h-5">{error ? <p id={errorId} role="alert" className="text-sm text-red-600">{error}</p> : <p className="text-xs text-zinc-400">⌘ Enter to continue</p>}</div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-6 py-4 sm:px-8">
        <button type="button" onClick={() => { setError(null); setCurrentIndex((index) => Math.max(0, index - 1)); }} disabled={currentIndex === 0 || isSubmitting} className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35">Back</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={skip} disabled={isSubmitting} className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50">Skip for now</button>
          <button type="button" onClick={proceed} disabled={isSubmitting} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50">{isSubmitting ? "Saving…" : isLast ? "Finish interview" : "Continue"}</button>
        </div>
      </footer>
    </section>
  );
}
