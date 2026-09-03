import type Database from "better-sqlite3";
import { getDb } from "../db.ts";
import { MEDIA_CATALOG } from "./media-catalog.ts";
import { DRAFT_PRODUCTION_STAGES } from "./types.ts";
import { runSingleCallDraftGeneration } from "./single-call-generator.ts";
import type {
  CreateDraftInput,
  DraftCodexThreadRecord,
  DraftCodexThreadState,
  DraftDetail,
  DraftGenerationRunRecord,
  DraftGenerationRunStage,
  DraftGenerationStatus,
  DraftNotificationRecord,
  DraftProductionStage,
  DraftRecord,
  DraftRevisionInput,
  DraftRevisionRecord,
  EditableDraftFields,
  MediaSourceRecord,
  DraftGenerationFunction,
  DraftGenerationProvenance,
} from "./types.ts";

export const DEFAULT_WORKFLOW_KEY = "instagram-brett-v1";

type MediaItemRow = {
  id: string;
  title: string;
  creator: string;
  source_account: string;
  source_platform: string;
  posted_at: string | null;
  duration: string | null;
  thumbnail_url: string;
  video_url: string;
  source_url: string;
  thumbnail_text: string | null;
  transcript: string;
  caption: string | null;
  summary: string | null;
  likes: string | null;
  comments: string | null;
  reposts: string | null;
};

type DraftRow = {
  id: number;
  source_media_id: string;
  workflow_key: string;
  speaker: string;
  source_platform: string;
  publishing_account: string;
  publishing_platform: string;
  generation_status: string;
  production_stage: string;
  thumbnail_hook: string | null;
  generated_thumbnail_url: string | null;
  script_hook: string | null;
  script_body: string | null;
  cta: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type NotificationRow = {
  id: number;
  draft_id: number;
  event_status: string;
  created_at: string;
  read_at: string | null;
  draft_title: string;
  speaker: string;
};

type GenerationRunRow = {
  id: number;
  draft_id: number;
  stage: string;
  pass_number: number;
  model: string | null;
  prompt_version: string | null;
  prompt_hash: string | null;
  error: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

type RevisionRow = {
  id: number;
  draft_id: number;
  generation_run_id: number;
  pass_number: number;
  event_key: string | null;
  kind: string;
  summary: string;
  source_urls: string;
  thumbnail_hook: string | null;
  generated_thumbnail_url: string | null;
  script_hook: string | null;
  script_body: string | null;
  cta: string | null;
  created_at: string;
};

type CodexThreadRow = {
  draft_id: number;
  thread_id: string | null;
  model: string | null;
  state: string;
  claim_token: string | null;
  claimed_at: string;
  claim_expires_at: string | null;
  ready_at: string | null;
  failed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationResult = {
  draft: DraftRecord;
  notification: DraftNotificationRecord;
};

const ACTIVE_RUN_STAGES = [
  "preparing_source",
  "writing",
  "verifying_facts",
  "checking_voice",
] as const satisfies readonly DraftGenerationRunStage[];

const activeRunSql = ACTIVE_RUN_STAGES.map(() => "?").join(", ");
const generationPromises = new WeakMap<
  Database.Database,
  Map<number, Promise<GenerationResult>>
>();

function asGenerationStatus(value: string): DraftGenerationStatus {
  if (value === "ready" || value === "failed") return value;
  return "generating";
}

function asProductionStage(value: string): DraftProductionStage {
  if (value === "ready_to_record" || value === "editing" || value === "ready_to_publish") {
    return value;
  }
  return "drafting";
}

function asRunStage(value: string): DraftGenerationRunStage {
  if (value === "writing" || value === "verifying_facts" || value === "checking_voice"
    || value === "ready" || value === "failed") return value;
  return "preparing_source";
}

function asCodexThreadState(value: string): DraftCodexThreadState {
  if (value === "ready" || value === "failed") return value;
  return "provisioning";
}

function codexThreadDto(row: CodexThreadRow): DraftCodexThreadRecord {
  return {
    draftId: row.draft_id,
    threadId: row.thread_id,
    model: row.model,
    state: asCodexThreadState(row.state),
    error: row.error,
    claimedAt: row.claimed_at,
    claimExpiresAt: row.claim_expires_at,
    readyAt: row.ready_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function runDto(row: GenerationRunRow): DraftGenerationRunRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    stage: asRunStage(row.stage),
    passNumber: row.pass_number,
    model: row.model,
    promptVersion: row.prompt_version,
    promptHash: row.prompt_hash,
    error: row.error,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function parseSourceUrls(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === "string") : [];
  } catch {
    return [];
  }
}

function revisionDto(row: RevisionRow): DraftRevisionRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    generationRunId: row.generation_run_id,
    passNumber: row.pass_number,
    eventKey: row.event_key ?? `legacy:${row.id}`,
    kind: row.kind,
    summary: row.summary,
    sourceUrls: parseSourceUrls(row.source_urls),
    thumbnailHook: row.thumbnail_hook,
    generatedThumbnailUrl: row.generated_thumbnail_url,
    scriptHook: row.script_hook,
    scriptBody: row.script_body,
    cta: row.cta,
    createdAt: row.created_at,
  };
}

function mediaDto(row: MediaItemRow): MediaSourceRecord {
  return {
    id: row.id,
    title: row.title,
    creator: row.creator,
    sourceAccount: row.source_account,
    platform: "Instagram",
    postedAt: row.posted_at ?? undefined,
    duration: row.duration ?? "",
    thumbnailUrl: row.thumbnail_url,
    videoUrl: row.video_url,
    sourceUrl: row.source_url,
    thumbnailText: row.thumbnail_text ?? "",
    transcript: row.transcript,
    caption: row.caption ?? "",
    summary: row.summary ?? "",
    metrics: {
      likes: row.likes ?? "0",
      comments: row.comments ?? "0",
      reposts: row.reposts ?? "0",
    },
  };
}

function draftDto(
  row: DraftRow,
  latestRun: DraftGenerationRunRecord | null,
  codexThread: DraftCodexThreadRecord | null,
): DraftRecord {
  return {
    id: row.id,
    sourceMediaId: row.source_media_id,
    workflowKey: row.workflow_key,
    speaker: row.speaker,
    sourcePlatform: row.source_platform,
    publishingAccount: row.publishing_account,
    publishingPlatform: row.publishing_platform,
    generationStatus: asGenerationStatus(row.generation_status),
    productionStage: asProductionStage(row.production_stage),
    thumbnailHook: row.thumbnail_hook,
    generatedThumbnailUrl: row.generated_thumbnail_url,
    scriptHook: row.script_hook,
    scriptBody: row.script_body,
    cta: row.cta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    latestRun,
    codexThread,
  };
}

function notificationDto(row: NotificationRow): DraftNotificationRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    eventStatus: "ready",
    createdAt: row.created_at,
    readAt: row.read_at,
    draftTitle: row.draft_title,
    speaker: row.speaker,
    draftUrl: `/drafts/${row.draft_id}`,
  };
}

const SELECT_NOTIFICATION = `
  SELECT notification.id, notification.draft_id, notification.event_status,
    notification.created_at, notification.read_at,
    COALESCE(draft.thumbnail_hook, media.title) AS draft_title,
    draft.speaker
  FROM draft_notifications notification
  JOIN drafts draft ON draft.id = notification.draft_id
  JOIN media_items media ON media.id = draft.source_media_id
`;

export class MediaDraftRepository {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  private codexThread(draftId: number): DraftCodexThreadRecord | null {
    const row = this.database.prepare(`
      SELECT * FROM draft_codex_threads WHERE draft_id = ?
    `).get(draftId) as CodexThreadRow | undefined;
    return row ? codexThreadDto(row) : null;
  }

  private latestRun(draftId: number): DraftGenerationRunRecord | null {
    const row = this.database.prepare(`
      SELECT * FROM draft_generation_runs
      WHERE draft_id = ? ORDER BY id DESC LIMIT 1
    `).get(draftId) as GenerationRunRow | undefined;
    return row ? runDto(row) : null;
  }

  private activeRun(draftId: number): DraftGenerationRunRecord | null {
    const row = this.database.prepare(`
      SELECT * FROM draft_generation_runs
      WHERE draft_id = ? AND stage IN (${activeRunSql})
      ORDER BY id DESC LIMIT 1
    `).get(draftId, ...ACTIVE_RUN_STAGES) as GenerationRunRow | undefined;
    return row ? runDto(row) : null;
  }

  private listRevisions(draftId: number): DraftRevisionRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM draft_revisions
      WHERE draft_id = ? ORDER BY created_at DESC, id DESC
    `).all(draftId) as RevisionRow[];
    return rows.map(revisionDto);
  }

  private createRun(draftId: number): DraftGenerationRunRecord {
    const result = this.database.prepare(`
      INSERT INTO draft_generation_runs (draft_id, stage, pass_number)
      VALUES (?, 'preparing_source', 1)
    `).run(draftId);
    const row = this.database.prepare("SELECT * FROM draft_generation_runs WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as GenerationRunRow;
    return runDto(row);
  }

  private setRunStage(
    runId: number,
    stage: DraftGenerationRunStage,
    passNumber: number,
  ): DraftGenerationRunRecord {
    if (!Number.isSafeInteger(passNumber) || passNumber < 1) {
      throw new Error("generation pass number must be a positive integer");
    }
    this.database.prepare(`
      UPDATE draft_generation_runs
      SET stage = ?, pass_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stage, passNumber, runId);
    const row = this.database.prepare("SELECT * FROM draft_generation_runs WHERE id = ?")
      .get(runId) as GenerationRunRow | undefined;
    if (!row) throw new Error("generation run not found");
    return runDto(row);
  }

  private setRunProvenance(
    runId: number,
    provenance: DraftGenerationProvenance,
  ): DraftGenerationRunRecord {
    const model = provenance.model.trim();
    const promptVersion = provenance.promptVersion.trim();
    const promptHash = provenance.promptHash.trim();
    if (!model || !promptVersion || !promptHash) {
      throw new Error("generation provenance requires model, prompt version, and prompt hash");
    }
    this.database.prepare(`
      UPDATE draft_generation_runs
      SET model = ?, prompt_version = ?, prompt_hash = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(model, promptVersion, promptHash, runId);
    const row = this.database.prepare("SELECT * FROM draft_generation_runs WHERE id = ?")
      .get(runId) as GenerationRunRow | undefined;
    if (!row) throw new Error("generation run not found");
    return runDto(row);
  }

  private saveRevision(
    runId: number,
    draftId: number,
    revision: DraftRevisionInput,
  ): DraftRevisionRecord {
    if (!Number.isSafeInteger(revision.passNumber) || revision.passNumber < 1) {
      throw new Error("revision pass number must be a positive integer");
    }
    if (!revision.eventKey.trim()) throw new Error("revision event key is required");
    if (!revision.kind.trim()) throw new Error("revision kind is required");
    if (!revision.summary.trim()) throw new Error("revision summary is required");
    const result = this.database.prepare(`
      INSERT INTO draft_revisions (
        draft_id, generation_run_id, pass_number, event_key, kind, summary, source_urls,
        thumbnail_hook, generated_thumbnail_url, script_hook, script_body, cta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(
      draftId,
      runId,
      revision.passNumber,
      revision.eventKey.trim(),
      revision.kind.trim(),
      revision.summary.trim(),
      JSON.stringify([...new Set(revision.sourceUrls)]),
      revision.thumbnailHook,
      revision.generatedThumbnailUrl,
      revision.scriptHook,
      revision.scriptBody,
      revision.cta,
    );
    const row = result.changes === 1
      ? this.database.prepare("SELECT * FROM draft_revisions WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as RevisionRow
      : this.database.prepare(`
          SELECT * FROM draft_revisions
          WHERE generation_run_id = ? AND event_key = ?
        `).get(runId, revision.eventKey.trim()) as RevisionRow | undefined;
    if (!row) throw new Error("draft revision did not persist");
    return revisionDto(row);
  }

  ensureMediaCatalog(): void {
    const insert = this.database.prepare(`
      INSERT INTO media_items (
        id, title, creator, source_account, source_platform, posted_at, duration,
        thumbnail_url, video_url, source_url, thumbnail_text, transcript,
        caption, summary, likes, comments, reposts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET posted_at = excluded.posted_at
    `);

    this.database.transaction(() => {
      for (const source of MEDIA_CATALOG) {
        insert.run(
          source.id,
          source.title,
          source.creator,
          source.sourceAccount,
          source.platform,
          source.postedAt ?? null,
          source.duration,
          source.thumbnailUrl,
          source.videoUrl,
          source.sourceUrl,
          source.thumbnailText,
          source.transcript,
          source.caption,
          source.summary,
          source.metrics.likes,
          source.metrics.comments,
          source.metrics.reposts,
        );
      }
    })();
  }

  listMedia(options: { activeOnly?: boolean } = {}): MediaSourceRecord[] {
    this.ensureMediaCatalog();
    const activeClause = options.activeOnly
      ? `WHERE media.killed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM drafts draft WHERE draft.source_media_id = media.id)`
      : "";
    const rows = this.database.prepare(`
      SELECT media.* FROM media_items media
      ${activeClause}
      ORDER BY media.created_at, media.id
    `).all() as MediaItemRow[];
    return rows.map(mediaDto);
  }

  getMedia(id: string): MediaSourceRecord | null {
    this.ensureMediaCatalog();
    const row = this.database.prepare("SELECT * FROM media_items WHERE id = ?")
      .get(id) as MediaItemRow | undefined;
    return row ? mediaDto(row) : null;
  }

  killMedia(id: string): boolean {
    const mediaId = id.trim();
    if (!mediaId) throw new Error("media id is required");
    this.ensureMediaCatalog();
    const result = this.database.prepare(`
      UPDATE media_items
      SET killed_at = COALESCE(killed_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mediaId);
    return result.changes === 1;
  }

  createDraft(input: CreateDraftInput): { draft: DraftRecord; created: boolean } {
    const sourceMediaId = input.sourceMediaId.trim();
    const workflowKey = input.workflowKey?.trim() || DEFAULT_WORKFLOW_KEY;
    if (!sourceMediaId) throw new Error("sourceMediaId is required");
    if (!workflowKey) throw new Error("workflowKey is required");

    this.ensureMediaCatalog();
    const source = this.database.prepare("SELECT id, source_platform FROM media_items WHERE id = ?")
      .get(sourceMediaId) as { id: string; source_platform: string } | undefined;
    if (!source) throw new Error("source media not found");

    return this.database.transaction(() => {
      const result = this.database.prepare(`
        INSERT INTO drafts (
          source_media_id, workflow_key, speaker, source_platform,
          publishing_account, publishing_platform, generation_status
        ) VALUES (?, ?, 'Brett', ?, 'Fonzi', 'Instagram', 'generating')
        ON CONFLICT(source_media_id, workflow_key) DO NOTHING
      `).run(sourceMediaId, workflowKey, source.source_platform);

      const row = this.database.prepare(`
        SELECT * FROM drafts WHERE source_media_id = ? AND workflow_key = ?
      `).get(sourceMediaId, workflowKey) as DraftRow;

      if (result.changes === 1) this.createRun(row.id);

      return {
        draft: draftDto(row, this.latestRun(row.id), this.codexThread(row.id)),
        created: result.changes === 1,
      };
    })();
  }

  listDrafts(): DraftRecord[] {
    this.ensureMediaCatalog();
    const rows = this.database.prepare(`
      SELECT * FROM drafts ORDER BY created_at DESC, id DESC
    `).all() as DraftRow[];
    return rows.map((row) => draftDto(
      row,
      this.latestRun(row.id),
      this.codexThread(row.id),
    ));
  }

  getDraft(id: number): DraftRecord | null {
    const row = this.database.prepare("SELECT * FROM drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? draftDto(row, this.latestRun(row.id), this.codexThread(row.id)) : null;
  }

  getDraftDetail(id: number): DraftDetail | null {
    this.ensureMediaCatalog();
    const row = this.database.prepare(`
      SELECT
        draft.id AS draft_id,
        draft.source_media_id AS draft_source_media_id,
        draft.workflow_key AS draft_workflow_key,
        draft.speaker AS draft_speaker,
        draft.source_platform AS draft_source_platform,
        draft.publishing_account AS draft_publishing_account,
        draft.publishing_platform AS draft_publishing_platform,
        draft.generation_status AS draft_generation_status,
        draft.production_stage AS draft_production_stage,
        draft.thumbnail_hook AS draft_thumbnail_hook,
        draft.generated_thumbnail_url AS draft_generated_thumbnail_url,
        draft.script_hook AS draft_script_hook,
        draft.script_body AS draft_script_body,
        draft.cta AS draft_cta,
        draft.created_at AS draft_created_at,
        draft.updated_at AS draft_updated_at,
        draft.completed_at AS draft_completed_at,
        media.*
      FROM drafts draft
      JOIN media_items media ON media.id = draft.source_media_id
      WHERE draft.id = ?
    `).get(id) as (MediaItemRow & {
      draft_id: number;
      draft_source_media_id: string;
      draft_workflow_key: string;
      draft_speaker: string;
      draft_source_platform: string;
      draft_publishing_account: string;
      draft_publishing_platform: string;
      draft_generation_status: string;
      draft_production_stage: string;
      draft_thumbnail_hook: string | null;
      draft_generated_thumbnail_url: string | null;
      draft_script_hook: string | null;
      draft_script_body: string | null;
      draft_cta: string | null;
      draft_created_at: string;
      draft_updated_at: string;
      draft_completed_at: string | null;
    }) | undefined;

    if (!row) return null;
    return {
      draft: draftDto({
        id: row.draft_id,
        source_media_id: row.draft_source_media_id,
        workflow_key: row.draft_workflow_key,
        speaker: row.draft_speaker,
        source_platform: row.draft_source_platform,
        publishing_account: row.draft_publishing_account,
        publishing_platform: row.draft_publishing_platform,
        generation_status: row.draft_generation_status,
        production_stage: row.draft_production_stage,
        thumbnail_hook: row.draft_thumbnail_hook,
        generated_thumbnail_url: row.draft_generated_thumbnail_url,
        script_hook: row.draft_script_hook,
        script_body: row.draft_script_body,
        cta: row.draft_cta,
        created_at: row.draft_created_at,
        updated_at: row.draft_updated_at,
        completed_at: row.draft_completed_at,
      }, this.latestRun(row.draft_id), this.codexThread(row.draft_id)),
      source: mediaDto(row),
      revisions: this.listRevisions(row.draft_id),
    };
  }

  updateDraft(id: number, fields: EditableDraftFields): DraftRecord | null {
    const columns: Array<{ name: string; value: string | null }> = [];
    const add = (name: string, value: string | null | undefined) => {
      if (value !== undefined) columns.push({ name, value });
    };

    add("thumbnail_hook", fields.thumbnailHook);
    add("generated_thumbnail_url", fields.generatedThumbnailUrl);
    add("script_hook", fields.scriptHook);
    add("script_body", fields.scriptBody);
    add("cta", fields.cta);
    add("speaker", fields.speaker);
    add("publishing_account", fields.publishingAccount);
    add("publishing_platform", fields.publishingPlatform);

    for (const field of columns) {
      if (["speaker", "publishing_account", "publishing_platform"].includes(field.name)
        && !field.value?.trim()) {
        throw new Error(`${field.name} cannot be empty`);
      }
    }

    if (columns.length > 0) {
      const assignments = columns.map(({ name }) => `${name} = ?`).join(", ");
      this.database.prepare(`
        UPDATE drafts SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(...columns.map(({ value }) => value), id);
    }

    return this.getDraft(id);
  }

  updateProductionStage(id: number, stage: DraftProductionStage): DraftRecord | null {
    return this.database.transaction(() => {
      if (!(DRAFT_PRODUCTION_STAGES as readonly string[]).includes(stage)) {
        throw new Error("invalid production stage");
      }
      const draft = this.getDraft(id);
      if (!draft) return null;

      if (stage === "ready_to_record") {
        if (draft.generationStatus !== "ready") {
          throw new Error("draft generation must be ready before recording");
        }
        if (![draft.scriptHook, draft.scriptBody].filter(Boolean).join("\n").trim()) {
          throw new Error("draft script must be non-empty before recording");
        }
      }

      if (draft.productionStage !== stage) {
        this.database.prepare(`
          UPDATE drafts SET production_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(stage, id);
      }
      return this.getDraft(id);
    })();
  }

  private prepareRun(id: number, force: boolean): DraftGenerationRunRecord | null {
    return this.database.transaction(() => {
      const draft = this.getDraft(id);
      if (!draft) throw new Error("draft not found");

      const active = this.activeRun(id);
      if (active) return active;
      if (draft.generationStatus === "ready" && !force) return null;

      const run = this.createRun(id);
      this.database.prepare(`
        UPDATE drafts SET generation_status = 'generating', completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
      // The prior completion stays visible as history but loses unread
      // emphasis while this rerun is active. Completion rearms the same row.
      this.database.prepare(`
        UPDATE draft_notifications
        SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE draft_id = ?
      `).run(id);
      return run;
    })();
  }

  private failRun(runId: number, draftId: number, error: string): void {
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE draft_generation_runs
        SET stage = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error, runId);
      this.database.prepare(`
        UPDATE drafts SET generation_status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (SELECT id FROM draft_generation_runs
            WHERE draft_id = ? ORDER BY id DESC LIMIT 1) = ?
      `).run(draftId, draftId, runId);
    })();
  }

  private async executeGeneration(
    id: number,
    run: DraftGenerationRunRecord,
    pipeline: DraftGenerationFunction,
  ): Promise<GenerationResult> {
    const detail = this.getDraftDetail(id);
    if (!detail) throw new Error("draft not found");

    try {
      const winner = await pipeline({
        sourceMaterial: detail.source.transcript,
      }, {
        onStage: (stage, passNumber) => {
          // Terminal stages are committed atomically with the final draft or
          // error below, so clients never see a ready run with stale content.
          if (ACTIVE_RUN_STAGES.includes(stage as typeof ACTIVE_RUN_STAGES[number])) {
            this.setRunStage(run.id, stage, passNumber);
          }
        },
        onProvenance: (provenance) => {
          this.setRunProvenance(run.id, provenance);
        },
      });
      const completedRun = this.latestRun(id);
      if (!completedRun?.model || !completedRun.promptVersion || !completedRun.promptHash) {
        throw new Error("generation completed without model and prompt provenance");
      }
      this.saveRevision(run.id, id, {
        ...winner,
        passNumber: 1,
        eventKey: `run:${run.id}:final`,
        kind: "final",
        summary: "Single-call generation completed",
      });

      return this.database.transaction(() => {
        this.database.prepare(`
          UPDATE drafts SET
            thumbnail_hook = ?, generated_thumbnail_url = ?, script_hook = ?,
            script_body = ?, cta = ?, generation_status = 'ready',
            updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          winner.thumbnailHook,
          winner.generatedThumbnailUrl,
          winner.scriptHook,
          winner.scriptBody,
          winner.cta,
          id,
        );
        this.database.prepare(`
          UPDATE draft_generation_runs
          SET stage = 'ready', error = NULL, updated_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(run.id);
        this.database.prepare(`
          INSERT INTO draft_notifications (draft_id, event_status)
          VALUES (?, 'ready')
          ON CONFLICT(draft_id) DO UPDATE SET
            event_status = 'ready', created_at = CURRENT_TIMESTAMP, read_at = NULL
        `).run(id);

        const draft = this.getDraft(id);
        const notification = this.getNotificationForDraft(id);
        if (!draft || !notification) throw new Error("draft generation did not persist");
        return { draft, notification };
      })();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Draft generation failed";
      this.failRun(run.id, id, message);
      throw error;
    }
  }

  async generateDraft(
    id: number,
    options: { force?: boolean; pipeline?: DraftGenerationFunction } = {},
  ): Promise<GenerationResult> {
    let databasePromises = generationPromises.get(this.database);
    if (!databasePromises) {
      databasePromises = new Map();
      generationPromises.set(this.database, databasePromises);
    }
    const current = databasePromises.get(id);
    if (current) return current;

    const run = this.prepareRun(id, options.force === true);
    if (!run) {
      const draft = this.getDraft(id);
      const notification = this.getNotificationForDraft(id);
      if (!draft) throw new Error("draft not found");
      if (!notification) throw new Error("ready draft is missing its notification");
      return { draft, notification };
    }

    const execution = this.executeGeneration(id, run, options.pipeline ?? runSingleCallDraftGeneration);
    databasePromises.set(id, execution);
    try {
      return await execution;
    } finally {
      if (databasePromises.get(id) === execution) databasePromises.delete(id);
    }
  }

  markDraftFailed(id: number, error = "Draft generation failed"): DraftRecord | null {
    const run = this.activeRun(id);
    if (run) this.failRun(run.id, id, error);
    else this.database.prepare(`
      UPDATE drafts SET generation_status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND generation_status != 'ready'
    `).run(id);
    return this.getDraft(id);
  }

  listNotifications(): DraftNotificationRecord[] {
    const rows = this.database.prepare(`
      ${SELECT_NOTIFICATION}
      ORDER BY notification.created_at DESC, notification.id DESC
    `).all() as NotificationRow[];
    return rows.map(notificationDto);
  }

  getNotificationForDraft(draftId: number): DraftNotificationRecord | null {
    const row = this.database.prepare(`
      ${SELECT_NOTIFICATION}
      WHERE notification.draft_id = ?
    `).get(draftId) as NotificationRow | undefined;
    return row ? notificationDto(row) : null;
  }

  markNotificationRead(id: number): DraftNotificationRecord | null {
    this.database.prepare(`
      UPDATE draft_notifications
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(id);
    const row = this.database.prepare(`
      ${SELECT_NOTIFICATION}
      WHERE notification.id = ?
    `).get(id) as NotificationRow | undefined;
    return row ? notificationDto(row) : null;
  }
}

function repository(): MediaDraftRepository {
  return new MediaDraftRepository(getDb());
}

export function listActiveMedia(): MediaSourceRecord[] {
  return repository().listMedia({ activeOnly: true });
}

export function listAllMedia(): MediaSourceRecord[] {
  return repository().listMedia();
}

export function killMedia(id: string): boolean {
  return repository().killMedia(id);
}

export function createDraft(input: CreateDraftInput): { draft: DraftRecord; created: boolean } {
  return repository().createDraft(input);
}

export function listDrafts(): DraftRecord[] {
  return repository().listDrafts();
}

export function listDraftNotifications(): DraftNotificationRecord[] {
  return repository().listNotifications();
}

export function getDraftDetail(id: number): DraftDetail | null {
  return repository().getDraftDetail(id);
}

export function updateDraft(id: number, fields: EditableDraftFields): DraftRecord | null {
  return repository().updateDraft(id, fields);
}

export function updateDraftProductionStage(
  id: number,
  stage: DraftProductionStage,
): DraftRecord | null {
  return repository().updateProductionStage(id, stage);
}

export function generateDraft(
  id: number,
  options?: { force?: boolean; pipeline?: DraftGenerationFunction },
): Promise<{ draft: DraftRecord; notification: DraftNotificationRecord }> {
  return repository().generateDraft(id, options);
}

export function markDraftFailed(id: number, error?: string): DraftRecord | null {
  return repository().markDraftFailed(id, error);
}

export function markDraftNotificationRead(id: number): DraftNotificationRecord | null {
  return repository().markNotificationRead(id);
}
