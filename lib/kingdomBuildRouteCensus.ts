import "server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { classifyKingdomBuildRoutes, type KingdomBuildRouteCounts } from "@/lib/kingdomBuildRouteClassifier";

export type KingdomBuildRouteCensus = {
  schema: 1;
  source: "deployed-next-app-paths-manifest";
  status: "verified" | "unavailable";
  capturedAt: string | null;
  buildVersion: string | null;
  counts: KingdomBuildRouteCounts | null;
};

const MAX_BYTES = 2_000_000;
const BASE = ".next/server/app-paths-manifest.json";
const TTL_MS = 120_000;
let last: { at: number; result: KingdomBuildRouteCensus } | null = null;

export async function readKingdomBuildRouteCensus(): Promise<KingdomBuildRouteCensus> {
  const now = Date.now();
  if (last && now-last.at < TTL_MS) return last.result;
  const buildVersion = process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || null;
  let counts: KingdomBuildRouteCounts | null = null;
  try {
    // No request/user-controlled path, no symlink traversal and no huge manifest reads.
    const fd = await open(path.join(process.cwd(), BASE), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await fd.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) throw new Error("manifest outside bounds");
      const json = JSON.parse(await fd.readFile({ encoding: "utf8" })) as unknown;
      counts = classifyKingdomBuildRoutes(json);
    } finally { await fd.close(); }
  } catch { counts = null; }
  const result: KingdomBuildRouteCensus = {
    schema:1, source:"deployed-next-app-paths-manifest",
    status:counts ? "verified" : "unavailable",
    capturedAt:counts ? new Date(now).toISOString() : null,
    buildVersion, counts,
  };
  last = { at:now, result };
  return result;
}
