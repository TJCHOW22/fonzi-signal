import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const memoryRoot = path.join(root, "memory");
const graphFile = path.join(root, "components", "memory", "memory-graph.tsx");
const requiredFields = ["name", "description", "type", "use_when", "owns", "sources", "related"];
const requiredSections = ["Instructions to the system", "Purpose", "Quality check", "Retrieval and conflict rules"];
const allowedTypes = new Set(["context", "procedure"]);
const issues = [];

function issue(severity, file, rule, message) {
  issues.push({ severity, file: path.relative(root, file), rule, message });
}

function frontmatterOf(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const scalar = {};
  const lists = {};
  let currentList = null;
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) {
      currentList = field[1];
      scalar[currentList] = field[2].trim();
      lists[currentList] = [];
      continue;
    }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && currentList) lists[currentList].push(item[1].trim());
  }
  return { scalar, lists };
}

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "GOVERNANCE.md") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesWithin(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

const files = await filesWithin(memoryRoot);
const graph = await readFile(graphFile, "utf8");
const graphIds = new Set([...graph.matchAll(/fileId:\s*"custom:([^"]+)"/g)].map((match) => match[1]));
const names = new Map();
const owners = new Map();

for (const file of files) {
  const content = await readFile(file, "utf8");
  const relativeMemoryPath = path.relative(memoryRoot, file);
  const frontmatter = frontmatterOf(content);
  if (!frontmatter) {
    issue("error", file, "frontmatter", "Missing YAML frontmatter.");
    continue;
  }

  for (const field of requiredFields) {
    const value = frontmatter.scalar[field];
    const list = frontmatter.lists[field] ?? [];
    if (!value && list.length === 0) issue("error", file, "required-field", `Missing ${field}.`);
  }

  if (!allowedTypes.has(frontmatter.scalar.type)) issue("error", file, "type", `Active memory type must be context or procedure, found "${frontmatter.scalar.type || "missing"}".`);
  if (!/^#\s+\S+/m.test(content)) issue("error", file, "title", "Missing H1 title.");
  for (const section of requiredSections) {
    if (!new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) {
      issue("error", file, "required-section", `Missing section: ${section}.`);
    }
  }
  if (/\bstatus:\s*proposed\b/i.test(content) || /^status:\s*PROPOSED/im.test(content)) issue("error", file, "proposal-leak", "Proposal status leaked into active memory.");
  if (content.length > 24_000) issue("warning", file, "size", "Memory exceeds 24,000 characters. Consider splitting by owned decision.");

  const name = frontmatter.scalar.name;
  if (names.has(name)) issue("error", file, "duplicate-name", `Name duplicates ${path.relative(root, names.get(name))}.`);
  else names.set(name, file);

  const owner = frontmatter.scalar.owns.toLowerCase();
  if (owners.has(owner)) issue("warning", file, "duplicate-owner", `Ownership duplicates ${path.relative(root, owners.get(owner))}.`);
  else owners.set(owner, file);

  for (const related of frontmatter.lists.related ?? []) {
    const target = path.resolve(path.dirname(file), related);
    try {
      await readFile(target, "utf8");
    } catch {
      issue("error", file, "broken-related", `Related memory not found: ${related}.`);
    }
  }

  const [domain, filename] = relativeMemoryPath.split(path.sep);
  const graphId = `${domain}:${filename}`;
  if (!graphIds.has(graphId)) issue("warning", file, "orphan", "Active memory is not represented by a graph bubble.");
}

if (/fileId:\s*"canonical:direction"/.test(graph)) {
  issue("error", graphFile, "direction-leak", "A live bubble still opens the implementation direction document.");
}

issues.sort((a, b) => a.severity.localeCompare(b.severity) || a.file.localeCompare(b.file));
const errors = issues.filter((entry) => entry.severity === "error").length;
const warnings = issues.filter((entry) => entry.severity === "warning").length;

console.log(JSON.stringify({
  ok: errors === 0,
  auditedFiles: files.length,
  errors,
  warnings,
  issues,
}, null, 2));

process.exitCode = errors === 0 ? 0 : 1;
