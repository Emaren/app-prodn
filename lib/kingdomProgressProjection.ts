/**
 * Public Kingdom Progress contract. No GitHub issue body, receipts or credentials
 * are ever forwarded to the browser. The parser deliberately accepts a tiny,
 * owner-published JSON island, NOT the private Central Command priority table.
 */
export type ProgressSort = "most" | "least" | "recent";
export type Gate = "source" | "runtime" | "economic";
export type PublicMilestone = { id: string; label: string; verified: boolean };
export type PublicProgressEntry = {
  id: string; label: string; category: string; source: string; href: string;
  scopeVersion: string; milestones: PublicMilestone[];
  verifiedCount: number | null; percent: number | null;
  lastWorkedAt: string | null; evidenceStatus: "VERIFIED" | "UNKNOWN";
};
export type PendingReceipt = {
  id: string; label: string; gate: Gate;
  proof: null | { kind: "github-actions"; sha: string; runId: number };
};
export type ApprovedScope = {
  id: string; label: string; category: string; href: string; repo: string;
  scopeVersion: string; lastCodeSha: string | null; milestones: PendingReceipt[];
};

const START = "<!-- AOE2WAR_PUBLIC_PRIORITY_V1 -->";
const END = "<!-- END_AOE2WAR_PUBLIC_PRIORITY_V1 -->";
const SAFE_REPOS = new Set(["Emaren/app-prodn", "Emaren/aoe2-watcher", "Emaren/aoe2hdbets", "Emaren/wolochain"]);
const SAFE_HREFS = new Set(["/kingdom-progress", "/kingdom-brain", "/kingdom-index", "/kingdom-agents", "/workshop", "/download", "/bets", "/television-wolo", "/hd-replay-engine", "/game-stats", "/speed", "/ai"]);
const SAFE_CATEGORIES = new Set(["client", "financial", "media", "replay", "platform", "experience"]);
const SAFE_FIELDS = /^[A-Za-z0-9][A-Za-z0-9 /&+.,'-]*$/;
const PRIVATE_WORDS = /\b(?:password|secret|token|credential|private|ssh|sudo|root|signer|custody|wallet|backup|host|server|ip|internal|hmac|keyfile|api.?key|database)\b/i;
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const exactKeys = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).every(k => keys.includes(k));
const safeText = (x: unknown, max = 48): x is string =>
  typeof x === "string" && x.length >= 2 && x.length <= max &&
  SAFE_FIELDS.test(x) && !PRIVATE_WORDS.test(x) && !/[\u202a-\u202e\u2066-\u2069]/.test(x);

export function readPublicPriorityScopes(issueBody: unknown, original: ReadonlyArray<{
  id: string; label: string; category: string; href: string; milestones: readonly string[];
}>): ApprovedScope[] {
  if (typeof issueBody !== "string" || issueBody.length > 100_000) return [];
  const from = issueBody.indexOf(START);
  if (from < 0 || issueBody.indexOf(START, from + START.length) >= 0) return [];
  const to = issueBody.indexOf(END, from + START.length);
  if (to < 0 || issueBody.indexOf(END, to + END.length) >= 0) return [];
  const block = issueBody.slice(from + START.length, to).trim();
  if (!block || block.length > 16_384) return [];
  let data: unknown;
  try { data = JSON.parse(block); } catch { return []; }
  if (!record(data) || !exactKeys(data, ["schema", "publication", "items"]) ||
      data.schema !== 1 || data.publication !== "OWNER_APPROVED_PUBLIC" ||
      !Array.isArray(data.items) || data.items.length > 8) return [];
  const known = new Map(original.map(p => [p.id, p]));
  const used = new Set<string>();
  const accepted: ApprovedScope[] = [];
  for (const item of data.items) {
    if (!record(item) || !exactKeys(item, ["id", "label", "category", "href", "repo", "scopeVersion", "lastCodeSha", "milestones", "approved"]) ||
        item.approved !== true || typeof item.id !== "string" || used.has(item.id) ||
        !(known.has(item.id) || /^Q(?:0[1-9]|1[0-9]|2[0-9])$/.test(item.id)) ||
        !safeText(item.label) || !SAFE_CATEGORIES.has(String(item.category)) ||
        !SAFE_HREFS.has(String(item.href)) || !SAFE_REPOS.has(String(item.repo)) ||
        typeof item.scopeVersion !== "string" || !/^[a-z0-9][a-z0-9.-]{1,31}$/.test(item.scopeVersion) ||
        !(item.lastCodeSha === null || (typeof item.lastCodeSha === "string" && SHA.test(item.lastCodeSha))) ||
        !Array.isArray(item.milestones) || item.milestones.length < 2 || item.milestones.length > 8) continue;
    const fixed = known.get(item.id);
    if (fixed && (fixed.label !== item.label || fixed.href !== item.href ||
        fixed.category !== item.category || fixed.milestones.length !== item.milestones.length)) continue;
    const milestones: PendingReceipt[] = [];
    const ids = new Set<string>();
    for (const m of item.milestones) {
      if (!record(m) || !exactKeys(m, ["id", "label", "gate", "proof"]) ||
          typeof m.id !== "string" || !ID.test(m.id) || ids.has(m.id) ||
          !safeText(m.label) || !["source", "runtime", "economic"].includes(String(m.gate))) break;
      if (fixed && m.id !== fixed.milestones[milestones.length]) break;
      let proof: PendingReceipt["proof"] = null;
      if (m.proof !== null) {
        if (!record(m.proof) || !exactKeys(m.proof, ["kind", "sha", "runId"]) ||
            m.gate !== "source" || m.proof.kind !== "github-actions" ||
            typeof m.proof.sha !== "string" || !SHA.test(m.proof.sha) ||
            !Number.isSafeInteger(m.proof.runId) || Number(m.proof.runId) <= 0) break;
        proof = { kind: "github-actions", sha: m.proof.sha, runId: Number(m.proof.runId) };
      }
      ids.add(m.id);
      milestones.push({ id: m.id, label: m.label, gate: m.gate as Gate, proof });
    }
    if (milestones.length !== item.milestones.length) continue;
    used.add(item.id);
    accepted.push({
      id: item.id, label: item.label, category: String(item.category), href: String(item.href),
      repo: String(item.repo), scopeVersion: item.scopeVersion,
      lastCodeSha: item.lastCodeSha as string | null, milestones
    });
  }
  return accepted;
}

export function safeCodeDate(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + 30_000 || time < Date.UTC(2020, 0, 1)) return null;
  return new Date(time).toISOString();
}

export function progressFromVerifiedScope(
  scope: ApprovedScope,
  acceptedIds: ReadonlySet<string>,
  actualCodeDate: string | null
): PublicProgressEntry {
  const milestones = scope.milestones.map(m => ({
    id: m.id, label: m.label, verified: m.gate === "source" && acceptedIds.has(m.id)
  }));
  const verifiedCount = milestones.filter(m => m.verified).length;
  // Never invent a zero from missing evidence. Scope completion requires every
  // independently accepted gate and remains version-bound.
  const measured = verifiedCount > 0;
  return {
    id: scope.id, label: scope.label, category: scope.category,
    source: "PUBLIC CAMPAIGN", href: scope.href, scopeVersion: scope.scopeVersion,
    milestones, verifiedCount: measured ? verifiedCount : null,
    percent: measured ? Math.round(100 * verifiedCount / milestones.length) : null,
    lastWorkedAt: actualCodeDate, evidenceStatus: measured ? "VERIFIED" : "UNKNOWN"
  };
}

export function sortProgressEntries<T extends Pick<PublicProgressEntry, "id" | "percent" | "lastWorkedAt">>(
  entries: readonly T[], mode: ProgressSort, originalOrder: readonly string[]
): T[] {
  const order = new Map(originalOrder.map((id, i) => [id, i]));
  const tie = (a: T, b: T) =>
    (order.get(a.id) ?? 1000) - (order.get(b.id) ?? 1000) || a.id.localeCompare(b.id);
  return [...entries].sort((a, b) => {
    if (mode === "recent") {
      const ta = safeCodeDate(a.lastWorkedAt);
      const tb = safeCodeDate(b.lastWorkedAt);
      const da = ta ? Date.parse(ta) : NaN;
      const db = tb ? Date.parse(tb) : NaN;
      if (Number.isFinite(da) !== Number.isFinite(db)) return Number.isFinite(da) ? -1 : 1;
      if (Number.isFinite(da) && da !== db) return db - da;
    } else {
      const va = a.percent !== null && Number.isFinite(a.percent) && a.percent >= 0 && a.percent <= 100;
      const vb = b.percent !== null && Number.isFinite(b.percent) && b.percent >= 0 && b.percent <= 100;
      if (va !== vb) return va ? -1 : 1;
      if (va && a.percent !== b.percent) return mode === "most" ? (b.percent! - a.percent!) : (a.percent! - b.percent!);
    }
    return tie(a, b);
  });
}
