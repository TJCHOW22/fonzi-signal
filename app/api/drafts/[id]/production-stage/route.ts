import { updateDraftProductionStage } from "@/lib/media-drafts/repository";
import { DRAFT_PRODUCTION_STAGES } from "@/lib/media-drafts/types";
import type { DraftProductionStage } from "@/lib/media-drafts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function draftId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
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
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "productionStage") {
    return errorResponse("Body must contain only productionStage", 400);
  }
  if (typeof record.productionStage !== "string"
    || !DRAFT_PRODUCTION_STAGES.includes(record.productionStage as DraftProductionStage)) {
    return errorResponse("Invalid productionStage", 400);
  }

  try {
    const draft = updateDraftProductionStage(
      id,
      record.productionStage as DraftProductionStage,
    );
    return draft ? Response.json({ draft }) : errorResponse("Draft not found", 404);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Production stage update failed", 400);
  }
}
