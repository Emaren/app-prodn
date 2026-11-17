/** Three distinct ownership lanes. Source-only browser evidence is NOT a host heartbeat.
 * Financial/Traders identity and private repository access cannot be inferred
 * from an app-prodn public GitHub branch or from any older website worktree.
 */
import { readBoundedGithubPublic } from "./githubBoundedPublicRead.ts";

export const WORK_ENVIRONMENT_SCHEMA = "aoe2war.product.work-environments.v2" as const;
export type WorkEnvironmentStatus =
  "ALIGNED" | "INTENTIONAL_DIVERGENCE" | "ACTION_REQUIRED" | "BLOCKED" | "UNKNOWN";

export const WORK_ENVIRONMENTS = [
  {
    id: "WE1", label: "Financial · WoloChain quarantine",
    description: "Protected custody, reserves, database writer and recovery gates. No PRODUCT reader may authorize a financial mutation.",
    focus: "FINANCIAL · separate source owner · seven open gates",
    repo: "NOT_ATTESTED", branch: "NOT_ATTESTED",
    namespace: "FINANCIAL_OWNER_ONLY",
    sourceOwner: "WE1_FINANCIAL",
    sourceLink: "https://github.com/Emaren/app-prodn/issues/1280",
    isolation: "FINANCIAL_QUARANTINE",
    scope: "Funding denied. No PRODUCT GitHub source observation is a custody or writer permit.",
  },
  {
    id: "WE2", label: "Website · Factory · Storage OS",
    description: "Nonfinancial website, Radio WOLO, community, release and storage recovery. A public main ref is source-only evidence.",
    focus: "WEBSITE · nonfinancial deployment · exact Factory authority",
    repo: "Emaren/app-prodn", branch: "main",
    namespace: "session-c/we2-*",
    sourceOwner: "WE2_PRODUCT",
    sourceLink: "https://github.com/Emaren/app-prodn",
    isolation: "NONFINANCIAL_PRODUCT_RELEASE_BOUNDARY",
    scope: "PR #1394 is an independently qualified candidate; only a separate owner permit and physical Factory proof authorize production.",
  },
  {
    id: "WE3", label: "Kingdom Traders · PAPER",
    description: "Private, independent Traders Git repository with Stellar research, 100-account historical PAPER journals and separately owned release gates.",
    focus: "STELLAR PAPER · private repo · NO LIVE authority",
    repo: "Emaren/kingdom-traders", branch: "main",
    namespace: "WE3_SOURCE_OWNED",
    sourceOwner: "WE3_TRADERS",
    sourceLink: "https://github.com/Emaren/kingdom-traders",
    isolation: "PRIVATE_TRADERS_REPOSITORY_AND_JOURNALS",
    scope: "Only WE3 may modify Traders sources/journals. Browser GitHub without an authorized private feed MUST show UNKNOWN, not an offline agent.",
  },
] as const;

export type WorkEnvironmentLane = typeof WORK_ENVIRONMENTS[number];
export type RemoteBranchEvidence = {
  state: "GITHUB_REF_OBSERVED" | "UNKNOWN";
  headSha: string | null;
  observedAt: string | null;
  reason: "SOURCE_OBSERVED" | "NOT_OBSERVED" |
    "FINANCIAL_SOURCE_QUARANTINED" | "PRIVATE_SOURCE_NOT_CONNECTED";
};

const SHA = /^[0-9a-f]{40}$/;
const unknown = (reason: RemoteBranchEvidence["reason"]): RemoteBranchEvidence =>
  ({ state: "UNKNOWN", headSha: null, observedAt: null, reason });

export function parseObservedBranch(
  value: unknown, expectedName: string, observedAt: string,
): RemoteBranchEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unknown("NOT_OBSERVED");
  const data = value as { name?: unknown; commit?: { sha?: unknown } };
  if (data.name !== expectedName || typeof data.commit?.sha !== "string" ||
      !SHA.test(data.commit.sha) || !Number.isFinite(Date.parse(observedAt)))
    return unknown("NOT_OBSERVED");
  return { state: "GITHUB_REF_OBSERVED", headSha: data.commit.sha,
    observedAt, reason: "SOURCE_OBSERVED" };
}

/** Policy-only classification; an externally VERIFIED host receipt is required
 * before calling a lane aligned. This browser never creates such a receipt.
 */
export type VerifiedHostReceipt = {
  authority: "AUTHORIZED_READONLY_HOST_WITNESS";
  repo: string; branch: string; headSha: string; treeSha: string;
  owner: string; observedAt: string; clean: boolean; plannedWip: boolean;
};
export function assessWorkEnvironment(
  lane: WorkEnvironmentLane,
  remote: RemoteBranchEvidence,
  receipt: VerifiedHostReceipt | null,
  nowMs: number,
): WorkEnvironmentStatus {
  if (lane.id === "WE1") return "BLOCKED";
  if (!receipt || remote.state !== "GITHUB_REF_OBSERVED" || !remote.headSha)
    return "UNKNOWN";
  if (receipt.authority !== "AUTHORIZED_READONLY_HOST_WITNESS" ||
      receipt.repo !== lane.repo || receipt.owner !== lane.sourceOwner ||
      receipt.branch !== lane.branch || !SHA.test(receipt.headSha) ||
      !SHA.test(receipt.treeSha))
    return "BLOCKED";
  const at = Date.parse(receipt.observedAt);
  const githubAt = Date.parse(remote.observedAt ?? "");
  if (!Number.isFinite(nowMs) || !Number.isFinite(at) ||
      !Number.isFinite(githubAt) ||
      nowMs < at || nowMs - at > 15 * 60_000 ||
      nowMs < githubAt || nowMs - githubAt > 15 * 60_000)
    return "UNKNOWN";
  if (receipt.headSha !== remote.headSha || !receipt.clean)
    return receipt.plannedWip ? "INTENTIONAL_DIVERGENCE" : "ACTION_REQUIRED";
  return "ALIGNED";
}

async function observeLane(lane: WorkEnvironmentLane): Promise<RemoteBranchEvidence> {
  // Only app-prodn/main is a configured public GitHub observation. The WE3
  // repository is PRIVATE: public 404 is not a source-offline claim.
  if (lane.id === "WE1") return unknown("FINANCIAL_SOURCE_QUARANTINED");
  if (lane.id === "WE3") return unknown("PRIVATE_SOURCE_NOT_CONNECTED");
  const result = await readBoundedGithubPublic("branches/main", 40_000);
  return result
    ? parseObservedBranch(result.data, "main", result.observedAt)
    : unknown("NOT_OBSERVED");
}

export async function readWorkEnvironmentEvidence() {
  const proofs = await Promise.all(WORK_ENVIRONMENTS.map(observeLane));
  return {
    schema: WORK_ENVIRONMENT_SCHEMA,
    queriedAt: new Date().toISOString(),
    lanes: WORK_ENVIRONMENTS.map((lane, index) => ({
      ...lane,
      remote: proofs[index],
      status: lane.id === "WE1" ? "BLOCKED" as const : "UNKNOWN" as const,
      hostReceipt: "NOT_AVAILABLE" as const,
      localHead: null, localTree: null, localDirtyState: "UNKNOWN" as const,
      physicalRuntime: "UNKNOWN" as const, ownerPermit: "UNKNOWN" as const,
      storageAdmission: "UNKNOWN" as const,
    })),
    sessionPresence: "UNKNOWN" as const,
    localDirtyState: "UNKNOWN" as const,
    releaseAuthority: "EXACT_SOURCE_B_PRODUCTION_CONTROLLER_ONLY" as const,
  };
}
