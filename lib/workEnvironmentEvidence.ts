/** Source-only, bounded Workspace 2/3 register.
 * A GitHub ref never attests a Mac agent heartbeat or a live website build.
 * No arbitrary repository, branch, code execution, mutation or financial scope.
 */
import { readBoundedGithubPublic } from "./githubBoundedPublicRead.ts";

export const WORK_ENVIRONMENT_SCHEMA = "aoe2war.product.work-environments.v1" as const;

export const WORK_ENVIRONMENTS = [
  {
    id: "WE2",
    label: "Work Environment 2",
    description: "Existing restricted PRODUCT checkout and the separately owned Storage OS work",
    focus: "PRODUCT source baseline · existing session",
    repo: "Emaren/app-prodn",
    branch: "session-c/next-renaissance-website-20261114",
    namespace: "session-c/*",
    sourceLink: "https://github.com/Emaren/app-prodn",
    isolation: "SHARED_UID650_LEGACY_SOURCE",
    scope: "No edits from WE3. The other session's VPSSentry work is separately owned.",
  },
  {
    id: "WE3",
    label: "Work Environment 3",
    description: "Independent PRODUCT Git clone, build dependencies, branch namespace and scratch",
    focus: "Website features · private admin observability",
    repo: "Emaren/app-prodn",
    branch: "session-c/we3-website-observatory-20261115",
    namespace: "session-c/we3-*",
    sourceLink: "https://github.com/Emaren/app-prodn/tree/session-c/we3-website-observatory-20261115",
    isolation: "INDEPENDENT_GIT_AND_DEPENDENCIES_UID650",
    scope: "No direct main push, no WE2 branch edits, no financial access, no direct HEL1 deployment.",
  },
] as const;

export type RemoteBranchEvidence = {
  state: "GITHUB_REF_OBSERVED" | "UNKNOWN";
  headSha: string | null;
  observedAt: string | null;
  reason: "SOURCE_OBSERVED" | "NOT_OBSERVED";
};

const SHA = /^[0-9a-f]{40}$/;
export function parseObservedBranch(
  value: unknown,
  expectedName: string,
  observedAt: string,
): RemoteBranchEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { state: "UNKNOWN", headSha: null, observedAt: null, reason: "NOT_OBSERVED" };
  const data = value as { name?: unknown; commit?: { sha?: unknown } };
  if (data.name !== expectedName || typeof data.commit?.sha !== "string" || !SHA.test(data.commit.sha))
    return { state: "UNKNOWN", headSha: null, observedAt: null, reason: "NOT_OBSERVED" };
  return { state: "GITHUB_REF_OBSERVED", headSha: data.commit.sha, observedAt, reason: "SOURCE_OBSERVED" };
}

async function readKnownGithubBranch(
  repo: "Emaren/app-prodn",
  branch: string,
): Promise<RemoteBranchEvidence> {
  const unknown: RemoteBranchEvidence = {
    state: "UNKNOWN", headSha: null, observedAt: null, reason: "NOT_OBSERVED",
  };
  const result = await readBoundedGithubPublic(
    "branches/" + encodeURIComponent(branch), 40_000,
    "aoe2war-private-work-environments",
  );
  return result ? parseObservedBranch(result.data, branch, result.observedAt) : unknown;
}

export async function readWorkEnvironmentEvidence() {
  // Source-only. The physical Mac checkout/agent cannot be inferred from GitHub.
  const proofs = await Promise.all(
    WORK_ENVIRONMENTS.map(lane => readKnownGithubBranch(lane.repo, lane.branch)),
  );
  return {
    schema: WORK_ENVIRONMENT_SCHEMA,
    queriedAt: new Date().toISOString(),
    lanes: WORK_ENVIRONMENTS.map((lane, index) => ({ ...lane, remote: proofs[index] })),
    sessionPresence: "UNKNOWN" as const,
    localDirtyState: "UNKNOWN" as const,
    releaseAuthority: "EXACT_SOURCE_B_PRODUCTION_CONTROLLER_ONLY" as const,
  };
}
