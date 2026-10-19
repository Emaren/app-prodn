export type KingdomBuildRouteCounts = {
  publicStatic: number;
  publicDynamic: number;
  publicUtility: number;
  admin: number;
  sensitiveDynamic: number;
  apiHandlers: number;
  totalPages: number;
};

const EXCLUDED_SENSITIVE = new Set(["/market/invoices/[publicId]"]);
const UTILITY = new Set(["/profile","/wallet","/settings","/connect-wallet","/pending-bets","/offline","/contact-emaren","/past-earnings","/app","/upload","/uploads"]);
const MAX_ROUTES = 15_000;

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

