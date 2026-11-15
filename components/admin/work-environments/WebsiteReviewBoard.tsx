import { readWebsiteReviews, type WebsiteReviewState } from "@/lib/websiteReviewEvidence";

const STATUS: Record<WebsiteReviewState, string> = {
  OPEN_DRAFT: "OPEN · DRAFT",
  OPEN_REVIEW: "OPEN · REVIEW",
  MERGED: "MERGED · SOURCE ONLY",
  CLOSED_UNMERGED: "CLOSED · NOT MERGED",
  UNKNOWN: "UNKNOWN · GitHub unavailable",
};

export async function WebsiteReviewBoard() {
  const reviews = await readWebsiteReviews();
  return (
    <section aria-labelledby="website-review-board-heading"
      className="rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-6">
      <h2 id="website-review-board-heading" className="text-xl font-bold text-white">
        Website source review queue
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
        Current public GitHub pull-request metadata for three fixed PRODUCT changes.
        A merged PR is source history, never proof of production, complete CI,
        an authorized release, or a running ChatGPT session.
        Verified responses are cached up to five minutes to limit GitHub API
        traffic. Each card shows its original observation timestamp;
        missing or invalid GitHub evidence is UNKNOWN.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reviews.map(review => (
          <article key={review.number}
            className="min-w-0 rounded-xl border border-cyan-300/20 bg-white/5 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
              PR #{review.number}
            </p>
            <h3 className="mt-2 text-base font-bold text-white">{review.label}</h3>
            <p className="mt-2 text-sm text-slate-300">{review.purpose}</p>
            <p className={"mt-3 text-sm font-bold " +
              (review.state === "UNKNOWN" || review.state === "CLOSED_UNMERGED"
                ? "text-amber-200" : "text-cyan-200")}>
              {STATUS[review.state]}
            </p>
            <dl className="mt-3 space-y-1 text-xs">
              <dt className="text-slate-300">Verified GitHub HEAD</dt>
              <dd className="break-all font-mono text-slate-100">
                {review.headSha ?? "UNKNOWN"}
              </dd>
              <dt className="pt-2 text-slate-300">Last GitHub update</dt>
              <dd className="font-mono text-slate-100">
                {review.updatedAt ?? "UNKNOWN"}
              </dd>
            </dl>
            <a href={review.url} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg border border-cyan-300/30 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200">
              Open exact GitHub PR
            </a>
            <p className="mt-2 text-xs text-slate-300">
              {review.observedAt ? "Read at " + review.observedAt : "No verified observation"}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <a href="https://github.com/Emaren/app-prodn/issues/787" target="_blank"
          rel="noopener noreferrer" className="text-cyan-200 underline underline-offset-4">
          DocsV2 A/B independent review handoff
        </a>
        <p className="text-xs text-slate-300">
          This page does not infer CI green, deploy readiness, or root staging headroom.
          Open GitHub for current check-run details.
        </p>
      </div>
    </section>
  );
}
