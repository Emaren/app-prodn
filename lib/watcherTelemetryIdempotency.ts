// Pure, independently testable idempotent telemetry receipt logic.
// A stable 128-bit client-generated event ID distinguishes network retries
// from genuinely new observations. DB uniqueness is the final arbiter.
export function readTelemetryEventId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string,unknown>).telemetryEventId;
  return typeof raw === "string" && /^telemetry_[a-f0-9]{32}$/i.test(raw)
    ? raw.toLowerCase()
    : null;
}

export function isTelemetryIdDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const input = error as {code?:unknown;meta?:{target?:unknown}};
  if (input.code !== "P2002") return false;
  const target = input.meta?.target;
  const candidates = Array.isArray(target) ? target : [target];
  return candidates.some(value =>
    value === "telemetry_event_id" ||
    value === "telemetryEventId" ||
    value === "uq_watcher_client_events_telemetry_event_id");
}

export async function storeTelemetryIdempotently(
  insert: () => Promise<unknown>,
  eventId: string | null,
): Promise<"stored"|"duplicate"> {
  try {
    await insert();
    return "stored";
  } catch (error) {
    // Only a verified collision of this event ID is an acknowledged duplicate.
    // All other failures must propagate so the client retries safely.
    if (eventId && isTelemetryIdDuplicateError(error)) return "duplicate";
    throw error;
  }
}
