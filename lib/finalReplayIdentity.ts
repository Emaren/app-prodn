type ReplayIdentityRow = {
  id: number | string;
  replayHash?: string | null;
  key_events?: unknown;
};

function readKeyEventRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function readPlatformMatchId(value: unknown) {
  const record = readKeyEventRecord(value);
  const platformMatchId = record.platform_match_id;
  return typeof platformMatchId === "string" && platformMatchId.trim()
    ? platformMatchId.trim()
    : null;
}

export function buildFinalReplayIdentityKey(row: ReplayIdentityRow) {
  const platformMatchId = readPlatformMatchId(row.key_events);
  if (platformMatchId) {
    return `platform:${platformMatchId}`;
  }

  const replayHash =
    typeof row.replayHash === "string" && row.replayHash.trim() ? row.replayHash.trim() : null;
  if (replayHash) {
    return `hash:${replayHash}`;
  }

  return `row:${String(row.id)}`;
}

export function dedupeFinalReplayRows<T extends ReplayIdentityRow>(rows: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const key = buildFinalReplayIdentityKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}
