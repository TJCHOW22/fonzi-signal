"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGlobalAIState } from "@/components/global-controls/global-ai-state";
import type {
  DraftDetail,
  DraftGenerationRunStage,
  DraftRecord,
  DraftRevisionRecord,
} from "@/lib/media-drafts/types";
import styles from "./draft-comparison-workspace.module.css";

type SaveState = "saved" | "saving" | "error";

type EditableDraftFields = {
  thumbnailHook: string;
  scriptHook: string;
  scriptBody: string;
  cta: string;
  speaker: string;
  publishingAccount: string;
  publishingPlatform: string;
};

function editableFields(draft: DraftRecord): EditableDraftFields {
  return {
    thumbnailHook: draft.thumbnailHook ?? "",
    scriptHook: draft.scriptHook ?? "",
    scriptBody: draft.scriptBody ?? "",
    cta: draft.cta ?? "",
    speaker: draft.speaker || "Brett",
    publishingAccount: draft.publishingAccount || "Fonzi",
    publishingPlatform: draft.publishingPlatform || "Instagram",
  };
}

function statusLabel(status: DraftRecord["generationStatus"]) {
  if (status === "generating") return "Generating";
  if (status === "failed") return "Generation failed";
  return "Ready";
}

function saveLabel(state: SaveState) {
  if (state === "saving") return "Saving changes…";
  if (state === "error") return "Changes not saved";
  return "All changes saved";
}

function metricLabel(value: string) {
  return value.trim() || "Not captured";
}

function accountLabel(value: string) {
  return value.startsWith("@") ? value : `@${value}`;
}

function formatUpdatedAt(value: string) {
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.valueOf())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

const ACTIVE_RUN_STAGES = new Set<DraftGenerationRunStage>([
  "preparing_source",
  "writing",
  "verifying_facts",
  "checking_voice",
]);

function runStageLabel(stage: DraftGenerationRunStage | undefined) {
  if (stage === "preparing_source") return "Preparing source";
  if (stage === "writing") return "Writing";
  if (stage === "verifying_facts") return "Verifying facts";
  if (stage === "checking_voice") return "Checking Brett's voice";
  if (stage === "failed") return "Pipeline failed";
  return "Ready";
}

function revisionKindLabel(kind: string) {
  return kind
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function revisionTitle(revision: DraftRevisionRecord, version: number) {
  return `Version ${version} · ${revisionKindLabel(revision.kind)}`;
}

function sourceLinkLabel(value: string, index: number) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return `Source ${index + 1}`;
  }
}

export function DraftComparisonWorkspace({
  initialDetail,
}: {
  initialDetail: DraftDetail;
}) {
  const router = useRouter();
  const { drafts, rerunDraft } = useGlobalAIState();
  const { draft, source, revisions } = initialDetail;
  const [fields, setFields] = useState<EditableDraftFields>(() => editableFields(draft));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [updatedAt, setUpdatedAt] = useState(draft.updatedAt);
  const [retryVersion, setRetryVersion] = useState(0);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [rerunPending, setRerunPending] = useState(false);
  const hasLocalEditsRef = useRef(false);
  const liveDraft = drafts.find((item) => item.id === draft.id) ?? draft;
  const activeRun = liveDraft.latestRun && ACTIVE_RUN_STAGES.has(liveDraft.latestRun.stage)
    ? liveDraft.latestRun
    : null;

  useEffect(() => {
    if (hasLocalEditsRef.current) return;
    setFields(editableFields(draft));
    setUpdatedAt(draft.updatedAt);
  }, [draft, revisions.length]);

  useEffect(() => {
    if (!hasLocalEditsRef.current) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/drafts/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
          signal: controller.signal,
        });

        const payload = (await response.json()) as {
          draft?: DraftRecord;
          error?: string;
        };

        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || "Could not save this draft.");
        }

        hasLocalEditsRef.current = false;
        setUpdatedAt(payload.draft.updatedAt);
        setSaveState("saved");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSaveState("error");
      }
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [draft.id, fields, retryVersion]);

  function updateField(field: keyof EditableDraftFields, value: string) {
    if (fields[field] === value) return;
    hasLocalEditsRef.current = true;
    setSaveState("saving");
    setFields((current) => current[field] === value ? current : { ...current, [field]: value });
  }

  function retrySave() {
    hasLocalEditsRef.current = true;
    setSaveState("saving");
    setRetryVersion((version) => version + 1);
  }

  async function handleRerun() {
    if (rerunPending || activeRun) return;
    setRerunPending(true);
    setRerunError(null);
    try {
      const updated = await rerunDraft(draft.id);
      if (updated.generationStatus === "failed") {
        throw new Error(updated.latestRun?.error || "Generation could not finish this draft.");
      }
    } catch (error) {
      setRerunError(error instanceof Error ? error.message : "Generation could not finish this draft.");
    } finally {
      router.refresh();
      setRerunPending(false);
    }
  }

  const isGenerating = liveDraft.generationStatus === "generating" || Boolean(activeRun);
  const generatedThumbnailAlt = fields.thumbnailHook
    ? `Generated thumbnail for “${fields.thumbnailHook}”`
    : `Generated thumbnail for ${source.title}`;
  const scriptWordCount = [fields.scriptHook, fields.scriptBody, fields.cta]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div className={styles.headerCopy}>
          <Link className={styles.backLink} href={`/?workspace=drafts&draft=${draft.id}`}>
            <span aria-hidden="true">←</span>
            Drafts
          </Link>
          <div className={styles.eyebrowRow}>
            <span>Draft {draft.id}</span>
            <span aria-hidden="true">·</span>
            <span>{fields.speaker}</span>
          </div>
          <h1>{fields.thumbnailHook || source.title}</h1>
        </div>

        <div className={styles.headerStatus}>
          <button
            className={styles.rerunButton}
            type="button"
            onClick={handleRerun}
            disabled={rerunPending || Boolean(activeRun)}
          >
            {rerunPending || activeRun ? "Generation running" : "Generate again"}
          </button>
          <span
            className={`${styles.generationPill} ${styles[`generation_${liveDraft.generationStatus}`]}`}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {activeRun
              ? `${runStageLabel(activeRun.stage)} · pass ${activeRun.passNumber}`
              : statusLabel(liveDraft.generationStatus)}
          </span>
          <div className={styles.saveMessage} role="status" aria-live="polite">
            <span className={styles.saveDot} data-state={saveState} aria-hidden="true" />
            <span>{saveLabel(saveState)}</span>
            {saveState === "error" ? (
              <button type="button" onClick={retrySave}>Retry</button>
            ) : null}
          </div>
          {rerunError ? <p className={styles.rerunError} role="alert">{rerunError}</p> : null}
        </div>
      </header>

      <div className={styles.comparisonGrid}>
        <section className={styles.sourcePanel} aria-labelledby="source-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.kicker}>Original source</p>
              <h2 id="source-heading">Reference</h2>
            </div>
            <span className={styles.readOnlyBadge}>
              <span aria-hidden="true">⌁</span>
              Read only
            </span>
          </div>

          <div className={styles.sourceMediaGrid}>
            <div className={styles.videoFrame}>
              <video
                controls
                playsInline
                preload="metadata"
                poster={source.thumbnailUrl}
                aria-label={`Original Instagram video by ${source.creator}`}
              >
                <source src={source.videoUrl} />
                Your browser does not support video playback.
              </video>
            </div>
          </div>

          <div className={styles.sourceIdentity}>
            <div className={styles.creatorAvatar} aria-hidden="true">
              {source.creator.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{source.creator}</strong>
              <span>{accountLabel(source.sourceAccount)}</span>
            </div>
            <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open on Instagram
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <dl className={styles.sourceFacts}>
            <div>
              <dt>Platform</dt>
              <dd>{source.platform}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{source.duration || "Not captured"}</dd>
            </div>
            <div>
              <dt>Source account</dt>
              <dd>{accountLabel(source.sourceAccount)}</dd>
            </div>
          </dl>

          <section className={styles.metricsCard} aria-labelledby="metrics-heading">
            <div className={styles.sectionTitleRow}>
              <h3 id="metrics-heading">Source metrics</h3>
              <span>At time of capture</span>
            </div>
            <dl>
              <div>
                <dt>Likes</dt>
                <dd>{metricLabel(source.metrics.likes)}</dd>
              </div>
              <div>
                <dt>Comments</dt>
                <dd>{metricLabel(source.metrics.comments)}</dd>
              </div>
              <div>
                <dt>Reposts</dt>
                <dd>{metricLabel(source.metrics.reposts)}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.sourceScript} aria-labelledby="transcript-heading">
            <div className={styles.sectionDivider}>
              <span id="transcript-heading">Spoken transcript</span>
            </div>
            <label className={`${styles.field} ${styles.readOnlyField}`}>
              <span>
                Transcript
                <small>Original spoken script</small>
              </span>
              <textarea
                className={styles.sourceTranscript}
                value={source.transcript || "No transcript was captured for this source."}
                rows={16}
                readOnly
              />
            </label>
          </section>

          <section className={styles.sourceText} aria-labelledby="caption-heading">
            <h3 id="caption-heading">Original caption</h3>
            <div className={styles.sourceTextBody}>
              {source.caption || "No caption was captured for this source."}
            </div>
          </section>
        </section>

        <section className={styles.draftPanel} aria-labelledby="draft-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.kicker}>New version</p>
              <h2 id="draft-heading">Writing room</h2>
            </div>
            <span className={styles.autoSaveBadge}>Autosave on</span>
          </div>

          <div className={`${styles.sectionDivider} ${styles.primarySectionDivider}`}>
            <span>Thumbnail direction</span>
          </div>

          <div className={styles.generatedThumbnail} aria-busy={isGenerating}>
            {draft.generatedThumbnailUrl ? (
              <Image
                src={draft.generatedThumbnailUrl}
                alt={generatedThumbnailAlt}
                fill
                sizes="(max-width: 920px) 100vw, 42vw"
                unoptimized
              />
            ) : (
              <div className={styles.thumbnailPlaceholder}>
                {isGenerating ? (
                  <span className={styles.thumbnailLoader} aria-hidden="true" />
                ) : null}
                <span>{isGenerating ? "Building thumbnail" : "Thumbnail direction"}</span>
                <strong>{fields.thumbnailHook || "Your winning hook will appear here"}</strong>
              </div>
            )}
          </div>

          <label className={styles.field}>
            <span>
              Thumbnail hook
              <small>Feed text, separate from the spoken hook</small>
            </span>
            <textarea
              value={fields.thumbnailHook}
              onChange={(event) => updateField("thumbnailHook", event.target.value)}
              rows={2}
              placeholder={isGenerating ? "Generating the winning thumbnail hook…" : "Write a concise feed hook"}
            />
          </label>

          <div className={styles.sectionDivider}>
            <span>
              Spoken script
              {scriptWordCount > 0 ? ` · ${scriptWordCount} words` : isGenerating ? " · Generating" : " · Missing"}
            </span>
          </div>

          <label className={styles.field}>
            <span>Hook</span>
            <textarea
              value={fields.scriptHook}
              onChange={(event) => updateField("scriptHook", event.target.value)}
              rows={3}
              placeholder={isGenerating ? "Writing the opening…" : "The first spoken lines"}
            />
          </label>

          <label className={styles.field}>
            <span>Body</span>
            <textarea
              className={styles.scriptBody}
              value={fields.scriptBody}
              onChange={(event) => updateField("scriptBody", event.target.value)}
              rows={16}
              placeholder={isGenerating ? "Writing the script…" : "Write the main script"}
            />
          </label>

          <label className={styles.field}>
            <span>CTA</span>
            <textarea
              value={fields.cta}
              onChange={(event) => updateField("cta", event.target.value)}
              rows={3}
              placeholder={isGenerating ? "Writing the close…" : "What should the viewer do next?"}
            />
          </label>

          <div className={styles.assignmentGrid}>
            <label className={styles.field}>
              <span>Speaker</span>
              <input
                type="text"
                value={fields.speaker}
                onChange={(event) => updateField("speaker", event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Publishing account</span>
              <input
                type="text"
                value={fields.publishingAccount}
                onChange={(event) => updateField("publishingAccount", event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Publishing platform</span>
              <input
                type="text"
                value={fields.publishingPlatform}
                onChange={(event) => updateField("publishingPlatform", event.target.value)}
                required
              />
            </label>
          </div>

          <footer className={styles.draftFooter}>
            <span>Source stays permanently linked to this draft.</span>
            <time dateTime={updatedAt}>Updated {formatUpdatedAt(updatedAt)}</time>
          </footer>
        </section>
      </div>

      <section className={styles.revisionHistory} aria-labelledby="revision-history-heading">
        <div className={styles.revisionHeading}>
          <div>
            <p className={styles.kicker}>Generation record</p>
            <h2 id="revision-history-heading">How this draft changed</h2>
          </div>
          <span>{revisions.length} {revisions.length === 1 ? "version" : "versions"}</span>
        </div>

        {revisions.length === 0 ? (
          <div className={styles.revisionEmpty}>
            The next completed generation will appear here.
          </div>
        ) : (
          <div className={styles.revisionList}>
            {revisions.map((revision, index) => {
              const version = revisions.length - index;
              return (
                <details className={styles.revisionItem} key={revision.id}>
                  <summary>
                    <span className={styles.revisionChevron} aria-hidden="true">›</span>
                    <span>
                      <strong>{revisionTitle(revision, version)}</strong>
                      <small>{revision.summary}</small>
                    </span>
                    <span className={styles.revisionMeta}>
                      <span>Pass {revision.passNumber}</span>
                      <time dateTime={revision.createdAt}>{formatUpdatedAt(revision.createdAt)}</time>
                    </span>
                  </summary>

                  <div className={styles.revisionBody}>
                    <div className={styles.revisionField}>
                      <span>Thumbnail hook</span>
                      <p>{revision.thumbnailHook || "No thumbnail hook saved for this version."}</p>
                    </div>
                    <div className={styles.revisionField}>
                      <span>Spoken hook</span>
                      <p>{revision.scriptHook || "No spoken hook saved for this version."}</p>
                    </div>
                    <div className={`${styles.revisionField} ${styles.revisionScript}`}>
                      <span>Script body</span>
                      <p>{revision.scriptBody || "No script body saved for this version."}</p>
                    </div>
                    <div className={styles.revisionField}>
                      <span>CTA</span>
                      <p>{revision.cta || "No CTA saved for this version."}</p>
                    </div>
                    {revision.sourceUrls.length > 0 ? (
                      <div className={styles.revisionSources}>
                        <span>Sources checked</span>
                        <div>
                          {revision.sourceUrls.slice(0, 5).map((url, sourceIndex) => (
                            <a href={url} key={url} target="_blank" rel="noopener noreferrer">
                              {sourceLinkLabel(url, sourceIndex)}
                              <span aria-hidden="true">↗</span>
                            </a>
                          ))}
                          {revision.sourceUrls.length > 5 ? (
                            <small>+{revision.sourceUrls.length - 5} more checked</small>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
