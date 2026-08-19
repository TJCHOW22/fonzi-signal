"use server";

// Claude CLI bridge for the develop page (/ideas/[id]). The app itself stays
// LLM-free (DIRECTION.md §5) — these actions shell out ONE `claude -p` call
// each, write the result into item_sections, and never crash the page: a CLI
// failure lands as a one-line error string in the section instead.

import { revalidatePath } from "next/cache";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getDb, getItem, getItemSections, getItemSources } from "@/lib/db";
import {
  buildConceptsPrompt,
  buildInterviewPrompt,
  buildResearchPrompt,
  buildShortFormScriptPrompt,
  contentIdentity,
  extractWinningScript,
  type ItemPromptContext,
} from "@/lib/ai/item-prompts";

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
    // Claude's launcher uses `#!/usr/bin/env node`. Put the same Node runtime
    // running Next first so a stale Homebrew Node cannot break CLI startup.
    const runtimePath = path.dirname(process.execPath);
    const child = execFile(
      "claude",
      ["-p", "--model", CLAUDE_MODEL],
      {
        timeout: CLAUDE_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: `${runtimePath}:${process.env.PATH ?? ""}` },
      },
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
export async function relevantTakes(text: string, limit = 3, person?: string | null): Promise<Take[]> {
  try {
    if (!fs.existsSync(TAKES_CACHE)) return [];
    const parsed = JSON.parse(fs.readFileSync(TAKES_CACHE, "utf8")) as {
      takes?: { person?: string | null; topic?: string; take?: string }[];
    };
    const identity = contentIdentity(person ?? null);
    const takes = (parsed.takes ?? []).filter((take) => {
      if (person === undefined) return true;
      const takePerson = take.person?.trim().toLowerCase() ?? "";
      if (identity.key === "brett") return ["brett", "brett martin"].includes(takePerson);
      if (identity.key === "thomas") return ["tj", "thomas", "thomas chow"].includes(takePerson);
      if (identity.key === "fonzi") return takePerson === "fonzi";
      return takePerson === person?.trim().toLowerCase();
    });
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
  const suggested = await relevantTakes(`${ctx.item.title} ${ctx.content}`, 5, ctx.item.person);
  const lines = [
    ...(edited ? [edited] : []),
    ...suggested.map((t) => `- (${t.person ?? "?"}, ${t.topic}) ${t.take}`),
  ];
  return lines.length ? lines.join("\n") : "(no takes on file)";
}

function readContextFile(relativePath: string, maxChars: number): string {
  try {
    const file = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(file)) return "";
    const content = fs.readFileSync(file, "utf8");
    return content.length > maxChars
      ? `${content.slice(0, maxChars)}\n\n[context truncated at ${maxChars} characters]`
      : content;
  } catch {
    return "";
  }
}

async function promptContext(itemId: number, includeScriptCanon = false): Promise<ItemPromptContext | null> {
  const ctx = itemContext(itemId);
  if (!ctx) return null;
  const identity = contentIdentity(ctx.item.person);
  const personaFile = identity.key === "brett"
    ? "../../Delphis/Brett.md"
    : identity.key === "fonzi"
      ? "../../Delphis/Fonzi.md"
      : "";
  return {
    title: ctx.item.title,
    person: ctx.item.person,
    angle: ctx.item.angle,
    notes: ctx.item.notes,
    sourceMaterial: ctx.content,
    sections: ctx.sections,
    takes: await takesBlock(itemId),
    persona: personaFile ? readContextFile(personaFile, 18_000) : "",
    scriptCanon: includeScriptCanon
      ? readContextFile("../../Knowledge/Fonzi - Scripts.md", 20_000)
      : "",
  };
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
  const ctx = await promptContext(itemId);
  if (!ctx) return;
  const prompt = buildInterviewPrompt(ctx);

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
  const ctx = await promptContext(itemId);
  if (!ctx) return;
  const prompt = buildConceptsPrompt(ctx);

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
  const ctx = await promptContext(itemId);
  if (!ctx) return;
  const db = getDb();
  db.prepare("UPDATE items SET stage = 'exploring', research_status = 'researching', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(itemId);
  const prompt = buildResearchPrompt(ctx);
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

// ---------------------------------------------------- short-form script

export async function generateShortFormScript(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  const ctx = await promptContext(itemId, true);
  if (!ctx) return;

  try {
    const generation = await runClaude(buildShortFormScriptPrompt(ctx));
    upsertSection(itemId, "script_generation", generation);
    upsertSection(itemId, "final_script", extractWinningScript(generation));
    upsertSection(itemId, "script_generation_error", null);
    getDb().prepare(
      "UPDATE items SET stage = 'drafting', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(itemId);
  } catch (error) {
    const message = `script generation failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`;
    upsertSection(itemId, "script_generation_error", message);
  }
  revalidatePath("/ideas");
  revalidatePath(`/ideas/${itemId}`);
}
