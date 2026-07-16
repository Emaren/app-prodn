export type ReplaySessionDisposition =
  | "live"
  | "result_ready"
  | "saved_rehost"
  | "result_review";

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function hasSaveEvent(keyEvents: Record<string, unknown>, eventTypes: unknown) {
  const chatEvents = [
    ...list(keyEvents.chat_preview),
    ...list(keyEvents.chat_transcript),
  ];
  return (
    list(eventTypes).some((value) => String(value).toLowerCase() === "save") ||
    chatEvents.some((value) => record(value).type === "save")
  );
}

export function classifyReplaySessionDisposition(input: {
  state: "live" | "completed";
  winner?: string | null;
  keyEvents?: unknown;
  eventTypes?: unknown;
}): ReplaySessionDisposition {
  if (input.state === "live") return "live";
  if (typeof input.winner === "string" && input.winner.trim() && input.winner.trim().toLowerCase() !== "unknown") {
    return "result_ready";
  }

  const keyEvents = record(input.keyEvents);
  const resultResolution = record(keyEvents.result_resolution);
  if (resultResolution.result_trusted === true || resultResolution.result_status === "resolved") {
    return "result_ready";
  }

  const noResignations = list(keyEvents.resigned_player_numbers).length === 0;
  const noPostgame = keyEvents.postgame_available !== true;
  const noCompletion = keyEvents.completed !== true;
  if (noResignations && noPostgame && noCompletion && hasSaveEvent(keyEvents, input.eventTypes)) {
    return "saved_rehost";
  }

  return "result_review";
}

export function replaySessionDispositionLabel(disposition: ReplaySessionDisposition) {
  if (disposition === "saved_rehost") return "Saved / rehosted";
  if (disposition === "result_ready") return "Result ready";
  if (disposition === "result_review") return "Result review";
  return "Live parse";
}
