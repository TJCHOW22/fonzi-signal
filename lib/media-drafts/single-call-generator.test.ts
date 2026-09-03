import assert from "node:assert/strict";
import test from "node:test";
import type { DraftModelRequest } from "./codex-client.ts";
import type { DraftGenerationCallbacks, DraftGenerationInput } from "./types.ts";
import {
  BILLION_DOLLAR_BLUEPRINT_PATH,
  DRAFT_PROMPT_VERSION,
  DraftGenerationResponseError,
  isHookTooSimilar,
  runSingleCallDraftGeneration,
} from "./single-call-generator.ts";

function input(transcript = "CURRENT SOURCE: Acme reached a $1B valuation after a free product drove distribution."): DraftGenerationInput {
  return {
    sourceMaterial: transcript,
  };
}

const callbacks: DraftGenerationCallbacks = {
  onStage() {},
  onProvenance() {},
};

test("uses one call with the complete fresh skill and only current transcript in the user prompt", async () => {
  const requests: DraftModelRequest[] = [];
  const reads: string[] = [];
  const skill = "COMPLETE SKILL CONTENT\nwith every writing instruction";
  const generationInput = Object.assign(input(), {
    previousDraft: "PREVIOUS DRAFT",
    chatHistory: "OLD CHAT THREAD",
    creator: "PRIVATE CREATOR",
    caption: "PRIVATE CAPTION",
    research: "PRIVATE RESEARCH URL",
    applicationContext: "old-workflow-secret",
  });
  const result = await runSingleCallDraftGeneration(generationInput, callbacks, {
    modelClient: {
      async generate(request) {
        requests.push(request);
        return "**Title:** Acme's Billion-Dollar Distribution\n\n**Script:**\nParagraph one.\n\nParagraph two.\n\nParagraph three.";
      },
    },
    async readSkill(path, encoding) {
      reads.push(`${path}:${encoding}`);
      return skill;
    },
  });

  assert.deepEqual(reads, [`${BILLION_DOLLAR_BLUEPRINT_PATH}:utf8`]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].systemInstruction, skill);
  assert.equal(requests[0].userPrompt,
    "CURRENT SOURCE: Acme reached a $1B valuation after a free product drove distribution.");
  for (const excluded of ["PREVIOUS DRAFT", "OLD CHAT THREAD", "PRIVATE CREATOR",
    "PRIVATE CAPTION", "PRIVATE RESEARCH URL", "old-workflow-secret"])
    assert.doesNotMatch(JSON.stringify(requests[0]), new RegExp(excluded, "i"));
  assert.equal(result.thumbnailHook, "Acme's Billion-Dollar Distribution");
  assert.equal(result.scriptBody, "Paragraph one.\n\nParagraph two.\n\nParagraph three.");
  assert.equal(result.scriptHook, "");
  assert.equal(result.cta, "");
});

test("includes only explicitly supplied current-draft constraints", async () => {
  const requests: DraftModelRequest[] = [];
  await runSingleCallDraftGeneration({
    sourceMaterial: "CURRENT SOURCE",
    constraints: "Company: Acme\nFrame: fundraising\nTarget duration: 90 seconds",
  }, callbacks, {
    modelClient: {
      async generate(request) {
        requests.push(request);
        return "**Title:** Title\n\n**Script:**\nOne.\n\nTwo.\n\nThree.";
      },
    },
    async readSkill() { return "skill"; },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].userPrompt,
    "CURRENT SOURCE\n\nCurrent-draft constraints:\n"
    + "Company: Acme\nFrame: fundraising\nTarget duration: 90 seconds");
});

test("loads the skill again for every draft", async () => {
  const instructions: string[] = [];
  let readCount = 0;
  const dependencies = {
    modelClient: {
      async generate(request: DraftModelRequest) {
        instructions.push(request.systemInstruction);
        return "**Title:** Title\n\n**Script:**\nOne.\n\nTwo.\n\nThree.";
      },
    },
    async readSkill() { readCount += 1; return `skill version ${readCount}`; },
  };
  await runSingleCallDraftGeneration(input(), callbacks, dependencies);
  await runSingleCallDraftGeneration(input(), callbacks, dependencies);
  assert.deepEqual(instructions, ["skill version 1", "skill version 2"]);
});

test("records the resolved model and exact skill hash before writing", async () => {
  const events: string[] = [];
  const skill = "exact raw skill bytes\n";
  await runSingleCallDraftGeneration(input(), {
    async onProvenance(provenance) {
      events.push(`provenance:${JSON.stringify(provenance)}`);
    },
    async onStage(stage, passNumber) {
      events.push(`stage:${stage}:${passNumber}`);
    },
  }, {
    model: "resolved-test-model",
    modelClient: {
      async generate() {
        events.push("model");
        return "**Title:** Title\n\n**Script:**\nOne.\n\nTwo.\n\nThree.";
      },
    },
    async readSkill() { return skill; },
  });

  assert.deepEqual(events, [
    `provenance:${JSON.stringify({
      model: "resolved-test-model",
      promptVersion: DRAFT_PROMPT_VERSION,
      promptHash: "86d07604e6c0839f5b2067a01fa6a67e91bd9412c0c17f6e1de2975abc84c750",
    })}`,
    "stage:writing:1",
    "model",
  ]);
});

test("stops before calling the model when skill or source content is unavailable", async () => {
  let calls = 0;
  const modelClient = { async generate() { calls += 1; return ""; } };
  await assert.rejects(
    runSingleCallDraftGeneration(input("   "), callbacks, { modelClient, async readSkill() { return "skill"; } }),
    /Source material is required/,
  );
  await assert.rejects(
    runSingleCallDraftGeneration(input(), callbacks, { modelClient, async readSkill() { return "   "; } }),
    /drafting skill.*empty/,
  );
  await assert.rejects(
    runSingleCallDraftGeneration(input(), callbacks, { modelClient, async readSkill() { throw new Error("missing"); } }),
    /Could not load the drafting skill/,
  );
  assert.equal(calls, 0);
});

test("rejects invalid completed output without a corrective call", async () => {
  let calls = 0;
  await assert.rejects(
    runSingleCallDraftGeneration(input(), callbacks, {
      modelClient: { async generate() { calls += 1; return "A draft without the required labels"; } },
      async readSkill() { return "skill"; },
    }),
    DraftGenerationResponseError,
  );
  assert.equal(calls, 1);
});

test("detects copied and lightly edited source hooks deterministically", () => {
  const source = "Don't shoot the messenger, but this tiny startup just became a billion-dollar business overnight. Here is how.";
  assert.equal(isHookTooSimilar(source,
    "Don't shoot the messenger, but this tiny startup just became a billion dollar business overnight. Let's break it down."), true);
  assert.equal(isHookTooSimilar(source,
    "A billion dollars usually takes decades to build. This startup got there by turning one ignored problem into its distribution engine."), false);
});

test("rejects the three copied openings observed in production", () => {
  const regressions = [
    [
      "Dyson is back at it again, and this time it's a $499 AI toothbrush.",
      "Dyson is back at it again, and this time it’s building a $499 AI toothbrush!",
    ],
    [
      "If you look closely at the next venture back giant, what you'll find they do is super simple.",
      "If you look closely at the next venture-backed giant, what you’ll find they do is actually super simple.",
    ],
    [
      "Don't shoot the messenger, but your perfectly written resume is now a red flag.",
      "Don’t shoot the messenger, but your perfectly written resume might now be a red flag.",
    ],
  ] as const;

  for (const [source, generated] of regressions) {
    assert.equal(isHookTooSimilar(source, generated), true);
  }
});

test("retries once with a focused hook correction and the same source-only user input", async () => {
  const requests: DraftModelRequest[] = [];
  const source = "Don't shoot the messenger, but Acme just became a billion-dollar company overnight.";
  const result = await runSingleCallDraftGeneration(input(source), callbacks, {
    modelClient: {
      async generate(request) {
        requests.push(request);
        return requests.length === 1
          ? "**Title:** Acme\n\n**Script:**\nDon't shoot the messenger, but Acme just became a billion-dollar company overnight.\n\nTwo.\n\nThree."
          : "**Title:** Acme\n\n**Script:**\nA billion-dollar company appeared almost overnight, but the real story is the distribution bet behind it.\n\nTwo.\n\nThree.";
      },
    },
    async readSkill() { return "COMPLETE SKILL"; },
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].systemInstruction, "COMPLETE SKILL");
  assert.match(requests[1].systemInstruction, /^COMPLETE SKILL\n\nCorrection for this retry only:/);
  assert.equal(requests[0].userPrompt, source);
  assert.equal(requests[1].userPrompt, source);
  assert.match(result.scriptBody, /^A billion-dollar company appeared/);
});

test("fails closed after one retry when the replacement still copies the source hook", async () => {
  let calls = 0;
  await assert.rejects(
    runSingleCallDraftGeneration(input("Acme became a billion-dollar company by giving its core product away for free."), callbacks, {
      modelClient: {
        async generate() {
          calls += 1;
          return "**Title:** Acme\n\n**Script:**\nAcme became a billion-dollar company by giving its core product away for free.\n\nTwo.\n\nThree.";
        },
      },
      async readSkill() { return "skill"; },
    }),
    /copied the source hook after one corrective retry/,
  );
  assert.equal(calls, 2);
});
