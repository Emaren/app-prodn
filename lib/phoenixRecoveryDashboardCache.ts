import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePhoenixDashboard, type PhoenixDashboardSnapshot } from "./phoenixRecoveryDashboard.ts";

export function parsePhoenixDashboardCache(raw: string, expectedSha256: string): PhoenixDashboardSnapshot {
  if (Buffer.byteLength(raw) > 65_536 || !/^[0-9a-f]{64}$/.test(expectedSha256) || createHash("sha256").update(raw).digest("hex") !== expectedSha256) throw new Error("Phoenix dashboard cache binding failed");
  return validatePhoenixDashboard(JSON.parse(raw));
}

/** Named checked-in cache only. No database query, remote fetch or archive scan. */
export function loadPhoenixDashboardCache(): PhoenixDashboardSnapshot | null {
  try {
    const snapshot = join(process.cwd(), "data", "phoenix-recovery.snapshot.json");
    const digest = join(process.cwd(), "data", "phoenix-recovery.snapshot.sha256");
    if (!lstatSync(snapshot).isFile() || !lstatSync(digest).isFile() || lstatSync(snapshot).size > 65_536 || lstatSync(digest).size > 65) return null;
    return parsePhoenixDashboardCache(readFileSync(snapshot, "utf8"), readFileSync(digest, "utf8").trim());
  } catch { return null; }
}
