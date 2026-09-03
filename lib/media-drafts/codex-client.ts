export const DEFAULT_CODEX_DRAFT_MODEL = "gpt-5.6-sol";

const RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const SECRET_PATTERN = /\b(?:sk|sess|eyJ)[-_A-Za-z0-9.]{12,}\b/g;

export type DraftModelRequest = {
  model: string;
  systemInstruction: string;
  userPrompt: string;
};

export interface DraftModelClient {
  generate(request: DraftModelRequest): Promise<string>;
}

export class DraftResponsesApiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DraftResponsesApiError";
  }
}

export type ProductionDraftModelClientOptions = {
  fetch?: typeof globalThis.fetch;
  env?: Record<string, string | undefined>;
};

type ResponsesApiPayload = {
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
  error?: { message?: unknown };
};

function responseText(payload: ResponsesApiPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  return (payload.output ?? [])
    .flatMap((item) => item.type === "message" ? item.content ?? [] : [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("")
    .trim();
}

function errorDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(SECRET_PATTERN, "[redacted]")
    .trim();
}

class ProductionDraftModelClient implements DraftModelClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly env: Record<string, string | undefined>;

  constructor(options: ProductionDraftModelClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.env = options.env ?? process.env;
  }

  async generate(request: DraftModelRequest): Promise<string> {
    const apiKey = this.env.OPENAI_API_KEY?.trim() || this.env.CODEX_API_KEY?.trim();
    if (!apiKey) {
      throw new DraftResponsesApiError(
        "OpenAI drafting API key is missing. Set OPENAI_API_KEY or CODEX_API_KEY.",
      );
    }

    try {
      const response = await this.fetchImpl(RESPONSES_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.systemInstruction,
          input: request.userPrompt,
          reasoning: { effort: "medium" },
          tools: [],
          store: false,
        }),
      });
      const payload = await response.json() as ResponsesApiPayload;
      if (!response.ok) {
        const message = typeof payload.error?.message === "string"
          ? payload.error.message
          : `HTTP ${response.status}`;
        throw new Error(message);
      }
      const text = responseText(payload);
      if (!text) throw new Error("OpenAI Responses API completed without text output.");
      return text;
    } catch (error) {
      if (error instanceof DraftResponsesApiError) throw error;
      const detail = errorDetail(error);
      throw new DraftResponsesApiError(
        detail
          ? `OpenAI Responses API drafting failed: ${detail}`
          : "OpenAI Responses API drafting failed.",
        detail ? new Error(detail) : undefined,
      );
    }
  }
}

export function createProductionDraftModelClient(
  options: ProductionDraftModelClientOptions = {},
): DraftModelClient {
  return new ProductionDraftModelClient(options);
}
