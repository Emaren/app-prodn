export const AI_CONCIERGE_UID = "aoe2hd_ai_concierge";
export const AI_CONCIERGE_NAME = "The AI Scribe";

export const AI_GRIMER_UID = "aoe2hd_ai_grimer";
export const AI_GRIMER_NAME = "Grimer";

export const AI_GUY_UID = "aoe2hd_ai_guy";
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
  },
  {
    id: "Agent4.1Grimer",
    label: "OpenAI GPT-4.1 Grimer",
    provider: "openai",
  },
  {
    id: "Agent4.1Guy",
    label: "OpenAI GPT-4.1 Guy",
    provider: "openai",
  },
  {
    id: "Agent4.1M",
    label: "OpenAI GPT-4.1",
    provider: "openai",
  },
  {
    id: "LlamaAgent42",
    label: "Local Llama 3 8B",
    provider: "ollama",
  },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["id"];

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
