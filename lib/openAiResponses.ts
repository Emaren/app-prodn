import "server-only";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_KEY_FALLBACK = "/etc/aoe2hdbets/openai.key";

type JsonRecord = Record<string, unknown>;

export type DirectOpenAiRequest = {
  promptId?: string | null;
  promptVersion?: string | null;
  model?: string | null;
  instructions: string;
  input: string;
  signal?: AbortSignal;
};

export class DirectOpenAiError extends Error {
  status: number | null;
  code: string;

  constructor(
    message: string,
    options: {
      status?: number | null;
      code: string;
    },
  ) {
    super(message);
    this.name = "DirectOpenAiError";
    this.status = options.status ?? null;
    this.code = options.code;
  }
}

function record(value: unknown): JsonRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function openAiKey() {
  const direct = process.env.OPENAI_API_KEY?.trim();
  if (direct) return direct;

  const keyFile =
    process.env.OPENAI_API_KEY_FILE ||
    OPENAI_KEY_FALLBACK;

  try {
    const value = (await readFile(keyFile, "utf8")).trim();
    if (value) return value;
  } catch {
    // handled below
  }

  throw new DirectOpenAiError(
    "OpenAI is not configured on this server.",
    {
      status: null,
      code: "openai_key_unavailable",
    },
  );
}

export function openAiOutputText(payload: unknown) {
  const source = record(payload);
  const direct = text(source?.output_text);
  if (direct) return direct;

  const output = Array.isArray(source?.output)
    ? source.output
    : [];

  for (const item of output) {
    const message = record(item);
    if (!Array.isArray(message?.content)) continue;

    for (const content of message.content) {
      const part = record(content);
      if (
        part?.type === "output_text" &&
        typeof part.text === "string"
      ) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function providerErrorMessage(
  payload: unknown,
  fallback: string,
) {
  const source = record(payload);
  const error = record(source?.error);
  return text(error?.message) || fallback;
}

export async function requestDirectOpenAiResponse(
  request: DirectOpenAiRequest,
) {
  const apiKey = await openAiKey();

  const body: Record<string, unknown> = {
    instructions: request.instructions,
    input: request.input,
    stream: false,
    store: false,
  };

  if (request.promptId) {
    body.prompt = {
      id: request.promptId,
      ...(request.promptVersion
        ? { version: request.promptVersion }
        : {}),
    };
  } else if (request.model) {
    body.model = request.model;
  } else {
    throw new DirectOpenAiError(
      "OpenAI model or saved prompt is required.",
      {
        code: "openai_runtime_unconfigured",
      },
    );
  }

  const clientRequestId = randomUUID();

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new DirectOpenAiError(
      "OpenAI network request failed.",
      {
        code: "openai_network_error",
      },
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new DirectOpenAiError(
      providerErrorMessage(
        payload,
        `OpenAI returned HTTP ${response.status}.`,
      ),
      {
        status: response.status,
        code: `openai_${response.status}`,
      },
    );
  }

  const output = openAiOutputText(payload);
  if (!output) {
    throw new DirectOpenAiError(
      "OpenAI returned no text output.",
      {
        status: response.status,
        code: "openai_empty_output",
      },
    );
  }

  return {
    text: output,
    provider: "openai" as const,
    clientRequestId,
    responseId:
      typeof record(payload)?.id === "string"
        ? String(record(payload)?.id)
        : null,
  };
}
