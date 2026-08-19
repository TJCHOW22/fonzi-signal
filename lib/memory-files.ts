import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MEMORY_DOMAINS = ["identity", "audience", "voice", "proof", "workflow", "creative"] as const;
export type MemoryDomain = (typeof MEMORY_DOMAINS)[number];
export type MemoryFileSummary = { id: string; domain: MemoryDomain; title: string; excerpt: string; source: string };
export type MemoryFile = { id: string; title: string; content: string; source: string };

export const MAX_MEMORY_FILE_BYTES = 512 * 1024;

const TOOL_ROOT = path.resolve(process.cwd());
const MEMORY_ROOT = path.join(TOOL_ROOT, "memory");
const CANONICAL_FILES: Readonly<Record<string, { file: string; title: string }>> = {
  "canonical:direction": { file: path.join(TOOL_ROOT, "DIRECTION.md"), title: "Content operating system" },
  "canonical:brand": { file: path.resolve(TOOL_ROOT, "..", "..", "Knowledge", "Fonzi - Brand.md"), title: "Fonzi brand" },
};

function isDomain(value: string): value is MemoryDomain {
  return (MEMORY_DOMAINS as readonly string[]).includes(value);
}

function customFileFromId(id: string): { domain: MemoryDomain; file: string; filename: string } | null {
  const match = /^custom:(identity|audience|voice|proof|workflow|creative):([a-z0-9]+(?:-[a-z0-9]+)*\.md)$/.exec(id);
  if (!match || !isDomain(match[1])) return null;
  const domain = match[1];
  const filename = match[2];
  const directory = path.join(MEMORY_ROOT, domain);
  const file = path.join(directory, filename);
  if (path.dirname(file) !== directory) return null;
  return { domain, file, filename };
}

function resolveFile(id: string): { file: string; title?: string; source: string } | null {
  const canonical = CANONICAL_FILES[id];
  if (canonical) return { ...canonical, source: path.relative(TOOL_ROOT, canonical.file) };
  const custom = customFileFromId(id);
  if (!custom) return null;
  return { file: custom.file, source: path.join("memory", custom.domain, custom.filename) };
}

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return heading || fallback;
}

function titleFromFilename(filename: string): string {
  const value = filename.replace(/\.md$/, "").replace(/-/g, " ");
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function excerptFromMarkdown(content: string): string {
  return content
    .replace(/^---[\s\S]*?^---\s*/m, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export async function readMemoryFile(id: string): Promise<MemoryFile | null> {
  const resolved = resolveFile(id);
  if (!resolved) return null;
  try {
    const content = await readFile(resolved.file, "utf8");
    const fallback = resolved.title || titleFromFilename(path.basename(resolved.file));
    return { id, title: titleFromMarkdown(content, fallback), content, source: resolved.source };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveMemoryFile(id: string, content: string): Promise<MemoryFile> {
  const resolved = resolveFile(id);
  if (!resolved) throw new Error("INVALID_MEMORY_ID");
  if (Buffer.byteLength(content, "utf8") > MAX_MEMORY_FILE_BYTES) throw new Error("MEMORY_FILE_TOO_LARGE");
  if (!CANONICAL_FILES[id] && !customFileFromId(id)) throw new Error("INVALID_MEMORY_ID");

  await mkdir(path.dirname(resolved.file), { recursive: true });
  const temporaryFile = path.join(path.dirname(resolved.file), `.${path.basename(resolved.file)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryFile, resolved.file);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
  return (await readMemoryFile(id))!;
}

function slugify(title: string): string {
  return title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
}

function candidateMemoryTemplate(slug: string, title: string): string {
  return [
    "---",
    "name: " + slug,
    "description: Add a one-sentence description before approving this memory.",
    "type: candidate",
    "use_when: Define the recurring decision that should load this memory.",
    "owns: Define the single decision this memory owns.",
    "sources:",
    "  - Add the authoritative source path.",
    "related:",
    "  - Add a related memory path.",
    "---",
    "",
    "# " + title,
    "",
    "## Memory admission review",
    "",
    "This page is a candidate memory. Do not treat it as active context until every item below is resolved.",
    "",
    "- [ ] This owns one recurring decision.",
    "- [ ] No active memory already owns that decision.",
    "- [ ] Sources and authority are named.",
    "- [ ] Facts and hypotheses are separated.",
    "- [ ] Conflicts have a precedence rule.",
    "- [ ] A human approved its activation.",
    "",
    "## Instructions to the system",
    "",
    "State exactly when this memory should load and what the system must return before acting.",
    "",
    "## Purpose",
    "",
    "Explain the recurring decision this memory improves.",
    "",
    "## Context",
    "",
    "Distill the minimum durable context required for that decision. Do not paste project notes or source documents here.",
    "",
    "## Quality check",
    "",
    "Define the checks that must pass before this context is used.",
    "",
    "## Retrieval and conflict rules",
    "",
    "Name deeper sources, related memories, precedence rules, and what must not be inferred.",
    "",
  ].join("\n");
}

export async function createMemoryFile(domain: string, title: string): Promise<MemoryFile> {
  if (!isDomain(domain)) throw new Error("INVALID_MEMORY_DOMAIN");
  const cleanTitle = title.trim().replace(/[\r\n]+/g, " ").slice(0, 140);
  const slug = slugify(cleanTitle);
  if (!cleanTitle || !slug) throw new Error("INVALID_MEMORY_TITLE");
  const directory = path.join(MEMORY_ROOT, domain);
  await mkdir(directory, { recursive: true });

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const filename = `${slug}${suffix ? `-${suffix + 1}` : ""}.md`;
    const id = `custom:${domain}:${filename}`;
    const resolved = customFileFromId(id)!;
    try {
      const handle = await open(resolved.file, "wx");
      try {
        await handle.writeFile(candidateMemoryTemplate(slug, cleanTitle), "utf8");
      } finally {
        await handle.close();
      }
      return (await readMemoryFile(id))!;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("MEMORY_FILENAME_EXHAUSTED");
}

export async function listCustomMemoryFiles(): Promise<MemoryFileSummary[]> {
  const summaries = await Promise.all(MEMORY_DOMAINS.map(async (domain) => {
    const directory = path.join(MEMORY_ROOT, domain);
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    return Promise.all(entries.filter((entry) => entry.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry.name)).map(async (entry) => {
      const id = `custom:${domain}:${entry.name}`;
      const memory = await readMemoryFile(id);
      if (!memory) return null;
      return { id, domain, title: memory.title, excerpt: excerptFromMarkdown(memory.content), source: memory.source } satisfies MemoryFileSummary;
    }));
  }));
  return summaries.flat().filter((summary): summary is MemoryFileSummary => summary !== null).sort((a, b) => a.title.localeCompare(b.title));
}
