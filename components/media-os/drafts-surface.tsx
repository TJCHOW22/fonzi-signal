"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DraftRecord } from "@/lib/media-drafts/types";
import styles from "./media-os.module.css";

export type DraftSpeakerFilter = "All" | "Brett";

const statusLabel: Record<DraftRecord["generationStatus"], string> = {
  generating: "Generating",
  ready: "Ready",
  failed: "Needs attention",
};

const statusClass: Record<DraftRecord["generationStatus"], string> = {
  generating: styles.draftStatusGenerating,
  ready: styles.draftStatusReady,
  failed: styles.draftStatusFailed,
};

function DraftThumbnail({ draft }: { draft: DraftRecord }) {
  if (draft.generatedThumbnailUrl) {
    return <Image
      src={draft.generatedThumbnailUrl}
      alt={`Generated thumbnail for ${draft.thumbnailHook ?? `draft ${draft.id}`}`}
      fill
      sizes="(max-width: 620px) calc(100vw - 28px), (max-width: 920px) 50vw, (max-width: 1260px) 33vw, 25vw"
    />;
  }

  if (draft.generationStatus === "generating") {
    return <div className={styles.draftGeneratingVisual} aria-label="Generating thumbnail">
      <span className={styles.draftGeneratingFace} aria-hidden="true" />
      <span className={styles.draftGeneratingLine} aria-hidden="true" />
      <strong>Building thumbnail<span aria-hidden="true">…</span></strong>
    </div>;
  }

  return <div className={styles.draftHookVisual}>
    <span className={styles.draftHookEyebrow}>Fonzi</span>
    <strong>{draft.thumbnailHook ?? "Thumbnail direction ready"}</strong>
    <span className={styles.draftHookPortrait} aria-hidden="true">B</span>
  </div>;
}

function DraftCard({
  draft,
  highlighted,
  onReadyToRecord,
}: {
  draft: DraftRecord;
  highlighted: boolean;
  onReadyToRecord: (draftId: number) => Promise<void>;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const [promoting, setPromoting] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const isOpenable = draft.generationStatus !== "generating";
  const isRecordReady = draft.generationStatus === "ready"
    && Boolean(draft.scriptHook?.trim() || draft.scriptBody?.trim());

  useEffect(() => {
    if (!highlighted) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return <article
    ref={cardRef}
    className={`${styles.draftCard}${highlighted ? ` ${styles.draftCardHighlighted}` : ""}`}
  >
    <button
      type="button"
      className={styles.draftCardButton}
      disabled={!isOpenable}
      onClick={() => router.push(`/drafts/${draft.id}`)}
      aria-current={highlighted ? "true" : undefined}
      aria-label={isOpenable
        ? `Open ${draft.thumbnailHook ?? `draft ${draft.id}`}`
        : `${draft.thumbnailHook ?? `Draft ${draft.id}`} is ${statusLabel[draft.generationStatus].toLowerCase()}`}
    >
      <div className={styles.draftThumbnail}>
        <DraftThumbnail draft={draft} />
      </div>
      <div className={styles.draftCardBody}>
        <div className={styles.draftStatusRow}>
          <span className={`${styles.draftStatus} ${statusClass[draft.generationStatus]}`}>
            {statusLabel[draft.generationStatus]}
          </span>
          <span>{draft.speaker}</span>
        </div>
        <h2>{draft.thumbnailHook ?? "Writing the thumbnail hook…"}</h2>
        <p>{draft.publishingAccount} · {draft.publishingPlatform}</p>
      </div>
    </button>
    <div className={styles.draftCardAction}>
      <button
        type="button"
        className={styles.readyToRecordButton}
        disabled={!isRecordReady || promoting}
        onClick={() => {
          setPromoting(true);
          setPromotionError(null);
          void onReadyToRecord(draft.id).catch((error) => {
            setPromotionError(error instanceof Error ? error.message : "Could not move draft");
            setPromoting(false);
          });
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="13" height="12" rx="3" />
          <path d="m16 10 5-3v10l-5-3z" />
        </svg>
        {promoting ? "Moving…" : "Ready 2 Rec"}
      </button>
      {promotionError ? <p role="alert">{promotionError}</p> : null}
    </div>
  </article>;
}

export function DraftsSurface({
  drafts,
  loading,
  speaker,
  highlightedDraftId = null,
  onReadyToRecord,
}: {
  drafts: readonly DraftRecord[];
  loading: boolean;
  speaker: DraftSpeakerFilter;
  highlightedDraftId?: number | null;
  onReadyToRecord: (draftId: number) => Promise<void>;
}) {
  const drafting = drafts.filter((draft) => draft.productionStage === "drafting");
  const visibleDrafts = speaker === "All"
    ? drafting
    : drafting.filter((draft) => draft.speaker.toLowerCase() === speaker.toLowerCase());

  return <main className={styles.draftsMain}>
    <div className={styles.draftsHeading}>
      <div>
        <span>AI writing room</span>
        <h1>Drafts</h1>
      </div>
      <p>{visibleDrafts.length} {visibleDrafts.length === 1 ? "draft" : "drafts"}</p>
    </div>

    {loading && drafts.length === 0 ? (
      <div className={styles.draftsEmpty} role="status">
        <span className={styles.draftsLoadingMark} aria-hidden="true" />
        <strong>Loading drafts…</strong>
      </div>
    ) : visibleDrafts.length > 0 ? (
      <div className={styles.draftsGrid}>
        {visibleDrafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            highlighted={draft.id === highlightedDraftId}
            onReadyToRecord={onReadyToRecord}
          />
        ))}
      </div>
    ) : (
      <div className={styles.draftsEmpty}>
        <span className={styles.draftsEmptyMark} aria-hidden="true" />
        <strong>No {speaker === "All" ? "" : `${speaker} `}drafts yet</strong>
        <p>Create one from an Instagram item in Media.</p>
      </div>
    )}
  </main>;
}
