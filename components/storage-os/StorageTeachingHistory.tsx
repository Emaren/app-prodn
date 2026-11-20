import type {TeachingEvent} from "@/lib/storageHogTeachingLedger";
import {CATEGORY_REVIEW_VERSION,categoryReviewEvidence,type TeachingPlane} from "@/lib/storageHogTeachingPolicy";
import type {VisualHog} from "@/lib/storageVisualPrivate";

export default function StorageTeachingHistory({events,plane,item,observedAt,ownerBinding,now}:{
  events:TeachingEvent[]; plane:TeachingPlane; item:VisualHog;
  observedAt:string; ownerBinding:string|null; now:number;
}) {
  const history = events.filter(event => event.plane === plane && event.category === item.key);
  const review = categoryReviewEvidence(history, {
    plane,category:item.key,observedAt,sourceFloor:item.level,overlaps:item.overlaps,
  },ownerBinding,now);
  const findings = {
    PROTECTED:"The source level or an existing protection excludes this category from L2 suggestions.",
    EXPIRED:"A new signed observation is required for an L2 suggestion.",
    ALREADY_REVIEWED:"This observation already has an owner decision.",
    NEEDS_EXAMPLES:"A suggestion requires owner notes on two separate L2 observations of this category on this drive.",
    REVIEW_SUGGESTED:`Consider this category for L2 review. You recorded L2 and an explanation on ${review.examples.length} distinct earlier observations with the same protection floor and overlap status.`,
  };
  return <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
    <h3 className="font-semibold text-slate-100">Review history for {item.label}</h3>
    <p className="mt-2 text-sm text-slate-300">{findings[review.finding]}</p>
    {review.finding === "REVIEW_SUGGESTED" && <p className="mt-2 text-xs text-slate-400">
      {CATEGORY_REVIEW_VERSION} · Category-level evidence. Review individual file identity, dependencies and restore evidence separately.
    </p>}
    {history.length > 0 && <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-cyan-200">Inspect {history.length} recorded {history.length === 1 ? "decision" : "decisions"}</summary>
      <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto">
        {history.reverse().map(event => <li key={event.id} className="rounded-lg border border-white/10 p-3">
          <p className="font-semibold">Requested L{event.requestedLevel} · Effective L{event.effectiveLevel}</p>
          <p className="mt-1 text-xs text-slate-300">{event.ownerBinding && event.ownerBinding === ownerBinding
            ? "Enrolled owner" : "Historical account attribution unconfirmed"} · {event.grossBytes.toLocaleString()} gross bytes observed{" "}
            <time dateTime={event.sourceObservedAt} title={event.sourceObservedAt}>{new Date(event.sourceObservedAt).toLocaleString()}</time></p>
          <p className="mt-2 whitespace-pre-wrap break-words">{event.note || "No explanation recorded."}</p>
          <p className="mt-2 break-all text-xs text-slate-400">Receipt {event.digestSha256}</p>
        </li>)}
      </ol>
    </details>}
  </div>;
}
