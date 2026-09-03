import { getDraftDetail, updateDraft } from "@/lib/media-drafts/repository";
import type { EditableDraftFields } from "@/lib/media-drafts/types";

export const dynamic = "force-dynamic";

const EDITABLE_KEYS = [
  "thumbnailHook",
  "generatedThumbnailUrl",
  "scriptHook",
  "scriptBody",
  "cta",
  "speaker",
  "publishingAccount",
  "publishingPlatform",
] as const satisfies readonly (keyof EditableDraftFields)[];

function draftId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = draftId((await params).id);
  if (!id) return errorResponse("Invalid draft id", 400);
  const detail = getDraftDetail(id);
  return detail ? Response.json(detail) : errorResponse("Draft not found", 404);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = draftId((await params).id);
  if (!id) return errorResponse("Invalid draft id", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Invalid request body", 400);
  }

  const record = body as Record<string, unknown>;
  const update: EditableDraftFields = {};
  for (const key of EDITABLE_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "string" && value !== null) {
      return errorResponse(`${key} must be a string or null`, 400);
    }
    if (["speaker", "publishingAccount", "publishingPlatform"].includes(key) && value === null) {
      return errorResponse(`${key} cannot be null`, 400);
    }
    Object.assign(update, { [key]: value });
  }
  if (Object.keys(update).length === 0) return errorResponse("No editable fields supplied", 400);

  try {
    const draft = updateDraft(id, update);
    return draft ? Response.json({ draft }) : errorResponse("Draft not found", 404);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Draft update failed", 400);
  }
}
