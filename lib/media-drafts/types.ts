export const DRAFT_GENERATION_STATUSES = ["generating", "ready", "failed"] as const;

export type DraftGenerationStatus = (typeof DRAFT_GENERATION_STATUSES)[number];

export const DRAFT_PRODUCTION_STAGES = [
  "drafting",
  "ready_to_record",
  "editing",
  "ready_to_publish",
] as const;

export type DraftProductionStage = (typeof DRAFT_PRODUCTION_STAGES)[number];

export const DRAFT_GENERATION_RUN_STAGES = [
  "preparing_source",
  "writing",
  "verifying_facts",
  "checking_voice",
  "ready",
  "failed",
] as const;

export type DraftGenerationRunStage = (typeof DRAFT_GENERATION_RUN_STAGES)[number];

export type DraftGenerationRunRecord = {
  id: number;
  draftId: number;
  stage: DraftGenerationRunStage;
  passNumber: number;
  model: string | null;
  promptVersion: string | null;
  promptHash: string | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export const DRAFT_CODEX_THREAD_STATES = ["provisioning", "ready", "failed"] as const;

export type DraftCodexThreadState = (typeof DRAFT_CODEX_THREAD_STATES)[number];

export type DraftCodexThreadRecord = {
  draftId: number;
  threadId: string | null;
  model: string | null;
  state: DraftCodexThreadState;
  error: string | null;
  claimedAt: string;
  claimExpiresAt: string | null;
  readyAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaMetrics = {
  likes: string;
  comments: string;
  reposts: string;
};

/** Client-safe source shape shared by Media, Drafts, and draft detail. */
export type MediaSourceRecord = {
  id: string;
  title: string;
  creator: string;
  sourceAccount: string;
  platform: "Instagram";
  postedAt?: string;
  duration: string;
  thumbnailUrl: string;
  videoUrl: string;
  sourceUrl: string;
  thumbnailText: string;
  transcript: string;
  caption: string;
  summary: string;
  metrics: MediaMetrics;
};

export type DraftRecord = {
  id: number;
  sourceMediaId: string;
  workflowKey: string;
  speaker: string;
  sourcePlatform: string;
  publishingAccount: string;
  publishingPlatform: string;
  generationStatus: DraftGenerationStatus;
  productionStage: DraftProductionStage;
  thumbnailHook: string | null;
  generatedThumbnailUrl: string | null;
  scriptHook: string | null;
  scriptBody: string | null;
  cta: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  latestRun: DraftGenerationRunRecord | null;
  codexThread: DraftCodexThreadRecord | null;
};

export type DraftRevisionRecord = {
  id: number;
  draftId: number;
  generationRunId: number;
  passNumber: number;
  eventKey: string;
  kind: string;
  summary: string;
  sourceUrls: string[];
  thumbnailHook: string | null;
  generatedThumbnailUrl: string | null;
  scriptHook: string | null;
  scriptBody: string | null;
  cta: string | null;
  createdAt: string;
};

export type DraftNotificationRecord = {
  id: number;
  draftId: number;
  eventStatus: "ready";
  createdAt: string;
  readAt: string | null;
  draftTitle: string;
  speaker: string;
  draftUrl: string;
};

export type DraftDetail = {
  draft: DraftRecord;
  source: MediaSourceRecord;
  revisions: DraftRevisionRecord[];
};

export type CreateDraftInput = {
  sourceMediaId: string;
  workflowKey?: string;
};

export type EditableDraftFields = {
  thumbnailHook?: string | null;
  generatedThumbnailUrl?: string | null;
  scriptHook?: string | null;
  scriptBody?: string | null;
  cta?: string | null;
  speaker?: string;
  publishingAccount?: string;
  publishingPlatform?: string;
};

export type DraftGenerationInput = {
  sourceMaterial: string;
  constraints?: string;
};

/** The single model response mapped into the existing editor fields. */
export type DraftGenerationWinner = {
  thumbnailHook: string;
  generatedThumbnailUrl: string | null;
  scriptHook: string;
  scriptBody: string;
  cta: string;
  sourceUrls: string[];
};

export type DraftGenerationProvenance = {
  model: string;
  promptVersion: string;
  promptHash: string;
};

export type DraftRevisionInput = Pick<
  DraftGenerationWinner,
  "thumbnailHook" | "generatedThumbnailUrl" | "scriptHook" | "scriptBody" | "cta" | "sourceUrls"
> & {
  passNumber: number;
  eventKey: string;
  kind: string;
  summary: string;
};

export type DraftGenerationCallbacks = {
  onStage(stage: DraftGenerationRunStage, passNumber: number): void | Promise<void>;
  onProvenance(provenance: DraftGenerationProvenance): void | Promise<void>;
};

export type DraftGenerationFunction = (
  input: DraftGenerationInput,
  callbacks: DraftGenerationCallbacks,
) => Promise<DraftGenerationWinner>;
