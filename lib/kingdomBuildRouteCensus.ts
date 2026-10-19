import "server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";

export type KingdomBuildRouteCounts = {
  publicStatic: number;
  publicDynamic: number;
  publicUtility: number;
  admin: number;
  sensitiveDynamic: number;
  apiHandlers: number;
  totalPages: number;
};
export type KingdomBuildRouteCensus = {
  schema: 1;
  source: "deployed-next-app-paths-manifest";
  status: "verified" | "unavailable";
  capturedAt: string | null;
  buildVersion: string | null;
  counts: KingdomBuildRouteCounts | null;
};

const EXCLUDED_SENSITIVE = new Set(["/market/invoices/[publicId]"]);
const UTILITY = new Set(["/profile","/wallet","/settings","/connect-wallet","/pending-bets","/offline","/contact-emaren","/past-earnings","/app","/upload","/uploads"]);
const MAX_BYTES = 2_000_000;
const MAX_ROUTES = 15_000;
const BASE = ".next/server/app-paths-manifest.json";
const TTL_MS = 120_000;
let last: { at: number; result: KingdomBuildRouteCensus } | null = null;

function isKnownRoute(value: string): boolean {
  return /^\/(?:[a-zA-Z0-9_@.\-\[\]()+]+\/)*[a-zA-Z0-9_@.\-\[\]()+]+\/(?:page|route)$/.test(value);
}
function normalizedPage(value: string): string {
  const p = value.slice(0, -"/page".length);
  // Route groups do not change the user-facing Next.js path.
  const segments = p.split("/").filter(v => v && !/^\([^/]+\)$/.test(v) && !/^@[^/]+$/.test(v));
  return "/" + segments.join("/");
}

/** Pure parser for the deployed *Next build* inventory; never count URL samples as pages. */
export function classifyKingdomBuildRoutes(raw: unknown): KingdomBuildRouteCounts | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rows = Object.entries(raw as Record<string, unknown>);
  if (!rows.length || rows.length > MAX_ROUTES) return null;
  const pageIds = new Set<string>();
  const handlerIds = new Set<string>();
  for (const [key, target] of rows) {
    if (!isKnownRoute(key) || typeof target !== "string" || !target.startsWith("app/") || target.length > 512) return null;
    if (key.endsWith("/route")) handlerIds.add(key);
    else pageIds.add(normalizedPage(key));
  }
  const counts: KingdomBuildRouteCounts = {
    publicStatic: 0, publicDynamic: 0, publicUtility: 0, admin: 0, sensitiveDynamic: 0, apiHandlers: handlerIds.size, totalPages: pageIds.size,
  };
  for (const href of pageIds) {
    if (href === "/admin" || href.startsWith("/admin/")) { counts.admin++; continue; }
    if (EXCLUDED_SENSITIVE.has(href)) { counts.sensitiveDynamic++; continue; }
    if (UTILITY.has(href)) { counts.publicUtility++; continue; }
    if (href.includes("[")) { counts.publicDynamic++; continue; }
    counts.publicStatic++;
  }
  if (counts.totalPages !== counts.publicStatic + counts.publicDynamic + counts.publicUtility + counts.admin + counts.sensitiveDynamic) return null;
  return counts;
}

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
