import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionDraftModelClient,
  DraftResponsesApiError,
} from "./codex-client.ts";

test("sends one isolated Responses API request with no tools or storage", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = createProductionDraftModelClient({
    env: { OPENAI_API_KEY: "test-openai-key" },
    fetch: (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: "draft" }] }],
      }), { status: 200 });
    }) as typeof fetch,
  });

  const output = await client.generate({
    model: "gpt-5.6-sol",
    systemInstruction: "SYSTEM ONLY",
    userPrompt: "RAW SOURCE ONLY",
  });

  assert.equal(output, "draft");
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer test-openai-key");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    model: "gpt-5.6-sol",
    instructions: "SYSTEM ONLY",
    input: "RAW SOURCE ONLY",
    reasoning: { effort: "medium" },
    tools: [],
    store: false,
  });
});

test("accepts CODEX_API_KEY as the fallback API credential", async () => {
  let authorization = "";
  const client = createProductionDraftModelClient({
    env: { CODEX_API_KEY: "test-codex-key" },
    fetch: (async (_input, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization;
      return Response.json({ output_text: "ok" });
    }) as typeof fetch,
  });
  assert.equal(await client.generate({
    model: "gpt-5.6-sol",
    systemInstruction: "system",
    userPrompt: "source",
  }), "ok");
  assert.equal(authorization, "Bearer test-codex-key");
});

test("fails clearly before any request when no API key is configured", async () => {
  let fetched = false;
  const client = createProductionDraftModelClient({
    env: {},
    fetch: (async () => {
      fetched = true;
      return Response.json({ output_text: "should not happen" });
    }) as typeof fetch,
  });

  await assert.rejects(
    client.generate({ model: "gpt-5.6-sol", systemInstruction: "system", userPrompt: "source" }),
    (error: unknown) => error instanceof DraftResponsesApiError
      && /Set OPENAI_API_KEY or CODEX_API_KEY/.test(error.message),
  );
  assert.equal(fetched, false);
});

test("surfaces a sanitized Responses API failure", async () => {
  const client = createProductionDraftModelClient({
    env: { OPENAI_API_KEY: "test-key" },
    fetch: (async () => new Response(JSON.stringify({
      error: { message: "bad token sk-secretvalue123456789" },
    }), { status: 401 })) as typeof fetch,
  });

  await assert.rejects(
    client.generate({ model: "gpt-5.6-sol", systemInstruction: "system", userPrompt: "source" }),
    (error: unknown) => error instanceof DraftResponsesApiError
      && error.message.includes("[redacted]")
      && !error.message.includes("sk-secretvalue"),
  );
});
