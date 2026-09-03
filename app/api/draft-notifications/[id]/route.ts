import { markDraftNotificationRead } from "@/lib/media-drafts/repository";

function notificationId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = notificationId((await params).id);
  if (!id) return Response.json({ error: "Invalid notification id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || (body as { read?: unknown }).read !== true) {
    return Response.json({ error: "read must be true" }, { status: 400 });
  }

  const notification = markDraftNotificationRead(id);
  return notification
    ? Response.json({ notification })
    : Response.json({ error: "Notification not found" }, { status: 404 });
}
