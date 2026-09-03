import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createProductionDraftModelClient, DEFAULT_CODEX_DRAFT_MODEL, type DraftModelClient } from "./codex-client.ts";
import type { DraftGenerationCallbacks, DraftGenerationInput, DraftGenerationWinner } from "./types.ts";

export const BILLION_DOLLAR_BLUEPRINT_PATH =
  "/Users/thomaschow/.codex/skills/billion-dollar-blueprint/SKILL.md";
export const DRAFT_PROMPT_VERSION = "billion-dollar-blueprint-v2";

export type DraftGenerationDependencies = {
  modelClient?: DraftModelClient;
  model?: string;
  skillPath?: string;
  readSkill?: (path: string, encoding: "utf8") => Promise<string>;
};

export class DraftGenerationResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftGenerationResponseError";
  }
}

export function buildDraftUserPrompt(sourceMaterial: string, constraints?: string): string {
  const normalizedConstraints = constraints?.trim();
  return normalizedConstraints
    ? [sourceMaterial, "", "Current-draft constraints:", normalizedConstraints].join("\n")
    : sourceMaterial;
}

const HOOK_RETRY_INSTRUCTION = [
  "Correction for this retry only: the previous draft's opening was too similar to the source opening.",
  "Generate a complete replacement draft. Keep the source facts and thesis, but make the first one or two sentences use a genuinely different framing, sentence structure, and wording.",
  "Do not quote, lightly edit, or preserve the source hook.",
].join(" ");

function openingTokens(text: string): string[] {
  return text
    .replace(/^\s*(?:source material|current source|transcript)\s*:\s*/i, "")
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
    ?.slice(0, 32) ?? [];
}

function sharedShingleRatio(left: string[], right: string[], size: number): number {
  if (left.length < size || right.length < size) return 0;
  const shingles = (tokens: string[]) => {
    const result = new Set<string>();
    for (let index = 0; index <= tokens.length - size; index += 1) {
      result.add(tokens.slice(index, index + size).join(" "));
    }
    return result;
  };
  const leftShingles = shingles(left);
  const rightShingles = shingles(right);
  let shared = 0;
  for (const shingle of leftShingles) if (rightShingles.has(shingle)) shared += 1;
  return shared / Math.min(leftShingles.size, rightShingles.size);
}

export function isHookTooSimilar(sourceMaterial: string, generatedScript: string): boolean {
  const source = openingTokens(sourceMaterial);
  const generated = openingTokens(generatedScript);
  const shorterLength = Math.min(source.length, generated.length);
  if (shorterLength < 4) return false;

  let sharedPrefix = 0;
  while (sharedPrefix < shorterLength && source[sharedPrefix] === generated[sharedPrefix]) {
    sharedPrefix += 1;
  }
  if (sharedPrefix >= Math.min(8, shorterLength)) return true;
  return sharedShingleRatio(source, generated, 3) >= 0.65;
}

export function parseDraftResponse(response: string): { title: string; script: string } {
  const match = response.trim().match(
    /^\*\*Title:\*\*\s*(.+?)\s*\n+\s*\*\*Script:\*\*\s*\n([\s\S]+)$/,
  );
  const title = match?.[1]?.trim() ?? "";
  const script = match?.[2]?.trim() ?? "";
  if (!title || !script) {
    throw new DraftGenerationResponseError(
      "Draft generation returned an invalid result. Expected a non-empty Title and Script.",
    );
  }
  return { title, script };
}

/** One fresh call, plus one isolated retry only when the opening copies the source hook. */
export async function runSingleCallDraftGeneration(
  input: DraftGenerationInput,
  callbacks: DraftGenerationCallbacks,
  dependencies: DraftGenerationDependencies = {},
): Promise<DraftGenerationWinner> {
  const sourceMaterial = input.sourceMaterial;
  if (!sourceMaterial.trim()) throw new Error("Source material is required to create a draft.");

  const skillPath = dependencies.skillPath ?? BILLION_DOLLAR_BLUEPRINT_PATH;
  let skillContent: string;
  try {
    skillContent = await (dependencies.readSkill ?? readFile)(skillPath, "utf8");
  } catch (error) {
    throw new Error(`Could not load the drafting skill at ${skillPath}.`, { cause: error });
  }
  if (!skillContent.trim()) throw new Error(`The drafting skill at ${skillPath} is empty.`);

  const model = dependencies.model?.trim()
    || process.env.CODEX_DRAFT_MODEL?.trim()
    || DEFAULT_CODEX_DRAFT_MODEL;
  await callbacks.onProvenance({
    model,
    promptVersion: DRAFT_PROMPT_VERSION,
    promptHash: createHash("sha256").update(skillContent, "utf8").digest("hex"),
  });
  await callbacks.onStage("writing", 1);
  const modelClient = dependencies.modelClient ?? createProductionDraftModelClient();
  const userPrompt = buildDraftUserPrompt(sourceMaterial, input.constraints);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await modelClient.generate({
      model,
      systemInstruction: attempt === 0
        ? skillContent
        : `${skillContent}\n\n${HOOK_RETRY_INSTRUCTION}`,
      userPrompt,
    });
    const { title, script } = parseDraftResponse(response);
    if (!isHookTooSimilar(sourceMaterial, script)) {
      return {
        thumbnailHook: title,
        generatedThumbnailUrl: null,
        scriptHook: "",
        scriptBody: script,
        cta: "",
        sourceUrls: [],
      };
    }
  }

  throw new DraftGenerationResponseError(
    "Draft generation copied the source hook after one corrective retry.",
  );
}
