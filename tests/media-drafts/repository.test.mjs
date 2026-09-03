import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import { applySchema } from "../../lib/db.ts";
import { MEDIA_CATALOG } from "../../lib/media-drafts/media-catalog.ts";
import { DEFAULT_WORKFLOW_KEY, MediaDraftRepository } from "../../lib/media-drafts/repository.ts";

const TEST_PROVENANCE = {
  model: "test-model",
  promptVersion: "test-prompt-v1",
  promptHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function testRepository() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database, fs.readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"));
  return { database, repository: new MediaDraftRepository(database) };
}

test("Create is idempotent and permanently links one draft to its source", () => {
  const { database, repository } = testRepository();
  const sourceId = "DZFnttWijxS";
  assert.equal(repository.listMedia({ activeOnly: true }).length, MEDIA_CATALOG.length);
  const first = repository.createDraft({ sourceMediaId: sourceId });
  const retry = repository.createDraft({ sourceMediaId: sourceId });
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.draft.id, first.draft.id);
  assert.equal(retry.draft.workflowKey, DEFAULT_WORKFLOW_KEY);
  assert.equal(repository.getDraftDetail(first.draft.id)?.source.id, sourceId);
  database.close();
});

test("Kill permanently removes media from the active grid without deleting its source", () => {
  const { database, repository } = testRepository();
  const sourceId = "DcQ5PNeC6-s";
  assert.equal(repository.listMedia({ activeOnly: true }).some((item) => item.id === sourceId), true);
  assert.equal(repository.killMedia(sourceId), true);
  assert.equal(repository.listMedia({ activeOnly: true }).some((item) => item.id === sourceId), false);
  assert.equal(repository.getMedia(sourceId)?.id, sourceId);
  repository.ensureMediaCatalog();
  assert.equal(repository.listMedia({ activeOnly: true }).some((item) => item.id === sourceId), false);
  database.close();
});

test("one generation result is passed directly into the editor fields", async () => {
  const { database, repository } = testRepository();
  const created = repository.createDraft({ sourceMediaId: "DZFnttWijxS" });
  let calls = 0;
  const result = await repository.generateDraft(created.draft.id, {
    pipeline: async (generationInput, callbacks) => {
      calls += 1;
      assert.equal(generationInput.sourceMaterial.includes("Databricks"), true);
      assert.deepEqual(Object.keys(generationInput), ["sourceMaterial"]);
      await callbacks.onProvenance(TEST_PROVENANCE);
      return {
        thumbnailHook: "The generated title",
        generatedThumbnailUrl: null,
        scriptHook: "",
        scriptBody: "The complete generated script, unchanged.",
        cta: "",
        sourceUrls: [],
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.draft.thumbnailHook, "The generated title");
  assert.equal(result.draft.scriptBody, "The complete generated script, unchanged.");
  assert.equal(result.draft.scriptHook, "");
  assert.equal(result.draft.cta, "");
  assert.equal(result.draft.generationStatus, "ready");
  assert.equal(result.draft.latestRun?.model, TEST_PROVENANCE.model);
  assert.equal(result.draft.latestRun?.promptVersion, TEST_PROVENANCE.promptVersion);
  assert.equal(result.draft.latestRun?.promptHash, TEST_PROVENANCE.promptHash);
  assert.equal(result.draft.codexThread, null);
  const revisions = repository.getDraftDetail(created.draft.id)?.revisions ?? [];
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].kind, "final");
  assert.equal(revisions[0].scriptBody, "The complete generated script, unchanged.");
  assert.equal(database.prepare("SELECT COUNT(*) count FROM draft_generation_artifacts").get().count, 0);
  database.close();
});

test("duplicate generation requests coalesce into one call", async () => {
  const { database, repository } = testRepository();
  const created = repository.createDraft({ sourceMediaId: "Dcd0nZkCnAa" });
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pipeline = async (_input, callbacks) => {
    calls += 1;
    await callbacks.onProvenance(TEST_PROVENANCE);
    await gate;
    return {
      thumbnailHook: "One title", generatedThumbnailUrl: null, scriptHook: "",
      scriptBody: "One script", cta: "", sourceUrls: [],
    };
  };
  const first = repository.generateDraft(created.draft.id, { pipeline });
  const duplicate = repository.generateDraft(created.draft.id, { pipeline });
  release();
  const [one, two] = await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
  assert.equal(one.draft.scriptBody, two.draft.scriptBody);
  database.close();
});

test("successful generation fails closed when provenance is missing", async () => {
  const { database, repository } = testRepository();
  const created = repository.createDraft({ sourceMediaId: "DcYhrFHiVw8" });
  await assert.rejects(
    repository.generateDraft(created.draft.id, {
      pipeline: async () => ({
        thumbnailHook: "Title", generatedThumbnailUrl: null, scriptHook: "Hook",
        scriptBody: "Script", cta: "", sourceUrls: [],
      }),
    }),
    /without model and prompt provenance/,
  );
  const run = repository.getDraft(created.draft.id)?.latestRun;
  assert.equal(run?.stage, "failed");
  assert.equal(run?.model, null);
  assert.equal(repository.getDraft(created.draft.id)?.generationStatus, "failed");
  database.close();
});

test("failed generation retains provenance captured before the model call", async () => {
  const { database, repository } = testRepository();
  const created = repository.createDraft({ sourceMediaId: "DcYhrFHiVw8" });
  await assert.rejects(
    repository.generateDraft(created.draft.id, {
      pipeline: async (_input, callbacks) => {
        await callbacks.onProvenance(TEST_PROVENANCE);
        throw new Error("model request failed");
      },
    }),
    /model request failed/,
  );
  const run = repository.getDraft(created.draft.id)?.latestRun;
  assert.equal(run?.stage, "failed");
  assert.equal(run?.model, TEST_PROVENANCE.model);
  assert.equal(run?.promptVersion, TEST_PROVENANCE.promptVersion);
  assert.equal(run?.promptHash, TEST_PROVENANCE.promptHash);
  database.close();
});

test("generation provenance migration is idempotent and legacy-safe", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE draft_generation_runs (
      id INTEGER PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      pass_number INTEGER NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    INSERT INTO draft_generation_runs (
      draft_id, stage, pass_number, error, started_at, updated_at, completed_at
    ) VALUES (1, 'ready', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `);
  const schema = fs.readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
  applySchema(database, schema);
  applySchema(database, schema);
  const row = database.prepare(`
    SELECT model, prompt_version, prompt_hash FROM draft_generation_runs WHERE id = 1
  `).get();
  assert.deepEqual(row, { model: null, prompt_version: null, prompt_hash: null });
  database.close();
});

test("generation errors are explicit and leave the draft failed", async () => {
  const { database, repository } = testRepository();
  const created = repository.createDraft({ sourceMediaId: "DcYhrFHiVw8" });
  await assert.rejects(
    repository.generateDraft(created.draft.id, {
      pipeline: async () => { throw new Error("Source material is required to create a draft."); },
    }),
    /Source material is required/,
  );
  assert.equal(repository.getDraft(created.draft.id)?.generationStatus, "failed");
  assert.match(repository.getDraft(created.draft.id)?.latestRun?.error ?? "", /Source material is required/);
  database.close();
});
