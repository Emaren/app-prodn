/**
 * Umbrella Tree — pure, read-only projection of the EXISTING OS registry.
 * No authority, process health or ChatGPT session activity can be derived
 * from a catalog identity, branch, alias, or decorative graph edge.
 */
export const UMBRELLA_GRAPH_SCHEMA = "aoe2war.umbrella-tree.graph.v1" as const;

export type TreeKind = "umbrella" | "os" | "workspace" | "session" | "role";
export type TreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: TreeKind;
  catalogState: "SOURCE_PRESENT" | "PLANNED" | "DECLARED_ONLY" | "UNKNOWN";
  authority: string;
  purpose: string;
  sourceRef: string | null;
  sourceStatus: string;
  liveStatus: "UNKNOWN";
  evidenceAt: null;
  isIllustrative: boolean;
};
export type TreeEdge = {
  id: string;
  from: string;
  to: string;
  kind: "parent" | "architectural-handoff";
  assertion: "CATALOG_ONLY";
};
export type TreeGraph = {
  schema: typeof UMBRELLA_GRAPH_SCHEMA;
  sourceSchema: string | null;
  snapshotDate: string | null;
  sourceBaseline: string | null;
  nodes: TreeNode[];
  edges: TreeEdge[];
  errors: string[];
};

export type WorkEnvironmentShape = {
  id: string;
  label: string;
  sessionSlots: readonly string[];
};

/**
 * These are ILLUSTRATIVE slots from the compositional hierarchy contract.
 * They are NOT discovered conversations, sessions, workers or authorizations.
 * Even a "Session A" label has no global identity without its WE parent.
 */
export const WORKSPACE_LAYOUT_SLOTS: readonly WorkEnvironmentShape[] = [
  { id: "WE1", label: "Work Environment 1", sessionSlots: ["A", "B", "C"] },
  { id: "WE2", label: "Work Environment 2", sessionSlots: ["A", "B", "C"] },
  { id: "WE3", label: "Work Environment 3", sessionSlots: ["A", "B", "C"] },
];

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const label = (value: unknown, fallback = "UNKNOWN"): string =>
  typeof value === "string" && value.length > 0 && value.length <= 200
    && !/[\u0000-\u001f<>]/.test(value) ? value : fallback;
const canonical = (value: unknown): value is string =>
  typeof value === "string" && /^aoe2war\.(?:os|role)\.[a-z0-9][a-z0-9.-]{0,75}$/.test(value);
const safePath = (value: unknown): string | null =>
  typeof value === "string" && value.length <= 160
    && /^\/(?!\/)(?!api\/)[a-zA-Z0-9/_-]+$/.test(value) && !value.includes("..")
    ? value : null;
const sourceReference = (value: unknown): string | null =>
  safePath(value) ||
  (typeof value === "string" && /^https:\/\/github\.com\/Emaren\/[a-zA-Z0-9_-]+\/(?:issues|pull)\/[0-9]+$/.test(value)
    ? value : null);
const emptyGraph = (error: string): TreeGraph => ({
  schema: UMBRELLA_GRAPH_SCHEMA, sourceSchema: null, snapshotDate: null,
  sourceBaseline: null, nodes: [], edges: [], errors: [error],
});

function classifyLifecycle(value: unknown): TreeNode["catalogState"] {
  if (value === "source-present") return "SOURCE_PRESENT";
  if (value === "proposed" || value === "draft-source" || value === "draft-unmerged") return "PLANNED";
  return "UNKNOWN";
}

export function buildUmbrellaTree(
  raw: unknown,
  workspaceSlots: readonly WorkEnvironmentShape[] = WORKSPACE_LAYOUT_SLOTS,
): TreeGraph {
  if (!record(raw) || raw.schema !== "aoe2war.os.census.v1" ||
    !record(raw.umbrella) || !Array.isArray(raw.subordinate_os) ||
    !Array.isArray(raw.supervisory_roles)) return emptyGraph("INVALID_REGISTRY_SCHEMA");

  const root = raw.umbrella;
  if (root.canonical_id !== "aoe2war.os.umbrella" || root.id !== "aoe2war"
    || raw.subordinate_os.length > 150 || raw.supervisory_roles.length > 30
    || workspaceSlots.length > 200) return emptyGraph("INVALID_REGISTRY_BOUNDARY");

  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  const ids = new Set<string>();
  const add = (node: TreeNode): boolean => {
    if (ids.has(node.id) || (node.parentId !== null && !ids.has(node.parentId))) return false;
    ids.add(node.id);
    nodes.push(node);
    if (node.parentId) edges.push({
      id: node.parentId + ">" + node.id, from: node.parentId, to: node.id,
      kind: "parent", assertion: "CATALOG_ONLY",
    });
    return true;
  };
  const common = { liveStatus: "UNKNOWN" as const, evidenceAt: null };
  if (!add({
    ...common, id: "aoe2war.os.umbrella", parentId: null,
    name: label(root.name, "AoE2WAR OS"), kind: "umbrella",
    catalogState: classifyLifecycle(root.lifecycle),
    authority: label(root.authority_domain, "integrated-source-dashboard"),
    purpose: "Original source-owned hierarchy. Not a live process census.",
    sourceStatus: label(root.status), sourceRef: safePath(root.ui),
    isIllustrative: false,
  })) return emptyGraph("DUPLICATE_ROOT");

  let workspacePresent = false;
  for (const entry of raw.subordinate_os) {
    if (!record(entry) || !canonical(entry.canonical_id) ||
      !String(entry.canonical_id).startsWith("aoe2war.os.") ||
      entry.canonical_id === root.canonical_id ||
      entry.immutable_id !== true) return emptyGraph("INVALID_OS_ID");
    const id = entry.canonical_id;
    if (id === "aoe2war.os.workspace") workspacePresent = true;
    if (!add({
      ...common, id, parentId: "aoe2war.os.umbrella",
      name: label(entry.name), kind: "os",
      catalogState: classifyLifecycle(entry.lifecycle),
      authority: label(entry.authority_domain, "UNSPECIFIED"),
      purpose: label(entry.responsibility, "Source-registered module"),
      sourceStatus: label(entry.status), sourceRef: sourceReference(entry.ui) || sourceReference(entry.reference),
      isIllustrative: false,
    })) return emptyGraph("DUPLICATE_OR_ORPHAN_OS");
  }
  if (!workspacePresent) return emptyGraph("MISSING_WORKSPACE_OS");

  for (const slot of workspaceSlots) {
    if (!/^WE(?:[1-9][0-9]{0,3})$/.test(slot.id) ||
      slot.sessionSlots.length > 24 || !slot.sessionSlots.length) return emptyGraph("INVALID_WORKSPACE_SLOT");
    const weId = "aoe2war.workspace." + slot.id.toLowerCase();
    if (!add({
      ...common, id: weId, parentId: "aoe2war.os.workspace",
      name: label(slot.label), kind: "workspace", catalogState: "DECLARED_ONLY",
      authority: "WORKSPACE_OWNER_UNOBSERVED",
      purpose: "Architectural workspace slot; actual source and sessions need separate receipts.",
      sourceStatus: "LAYOUT_SLOT", sourceRef: null, isIllustrative: true,
    })) return emptyGraph("DUPLICATE_WORKSPACE_SLOT");
    for (const sid of slot.sessionSlots) {
      if (!/^[A-Z][A-Z0-9]{0,7}$/.test(sid)) return emptyGraph("INVALID_SESSION_SLOT");
      if (!add({
        ...common, id: weId + ".session." + sid.toLowerCase(), parentId: weId,
        name: "Session " + sid, kind: "session", catalogState: "DECLARED_ONLY",
        authority: "NO_ROLE_ASSIGNED",
        purpose: "Illustrative scoped session slot; neither a discovered chat nor a worker heartbeat.",
        sourceStatus: "MODEL_ONLY", sourceRef: null, isIllustrative: true,
      })) return emptyGraph("DUPLICATE_SESSION_SLOT");
    }
  }

  for (const entry of raw.supervisory_roles) {
    if (!record(entry) || !canonical(entry.canonical_id) ||
      !String(entry.canonical_id).startsWith("aoe2war.role.") ||
      entry.not_subordinate_os !== true) return emptyGraph("INVALID_NON_OS_ROLE");
    if (!add({
      ...common, id: entry.canonical_id, parentId: "aoe2war.os.umbrella",
      name: label(entry.name), kind: "role", catalogState: "DECLARED_ONLY",
      authority: label(entry.authority_domain, "ROLE_NOT_OS"),
      purpose: label(entry.responsibility, "Supervisory role, not a standalone operating system"),
      sourceStatus: label(entry.status), sourceRef: sourceReference(entry.reference),
      isIllustrative: false,
    })) return emptyGraph("DUPLICATE_ROLE");
  }

  const lateral: ReadonlyArray<[string, string]> = [
    ["aoe2war.os.workspace", "aoe2war.os.release"],
    ["aoe2war.os.release", "aoe2war.os.recovery"],
    ["aoe2war.os.documentation", "aoe2war.os.central-command"],
    ["aoe2war.os.storage", "aoe2war.os.host"],
    ["aoe2war.os.campaign", "aoe2war.os.operation"],
    ["aoe2war.os.operation", "aoe2war.os.storage"],
    ["aoe2war.os.operation", "aoe2war.os.orchestra"],
    ["aoe2war.os.neuron", "aoe2war.os.synapse"],
    ["aoe2war.os.synapse", "aoe2war.os.neuronal-net"],
  ];
  for (const [from, to] of lateral) {
    if (ids.has(from) && ids.has(to)) edges.push({
      id: from + "~" + to, from, to,
      kind: "architectural-handoff", assertion: "CATALOG_ONLY",
    });
  }

  return {
    schema: UMBRELLA_GRAPH_SCHEMA, sourceSchema: "aoe2war.os.census.v1",
    snapshotDate: label(raw.snapshot_date, "UNKNOWN"),
    sourceBaseline: typeof raw.source_baseline_main === "string"
      && /^[a-f0-9]{40}$/.test(raw.source_baseline_main) ? raw.source_baseline_main : null,
    nodes, edges, errors: [],
  };
}

export type LightState = "VERIFIED" | "OBSERVED" | "HOLD" | "FAULT" | "CANDIDATE" | "UNKNOWN";
export type EvidenceReceipt = {
  schema: "aoe2war.umbrella.light.v1";
  nodeId: string;
  state: "VERIFIED" | "OBSERVED" | "HOLD" | "FAULT";
  observedAt: string;
  provenance: string;
  sourceSha?: string;
};
/** Only precise, fresh, source-scoped evidence may light a runtime node. */
export function verifyLight(
  raw: unknown, nodeId: string, now = Date.now(),
): { state: LightState; observedAt: string | null; provenance: string | null } {
  const unknown = { state: "UNKNOWN" as const, observedAt: null, provenance: null };
  if (!record(raw) || raw.schema !== "aoe2war.umbrella.light.v1" ||
    raw.nodeId !== nodeId || !["VERIFIED", "OBSERVED", "HOLD", "FAULT"].includes(String(raw.state)) ||
    typeof raw.observedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(raw.observedAt) ||
    !Number.isFinite(Date.parse(raw.observedAt)) ||
    now - Date.parse(raw.observedAt) > 600_000 ||
    now - Date.parse(raw.observedAt) < -60_000 ||
    typeof raw.provenance !== "string" ||
    !/^https:\/\/github\.com\/Emaren\/[A-Za-z0-9_-]+\/(?:pull|issues|actions\/runs)\/[0-9]+(?:#[-\w]+)?$/.test(raw.provenance) ||
    (raw.sourceSha !== undefined && (typeof raw.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(raw.sourceSha)))) {
    return unknown;
  }
  return { state: raw.state as EvidenceReceipt["state"], observedAt: raw.observedAt, provenance: raw.provenance };
}
