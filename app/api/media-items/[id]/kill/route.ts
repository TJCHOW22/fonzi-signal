import { killMedia } from "@/lib/media-drafts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id.trim();
  if (!id) return Response.json({ error: "Invalid media id" }, { status: 400 });

  try {
    if (!killMedia(id)) return Response.json({ error: "Media not found" }, { status: 404 });
    return Response.json({ killed: true, id });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Could not kill media",
    }, { status: 500 });
  }
}
