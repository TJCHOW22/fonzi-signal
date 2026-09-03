"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGlobalAIState } from "@/components/global-controls/global-ai-state";
import { DraftsSurface, type DraftSpeakerFilter } from "@/components/media-os/drafts-surface";
import { SpacesSurface } from "@/components/media-os/spaces-surface";
import type { MediaSourceRecord } from "@/lib/media-drafts/types";
import styles from "./media-os.module.css";

type Workspace = "Media" | "Drafts" | "Spaces" | "Calendar";
type Channel = "All" | "Instagram" | "LinkedIn" | "X" | "TikTok" | "YouTube" | "Gmail";
type SortOrder = "newest" | "oldest";
type MediaRecord = MediaSourceRecord;

const WORKSPACES: Workspace[] = ["Media", "Drafts", "Spaces", "Calendar"];
const CHANNELS: Channel[] = ["All", "Instagram", "LinkedIn", "X", "TikTok", "YouTube", "Gmail"];
const postedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

const badgeClass: Record<Channel, string> = {
  All: styles.badgeAll,
  Instagram: styles.badgeInstagram,
  LinkedIn: styles.badgeLinkedIn,
  X: styles.badgeX,
  TikTok: styles.badgeTikTok,
  YouTube: styles.badgeYouTube,
  Gmail: styles.badgeGmail,
};

function SearchMark() {
  return <span className={styles.searchMark} aria-hidden="true" />;
}

function MediaMark() {
  return <span className={styles.mediaMark} aria-hidden="true">
    <i /><i /><i /><i /><i />
  </span>;
}

function ChannelBadge({ channel }: { channel: Channel }) {
  const label = channel === "LinkedIn" ? "in" : channel === "YouTube" ? "▶" : channel.slice(0, 1);
  return <span className={`${styles.channelBadge} ${badgeClass[channel]}`} aria-hidden="true">{label}</span>;
}

function EmptySurface({ label }: { label: string }) {
  return <section className={styles.emptySurface} aria-label={label}>
    <h1 className={styles.srOnly}>{label}</h1>
  </section>;
}

function firstWords(text: string, limit: number) {
  const words = text.trim().split(/\s+/);
  const preview = words.slice(0, limit).join(" ");
  return words.length > limit ? `${preview}…` : preview;
}

function scriptParagraphs(script: string) {
  const sentences = script.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map((sentence) => sentence.trim()).filter(Boolean);
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }

  return paragraphs;
}

function Thumbnail({ record, soundEnabled }: { record: MediaRecord; soundEnabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRequestedRef = useRef(false);
  const [previewing, setPreviewing] = useState(false);

  const stopPreview = useCallback(() => {
    previewRequestedRef.current = false;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setPreviewing(false);
  }, []);

  const startPreview = useCallback(() => {
    if (previewRequestedRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    previewRequestedRef.current = true;
    video.muted = !soundEnabled;
    video.volume = 1;
    video.currentTime = 0;
    setPreviewing(true);
    void video.play().catch(() => {
      if (videoRef.current === video) {
        previewRequestedRef.current = false;
        setPreviewing(false);
      }
    });
  }, [soundEnabled]);

  return <div
    className={styles.poster}
    onMouseEnter={startPreview}
    onMouseLeave={stopPreview}
  >
    <Image
      className={styles.posterImage}
      src={record.thumbnailUrl}
      alt={`${record.title} Reel thumbnail`}
      fill
      sizes="(max-width: 620px) calc(100vw - 28px), (max-width: 920px) 50vw, (max-width: 1260px) 33vw, 25vw"
    />
    <video
      ref={videoRef}
      className={`${styles.previewVideo}${previewing ? ` ${styles.previewVideoActive}` : ""}`}
      src={record.videoUrl}
      muted={!soundEnabled}
      playsInline
      preload="metadata"
      tabIndex={-1}
      aria-hidden="true"
    />
    <span className={styles.posterDuration}>{record.duration}</span>
  </div>;
}

function MediaCard({
  record,
  soundEnabled,
  showPlatform = false,
  onOpen,
}: {
  record: MediaRecord;
  soundEnabled: boolean;
  showPlatform?: boolean;
  onOpen: (record: MediaRecord, trigger: HTMLButtonElement) => void;
}) {
  return <article className={styles.card}>
    <button
      type="button"
      className={styles.cardButton}
      onClick={(event) => onOpen(record, event.currentTarget)}
      aria-label={`Review ${record.title}`}
    >
      <Thumbnail record={record} soundEnabled={soundEnabled} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <span className={styles.creator}>@{record.creator}</span>
          <div className={styles.cardMetaEnd}>
            {record.postedAt ? <time className={styles.postedAt} dateTime={record.postedAt}>
              {postedAtFormatter.format(new Date(record.postedAt))}
            </time> : null}
            {showPlatform ? <span className={styles.platform}>Instagram Reel</span> : null}
          </div>
        </div>
        <h2>{record.title}</h2>
        <dl className={styles.metrics} aria-label="Post performance">
          <div><dt>Likes</dt><dd>{record.metrics.likes}</dd></div>
          <div><dt>Comments</dt><dd>{record.metrics.comments}</dd></div>
          <div><dt>Reposts</dt><dd>{record.metrics.reposts}</dd></div>
        </dl>
        <p className={styles.scriptLabel}>Script</p>
        <p className={styles.scriptPreview}>{firstWords(record.transcript, 30)}</p>
      </div>
    </button>
  </article>;
}

function ReviewSurface({
  record,
  index,
  total,
  formatted,
  backRef,
  onBack,
  onToggleFormatted,
  onKill,
  onCreate,
}: {
  record: MediaRecord;
  index: number;
  total: number;
  formatted: boolean;
  backRef: React.RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onToggleFormatted: () => void;
  onKill: () => void;
  onCreate: () => void;
}) {
  return <main className={styles.review} aria-labelledby="review-title">
    <header className={styles.reviewBar}>
      <button ref={backRef} type="button" className={styles.backButton} onClick={onBack} aria-label="Back to Instagram media">
        <span aria-hidden="true">←</span> Back
      </button>
      <span className={styles.reviewCount}>{index + 1} / {total}</span>
    </header>
    <div className={styles.reviewContent}>
      <section className={styles.assetPanel} aria-label="Video asset preview">
        <video
          key={record.id}
          className={styles.detailVideo}
          controls
          playsInline
          preload="metadata"
          poster={record.thumbnailUrl}
          aria-label={`${record.title} by @${record.creator}`}
        >
          <source src={record.videoUrl} type="video/mp4" />
          Your browser does not support HTML video.
        </video>
      </section>
      <aside className={styles.detailsPanel} aria-label="Video details">
        <div className={styles.detailsScroll}>
          <div className={styles.detailsHeading}>
            <div>
              <span className={styles.eyebrow}>Review asset</span>
              <h1 id="review-title">{record.title}</h1>
            </div>
            <span className={styles.duration}>{record.duration}</span>
          </div>
          <section className={styles.detailSection}>
            <h2>Channel</h2>
            <div className={styles.pills}><span>Instagram</span></div>
          </section>
          <section className={styles.detailSection}>
            <h2>Creator</h2>
            <div className={styles.creatorRow}>
              <p>@{record.creator}</p>
              <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">View original<span aria-hidden="true"> ↗</span></a>
            </div>
          </section>
          <section className={styles.detailSection}>
            <h2>Performance</h2>
            <dl className={`${styles.metrics} ${styles.detailMetrics}`} aria-label="Post performance">
              <div><dt>Likes</dt><dd>{record.metrics.likes}</dd></div>
              <div><dt>Comments</dt><dd>{record.metrics.comments}</dd></div>
              <div><dt>Reposts</dt><dd>{record.metrics.reposts}</dd></div>
            </dl>
          </section>
          <section className={styles.detailSection}>
            <h2>Video summary</h2>
            <p>{record.summary}</p>
          </section>
          <section className={styles.scriptSection}>
            <div className={styles.scriptHeading}>
              <h2>Transcript</h2>
              <label className={styles.formatControl}>
                <span>Paragraphs</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formatted}
                  aria-label="Format spoken script into paragraphs"
                  className={formatted ? styles.switchOn : styles.switch}
                  onClick={onToggleFormatted}
                ><span /></button>
              </label>
            </div>
            {formatted ? <div className={styles.scriptFormatted}>
              {scriptParagraphs(record.transcript).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            </div> : <pre className={styles.scriptRaw}>{record.transcript}</pre>}
          </section>
        </div>
        <div className={styles.reviewActions}>
          <button type="button" className={styles.killButton} onClick={onKill}>Kill</button>
          <button type="button" className={styles.createButton} onClick={onCreate}>Create draft</button>
        </div>
      </aside>
    </div>
  </main>;
}

export function MediaOS({
  requestedWorkspace = "Media",
  highlightedDraftId = null,
  initialMediaRecords,
}: {
  requestedWorkspace?: Extract<Workspace, "Media" | "Drafts" | "Spaces">;
  highlightedDraftId?: number | null;
  initialMediaRecords: MediaSourceRecord[];
}) {
  const {
    drafts,
    loading: draftsLoading,
    createDraft,
    setDraftProductionStage,
  } = useGlobalAIState();
  const [workspace, setWorkspace] = useState<Workspace>(requestedWorkspace);
  const [channel, setChannel] = useState<Channel>("Instagram");
  const [speaker, setSpeaker] = useState<DraftSpeakerFilter>("All");
  const [records, setRecords] = useState<MediaRecord[]>(() => initialMediaRecords);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [formatted, setFormatted] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [optimisticHiddenIds, setOptimisticHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const detailBackRef = useRef<HTMLButtonElement>(null);
  const draftsTabRef = useRef<HTMLButtonElement>(null);
  const instagramTabRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const osRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convertedSourceIds = useMemo(
    () => new Set(drafts.map((draft) => draft.sourceMediaId)),
    [drafts],
  );
  const activeRecords = useMemo(
    () => records.filter(
      (record) => !convertedSourceIds.has(record.id) && !optimisticHiddenIds.has(record.id),
    ),
    [convertedSourceIds, optimisticHiddenIds, records],
  );

  const orderedRecords = useMemo(() => [...activeRecords].sort((left, right) => {
    const leftTime = left.postedAt ? Date.parse(left.postedAt) : Number.NaN;
    const rightTime = right.postedAt ? Date.parse(right.postedAt) : Number.NaN;
    const leftHasDate = Number.isFinite(leftTime);
    const rightHasDate = Number.isFinite(rightTime);

    if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1;
    if (!leftHasDate || !rightHasDate) return left.id.localeCompare(right.id);

    const timeDifference = sortOrder === "newest"
      ? rightTime - leftTime
      : leftTime - rightTime;
    return timeDifference || left.id.localeCompare(right.id);
  }), [activeRecords, sortOrder]);

  const selected = records.find((record) => record.id === selectedId) ?? null;
  const selectedIndex = selected ? orderedRecords.findIndex((record) => record.id === selected.id) : -1;
  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orderedRecords;
    return orderedRecords.filter((record) => [
      record.title,
      record.caption,
      record.transcript,
      record.creator,
      record.summary,
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [orderedRecords, query]);

  const showToast = useCallback((message: string, error = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, error });
    toastTimerRef.current = setTimeout(() => setToast(null), error ? 4_500 : 3_200);
  }, []);

  useEffect(() => {
    setWorkspace(requestedWorkspace);
    if (requestedWorkspace === "Drafts") setSpeaker("All");
  }, [requestedWorkspace, highlightedDraftId]);

  useEffect(() => {
    setRecords(initialMediaRecords);
  }, [initialMediaRecords]);

  useEffect(() => {
    if (selectedId) detailBackRef.current?.focus();
  }, [selectedId]);

  useLayoutEffect(() => {
    if (selectedId && osRef.current) osRef.current.scrollTop = 0;
  }, [selectedId]);

  useEffect(() => {
    if (searchOpen && !selectedId) searchRef.current?.focus();
  }, [searchOpen, selectedId]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedId) {
        event.preventDefault();
        setSelectedId(null);
        requestAnimationFrame(() => lastTriggerRef.current?.focus());
        return;
      }
      if (searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        setQuery("");
        requestAnimationFrame(() => searchButtonRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, selectedId]);

  const closeDetail = () => {
    setSelectedId(null);
    requestAnimationFrame(() => lastTriggerRef.current?.focus());
  };

  const openDetail = (record: MediaRecord, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setFormatted(true);
    setSelectedId(record.id);
  };

  const killSelected = async () => {
    if (!selected) return;
    const killed = selected;
    setOptimisticHiddenIds((current) => new Set(current).add(killed.id));
    setRecords((current) => current.filter((record) => record.id !== killed.id));
    setSelectedId(null);
    requestAnimationFrame(() => instagramTabRef.current?.focus());
    try {
      const response = await fetch(`/api/media-items/${encodeURIComponent(killed.id)}/kill`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof payload?.error === "string" ? payload.error : "Could not kill media");
      }
      showToast("Video removed");
    } catch (killError) {
      setOptimisticHiddenIds((current) => {
        const next = new Set(current);
        next.delete(killed.id);
        return next;
      });
      setRecords((current) => current.some((record) => record.id === killed.id)
        ? current
        : [...current, killed]);
      showToast(killError instanceof Error ? killError.message : "Could not kill media", true);
    }
  };

  const createSelected = () => {
    if (!selected) return;
    const sourceId = selected.id;
    setOptimisticHiddenIds((current) => new Set(current).add(sourceId));
    setSelectedId(null);
    setWorkspace("Media");
    setChannel("Instagram");
    showToast("Drafting…");
    requestAnimationFrame(() => instagramTabRef.current?.focus());

    void createDraft(sourceId).catch((creationError) => {
      setOptimisticHiddenIds((current) => {
        const next = new Set(current);
        next.delete(sourceId);
        return next;
      });
      showToast(
        creationError instanceof Error ? creationError.message : "Could not create draft",
        true,
      );
    });
  };

  if (selected) return <div ref={osRef} className={styles.os}>
    <ReviewSurface
      record={selected}
      index={selectedIndex}
      total={activeRecords.length}
      formatted={formatted}
      backRef={detailBackRef}
      onBack={closeDetail}
      onToggleFormatted={() => setFormatted((current) => !current)}
      onKill={killSelected}
      onCreate={createSelected}
    />
  </div>;

  const showInstagram = workspace === "Media" && channel === "Instagram";
  const showDrafts = workspace === "Drafts";
  const showSpaces = workspace === "Spaces";
  const emptyLabel = workspace === "Media" ? `${channel} media` : `${workspace} workspace`;

  return <div
    ref={osRef}
    className={`${styles.os}${showSpaces ? ` ${styles.spacesMode}` : ""}`}
  >
    <header className={styles.libraryHeader}>
      <nav className={styles.primaryNav} aria-label="Workspace navigation">
        {searchOpen ? <div className={styles.searchField}>
          <SearchMark />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value) {
                setWorkspace("Media");
                setChannel("Instagram");
              }
            }}
            placeholder="Search media"
            aria-label="Search Instagram media"
          />
          <button type="button" onClick={() => {
            setSearchOpen(false);
            setQuery("");
            requestAnimationFrame(() => searchButtonRef.current?.focus());
          }} aria-label="Close search">×</button>
        </div> : <button ref={searchButtonRef} type="button" className={styles.searchButton} onClick={() => setSearchOpen(true)} aria-label="Search media">
          <SearchMark />
        </button>}
        {WORKSPACES.map((item) => <button
          key={item}
          ref={item === "Drafts" ? draftsTabRef : undefined}
          type="button"
          className={`${styles.primaryItem}${workspace === item ? ` ${styles.primaryActive}` : ""}`}
          aria-pressed={workspace === item}
          onClick={() => setWorkspace(item)}
        >
          {item === "Media" ? <MediaMark /> : null}
          <span>{item}</span>
        </button>)}
      </nav>
      {workspace === "Drafts" ? <nav className={styles.personaNav} aria-label="Draft speaker">
        {(["All", "Brett"] as DraftSpeakerFilter[]).map((item) => <button
          key={item}
          type="button"
          aria-pressed={speaker === item}
          className={speaker === item ? styles.personaActive : undefined}
          onClick={() => setSpeaker(item)}
        >{item}</button>)}
      </nav> : null}
      {workspace === "Media" ? <nav className={styles.channelNav} aria-label="Media channels">
        {CHANNELS.map((item) => <button
          key={item}
          ref={item === "Instagram" ? instagramTabRef : undefined}
          type="button"
          className={`${styles.channelItem}${channel === item ? ` ${styles.channelActive}` : ""}`}
          aria-pressed={channel === item}
          onClick={() => setChannel(item)}
        >
          <ChannelBadge channel={item} />
          <span>{item}</span>
          {item === "Instagram" ? <small>{activeRecords.length}</small> : null}
        </button>)}
      </nav> : <div className={styles.headerSpacer} />}
    </header>

    {showInstagram ? <main className={styles.mediaMain}>
      <h1 className={styles.srOnly}>Instagram media library</h1>
      <div className={styles.mediaControls}>
        <button
          type="button"
          className={styles.sortButton}
          aria-label={`Sort Instagram media ${sortOrder === "newest" ? "oldest first" : "newest first"}`}
          onClick={() => setSortOrder((current) => current === "newest" ? "oldest" : "newest")}
        >
          <span aria-hidden="true">↕</span>
          {sortOrder === "newest" ? "Newest first" : "Oldest first"}
        </button>
        <button
          type="button"
          className={`${styles.soundButton}${soundEnabled ? ` ${styles.soundButtonActive}` : ""}`}
          aria-pressed={soundEnabled}
          onClick={() => setSoundEnabled((current) => !current)}
        >
          <span aria-hidden="true" />
          {soundEnabled ? "Sound on" : "Enable sound"}
        </button>
      </div>
      {filteredRecords.length ? <div className={styles.mediaGrid}>
        {filteredRecords.map((record) => <MediaCard
          key={record.id}
          record={record}
          soundEnabled={soundEnabled}
          onOpen={openDetail}
        />)}
      </div> : <div className={styles.noResults} role="status">
        <strong>No Instagram posts found</strong>
        <span>Try a title, creator, script, or summary phrase.</span>
      </div>}
    </main> : showDrafts ? (
      <DraftsSurface
        drafts={drafts}
        loading={draftsLoading}
        speaker={speaker}
        highlightedDraftId={highlightedDraftId}
        onReadyToRecord={async (draftId) => {
          await setDraftProductionStage(draftId, "ready_to_record");
          showToast("Moved to Ready 2 Rec");
        }}
      />
    ) : showSpaces ? (
      <SpacesSurface drafts={drafts} loading={draftsLoading} />
    ) : <EmptySurface label={emptyLabel} />}
    {toast ? (
      <div
        className={`${styles.draftToast}${toast.error ? ` ${styles.draftToastError}` : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast.message}
      </div>
    ) : null}
  </div>;
}
