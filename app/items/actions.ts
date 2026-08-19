"use server";

// Claude CLI bridge for the develop page (/ideas/[id]). The app itself stays
// LLM-free (DIRECTION.md §5) — these actions shell out ONE `claude -p` call
// each, write the result into item_sections, and never crash the page: a CLI
// failure lands as a one-line error string in the section instead.

import { revalidatePath } from "next/cache";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { getDb, getItem, getItemSections, getItemSources } from "@/lib/db";

const CLAUDE_MODEL = "claude-sonnet-5";
const CLAUDE_TIMEOUT_MS = 120_000;
const TAKES_CACHE =
  "/Users/thomaschow/100M_Hub/Fonzi/Workspaces/X Engine/scripts/data/takes-cache.json";

function upsertSection(itemId: number, section: string, content: string | null) {
  getDb()
    .prepare(
      `INSERT INTO item_sections (item_id, section, content_md, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (item_id, section) DO UPDATE SET
         content_md = excluded.content_md, updated_at = CURRENT_TIMESTAMP`
    )
    .run(itemId, section, content);
  getDb().prepare("UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(itemId);
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", "--model", CLAUDE_MODEL],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // the CLI often reports the real failure (e.g. expired OAuth) on
          // stdout with an empty stderr — surface whichever has substance
          const detail = stderr?.trim() || stdout?.trim() || err.message;
          reject(new Error(detail));
        } else resolve(stdout.trim());
      }
    );
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

export type Take = { person: string | null; topic: string; take: string };

/** Top take-bank matches by naive keyword overlap with the given text.
 * Reads the X Engine takes cache when present; empty array otherwise. */
export async function relevantTakes(text: string, limit = 3): Promise<Take[]> {
  try {
    if (!fs.existsSync(TAKES_CACHE)) return [];
    const parsed = JSON.parse(fs.readFileSync(TAKES_CACHE, "utf8")) as {
      takes?: { person?: string | null; topic?: string; take?: string }[];
    };
    const takes = parsed.takes ?? [];
    const stop = new Set([
      "this", "that", "with", "have", "from", "they", "what", "will", "your",
      "about", "their", "there", "when", "more", "than", "just", "like",
      "because", "into", "them", "were", "been", "being", "over", "only",
    ]);
    const words = new Set(
      (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !stop.has(w))
    );
    return takes
      .map((t) => {
        const tw = `${t.topic ?? ""} ${t.take ?? ""}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
        const score = tw.filter((w) => words.has(w)).length;
        return { take: t, score };
      })
      .filter((x) => x.score > 0 && x.take.take)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => ({
        person: x.take.person ?? null,
        topic: x.take.topic ?? "",
        take: x.take.take ?? "",
      }));
  } catch {
    return [];
  }
}

function itemContext(itemId: number) {
  const item = getItem(itemId);
  if (!item) return null;
  const sources = getItemSources(itemId);
  const sections = getItemSections(itemId);
  const content = sources
    .map((s) => {
      const lines: string[] = [];
      if (s.source_title) lines.push(`source: ${s.source_title}`);
      if (s.source_text) lines.push(`content: ${s.source_text}`);
      if (s.why_it_worked) lines.push(`why it worked: ${s.why_it_worked}`);
      if (s.saved_note) lines.push(`my saved note: ${s.saved_note}`);
      if (s.url) lines.push(`url: ${s.url}`);
      return lines.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return { item, sections, content: content || "(no source content on file)" };
}

async function takesBlock(itemId: number): Promise<string> {
  const ctx = itemContext(itemId);
  if (!ctx) return "(none)";
  const edited = ctx.sections["founder_takes"]?.trim();
  const suggested = await relevantTakes(`${ctx.item.title} ${ctx.content}`);
  const lines = [
    ...(edited ? [edited] : []),
    ...suggested.map((t) => `- (${t.person ?? "?"}, ${t.topic}) ${t.take}`),
  ];
  return lines.length ? lines.join("\n") : "(no takes on file)";
}

// ------------------------------------------------------------- interview

/** Q/A storage format inside item_sections('interview').content_md:
 *
 *   ### Q: <question>
 *   A: <answer, possibly multi-line, possibly empty>
 */
export async function runInterview(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  const ctx = itemContext(itemId);
  if (!ctx) return;
  const takes = await takesBlock(itemId);

  const prompt = `You are interviewing TJ (Thomas Chow, Head of Content at Fonzi, an AI-powered engineering talent marketplace) to pull HIS actual take out of him — the get-interviewed method: the interviewer asks, the subject's real opinion becomes the content.

The content item being developed:
title: ${ctx.item.title}
angle so far: ${ctx.item.angle ?? "(none yet)"}
notes: ${ctx.item.notes ?? "(none)"}

source material:
${ctx.content}

founder takes on file:
${takes}

Write exactly 5 pointed interview questions that would pull TJ's actual opinion out. Rules:
- each question must force a position, not a summary ("where do you disagree with X" beats "what do you think about X")
- ground each question in the source material above, never in invented facts
- no softballs, no yes/no questions, no hype words
- return ONLY the 5 questions, one per line, numbered 1-5, nothing else`;

  let content: string;
  try {
    const out = await runClaude(prompt);
    const questions = out
      .split("\n")
      .map((l) => l.match(/^\s*\d+[.)]\s*(.+)$/)?.[1]?.trim())
      .filter((x): x is string => Boolean(x));
    content =
      questions.length > 0
        ? questions.map((q) => `### Q: ${q}\nA: `).join("\n\n")
        : out; // model ignored the format — keep the raw output, still editable
  } catch (e) {
    content = `interview failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}`;
  }
  upsertSection(itemId, "interview", content);
  revalidatePath(`/ideas/${itemId}`);
}

export async function saveInterviewAnswers(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const question = formData.get(`q_${i}`);
    if (question === null) break;
    const answer = String(formData.get(`a_${i}`) ?? "").trim();
    parts.push(`### Q: ${String(question).trim()}\nA: ${answer}`);
  }
  if (parts.length === 0) return;
  upsertSection(itemId, "interview", parts.join("\n\n"));
  revalidatePath(`/ideas/${itemId}`);
}

// -------------------------------------------------------------- concepts

export async function runConcepts(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  const ctx = itemContext(itemId);
  if (!ctx) return;
  const takes = await takesBlock(itemId);

  const prompt = `You generate content concept directions for Fonzi (AI-powered engineering talent marketplace). Ground EVERYTHING in the material below — never fabricate a take, a number, or an opinion. If the material doesn't support a concept, don't write it.

item: ${ctx.item.title}
angle: ${ctx.item.angle ?? "(none yet)"}

source material:
${ctx.content}

reusable pattern extracted so far:
${ctx.sections["pattern"] ?? "(none)"}

founder takes on file:
${takes}

interview answers so far:
${ctx.sections["interview"] ?? "(none)"}

Write 3-5 concept directions. Hard rules:
- pattern remix, not copying: reuse the source's MECHANISM (hook shape, structure), never its wording or beat-by-beat structure
- cite which take or data point grounds each concept — if nothing grounds it, cut it
- no hype words (game-changer, revolutionary, unlock, leverage), no AI-writing tells
- for each concept: a working title, 2-3 sentences of the direction, the grounding citation, then a 2-line critique covering voice fit, idea strength, and platform fit
- mark exactly one concept WINNER with one line on why it wins
- plain markdown, ### headings per concept, nothing else`;

  let content: string;
  try {
    content = await runClaude(prompt);
  } catch (e) {
    content = `concepts failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}`;
  }
  upsertSection(itemId, "concepts", content);
  revalidatePath(`/ideas/${itemId}`);
}

export async function runDeepResearch(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  const ctx = itemContext(itemId);
  if (!ctx) return;
  const db = getDb();
  db.prepare("UPDATE items SET stage = 'exploring', research_status = 'researching', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(itemId);
  const takes = await takesBlock(itemId);
  const prompt = `You are the deep-research editor for Fonzi. Build a decision dossier for a human who must decide whether this idea deserves a real opinion and production time.

IDEA: ${ctx.item.title}
CURRENT ANGLE: ${ctx.item.angle ?? "(none)"}
NOTES: ${ctx.item.notes ?? "(none)"}

SOURCE MATERIAL:
${ctx.content}

FOUNDER TAKES ON FILE:
${takes}

Return concise markdown with exactly these sections:
## Why this matters now
## What the source actually claims
## Audience tension
## Supporting evidence
## Counterevidence and skeptical views
## Community and Reddit questions to investigate
## Relevant founder beliefs
## Three grounded Fonzi angles
## Recommended format
## Questions for the human interview
## Evidence gaps

Rules: never invent Reddit opinions, facts, quotes, metrics, or founder beliefs. If live community evidence was not supplied, write the exact research queries and communities to inspect instead of pretending research occurred. Distinguish observed evidence from hypotheses. Each angle must say what grounds it and who it is for.`;
  try {
    const dossier = await runClaude(prompt);
    upsertSection(itemId, "research_dossier", dossier);
    const summary = dossier.split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#"))?.slice(0, 280) ?? "Deep research dossier is ready for review.";
    db.prepare("UPDATE items SET research_status = 'research_ready', research_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, itemId);
  } catch (error) {
    db.prepare("UPDATE items SET research_status = 'needs_input', research_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(`Research needs attention: ${error instanceof Error ? error.message.slice(0, 180) : "unknown error"}`, itemId);
  }
  revalidatePath("/ideas");
  revalidatePath("/angle-feed");
  revalidatePath(`/ideas/${itemId}`);
}
