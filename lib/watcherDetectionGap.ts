export type WatcherReplayDetectionGapInput = {
  connected: boolean;
  monitorState: "active" | "stopped" | "unknown";
  folderState: "valid_hd" | "missing" | "invalid" | "unknown";
  folderActivityProven: boolean | null;
  currentReplay: string | null;
  folderLatestReplayModifiedAt: string | null;
  lastServerReplayAt: Date | null;
};

export function deriveReplayDetectionGapWarning(input: WatcherReplayDetectionGapInput) {
  if (
    !input.connected ||
    input.monitorState !== "active" ||
    input.folderState !== "valid_hd" ||
    input.folderActivityProven !== true ||
    input.currentReplay ||
    !input.folderLatestReplayModifiedAt ||
    !input.lastServerReplayAt
  ) {
    return null;
  }

  const latestReplayMs = Date.parse(input.folderLatestReplayModifiedAt);
  if (!Number.isFinite(latestReplayMs)) return null;
  if (latestReplayMs <= input.lastServerReplayAt.getTime() + 5_000) return null;

  return (
    "Selected HD folder has replay activity newer than the last server receipt, " +
    "but Watcher reports no active replay. Suspect client replay detection/recovery before upload."
  );
}
