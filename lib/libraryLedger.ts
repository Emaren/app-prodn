/**
 * Public presentation of durable final replay-ingest records.
 *
 * This is an intake ledger, NOT a competitive result, settlement, or
 * deduplicated battle authority. Client-supplied watcher metadata is a
 * descriptive source label only; it never upgrades signed Watcher proof.
 */
export type LibraryOrigin =
  | "watcher-live"
  | "watcher-batch"
  | "watcher-legacy"
  | "manual-zip"
  | "manual"
  | "unclassified";

export function libraryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function libraryOrigin(
  source: string | null,
  events: unknown,
  isExactZipMember: boolean,
): LibraryOrigin {
  const parsed = libraryRecord(events);
  const watcher = libraryRecord(parsed.watcher_upload);
  const provenance = typeof watcher.ingestion_provenance === "string"
    ? watcher.ingestion_provenance.trim().toLowerCase()
    : "";
  const normalized = String(source ?? "").trim().toLowerCase();

  if (normalized.startsWith("watcher")) {
    if (provenance === "live_monitor") return "watcher-live";
    if (provenance === "historical_import") return "watcher-batch";
    return "watcher-legacy";
  }
  if (normalized === "file_upload" || normalized === "manual_upload") {
    return isExactZipMember ? "manual-zip" : "manual";
  }
  // Do not guess older ZIP provenance by matching potentially reused filenames.
  return isExactZipMember ? "manual-zip" : "unclassified";
}

export function libraryMapName(value: unknown): string | null {
  const raw = typeof value === "string" ? value : libraryRecord(value).name;
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, 100);
  return name && !/^(unknown|n\/a|none|parsing|map unavailable)$/i.test(name)
    ? name
    : null;
}

export function libraryPlayerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const player of value) {
    const entry = libraryRecord(player);
    const name = [entry.name, entry.player_name, entry.playerName]
      .find((candidate) => typeof candidate === "string" && candidate.trim());
    if (typeof name !== "string") continue;
    const trimmed = name.trim().slice(0, 72);
    if (!trimmed || /^unknown$/i.test(trimmed) || names.includes(trimmed)) continue;
    names.push(trimmed);
    if (names.length === 8) break;
  }
  return names;
}

export function libraryDisplayName(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
  uid: string;
} | null | undefined): string {
  return user?.inGameName?.trim() ||
    user?.steamPersonaName?.trim() ||
    user?.uid?.trim() ||
    "Unknown uploader";
}

export function libraryPendingReason(reason: string | null): boolean {
  return ["watcher_final_unparsed", "watcher_live_pending_parse"]
    .includes(String(reason ?? "").trim().toLowerCase());
}
