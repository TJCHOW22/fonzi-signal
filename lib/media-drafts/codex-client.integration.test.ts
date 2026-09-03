import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionDraftModelClient,
  DEFAULT_CODEX_DRAFT_MODEL,
} from "./codex-client.ts";

const liveEnabled = process.env.RUN_OPENAI_DRAFT_LIVE === "1";

test("opt-in Responses API client can complete one isolated draft call", {
  skip: liveEnabled ? false : "set RUN_OPENAI_DRAFT_LIVE=1 to spend a live API call",
}, async () => {
  const model = process.env.CODEX_DRAFT_MODEL?.trim() || DEFAULT_CODEX_DRAFT_MODEL;
  const client = createProductionDraftModelClient();
  const result = await client.generate({
    model,
    systemInstruction: "Reply with exactly: ok",
    userPrompt: "Reply now.",
  });

  assert.equal(result.trim(), "ok");
});
