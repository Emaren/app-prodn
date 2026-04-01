export const AI_CONCIERGE_UID = "aoe2hd_ai_concierge";
export const AI_CONCIERGE_NAME = "AI Concierge";

function getDefaultLlamaChatGatewayUrl() {
  const defaultPort = process.env.NODE_ENV === "production" ? "3350" : "8006";
  return `http://127.0.0.1:${defaultPort}/api/chat/send`;
}

export const LLAMA_CHAT_GATEWAY_URL =
  process.env.LLAMA_CHAT_API_URL || getDefaultLlamaChatGatewayUrl();

export const AI_VISIBILITY_OPTIONS = ["private", "public"] as const;
export type AiVisibilityOption = (typeof AI_VISIBILITY_OPTIONS)[number];

export const AI_MODEL_OPTIONS = [
  {
    id: "Agent4.1M",
    label: "OpenAI GPT-4.1",
    provider: "openai",
  },
  {
    id: "Agent4oM",
    label: "OpenAI GPT-4o",
    provider: "openai",
  },
  {
    id: "LlamaAgent42",
    label: "Local Llama 3 8B",
    provider: "ollama",
  },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["id"];

export function isAiConciergeUid(uid: string | null | undefined) {
  return uid === AI_CONCIERGE_UID;
}

export function isAiModelId(value: string | null | undefined): value is AiModelId {
  return AI_MODEL_OPTIONS.some((option) => option.id === value);
}

export function getAiModelLabel(modelId: string | null | undefined) {
  return AI_MODEL_OPTIONS.find((option) => option.id === modelId)?.label || "AI model";
}
