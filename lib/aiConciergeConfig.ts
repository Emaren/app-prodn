import {
  AI_CONCIERGE_UID,
  AI_GRIMER_UID,
  AI_GUY_UID,
} from "@/lib/internalSystemAccounts";

export {
  AI_CONCIERGE_UID,
  AI_GRIMER_UID,
  AI_GUY_UID,
};

export const AI_CONCIERGE_NAME = "The AI Scribe";

export const AI_GRIMER_NAME = "Grimer";

export const AI_GUY_NAME = "Guy of Moxica";

function getDefaultLlamaChatGatewayUrl() {
  const defaultPort = process.env.NODE_ENV === "production" ? "3350" : "8006";
  return `http://127.0.0.1:${defaultPort}/api/chat/send`;
}

export const LLAMA_CHAT_GATEWAY_URL =
  process.env.LLAMA_CHAT_API_URL || getDefaultLlamaChatGatewayUrl();

export const AI_VISIBILITY_OPTIONS = ["private", "public"] as const;
export type AiVisibilityOption = (typeof AI_VISIBILITY_OPTIONS)[number];

export const DEFAULT_AI_VISIBILITY: AiVisibilityOption = "public";

export const AI_MODEL_OPTIONS = [
  {
    id: "Agent4.1Scribe",
    label: "OpenAI GPT-4.1 Scribe",
    provider: "openai",
    promptId: "pmpt_69cf27b4471481948af207cc46496d610a8fc123d5176074",
    promptVersion: "9",
  },
  {
    id: "Agent4.1Grimer",
    label: "OpenAI GPT-4.1 Grimer",
    provider: "openai",
    promptId: "pmpt_69d2f44dcac08193941ed5d52223acf9092ea9affdc458bd",
    promptVersion: "11",
  },
  {
    id: "Agent4.1Guy",
    label: "OpenAI GPT-4.1 Guy",
    provider: "openai",
    promptId: "pmpt_69d3eda4e3208196a00348e6c3531c3806b3521a2dd717fb",
    promptVersion: "2",
  },
  {
    id: "Agent4.1M",
    label: "OpenAI GPT-4.1",
    provider: "openai",
    promptId: "pmpt_686bf4b4f1d48195a1308c4e91328e740b8e7b35195e334b",
    promptVersion: "5",
  },
  {
    id: "LlamaAgent42",
    label: "Local Llama 3 8B",
    provider: "ollama",
    promptId: null,
    promptVersion: null,
  },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["id"];

export type AiProviderPromptMetadata = {
  provider: string;
  label: string;
  promptId: string;
  promptVersion: string;
  platformUrl: string;
  source: "llama-chat gateway registry";
  readOnly: true;
};

export function getAiProviderPromptMetadata(
  modelId: string | null | undefined,
): AiProviderPromptMetadata | null {
  const option = AI_MODEL_OPTIONS.find((candidate) => candidate.id === modelId);
  if (!option?.promptId || !option.promptVersion) return null;

  const query = new URLSearchParams({
    prompt: option.promptId,
    version: option.promptVersion,
  });

  return {
    provider: option.provider,
    label: option.label,
    promptId: option.promptId,
    promptVersion: option.promptVersion,
    platformUrl: `https://platform.openai.com/chat/edit?${query.toString()}`,
    source: "llama-chat gateway registry",
    readOnly: true,
  };
}

export const DEFAULT_AI_CONCIERGE_MODEL_ID: AiModelId = "Agent4.1Scribe";
export const DEFAULT_AI_GRIMER_MODEL_ID: AiModelId = "Agent4.1Grimer";
export const DEFAULT_AI_GUY_MODEL_ID: AiModelId = "Agent4.1Guy";

export const AI_PERSONA_OPTIONS = [
  {
    id: "scribe",
    uid: AI_CONCIERGE_UID,
    name: AI_CONCIERGE_NAME,
    requestedModel: DEFAULT_AI_CONCIERGE_MODEL_ID,
    toneLabel: "premium match scribe",
  },
  {
    id: "grimer",
    uid: AI_GRIMER_UID,
    name: AI_GRIMER_NAME,
    requestedModel: DEFAULT_AI_GRIMER_MODEL_ID,
    toneLabel: "dark sidecar",
  },
  {
    id: "guy",
    uid: AI_GUY_UID,
    name: AI_GUY_NAME,
    requestedModel: DEFAULT_AI_GUY_MODEL_ID,
    toneLabel: "velvet knife",
  },
] as const;

export type AiPersonaId = (typeof AI_PERSONA_OPTIONS)[number]["id"];

export function isAiModelId(value: string | null | undefined): value is AiModelId {
  return AI_MODEL_OPTIONS.some((option) => option.id === value);
}

export function getAiModelLabel(modelId: string | null | undefined) {
  return AI_MODEL_OPTIONS.find((option) => option.id === modelId)?.label || "AI model";
}

export function isAiPersonaId(value: string | null | undefined): value is AiPersonaId {
  return AI_PERSONA_OPTIONS.some((option) => option.id === value);
}

export function getAiPersonaConfig(personaId: AiPersonaId) {
  return AI_PERSONA_OPTIONS.find((option) => option.id === personaId) ?? AI_PERSONA_OPTIONS[0];
}

export function getAiPersonaByUid(uid: string | null | undefined) {
  return AI_PERSONA_OPTIONS.find((option) => option.uid === uid) ?? null;
}

export function getAiPersonaName(uid: string | null | undefined) {
  return getAiPersonaByUid(uid)?.name || "AI";
}

export function isAiPersonaUid(uid: string | null | undefined) {
  return getAiPersonaByUid(uid) !== null;
}

export function isAiConciergeUid(uid: string | null | undefined) {
  return isAiPersonaUid(uid);
}
