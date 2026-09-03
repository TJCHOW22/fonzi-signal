import { MediaOS } from "@/components/media-os/media-os";
import { listActiveMedia } from "@/lib/media-drafts/repository";

type FeedSearchParams = {
  workspace?: string | string[];
  draft?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>;
}) {
  const query = await searchParams;
  const workspace = firstValue(query.workspace);
  const requestedWorkspace = workspace === "drafts"
    ? "Drafts"
    : workspace === "spaces"
      ? "Spaces"
      : "Media";
  const requestedDraftId = Number(firstValue(query.draft));
  const highlightedDraftId = Number.isSafeInteger(requestedDraftId) && requestedDraftId > 0
    ? requestedDraftId
    : null;
  const mediaRecords = listActiveMedia();

  return (
    <MediaOS
      requestedWorkspace={requestedWorkspace}
      highlightedDraftId={highlightedDraftId}
      initialMediaRecords={mediaRecords}
    />
  );
}
