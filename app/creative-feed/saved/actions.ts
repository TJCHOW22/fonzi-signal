"use server";

import { revalidatePath } from "next/cache";
import { execFile } from "node:child_process";
import path from "node:path";
import { analyzeGatherSave } from "@/lib/gather-analysis/analyze";

/** On-demand and idempotent. The caller can display the cached result after revalidation. */
export async function runGatherAnalysis(formData: FormData) {
  const saveId = String(formData.get("gather_id") ?? "").trim();
  if (!saveId) return;
  try {
    await analyzeGatherSave(saveId);
    revalidatePath(`/creative-feed/saved/${encodeURIComponent(saveId)}`);
  } catch (error) {
    revalidatePath(`/creative-feed/saved/${encodeURIComponent(saveId)}`);
    console.error("GatherOS analysis failed:", error instanceof Error ? error.message : "analysis failed");
  }
}

export async function hydrateGatherXMetrics(formData: FormData) {
  const saveId = String(formData.get("gather_id") ?? "").trim();
  if (!saveId || saveId.length > 100) return;
  const script = path.join(process.cwd(), "scripts", "hydrate-gather-x.mjs");
  await new Promise<void>((resolve) => {
    execFile(process.execPath, [script, "--save-id", saveId], { timeout: 300_000 }, (error, stdout, stderr) => {
      if (error) console.error("X insight hydration failed:", stderr.trim() || error.message);
      else console.log("X insight hydration:", stdout.trim());
      resolve();
    });
  });
  revalidatePath(`/creative-feed/saved/${encodeURIComponent(saveId)}`);
  revalidatePath("/");
}
