type ArchiveCandidate =
  Record<string, unknown>;

function archiveRecord(
  value: unknown
): ArchiveCandidate {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as ArchiveCandidate
    : {};
}

function archiveText(
  value: unknown
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function archivePlayers(
  value: unknown
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    try {
      const parsed =
        JSON.parse(value) as unknown;

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function publicBattleArchiveFilename(
  row: unknown
) {
  const candidate =
    archiveRecord(row);

  return archiveText(
    candidate.original_filename ??
    candidate.originalFilename ??
    candidate.replay_file ??
    candidate.replayFile
  );
}

export function publicBattleArchiveNamedPlayerCount(
  row: unknown
) {
  const candidate =
    archiveRecord(row);

  return archivePlayers(
    candidate.players
  )
    .map(
      archiveRecord
    )
    .filter(
      (player) => {
        const name =
          archiveText(
            player.name ??
            player.player_name ??
            player.playerName
          );

        return (
          Boolean(name) &&
          name.toLowerCase() !==
            "unknown"
        );
      }
    )
    .length;
}

/*
 * Public battle history contains actual completed/reviewable replay
 * records—not saved-game checkpoints or failed finalization shells.
 *
 * These rows remain preserved internally. This contract affects only
 * public archive eligibility and grants no result or financial authority.
 */
export function isPublicBattleArchiveRow(
  row: unknown
) {
  const candidate =
    archiveRecord(row);

  const filename =
    publicBattleArchiveFilename(
      candidate
    )
      .toLowerCase();

  if (
    filename.endsWith(
      ".aoe2mpgame"
    )
  ) {
    return false;
  }

  const parseReason =
    archiveText(
      candidate.parse_reason ??
      candidate.parseReason
    )
      .toLowerCase();

  if (
    parseReason ===
      "watcher_final_unparsed" &&
    publicBattleArchiveNamedPlayerCount(
      candidate
    ) < 2
  ) {
    return false;
  }

  return true;
}

export function filterPublicBattleArchiveRows<
  T
>(
  rows: T[]
) {
  return rows.filter(
    isPublicBattleArchiveRow
  );
}
