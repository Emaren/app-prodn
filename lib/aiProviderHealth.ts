/**
 * Safe operator-visible OpenAI provider error classification.
 * Never forward arbitrary provider response text or credentials into player chat.
 * Provider response codes are *observations*, not proof of account billing state.
 */
type RecordLike = Record<string, unknown>;
function object(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike : null;
}

export type SafeProviderFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export function classifyOpenAiFailure(status: number, body: unknown): SafeProviderFailure {
  const error = object(object(body)?.error);
  const providerCode = typeof error?.code === "string" ? error.code : "";
  const providerType = typeof error?.type === "string" ? error.type : "";
  const quotaCodes = new Set(["insufficient_quota", "billing_hard_limit_reached", "credits_exhausted"]);
  if (status === 429 && (quotaCodes.has(providerCode) || quotaCodes.has(providerType))) {
    return {
      code: "openai_quota_exhausted",
      message: "AoE2WAR AI is temporarily unavailable because its API quota was exhausted. Please try again later.",
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: "openai_rate_limited",
      message: "AoE2WAR AI is temporarily rate-limited. Please try again later.",
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "openai_access_unavailable",
      message: "AoE2WAR AI is temporarily unavailable. The site operator has been notified.",
      retryable: false,
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      code: "openai_upstream_unavailable",
      message: "AoE2WAR AI's provider is temporarily unavailable. Please try again later.",
      retryable: true,
    };
  }
  return {
    code: "openai_" + (Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : "unknown"),
    message: "AoE2WAR AI could not complete the request. Please try again later.",
    retryable: false,
  };
}
