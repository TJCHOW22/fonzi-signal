import { listDraftNotifications } from "@/lib/media-drafts/repository";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ notifications: listDraftNotifications() });
}
