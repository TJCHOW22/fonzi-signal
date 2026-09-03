import { generateDraft } from "@/lib/media-drafts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function draftId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = draftId((await params).id);
  if (!id) return Response.json({ error: "Invalid draft id" }, { status: 400 });

  let force = false;
  const bodyText = await request.text();
  if (bodyText.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const value = (body as Record<string, unknown>).force;
    if (value !== undefined && typeof value !== "boolean") {
      return Response.json({ error: "force must be a boolean" }, { status: 400 });
    }
    force = value === true;
  }

  try {
    return Response.json(await generateDraft(id, { force }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft generation failed";
    return Response.json(
      { error: message },
      { status: message === "draft not found" ? 404 : 500 },
    );
  }
}
