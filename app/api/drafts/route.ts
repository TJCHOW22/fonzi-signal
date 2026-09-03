import {
  createDraft,
  listDraftNotifications,
  listDrafts,
} from "@/lib/media-drafts/repository";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function GET() {
  return Response.json({
    drafts: listDrafts(),
    notifications: listDraftNotifications(),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object") return errorResponse("Invalid request body", 400);
  const { sourceMediaId, workflowKey } = body as Record<string, unknown>;
  if (typeof sourceMediaId !== "string" || !sourceMediaId.trim()) {
    return errorResponse("sourceMediaId is required", 400);
  }
  if (workflowKey !== undefined && typeof workflowKey !== "string") {
    return errorResponse("workflowKey must be a string", 400);
  }

  try {
    const result = createDraft({ sourceMediaId, workflowKey });
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft creation failed";
    return errorResponse(message, message === "source media not found" ? 404 : 400);
  }
}
