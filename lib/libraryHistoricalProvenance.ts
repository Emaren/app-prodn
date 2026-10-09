import { libraryOrigin, type LibraryOrigin } from "@/lib/libraryLedger";

export type LibrarySourceEvidence =
  | "watcher-provenance"
  | "watcher-batch-telemetry"
  | "source-record"
  | "zip-exact-id"
  | "zip-legacy-correlation"
  | "unclassified";

export type LibrarySource = { kind: LibraryOrigin; evidence: LibrarySourceEvidence };

export type LibraryHistoryRow = {
  id: number;
  userUid: string | null;
  replayHash: string;
  createdAt: Date;
  original_filename: string | null;
  replay_file: string;
  parse_source: string | null;
  key_events: unknown;
};

export type LibraryPackageReceipt = {
  createdAt: Date;
  uid: string | null;
  metadata: unknown;
};

export type LibraryBatchReceipt = {
  createdAt: Date;
  userUid: string | null;
  replayHash: string | null;
};

export type LibraryOriginFilter =
  | "all"
  | "watcher-live"
  | "watcher-batch"
  | "manual"
  | "manual-zip"
  | "other";

export const LIBRARY_ORIGIN_FILTERS: LibraryOriginFilter[] = [
  "all", "watcher-live", "watcher-batch", "manual", "manual-zip", "other",
];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function canonicalFile(value: string | null | undefined): string {
  return (value ?? "").split(/[\\/]/).pop()?.trim().toLowerCase() ?? "";
}

function packageIdentity(uid: string | null | undefined, filename: string) {
  return `${uid ?? ""}\u0000${filename}`;
}

/** A 30-minute envelope is a presentation-only correlation, NEVER an attestation. */
const ZIP_RECEIPT_WINDOW_MS = 30 * 60_000;
const WATCHER_BATCH_WINDOW_MS = 60 * 60_000;

/**
 * Historical provenance, reconstructed *without DB writes*.
 *
 * The user-owned replay row is the grain. Explicit persisted Watcher provenance
 * and exact new ZIP gameIds win. Older ZIP filename correlation is used only
 * when one unique uploader+filename+time candidate and one unique package
 * receipt agree, then visibly marked "inferred".
 */
export function reconstructLibraryOrigins(
  rows: LibraryHistoryRow[],
  packageReceipts: LibraryPackageReceipt[],
  batchReceipts: LibraryBatchReceipt[],
): Map<number, LibrarySource> {
  const result = new Map<number, LibrarySource>();
  const rowById = new Map(rows.map(row => [row.id, row]));
  const byOwnerFile = new Map<string, LibraryHistoryRow[]>();
  const byOwnerHash = new Map<string, LibraryHistoryRow[]>();

  for (const row of rows) {
    const kind = libraryOrigin(row.parse_source, row.key_events, false);
    const evidence: LibrarySourceEvidence =
      kind === "watcher-batch" || kind === "watcher-live"
        ? "watcher-provenance"
        : kind === "unclassified" || kind === "watcher-legacy"
          ? "unclassified"
          : "source-record";
    result.set(row.id, { kind, evidence });
    if (row.userUid) {
      const file = canonicalFile(row.original_filename ?? row.replay_file);
      if (file) {
        const key = packageIdentity(row.userUid, file);
        byOwnerFile.set(key, [...(byOwnerFile.get(key) ?? []), row]);
      }
      if (row.replayHash) {
        const key = packageIdentity(row.userUid, row.replayHash.toLowerCase());
        byOwnerHash.set(key, [...(byOwnerHash.get(key) ?? []), row]);
      }
    }
  }

  // The Watcher emitted a durable successful batch-file receipt naming the
  // same immutable hash, owner, and nearby time. Never identify a game from
  // mere usernames, parse time or gameplay participant names.
  for (const event of batchReceipts) {
    if (!event.userUid || !event.replayHash) continue;
    for (const row of byOwnerHash.get(
      packageIdentity(event.userUid, event.replayHash.toLowerCase()),
    ) ?? []) {
      const before = row.createdAt.getTime();
      const delta = event.createdAt.getTime() - before;
      if (delta < -60_000 || delta > WATCHER_BATCH_WINDOW_MS) continue;
      if (result.get(row.id)?.kind === "watcher-legacy") {
        result.set(row.id, {
          kind: "watcher-batch", evidence: "watcher-batch-telemetry",
        });
      }
    }
  }

  // Explicit game-ID packages are durable, user-scoped relationships.
  for (const receipt of packageReceipts) {
    if (!receipt.uid) continue;
    const meta = object(receipt.metadata);
    const ids = Array.isArray(meta.gameIds) ? meta.gameIds : [];
    for (const id of ids) {
      if (!Number.isSafeInteger(id)) continue;
      const row = rowById.get(id as number);
      if (!row || row.userUid !== receipt.uid) continue;
      const source = result.get(row.id);
      if (source?.kind === "manual") {
        result.set(row.id, { kind: "manual-zip", evidence: "zip-exact-id" });
      }
    }
  }

  // Historical packs stored filenames but no game IDs. Correlate only once
  // and expose uncertainty instead of silently claiming exact source truth.
  const possible = new Map<number, Set<number>>();
  for (let receiptIndex = 0; receiptIndex < packageReceipts.length; receiptIndex++) {
    const receipt = packageReceipts[receiptIndex];
    if (!receipt.uid) continue;
    const meta = object(receipt.metadata);
    const names = Array.isArray(meta.filenames) ? meta.filenames : [];
    const counts = new Map<string, number>();
    for (const name of names) {
      if (typeof name !== "string") continue;
      const normalized = canonicalFile(name);
      if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    for (const [name, count] of counts) {
      if (count !== 1) continue;
      const possibleRows = (byOwnerFile.get(packageIdentity(receipt.uid, name)) ?? [])
        .filter(row => {
          if (result.get(row.id)?.kind !== "manual") return false;
          const age = receipt.createdAt.getTime() - row.createdAt.getTime();
          return age >= -5_000 && age <= ZIP_RECEIPT_WINDOW_MS;
        });
      if (possibleRows.length !== 1) continue;
      const row = possibleRows[0];
      const earlier = possible.get(row.id) ?? new Set<number>();
      earlier.add(receiptIndex);
      possible.set(row.id, earlier);
    }
  }

  for (const [id, receiptIndices] of possible) {
    if (receiptIndices.size !== 1 || result.get(id)?.kind !== "manual") continue;
    result.set(id, {
      kind: "manual-zip", evidence: "zip-legacy-correlation",
    });
  }
  return result;
}

export function matchesLibraryOriginFilter(
  origin: LibraryOrigin,
  filter: LibraryOriginFilter,
) {
  return filter === "all" ||
    (filter === "other"
      ? origin === "watcher-legacy" || origin === "unclassified"
      : origin === filter);
}
