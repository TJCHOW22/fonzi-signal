"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

export async function addHumanInput(formData:FormData){const itemId=Number(formData.get("item_id"));const input=String(formData.get("input")??"").trim();if(!itemId||!input)return;const db=getDb();const current=db.prepare("SELECT content_md FROM item_sections WHERE item_id=? AND section='human_input'").get(itemId) as{content_md:string|null}|undefined;const next=[current?.content_md?.trim(),`- ${input}`].filter(Boolean).join("\n");db.prepare(`INSERT INTO item_sections(item_id,section,content_md,updated_at) VALUES(?,'human_input',?,CURRENT_TIMESTAMP) ON CONFLICT(item_id,section) DO UPDATE SET content_md=excluded.content_md,updated_at=CURRENT_TIMESTAMP`).run(itemId,next);db.prepare("UPDATE items SET research_status='needs_input',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(itemId);revalidatePath("/angle-feed");revalidatePath(`/ideas/${itemId}`)}
