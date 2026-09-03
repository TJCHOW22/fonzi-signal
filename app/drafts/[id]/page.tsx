import { notFound } from "next/navigation";
import { DraftComparisonWorkspace } from "@/components/drafts/draft-comparison-workspace";
import { getDraftDetail } from "@/lib/media-drafts/repository";

export const dynamic = "force-dynamic";

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id < 1) {
    notFound();
  }

  const detail = getDraftDetail(id);

  if (!detail) {
    notFound();
  }

  return <DraftComparisonWorkspace initialDetail={detail} />;
}
