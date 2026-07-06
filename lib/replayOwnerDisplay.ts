export type ReplayOwnerDisplay = {
  ownerPlayerName: string;
  ownerDisplayName: string;
  ownerDisplaySource:
    | "captured_owner"
    | "watcher_owner_backfill"
    | "not_captured";
  ownerWatcherId: string | null;
};

const WATCHER_OWNER_DISPLAY_BY_ID: Record<string, string> = {
  // Jim watcher rows from early watcher-final parses where owner_player_name was not written.
  watcher_96c99134ede14ccea59aa11f4c175f33: "Jim",
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveReplayOwnerDisplay(row: {
  key_events?: unknown;
  keyEvents?: unknown;
}): ReplayOwnerDisplay {
  const keyEvents = readRecord(row.key_events ?? row.keyEvents);
  const capturedOwner = normalizeText(keyEvents.owner_player_name);

  const watcherUpload = readRecord(keyEvents.watcher_upload);
  const watcherId = normalizeText(watcherUpload.watcher_id);

  if (capturedOwner) {
    return {
      ownerPlayerName: capturedOwner,
      ownerDisplayName: capturedOwner,
      ownerDisplaySource: "captured_owner",
      ownerWatcherId: watcherId || null,
    };
  }

  const backfilledOwner = watcherId
    ? WATCHER_OWNER_DISPLAY_BY_ID[watcherId]
    : null;

  if (backfilledOwner) {
    return {
      ownerPlayerName: backfilledOwner,
      ownerDisplayName: backfilledOwner,
      ownerDisplaySource: "watcher_owner_backfill",
      ownerWatcherId: watcherId,
    };
  }

  return {
    ownerPlayerName: "Owner not captured",
    ownerDisplayName: "Owner not captured",
    ownerDisplaySource: "not_captured",
    ownerWatcherId: watcherId || null,
  };
}
