import { createHash } from "node:crypto";

/** Transport integrity only. A digest never grants result or execution authority. */
export type NativeReplayManifest = {
  schema: "aoe2war-native-replay-manifest/v2";
  gameStatsId: number;
  replaySha256: string;
  logicalBattleId: string;
  sourceGameStatsIds: number[];
  sourceSnapshotSha256: string;
  archive: { objectKey: string; sha256: string; byteSize: number };
  roster: Array<{ slot: number; steamId: string; name: string; teamId: number }>;
  parser: { parserName: string; parserVersion: string; schemaVersion: string; passName: string; passVersion: string; status: string };
  result: { known: true; winningSlots: number[]; provenance: string };
  financialExposure: { markets: number; wagers: number; claims: number; settlements: number };
  candidateOnly: true;
  authority: { stats: false; bets: false; settlement: false; wolo: false };
  executionKind: "control";
  manifestSha256: string;
};

export function nativeCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(nativeCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${nativeCanonicalJson(v)}`).join(",")}}`;
  }
  if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) throw Error("Noncanonical manifest value.");
  return JSON.stringify(value);
}

export const nativeSnapshotDigest = (value: unknown) => createHash("sha256").update(nativeCanonicalJson(value)).digest("hex");

/** Validate raw integers before the presentation normalizer can round them. */
export function nativeRosterFromSource(value: unknown): NativeReplayManifest["roster"] {
  const rows = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 8) throw Error("Complete raw native roster required.");
  const exactInteger = (v: unknown, team = false): number => {
    if (typeof v === "number" && Number.isSafeInteger(v)) return v;
    if (typeof v === "string" && (team ? /^(?:team:)?(?:0|[1-9]\d*)$/ : /^[1-8]$/).test(v)) return Number(v.replace(/^team:/, ""));
    throw Error("Raw native slot/team must be an exact integer.");
  };
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw Error("Invalid raw native player.");
    const slotValues = [row.player_number, row.playerNumber, row.number].filter(v => v !== undefined && v !== null);
    const teamValues = [row.team_id, row.teamId, row.team_number, row.teamNumber, row.team].filter(v => v !== undefined && v !== null);
    const steamValues = [row.steam_id, row.steamId, row.user_id].filter(v => v !== undefined && v !== null);
    if (!slotValues.length || !teamValues.length || !steamValues.length || new Set(slotValues.map(v => exactInteger(v))).size !== 1 || new Set(teamValues.map(v => exactInteger(v, true))).size !== 1 || new Set(steamValues).size !== 1 || typeof steamValues[0] !== "string" || !/^\d{17}$/.test(steamValues[0]) || typeof row.name !== "string") throw Error("Ambiguous raw native identity or side aliases.");
    return { slot: exactInteger(slotValues[0]), teamId: exactInteger(teamValues[0], true), steamId: steamValues[0], name: row.name };
  }).sort((a, b) => a.slot - b.slot);
}
export function sealNativeReplayManifest(value: Omit<NativeReplayManifest, "manifestSha256">): NativeReplayManifest {
  return validateNativeReplayManifest({ ...value, manifestSha256: nativeSnapshotDigest(value) });
}

export function validateNativeReplayManifest(value: unknown): NativeReplayManifest {
  function record(v: unknown, keys: string[]) {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== keys.sort().join()) throw Error("Unexpected native manifest fields.");
    return v as Record<string, unknown>;
  }
  const m = record(value, ["schema", "gameStatsId", "replaySha256", "logicalBattleId", "sourceGameStatsIds", "sourceSnapshotSha256", "archive", "roster", "parser", "result", "financialExposure", "candidateOnly", "authority", "executionKind", "manifestSha256"]);
  const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
  const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  const text = (v: unknown, max = 256) => typeof v === "string" && Boolean(v.trim()) && v.trim() === v && Array.from(v).length <= max && !/[\x00-\x1f]/.test(v);
  const ascending = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length > 0 && v.every((n, i) => int(n, 1, max) && (i === 0 || n > v[i - 1]));
  if (m.schema !== "aoe2war-native-replay-manifest/v2" || m.executionKind !== "control" || m.candidateOnly !== true) throw Error("Only candidate known-result controls are admitted; unknown control ladder is incomplete.");
  if (!int(m.gameStatsId, 1) || !digest(m.replaySha256) || !digest(m.sourceSnapshotSha256) || !text(m.logicalBattleId, 512) || !ascending(m.sourceGameStatsIds, Number.MAX_SAFE_INTEGER) || m.sourceGameStatsIds.length > 500 || !m.sourceGameStatsIds.includes(m.gameStatsId)) throw Error("Invalid exact native battle identity.");
  const a = record(m.archive, ["objectKey", "sha256", "byteSize"]);
  if (a.objectKey !== `${m.replaySha256}.aoe2record` || a.sha256 !== m.replaySha256 || !int(a.byteSize, 1, 64 * 1024 * 1024)) throw Error("Invalid native archive object.");
  if (!Array.isArray(m.roster) || m.roster.length < 2 || m.roster.length > 8) throw Error("Incomplete native roster.");
  const roster = m.roster.map(r => record(r, ["slot", "steamId", "name", "teamId"]));
  if (roster.some((r, i) => !int(r.slot, 1, 8) || (i > 0 && Number(r.slot) <= Number(roster[i - 1].slot)) || typeof r.steamId !== "string" || !/^\d{17}$/.test(r.steamId) || /^0+$/.test(r.steamId) || !text(r.name) || !int(r.teamId, 0, 2147483647)) || new Set(roster.map(r => r.steamId)).size !== roster.length || new Set(roster.map(r => r.teamId)).size !== 2) throw Error("Ambiguous native slots, Steam identities or sides.");
  const p = record(m.parser, ["parserName", "parserVersion", "schemaVersion", "passName", "passVersion", "status"]);
  if (p.parserName !== "aoe2war.mgz_hd" || p.parserVersion !== "1.8.51" || p.schemaVersion !== "2026-07-25.1" || p.passName !== "hd_deterministic_evidence" || p.passVersion !== "10" || !["completed", "recovered"].includes(String(p.status))) throw Error("Unsupported native parser snapshot.");
  const r = record(m.result, ["known", "winningSlots", "provenance"]);
  if (r.known !== true || !ascending(r.winningSlots, 8) || r.winningSlots.length >= roster.length || !text(r.provenance) || !/^(acceptedadjudication:[1-9][0-9]*|public_result:[A-Za-z0-9_.:-]+)$/.test(String(r.provenance))) throw Error("Trusted independent control result required.");
  const winners = roster.filter(p => (r.winningSlots as number[]).includes(Number(p.slot)));
  if (winners.length !== r.winningSlots.length || new Set(winners.map(p => p.teamId)).size !== 1 || roster.filter(p => p.teamId === winners[0].teamId).length !== winners.length) throw Error("Control winner is not one complete explicit side.");
  const f = record(m.financialExposure, ["markets", "wagers", "claims", "settlements"]);
  const auth = record(m.authority, ["stats", "bets", "settlement", "wolo"]);
  if (Object.values(f).some(n => n !== 0) || Object.values(auth).some(n => n !== false)) throw Error("Financially linked or authoritative native execution rejected.");
  const { manifestSha256, ...unsigned } = m;
  if (!digest(manifestSha256) || nativeSnapshotDigest(unsigned) !== manifestSha256) throw Error("Native manifest digest mismatch.");
  if (Buffer.byteLength(nativeCanonicalJson(m), "utf8") > 32768) throw Error("Native manifest exceeds byte bound.");
  return value as NativeReplayManifest;
}
