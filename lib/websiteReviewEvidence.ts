/**
 * Bounded read-only GitHub PR metadata for the authenticated PRODUCT command
 * room. No GitHub action, status-check/CI inference, session presence, financial
 * permit or deployment approval is derived from a pull request.
 */
import { readBoundedGithubPublic } from "./githubBoundedPublicRead.ts";

export const WEBSITE_REVIEW_TARGETS = [
  { number: 1362, label: "WE3 Admin Observatory", purpose: "Authenticated workspace observability" },
  { number: 1363, label: "WE3 Kingdom Traders", purpose: "PAPER-only fleet and research" },
  { number: 1364, label: "PRODUCT DocsV2 reviews", purpose: "Hall Scribe and Phoenix source reviews" },
] as const;

export type WebsiteReviewState = "OPEN_DRAFT" | "OPEN_REVIEW" | "MERGED" | "CLOSED_UNMERGED" | "UNKNOWN";

export type WebsiteReviewProof = {
  number: number;
  label: string;
  purpose: string;
  url: string;
  state: WebsiteReviewState;
  headSha: string | null;
  updatedAt: string | null;
  observedAt: string | null;
};

const SHA = /^[0-9a-f]{40}$/;
const SAFE_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

function unknown(number: number, label: string, purpose: string): WebsiteReviewProof {
  return { number, label, purpose, url: "https://github.com/Emaren/app-prodn/pull/" + number,
    state: "UNKNOWN", headSha: null, updatedAt: null, observedAt: null };
}

export function parseWebsiteReview(
  data: unknown,
  number: number,
  label: string,
  purpose: string,
  observedAt: string,
): WebsiteReviewProof {
  const fallback = unknown(number, label, purpose);
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const row = data as Record<string, unknown>;
  const head = row.head as Record<string, unknown> | null;
  const base = row.base as Record<string, unknown> | null;
  if (row.number !== number || !head || typeof head !== "object" || Array.isArray(head)
    || !base || typeof base !== "object" || Array.isArray(base)
    || typeof head.sha !== "string" || !SHA.test(head.sha)
    || base.ref !== "main"
    || typeof row.updated_at !== "string"
    || !SAFE_UTC.test(row.updated_at) || !Number.isFinite(Date.parse(row.updated_at))) {
    return fallback;
  }
  let state: WebsiteReviewState;
  if (row.state === "open" && row.merged_at === null && row.draft === true)
    state = "OPEN_DRAFT";
  else if (row.state === "open" && row.merged_at === null && row.draft === false)
    state = "OPEN_REVIEW";
  else if (row.state === "closed" && typeof row.merged_at === "string"
    && SAFE_UTC.test(row.merged_at) && Number.isFinite(Date.parse(row.merged_at)))
    state = "MERGED";
  else if (row.state === "closed" && row.merged_at === null)
    state = "CLOSED_UNMERGED";
  else return fallback;
  return { ...fallback, state, headSha: head.sha, updatedAt: row.updated_at, observedAt };
}

async function readKnownReview(target: typeof WEBSITE_REVIEW_TARGETS[number]): Promise<WebsiteReviewProof> {
  const fallback = unknown(target.number, target.label, target.purpose);
  const result = await readBoundedGithubPublic(
    "pulls/" + target.number, 250_000, "aoe2war-private-website-review-observer",
  );
  return result
    ? parseWebsiteReview(result.data, target.number, target.label, target.purpose,
      result.observedAt)
    : fallback;
}

export async function readWebsiteReviews() {
  // Fixed three sources; no user-controlled query and no arbitrary GitHub URL.
  return Promise.all(WEBSITE_REVIEW_TARGETS.map(readKnownReview));
}
