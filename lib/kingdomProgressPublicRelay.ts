/**
 * A07: bounded, untrusted-on-disk public progress projection.
 * The isolated R25 website NEVER reaches GitHub directly: the distinct,
 * nonfinancial VPSSentry relay verifies source evidence on a separate UID
 * and atomically publishes one finite public-only JSON file.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { dirname } from "node:path";
import type { PublicProgressEntry } from "./kingdomProgressProjection";

export const Q12_RELAY_FILE = "/var/cache/aoe2war-public-priority/current.json";
const MAX_BYTES = 8_192;
const MAX_TTL_MS = 10 * 60 * 1_000;
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^v[0-9]-[0-9]{8}$/;

export type PublicQ12Envelope = {
  schema: 1;
  status: "FRESH";
  observedAt: string;
  readAt: string;
  entries: PublicProgressEntry[];
};

const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const keys = (value: Record<string, unknown>, names: readonly string[]): boolean =>
  Object.keys(value).length === names.length && Object.keys(value).every(x => names.includes(x));

const isoDate = (value: unknown, now: number): number | null => {
  if (typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= Date.UTC(2020, 0, 1) && ms <= now + 30_000
    ? ms : null;
};

/** Return null on any read, authority, validity or clock uncertainty. Never log file contents. */
export function readPublicQ12Relay(
  now = Date.now(),
  file = Q12_RELAY_FILE,
  readerUid = process.getuid?.()
): PublicQ12Envelope | null {
  let fd: number | undefined;
  try {
    if (!Number.isFinite(now) || typeof readerUid !== "number") return null;

    const parent = lstatSync(dirname(file));
    const source = lstatSync(file);
    // The file and parent are owned by a distinct non-root producer.
    // Reject symlinks, world/group-write, hardlinks, and self-owned files.
    if (!parent.isDirectory() || parent.isSymbolicLink() ||
        !source.isFile() || source.isSymbolicLink() ||
        source.uid === 0 || source.uid === readerUid ||
        parent.uid !== source.uid || source.nlink !== 1 ||
        (parent.mode & 0o777) !== 0o755 ||
        (source.mode & 0o777) !== 0o644 ||
        source.size < 128 || source.size > MAX_BYTES) return null;

    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.ino !== source.ino ||
        opened.dev !== source.dev || opened.uid !== source.uid ||
        opened.nlink !== 1 || opened.size !== source.size) return null;

    // Bounded OS read even if a compromised producer grows the file between
    // fstat and read; never ask Node to read an arbitrary-length path.
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let read = 0;
    while (read < bytes.length) {
      const count = readSync(fd, bytes, read, bytes.length - read, null);
      if (count === 0) break;
      read += count;
    }
    if (read !== source.size || read > MAX_BYTES) return null;
    const decoded: unknown = JSON.parse(bytes.toString("utf8", 0, read));
    if (!obj(decoded) || !keys(decoded,
      ["schema", "status", "observedAt", "readAt", "entries", "provenance", "expiresAt"]) ||
      decoded.schema !== 1 || decoded.status !== "FRESH" ||
      !Array.isArray(decoded.entries) || decoded.entries.length !== 1 ||
      !obj(decoded.provenance)) return null;

    const observedAt = isoDate(decoded.observedAt, now);
    const readAt = isoDate(decoded.readAt, now);
    const expiry = isoDate(decoded.expiresAt, now + MAX_TTL_MS);
    if (observedAt === null || readAt === null || expiry === null ||
        observedAt > now + 30_000 ||
        readAt < observedAt || readAt > observedAt + 5_000 ||
        expiry <= now || expiry > observedAt + MAX_TTL_MS ||
        !keys(decoded.provenance, ["issue", "issueUpdatedAt", "runId", "sourceSha"]) ||
        decoded.provenance.issue !== 984 ||
        !Number.isSafeInteger(decoded.provenance.runId) ||
        Number(decoded.provenance.runId) <= 0 ||
        typeof decoded.provenance.sourceSha !== "string" ||
        !SHA.test(decoded.provenance.sourceSha) ||
        isoDate(decoded.provenance.issueUpdatedAt, now) === null) return null;

    const entry = decoded.entries[0];
    if (!obj(entry) || !keys(entry, [
      "id", "label", "category", "source", "href", "scopeVersion",
      "milestones", "verifiedCount", "percent", "lastWorkedAt", "evidenceStatus"
    ]) ||
      entry.id !== "Q12" || entry.label !== "Kingdom Progress" ||
      entry.category !== "experience" || entry.source !== "PUBLIC CAMPAIGN" ||
      entry.href !== "/kingdom-progress" ||
      typeof entry.scopeVersion !== "string" || !VERSION.test(entry.scopeVersion) ||
      entry.verifiedCount !== 1 || entry.percent !== 33 ||
      entry.evidenceStatus !== "VERIFIED" ||
      isoDate(entry.lastWorkedAt, now) === null ||
      !Array.isArray(entry.milestones) || entry.milestones.length !== 3) return null;

    const truth = [
      ["source-contract", "Source Contract", true],
      ["public-feed", "Public Feed", false],
      ["browser-acceptance", "Browser Acceptance", false]
    ] as const;
    for (let i = 0; i < truth.length; i++) {
      const milestone = entry.milestones[i];
      const [id, label, verified] = truth[i];
      if (!obj(milestone) || !keys(milestone, ["id", "label", "verified"]) ||
          milestone.id !== id || milestone.label !== label ||
          milestone.verified !== verified) return null;
    }

    // Only finite reviewed fields are returned, never the provenance/private source body.
    return {
      schema: 1, status: "FRESH", observedAt: decoded.observedAt as string,
      readAt: new Date(now).toISOString(),
      entries: [{
        id: "Q12", label: "Kingdom Progress", category: "experience",
        source: "PUBLIC CAMPAIGN", href: "/kingdom-progress",
        scopeVersion: entry.scopeVersion,
        milestones: truth.map(([id, label, verified]) => ({ id, label, verified })),
        verifiedCount: 1, percent: 33,
        lastWorkedAt: entry.lastWorkedAt as string,
        evidenceStatus: "VERIFIED"
      }]
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
