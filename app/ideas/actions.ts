"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, ITEM_STAGES, type ItemStage } from "@/lib/db";

const SPEAKERS = ["TJ", "Brett", "Fonzi"] as const;

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createIdea(formData: FormData) {
  const title = value(formData, "title");
  if (!title) return;
  const result = getDb().prepare(
    `INSERT INTO items (title, stage, person, lane, angle, notes, format, target_platform, owner)
     VALUES (?, 'inbox', ?, ?, ?, ?, ?, ?, ?)`
  ).run(title, value(formData, "person") || null, value(formData, "lane") || null,
    value(formData, "angle") || null, value(formData, "notes") || null,
    value(formData, "format") || null, value(formData, "target_platform") || null,
    value(formData, "owner") || null);
  redirect(`/ideas/${result.lastInsertRowid}`);
}

export async function updateIdea(formData: FormData) {
  const id = Number(formData.get("id"));
  const stage = value(formData, "stage") as ItemStage;
  if (!id || !ITEM_STAGES.includes(stage)) return;
  const requestedSpeaker = value(formData, "person");
  const speaker = SPEAKERS.find(candidate => candidate.toLowerCase() === requestedSpeaker.toLowerCase()) ?? null;
  getDb().prepare(`UPDATE items SET title = ?, stage = ?, person = ?, lane = ?, angle = ?,
    notes = ?, format = ?, target_platform = ?, owner = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(value(formData, "title") || "Untitled", stage, speaker,
      value(formData, "lane") || null, value(formData, "angle") || null,
      value(formData, "notes") || null, value(formData, "format") || null,
      value(formData, "target_platform") || null, value(formData, "owner") || null, id);
  revalidatePath("/ideas");
  revalidatePath(`/ideas/${id}`);
}

export async function updateSection(formData: FormData) {
  const id = Number(formData.get("id"));
  const section = value(formData, "section");
  if (!id || !section) return;
  getDb().prepare(`INSERT INTO item_sections (item_id, section, content_md, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT (item_id, section)
    DO UPDATE SET content_md = excluded.content_md, updated_at = CURRENT_TIMESTAMP`)
    .run(id, section, String(formData.get("content") ?? ""));
  getDb().prepare("UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  revalidatePath("/ideas");
  revalidatePath(`/ideas/${id}`);
}

export async function investInResearch(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb().prepare(`UPDATE items SET stage = 'exploring', research_status = 'queued',
    research_priority = research_priority + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  revalidatePath("/ideas");
  revalidatePath("/angle-feed");
}

export async function approveForDrafting(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  getDb().prepare(`UPDATE items SET stage = 'drafting', research_status = 'approved',
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  revalidatePath("/ideas");
  revalidatePath("/angle-feed");
  redirect(`/ideas/${id}`);
}
