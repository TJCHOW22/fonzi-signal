import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getDb,
  mediaDir,
  type GatherContentAnalysis,
  type GatherSave,
  type Post,
} from "@/lib/db";

export const GATHER_ANALYSIS_VERSION = "gather-multimodal-v2";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = process.env.GATHER_ANALYSIS_MODEL?.trim() || "gemini-3.1-pro-preview";
const REQUEST_TIMEOUT_MS = 10 * 60_000;
const PROCESSING_POLL_MS = 2_000;

function safeMediaPath(relative: string | null): string | null {
  if (!relative) return null;
  const root = path.resolve(mediaDir());
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function fileFingerprint(file: string | null) {
  if (!file) return null;
  const stat = fs.statSync(file);
  return { name: path.basename(file), bytes: stat.size, modified_ms: stat.mtimeMs };
}

function extractJson(output: string): unknown {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Validate and normalize model output before it crosses the UI contract. */
function normalize(value: unknown): GatherContentAnalysis {
  if (!value || typeof value !== "object") throw new Error("analysis was not a JSON object");
  const v = value as Record<string, unknown>;
  const frame = (v.thumbnail_opening_frame ?? {}) as Record<string, unknown>;
  const visible = (v.visible_text_hook ?? {}) as Record<string, unknown>;
  const spoken = (v.spoken_text_hook ?? {}) as Record<string, unknown>;
  const worked = (v.why_likely_worked ?? {}) as Record<string, unknown>;
  const angle = (v.possible_fonzi_angle ?? {}) as Record<string, unknown>;
  const confidence = ["low", "medium", "high"].includes(String(v.confidence))
    ? String(v.confidence) as "low" | "medium" | "high"
    : "low";
  return {
    thumbnail_opening_frame: { description: text(frame.description), effectiveness: text(frame.effectiveness), evidence: strings(frame.evidence) },
    visible_text_hook: { text: textOrNull(visible.text), analysis: text(visible.analysis), evidence: strings(visible.evidence) },
    spoken_text_hook: { text: textOrNull(spoken.text), analysis: text(spoken.analysis), evidence: strings(spoken.evidence) },
    transcript_or_summary: text(v.transcript_or_summary),
    format: text(v.format),
    pacing_structure: text(v.pacing_structure),
    why_likely_worked: { analysis: text(worked.analysis), evidence: strings(worked.evidence), performance_claim: worked.performance_claim === true },
    reusable_pattern: text(v.reusable_pattern),
    possible_fonzi_angle: { angle: textOrNull(angle.angle), grounding: text(angle.grounding), needs_founder_input: angle.needs_founder_input !== false },
    confidence,
    limitations: strings(v.limitations),
  };
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) {
    throw new Error("media analysis needs GEMINI_API_KEY (or GOOGLE_API_KEY); no media was analyzed");
  }
  return key;
}

function mimeType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".avif": "image/avif", ".gif": "image/gif", ".heic": "image/heic",
    ".heif": "image/heif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4",
    ".mov": "video/quicktime", ".mpeg": "video/mpeg", ".mpg": "video/mpeg",
    ".webm": "video/webm", ".wmv": "video/x-ms-wmv", ".3gp": "video/3gpp",
  };
  return types[extension] || "application/octet-stream";
}

type GeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
  state?: "PROCESSING" | "ACTIVE" | "FAILED";
  error?: { message?: string };
};

async function checkedFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`Gemini API ${response.status}: ${detail || response.statusText}`);
  }
  return response;
}

async function uploadFile(file: string, key: string): Promise<GeminiFile> {
  const stat = fs.statSync(file);
  const mime = mimeType(file);
  const start = await checkedFetch(`${GEMINI_API_ROOT}/upload/v1beta/files?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(stat.size),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: path.basename(file) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return a media upload URL");
  const uploaded = await checkedFetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(stat.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fs.readFileSync(file),
  });
  return (await uploaded.json() as { file: GeminiFile }).file;
}

async function waitUntilActive(file: GeminiFile, key: string): Promise<GeminiFile> {
  let current = file;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (current.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
    current = await (await checkedFetch(
      `${GEMINI_API_ROOT}/v1beta/${current.name}?key=${encodeURIComponent(key)}`,
    )).json() as GeminiFile;
  }
  if (current.state !== "ACTIVE") {
    throw new Error(current.error?.message || `Gemini media processing ended in ${current.state || "unknown state"}`);
  }
  return current;
}

async function deleteFile(file: GeminiFile, key: string): Promise<void> {
  try {
    await checkedFetch(`${GEMINI_API_ROOT}/v1beta/${file.name}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch {
    // Uploaded files expire server-side. Cleanup failure must not discard a valid analysis.
  }
}

async function runGemini(prompt: string, files: string[]): Promise<string> {
  const key = apiKey();
  const uploaded: GeminiFile[] = [];
  try {
    for (const localFile of [...new Set(files)]) {
      uploaded.push(await waitUntilActive(await uploadFile(localFile, key), key));
    }
    const parts = [
      ...uploaded.map((file) => ({ file_data: { mime_type: file.mimeType, file_uri: file.uri } })),
      { text: prompt },
    ];
    const response = await checkedFetch(
      `${GEMINI_API_ROOT}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
    );
    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!output) throw new Error(`Gemini returned no analysis${payload.promptFeedback?.blockReason ? `: ${payload.promptFeedback.blockReason}` : ""}`);
    return output;
  } finally {
    await Promise.all(uploaded.map((file) => deleteFile(file, key)));
  }
}

export async function analyzeGatherSave(saveId: string): Promise<GatherContentAnalysis> {
  const db = getDb();
  const save = db.prepare("SELECT * FROM gather_saves WHERE id = ?").get(saveId) as GatherSave | undefined;
  if (!save) throw new Error("saved bookmark not found");
  const matched = save.matched_post_id
    ? db.prepare("SELECT * FROM posts WHERE id = ?").get(save.matched_post_id) as Post | undefined
    : undefined;
  const media = safeMediaPath(save.media_path);
  const thumbnail = safeMediaPath(save.thumb_path);
  const input = {
    version: GATHER_ANALYSIS_VERSION,
    provider: "gemini",
    model: GEMINI_MODEL,
    id: save.id,
    source_url: save.source_url,
    creator: save.creator,
    caption: save.content_text ?? save.title,
    media: fileFingerprint(media),
    thumbnail: fileFingerprint(thumbnail),
    metrics: matched ? {
      impressions: matched.impressions, likes: matched.likes, replies: matched.replies,
      reposts: matched.reposts, bookmarks: matched.bookmarks, quotes: matched.quotes,
    } : null,
  };
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const cached = db.prepare(`SELECT result_json FROM gather_save_analyses
    WHERE gather_save_id = ? AND analysis_version = ? AND input_hash = ? AND status = 'complete'`)
    .get(saveId, GATHER_ANALYSIS_VERSION, inputHash) as { result_json: string } | undefined;
  if (cached) return normalize(JSON.parse(cached.result_json));

  const active = db.prepare(`SELECT status FROM gather_save_analyses
    WHERE gather_save_id = ? AND analysis_version = ? AND input_hash = ? AND status = 'running'`)
    .get(saveId, GATHER_ANALYSIS_VERSION, inputHash) as { status: string } | undefined;
  if (active) throw new Error("bookmark analysis is already running");

  db.prepare(`INSERT INTO gather_save_analyses
      (gather_save_id, analysis_version, input_hash, status, started_at)
    VALUES (?, ?, ?, 'running', CURRENT_TIMESTAMP)
    ON CONFLICT(gather_save_id, analysis_version, input_hash) DO UPDATE SET
      status = 'running', error = NULL, started_at = CURRENT_TIMESTAMP,
      attempt_count = attempt_count + 1, next_attempt_at = NULL`)
    .run(saveId, GATHER_ANALYSIS_VERSION, inputHash);

  const metrics = input.metrics
    ? `Exact captured metrics (no creator baseline is available unless explicitly stated): ${JSON.stringify(input.metrics)}`
    : "No performance metrics are available. Do not say the post performed well or infer reach/engagement.";
  const prompt = `Analyze this personally bookmarked social post as a creative teardown. A bookmark is a taste signal, NOT evidence of performance.

Source URL: ${save.source_url ?? "unavailable"}
Creator: ${save.creator ? `@${save.creator}` : "unknown"}
Caption/text: ${save.content_text ?? save.title ?? "unavailable"}
${metrics}
Attached media: ${media ? `${mimeType(media)} (${path.basename(media)})` : "unavailable"}
Attached thumbnail/poster: ${thumbnail ? `${mimeType(thumbnail)} (${path.basename(thumbnail)})` : "unavailable"}

Inspect every attached file, not just the caption. For video, watch the full visual and audio streams. Study the thumbnail/opening frame, first spoken and visible hooks, delivery, edit rhythm, pacing changes, structure, payoff, and CTA. Quote only words you can verify from the media or caption. If any stream is absent or unintelligible, state that precisely in limitations. Distinguish direct observations from interpretation. Explain why it LIKELY works creatively; only make performance claims when exact metrics above support them. A possible Fonzi angle must be grounded in the source; if a real Fonzi/founder position is missing, set angle null and needs_founder_input true.

Return ONLY valid JSON with exactly this shape:
{
  "thumbnail_opening_frame":{"description":"","effectiveness":"","evidence":[""]},
  "visible_text_hook":{"text":null,"analysis":"","evidence":[""]},
  "spoken_text_hook":{"text":null,"analysis":"","evidence":[""]},
  "transcript_or_summary":"",
  "format":"",
  "pacing_structure":"",
  "why_likely_worked":{"analysis":"","evidence":[""],"performance_claim":false},
  "reusable_pattern":"",
  "possible_fonzi_angle":{"angle":null,"grounding":"","needs_founder_input":true},
  "confidence":"low|medium|high",
  "limitations":[""]
}`;

  try {
    if (!media && !thumbnail) {
      throw new Error("no saved media or thumbnail is available; no visual analysis was run");
    }
    const result = normalize(extractJson(await runGemini(prompt, [media, thumbnail].filter((file): file is string => Boolean(file)))));
    // Without metrics, a model is never allowed to persist a performance claim.
    if (!input.metrics) result.why_likely_worked.performance_claim = false;
    db.prepare(`UPDATE gather_save_analyses SET status = 'complete', result_json = ?,
      error = NULL, analyzed_at = CURRENT_TIMESTAMP
      WHERE gather_save_id = ? AND analysis_version = ? AND input_hash = ?`)
      .run(JSON.stringify(result), saveId, GATHER_ANALYSIS_VERSION, inputHash);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown analysis error";
    db.prepare(`UPDATE gather_save_analyses SET status = 'error', error = ?, analyzed_at = CURRENT_TIMESTAMP
      WHERE gather_save_id = ? AND analysis_version = ? AND input_hash = ?`)
      .run(message, saveId, GATHER_ANALYSIS_VERSION, inputHash);
    throw new Error(message);
  }
}
