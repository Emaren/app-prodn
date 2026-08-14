"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronDown,
  CircleDot,
  Crown,
  Gavel,
  Landmark,
  LoaderCircle,
  MessageSquareText,
  PenLine,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldCheck,
  Swords,
  ThumbsDown,
  ThumbsUp,
  Users,
  Vote,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import SteamLoginButton from "@/components/SteamLoginButton";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import type {
  RoundChamberChoice,
  RoundChamberProposal,
  RoundChamberSnapshot,
  RoundChamberStatus,
} from "@/lib/roundChamber";

type Filter = "all" | "open" | "adopted" | "declined";

type ProposalDraft = {
  category: string;
  title: string;
  summary: string;
  body: string;
  votingClosesAt: string;
};

const EMPTY_DRAFT: ProposalDraft = {
  category: "kingdom",
  title: "",
  summary: "",
  body: "",
  votingClosesAt: "",
};

const CATEGORY_OPTIONS = [
  ["kingdom", "Kingdom"],
  ["chamber", "The Chamber"],
  ["forge", "Kingdom Forge"],
  ["oracle", "The Oracle"],
  ["battle", "Battle & Competition"],
  ["economy", "Economy"],
  ["community", "Community"],
] as const;

const FILTERS: Array<[Filter, string]> = [
  ["all", "All scrolls"],
  ["open", "On the floor"],
  ["adopted", "Adopted"],
  ["declined", "Declined"],
];

function categoryLabel(category: string) {
  return (
    CATEGORY_OPTIONS.find(([value]) => value === category)?.[1] ||
    category.replace(/[-_]/g, " ")
  );
}

function statusLabel(status: RoundChamberStatus, votingOpen: boolean) {
  if (status === "open" && !votingOpen) return "Ballot closed";
  if (status === "open") return "On the floor";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: RoundChamberStatus, votingOpen: boolean) {
  if (status === "adopted") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
  if (status === "declined") {
    return "border-rose-300/20 bg-rose-400/10 text-rose-100";
  }
  if (status === "open" && votingOpen) {
    return "border-amber-200/25 bg-amber-300/10 text-amber-100";
  }
  return "border-slate-300/15 bg-white/5 text-slate-300";
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    proposal_opened: "Scroll opened",
    ballot_cast: "Ballot cast",
    ballot_changed: "Ballot changed",
    comment_added: "Voice entered",
    proposal_adopted: "Proposal adopted",
    proposal_declined: "Proposal declined",
    proposal_reopened: "Floor reopened",
  };
  return labels[eventType] || eventType.replace(/_/g, " ");
}

function responseError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  return fallback;
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-100/75">
        {label}
        {hint ? (
          <span className="font-medium normal-case tracking-normal text-slate-500">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function ChamberStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border border-[#97703b]/40 bg-[linear-gradient(150deg,rgba(28,21,13,0.91),rgba(5,5,5,0.90))] p-3.5 shadow-[inset_0_1px_0_rgba(255,225,166,0.08),0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-[#c4a36e]/68">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-serif text-2xl font-bold text-[#f0dab0] sm:text-3xl">
        {value}
      </div>
    </div>
  );
}

function Chronicle({ proposal }: { proposal: RoundChamberProposal }) {
  return (
    <details className="group border border-[#846238]/35 bg-[linear-gradient(145deg,rgba(14,11,8,0.90),rgba(3,3,3,0.95))] open:border-[#aa8044]/45 open:bg-black/45">
      <summary className="flex min-h-12 list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-200 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-amber-200/65" />
          Chamber Chronicle
          <span className="text-xs font-medium text-slate-500">
            {proposal.events.length} recent
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
        {proposal.events.length > 0 ? (
          <ol className="space-y-3">
            {proposal.events.map((event) => (
              <li key={event.id} className="relative pl-5">
                <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_10px_rgba(252,211,77,0.5)]" />
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/55">
                  {eventLabel(event.eventType)}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {event.detail}
                </p>
                <div className="mt-1 text-[11px] text-slate-600">
                  <TimeDisplayText value={event.createdAt} includeYear />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No Chronicle entries yet.</p>
        )}
      </div>
    </details>
  );
}

function BallotLedger({ proposal }: { proposal: RoundChamberProposal }) {
  return (
    <details className="group border border-[#846238]/35 bg-[linear-gradient(145deg,rgba(14,11,8,0.90),rgba(3,3,3,0.95))] open:border-[#aa8044]/45 open:bg-black/45">
      <summary className="flex min-h-12 list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-200 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <Vote className="h-4 w-4 text-amber-200/65" />
          Public ballot ledger
          <span className="text-xs font-medium text-slate-500">
            {proposal.ballots.length}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="max-h-80 space-y-2 overflow-y-auto border-t border-white/[0.06] px-4 pb-4 pt-3">
        {proposal.ballots.length > 0 ? (
          proposal.ballots.map((ballot, index) => (
            <div
              key={`${ballot.voter.displayName}-${ballot.updatedAt}-${index}`}
              className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-200">
                  {ballot.voter.displayName}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                    ballot.choice === "support"
                      ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100"
                      : "border-rose-200/18 bg-rose-300/[0.07] text-rose-100"
                  }`}
                >
                  {ballot.choice}
                </span>
              </div>
              {ballot.reason ? (
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {ballot.reason}
                </p>
              ) : null}
              <div className="mt-2 text-[10px] text-slate-600">
                <TimeDisplayText value={ballot.updatedAt} includeYear />
              </div>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-slate-500">No ballots sealed yet.</p>
        )}
      </div>
    </details>
  );
}

function ProposalCard({
  proposal,
  snapshot,
  sendingKey,
  voteReason,
  commentDraft,
  decisionNote,
  onVoteReason,
  onCommentDraft,
  onDecisionNote,
  onVote,
  onComment,
  onDecision,
}: {
  proposal: RoundChamberProposal;
  snapshot: RoundChamberSnapshot;
  sendingKey: string | null;
  voteReason: string;
  commentDraft: string;
  decisionNote: string;
  onVoteReason: (value: string) => void;
  onCommentDraft: (value: string) => void;
  onDecisionNote: (value: string) => void;
  onVote: (choice: RoundChamberChoice) => void;
  onComment: () => void;
  onDecision: (action: "adopt" | "decline" | "reopen") => void;
}) {
  const busy = sendingKey?.endsWith(proposal.publicId) ?? false;
  const canParticipate = Boolean(snapshot.viewer?.canParticipate);
  const isAdmin = Boolean(snapshot.viewer?.isAdmin);
  const supportWidth = proposal.ballotCount > 0 ? proposal.supportPercent : 50;

  return (
    <article
      id={`proposal-${proposal.publicId}`}
      className="relative overflow-hidden border border-[#9f733b]/45 bg-[radial-gradient(circle_at_18%_0%,rgba(168,107,34,0.10),transparent_28%),linear-gradient(155deg,rgba(24,18,11,0.98),rgba(5,5,6,0.99)_54%,rgba(2,2,3,0.995))] shadow-[0_34px_110px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,226,171,0.07)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#c78c35]/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#d2a45a]/40 to-transparent" />
      <div className="relative p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-100/14 bg-amber-100/[0.055] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/70">
                {categoryLabel(proposal.category)}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${statusTone(
                  proposal.status,
                  proposal.votingOpen
                )}`}
              >
                {statusLabel(proposal.status, proposal.votingOpen)}
              </span>
            </div>
            <h2 className="mt-4 max-w-3xl font-serif text-2xl font-bold leading-tight text-amber-50 sm:text-3xl">
              {proposal.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/70 sm:text-base sm:leading-7">
              {proposal.summary}
            </p>
          </div>

          <div className="shrink-0 rounded-[1.15rem] border border-white/[0.07] bg-black/25 px-4 py-3 text-left sm:min-w-44 sm:text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
              Sealed by
            </div>
            <div className="mt-1 text-sm font-bold text-slate-200">
              {proposal.createdByLabel}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              <TimeDisplayText value={proposal.createdAt} includeYear />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="rounded-[1.35rem] border border-white/[0.07] bg-black/20 p-4 sm:p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300 sm:text-[15px]">
              {proposal.body}
            </p>

            {proposal.decisionNote ? (
              <div className="mt-5 rounded-xl border border-amber-200/14 bg-amber-200/[0.055] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/60">
                  Stewardship record
                </div>
                <p className="mt-2 text-sm leading-6 text-amber-50/80">
                  {proposal.decisionNote}
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-[1.25rem] border border-emerald-200/12 bg-emerald-300/[0.045] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/55">
                Support
              </div>
              <div className="mt-2 text-3xl font-black text-emerald-100 tabular-nums">
                {proposal.supportCount}
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-rose-200/10 bg-rose-300/[0.035] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-100/50">
                Oppose
              </div>
              <div className="mt-2 text-3xl font-black text-rose-100 tabular-nums">
                {proposal.opposeCount}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <span>{proposal.supportPercent}% support</span>
            <span>{proposal.ballotCount} civic ballots</span>
          </div>
          <div
            className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-rose-400/25"
            role="progressbar"
            aria-label={`${proposal.supportPercent}% support`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={proposal.supportPercent}
          >
            <div
              className="h-full bg-[linear-gradient(90deg,#059669,#6ee7b7)] transition-[width] duration-500"
              style={{ width: `${supportWidth}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {proposal.votingClosesAt ? (
                <>
                  Voting bell: {" "}
                  <TimeDisplayText value={proposal.votingClosesAt} includeYear />
                </>
              ) : (
                "No scheduled voting bell"
              )}
            </span>
            <span>One signed Steam account · one ballot</span>
          </div>
        </div>

        {proposal.votingOpen ? (
          <section className="mt-6 rounded-[1.4rem] border border-amber-100/12 bg-amber-100/[0.035] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/60">
                  Ballot rationale <span className="normal-case tracking-normal text-slate-500">(optional)</span>
                </span>
                <input
                  value={voteReason}
                  onChange={(event) => onVoteReason(event.target.value)}
                  maxLength={500}
                  disabled={!canParticipate || busy}
                  placeholder="Add a short reason to your ballot record…"
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10 disabled:opacity-55"
                />
              </label>
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onVote("support")}
                  disabled={!canParticipate || busy}
                  aria-pressed={proposal.viewerChoice === "support"}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-200/35 disabled:cursor-not-allowed disabled:opacity-45 ${
                    proposal.viewerChoice === "support"
                      ? "border-emerald-200/35 bg-emerald-300 text-emerald-950"
                      : "border-emerald-200/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" /> Support
                </button>
                <button
                  type="button"
                  onClick={() => onVote("oppose")}
                  disabled={!canParticipate || busy}
                  aria-pressed={proposal.viewerChoice === "oppose"}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-rose-200/30 disabled:cursor-not-allowed disabled:opacity-45 ${
                    proposal.viewerChoice === "oppose"
                      ? "border-rose-200/35 bg-rose-300 text-rose-950"
                      : "border-rose-200/18 bg-rose-300/[0.07] text-rose-100 hover:bg-rose-300/15"
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" /> Oppose
                </button>
              </div>
            </div>
            {!canParticipate ? (
              <p className="mt-3 text-xs text-slate-400">
                Sign in with a linked Steam identity to place your one civic ballot.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-[1.4rem] border border-white/[0.07] bg-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-black text-white">
                <MessageSquareText className="h-4 w-4 text-amber-200/65" />
                Deliberation
                <span className="text-xs font-medium text-slate-500">
                  {proposal.commentCount}
                </span>
              </div>
            </div>

            {proposal.comments.length > 0 ? (
              <div className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
                {proposal.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-black text-amber-50/85">
                        {comment.author.displayName}
                        {comment.author.isAdmin ? (
                          <span className="ml-2 rounded-full border border-amber-200/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-100/60">
                            Steward
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        <TimeDisplayText value={comment.createdAt} />
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
                The floor is quiet. Be the first voice in the record.
              </div>
            )}

            {canParticipate ? (
              <div className="mt-4 space-y-3">
                <label className="sr-only" htmlFor={`comment-${proposal.publicId}`}>
                  Address the Round
                </label>
                <textarea
                  id={`comment-${proposal.publicId}`}
                  value={commentDraft}
                  onChange={(event) => onCommentDraft(event.target.value)}
                  maxLength={2_000}
                  disabled={busy}
                  placeholder="Address the Round…"
                  className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10 disabled:opacity-55"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onComment}
                    disabled={busy || commentDraft.trim().length < 2}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100/50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <PenLine className="h-4 w-4" />
                    )}
                    Enter the record
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="space-y-4">
            <BallotLedger proposal={proposal} />
            <Chronicle proposal={proposal} />

            {isAdmin ? (
              <section className="rounded-[1.25rem] border border-amber-200/16 bg-amber-300/[0.045] p-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-100/65">
                  <Gavel className="h-4 w-4" /> Steward seal
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">Stewardship note</span>
                  <textarea
                    value={decisionNote}
                    onChange={(event) => onDecisionNote(event.target.value)}
                    maxLength={1_500}
                    disabled={busy}
                    placeholder="Reason for the permanent record…"
                    className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs leading-5 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35 disabled:opacity-55"
                  />
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {proposal.status === "open" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onDecision("adopt")}
                        disabled={busy || decisionNote.trim().length < 4}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-xs font-black text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Check className="h-4 w-4" /> Adopt
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecision("decline")}
                        disabled={busy || decisionNote.trim().length < 4}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/20 bg-rose-300/[0.08] px-4 text-xs font-black text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <X className="h-4 w-4" /> Decline
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDecision("reopen")}
                      disabled={busy || decisionNote.trim().length < 4}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2 xl:col-span-1"
                    >
                      <RefreshCw className="h-4 w-4" /> Reopen the floor
                    </button>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function RoundChamberClient() {
  const [snapshot, setSnapshot] = useState<RoundChamberSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [draft, setDraft] = useState<ProposalDraft>(EMPTY_DRAFT);
  const [voteReasons, setVoteReasons] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/round-chamber", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(responseError(payload, "The Chamber record failed to open."));
      }
      setSnapshot(payload as RoundChamberSnapshot);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The Chamber record failed to open."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const mutate = useCallback(
    async (
      method: "POST" | "PATCH",
      body: Record<string, unknown>,
      key: string,
      successMessage: string
    ) => {
      setSendingKey(key);
      setError(null);
      setSuccess(null);
      try {
        const response = await fetch("/api/round-chamber", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(responseError(payload, "The Chamber rejected that action."));
        }
        setSnapshot(payload as RoundChamberSnapshot);
        setSuccess(successMessage);
        return true;
      } catch (mutationError) {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "The Chamber rejected that action."
        );
        return false;
      } finally {
        setSendingKey(null);
      }
    },
    []
  );

  const visibleProposals = useMemo(() => {
    if (!snapshot) return [];
    if (filter === "all") return snapshot.proposals;
    return snapshot.proposals.filter((proposal) => proposal.status === filter);
  }, [filter, snapshot]);

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let votingClosesAt: string | undefined;
    if (draft.votingClosesAt) {
      const parsed = new Date(draft.votingClosesAt);
      if (!Number.isFinite(parsed.getTime())) {
        setError("Choose a valid voting close.");
        return;
      }
      votingClosesAt = parsed.toISOString();
    }

    const ok = await mutate(
      "POST",
      {
        action: "create_proposal",
        ...draft,
        votingClosesAt,
      },
      "create-proposal",
      "Your proposal has entered the Round."
    );
    if (ok) {
      setDraft(EMPTY_DRAFT);
      setShowProposalForm(false);
      setFilter("open");
    }
  }

  async function castVote(
    proposal: RoundChamberProposal,
    choice: RoundChamberChoice
  ) {
    await mutate(
      "POST",
      {
        action: "cast_vote",
        publicId: proposal.publicId,
        choice,
        reason: voteReasons[proposal.publicId] || "",
      },
      `vote-${proposal.publicId}`,
      choice === "support"
        ? "Your support ballot is sealed."
        : "Your opposition ballot is sealed."
    );
  }

  async function addComment(proposal: RoundChamberProposal) {
    const ok = await mutate(
      "POST",
      {
        action: "add_comment",
        publicId: proposal.publicId,
        body: commentDrafts[proposal.publicId] || "",
      },
      `comment-${proposal.publicId}`,
      "Your voice has entered the Chronicle."
    );
    if (ok) {
      setCommentDrafts((current) => ({
        ...current,
        [proposal.publicId]: "",
      }));
    }
  }

  async function decideProposal(
    proposal: RoundChamberProposal,
    action: "adopt" | "decline" | "reopen"
  ) {
    const ok = await mutate(
      "PATCH",
      {
        action,
        publicId: proposal.publicId,
        note: decisionNotes[proposal.publicId] || "",
      },
      `decision-${proposal.publicId}`,
      action === "reopen"
        ? "The proposal has returned to the floor."
        : action === "adopt"
          ? "The proposal is adopted and sealed in the Chronicle."
          : "The proposal is declined and sealed in the Chronicle."
    );
    if (ok) {
      setDecisionNotes((current) => ({
        ...current,
        [proposal.publicId]: "",
      }));
    }
  }

  const totals = snapshot?.totals;
  const viewer = snapshot?.viewer;

  const activeProposal =
    snapshot?.proposals.find((proposal) => proposal.votingOpen) ??
    snapshot?.proposals[0] ??
    null;

  return (
    <main className="relative space-y-7 overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(151,94,25,0.08),transparent_30%),linear-gradient(180deg,#050403_0%,#080705_44%,#030303_100%)] py-3 text-white sm:space-y-9 sm:py-5">
      <section className="relative isolate min-h-[49rem] overflow-hidden border-y border-[#9d713a]/40 bg-[#030302] shadow-[0_38px_140px_rgba(0,0,0,0.78),inset_0_1px_0_rgba(255,226,168,0.10)] sm:min-h-[54rem] lg:min-h-[58rem]">

        <Image
          src="/round-chamber/round-chamber-senate-hero.png"
          alt="The monumental AoE2WAR Round Chamber Senate"
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-center brightness-[0.73] saturate-[0.82] contrast-[1.12]"
        />

        {/* Cinematic darkness */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.12)_29%,rgba(0,0,0,0.11)_55%,rgba(3,3,2,0.96)_100%)]" />

        {/* Central Senate fire */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,165,53,0.17),transparent_23%),radial-gradient(circle_at_50%_50%,transparent_25%,rgba(0,0,0,0.15)_58%,rgba(0,0,0,0.72)_100%)]" />

        {/* Bronze architectural rule */}
        <div className="absolute inset-x-[4%] top-5 h-px bg-gradient-to-r from-transparent via-[#eccb8c]/65 to-transparent" />
        <div className="absolute inset-x-[10%] bottom-6 h-px bg-gradient-to-r from-transparent via-[#8d652f]/45 to-transparent" />

        <div className="relative mx-auto flex min-h-[49rem] max-w-[96rem] flex-col px-5 py-8 sm:min-h-[54rem] sm:px-8 sm:py-10 lg:min-h-[58rem] lg:px-12">

          {/* Senate inscription */}
          <header className="mx-auto text-center">

            <div className="flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.46em] text-[#dfc28c]/70 sm:text-[10px]">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#ba8944]" />
              <Crown className="h-3.5 w-3.5 text-[#d9aa58]" />
              Senatus · Civitas · Regnum
              <Crown className="h-3.5 w-3.5 text-[#d9aa58]" />
              <span className="h-px w-10 bg-gradient-to-l from-transparent to-[#ba8944]" />
            </div>

            <h1 className="mt-4 font-serif text-[clamp(3.6rem,8vw,8rem)] font-semibold uppercase leading-[0.80] tracking-[-0.055em] text-transparent bg-clip-text bg-[linear-gradient(180deg,#fff8dd_0%,#efd394_27%,#c58a39_58%,#684015_100%)] drop-shadow-[0_10px_24px_rgba(0,0,0,0.95)]">
              The Round
              <span className="block">Chamber</span>
            </h1>

            <div className="mx-auto mt-5 flex max-w-3xl items-center gap-4">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d2a659]/70" />
              <Landmark className="h-5 w-5 text-[#d6a657]" />
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d2a659]/70" />
            </div>

            <p className="mx-auto mt-5 max-w-2xl font-serif text-base leading-7 text-[#ead8b4]/90 sm:text-lg sm:leading-8">
              Every citizen has a seat. Every voice may enter the record.
              Every ballot stands equal before the Kingdom.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 border border-[#be8d4c]/35 bg-black/45 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[#dfc794] backdrop-blur-md">
                <CircleDot className="h-3.5 w-3.5 text-emerald-300" />
                Chamber in session
              </span>

              <span className="inline-flex items-center gap-2 border border-[#be8d4c]/35 bg-black/45 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-[#dfc794] backdrop-blur-md">
                <Scale className="h-3.5 w-3.5" />
                One citizen · one ballot
              </span>
            </div>
          </header>

          {/* Preserve the architecture as the visual centerpiece */}
          <div className="flex-1" />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">

            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ChamberStat
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                  label="Scrolls"
                  value={totals?.proposals ?? "—"}
                />

                <ChamberStat
                  icon={<Vote className="h-3.5 w-3.5" />}
                  label="Ballots sealed"
                  value={totals?.ballots ?? "—"}
                />

                <ChamberStat
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Citizens heard"
                  value={totals?.civicVoters ?? "—"}
                />

                <ChamberStat
                  icon={<Gavel className="h-3.5 w-3.5" />}
                  label="Decrees adopted"
                  value={totals?.adoptedProposals ?? "—"}
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">

                {viewer?.canParticipate ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowProposalForm((current) => !current)
                    }
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#f0cc84]/50 bg-[linear-gradient(180deg,#d4a24b,#98651f)] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#160e05] shadow-[0_14px_40px_rgba(168,102,25,0.24),inset_0_1px_0_rgba(255,242,197,0.55)] transition hover:-translate-y-0.5 hover:brightness-110"
                  >
                    <ScrollText className="h-4 w-4" />
                    Present a scroll
                  </button>
                ) : (
                  <SteamLoginButton
                    label={
                      viewer
                        ? "Link Steam to take your seat"
                        : "Enter the Senate"
                    }
                    returnTo="/round-chamber"
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#f0cc84]/50 bg-[linear-gradient(180deg,#d4a24b,#98651f)] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#160e05] shadow-[0_14px_40px_rgba(168,102,25,0.24)] transition hover:-translate-y-0.5 hover:brightness-110"
                  />
                )}

                <a
                  href="#chamber-floor"
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#ad8043]/40 bg-black/55 px-6 text-sm font-bold text-[#ead7b0] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[#ddb872]/65 hover:bg-black/70"
                >
                  Enter the Senate floor
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* REAL existing proposal data */}
            <aside className="border border-[#a97c40]/45 bg-[linear-gradient(145deg,rgba(19,14,8,0.94),rgba(3,3,3,0.97))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,225,169,0.08)] backdrop-blur-lg">

              <div className="flex items-center justify-between border-b border-[#976c36]/25 pb-3">
                <div className="text-[9px] font-black uppercase tracking-[0.28em] text-[#cfad75]/70">
                  Current docket
                </div>
                <Vote className="h-4 w-4 text-[#d2a04f]" />
              </div>

              {activeProposal ? (
                <>
                  <div className="mt-4 text-[9px] font-black uppercase tracking-[0.20em] text-[#9e835c]">
                    {categoryLabel(activeProposal.category)}
                  </div>

                  <h2 className="mt-2 font-serif text-xl font-bold leading-tight text-[#fff0cf]">
                    {activeProposal.title}
                  </h2>

                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#b7aa95]">
                    {activeProposal.summary}
                  </p>

                  <div className="mt-5 flex items-end justify-between gap-4">

                    <div>
                      <div className="text-[9px] uppercase tracking-[0.20em] text-[#867258]">
                        Support
                      </div>

                      <div className="font-serif text-3xl font-bold text-[#dab363]">
                        {activeProposal.supportPercent}%
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-[0.20em] text-[#867258]">
                        Sealed ballots
                      </div>

                      <div className="font-serif text-2xl font-bold text-[#f1ddb5]">
                        {activeProposal.ballotCount}
                      </div>
                    </div>

                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden bg-[#311a12]">
                    <div
                      className="h-full bg-[linear-gradient(90deg,#896d2e,#e1bc68)]"
                      style={{
                        width: `${activeProposal.supportPercent}%`,
                      }}
                    />
                  </div>

                  <a
                    href={`#proposal-${activeProposal.publicId}`}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#9d743c]/40 bg-[#9f762f]/10 px-4 text-xs font-black uppercase tracking-[0.12em] text-[#e5c581] transition hover:bg-[#aa7e35]/20"
                  >
                    View the living record
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </>
              ) : (
                <div className="py-7 text-center">
                  <ScrollText className="mx-auto h-6 w-6 text-[#9b7843]" />
                  <p className="mt-3 text-sm text-[#a9987c]">
                    No scroll has entered the Senate yet.
                  </p>
                </div>
              )}

            </aside>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <div className="border border-[#95703d]/40 bg-[radial-gradient(circle_at_top_left,rgba(181,120,43,0.09),transparent_34%),linear-gradient(145deg,rgba(21,16,10,0.97),rgba(4,4,5,0.99))] p-5 shadow-[inset_0_1px_0_rgba(255,225,168,0.06)] sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-sky-200/14 bg-sky-300/[0.07] text-sky-100">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-100/55">
                Civic signal · explicit boundary
              </div>
              <h2 className="mt-2 font-serif text-xl font-bold text-white sm:text-2xl">
                Equal voices here. Chain authority elsewhere.
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {snapshot?.governanceNotice ||
                  "Round Chamber ballots are app-level civic signals, separate from WoloChain x/gov and chain execution."}
              </p>
            </div>
          </div>
        </div>

        <div className="border border-[#95703d]/40 bg-[linear-gradient(145deg,rgba(31,23,12,0.95),rgba(4,4,5,0.99))] p-5 shadow-[inset_0_1px_0_rgba(255,225,168,0.06)] sm:p-6">
          <div className="flex items-center gap-3">
            <Scale className="h-5 w-5 text-amber-200/75" />
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/55">
                Chamber law
              </div>
              <div className="mt-1 text-sm font-bold text-amber-50">
                One account. One current ballot. No WOLO multiplier.
              </div>
            </div>
          </div>
        </div>
      </section>

      <div aria-live="polite" className="space-y-3">
        {error ? (
          <div className="flex flex-col gap-3 rounded-[1.3rem] border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void loadSnapshot();
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rose-200/20 px-4 font-bold transition hover:bg-rose-100/10"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : null}
        {success ? (
          <div className="flex items-center gap-3 rounded-[1.3rem] border border-emerald-300/18 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100">
            <Check className="h-4 w-4" /> {success}
          </div>
        ) : null}
      </div>

      {showProposalForm ? (
        <section className="overflow-hidden rounded-[1.8rem] border border-amber-100/16 bg-[linear-gradient(145deg,rgba(35,27,15,0.92),rgba(5,8,15,0.98))] shadow-[0_26px_90px_rgba(0,0,0,0.3)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/55">
                Citizen scroll
              </div>
              <h2 className="mt-2 font-serif text-2xl font-bold text-amber-50">
                Place a proposal before the Round
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowProposalForm(false)}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-white/10 px-4 text-xs font-bold text-slate-300 hover:border-white/20 hover:text-white sm:self-auto"
            >
              <X className="h-4 w-4" /> Close scroll
            </button>
          </div>

          <form
            onSubmit={submitProposal}
            className="grid gap-5 p-5 sm:p-7 lg:grid-cols-2"
          >
            <FormField label="Category">
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10"
              >
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Voting closes" hint="Blank means 14 days">
              <input
                type="datetime-local"
                value={draft.votingClosesAt}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    votingClosesAt: event.target.value,
                  }))
                }
                className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10"
              />
            </FormField>
            <div className="lg:col-span-2">
              <FormField label="Proposal title" hint={`${draft.title.length}/180`}>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  maxLength={180}
                  required
                  placeholder="What should the Kingdom decide?"
                  className="min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10"
                />
              </FormField>
            </div>
            <div className="lg:col-span-2">
              <FormField label="Herald's summary" hint={`${draft.summary.length}/500`}>
                <textarea
                  value={draft.summary}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                  maxLength={500}
                  required
                  placeholder="The clear, one-breath version citizens see first…"
                  className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10"
                />
              </FormField>
            </div>
            <div className="lg:col-span-2">
              <FormField label="Full scroll" hint={`${draft.body.length}/6000`}>
                <textarea
                  value={draft.body}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  maxLength={6_000}
                  required
                  placeholder="Set out the change, the reason, and what adoption should mean…"
                  className="min-h-40 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35 focus:ring-2 focus:ring-amber-200/10"
                />
              </FormField>
            </div>
            <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                Submission opens an app civic ballot and appends a permanent
                Chronicle event. It does not submit a WoloChain governance transaction.
              </p>
              <button
                type="submit"
                disabled={
                  sendingKey === "create-proposal" ||
                  draft.title.trim().length < 3 ||
                  draft.summary.trim().length < 3 ||
                  draft.body.trim().length < 10
                }
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-amber-300 px-6 text-sm font-black text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-100/50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sendingKey === "create-proposal" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ScrollText className="h-4 w-4" />
                )}
                Seal and open
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section id="chamber-floor" className="scroll-mt-24 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/55">
              The Senate floor
            </div>
            <h2 className="mt-2 font-serif text-3xl font-bold text-amber-50 sm:text-4xl">
              The Living Docket
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Every scroll before the Kingdom. Every public argument. Every
              equal civic ballot. Every decree preserved in the permanent record.
            </p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-100/30 ${
                  filter === value
                    ? "border-amber-200/28 bg-amber-300/14 text-amber-50"
                    : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-72 place-items-center rounded-[1.8rem] border border-white/10 bg-black/20 text-center">
            <div>
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-amber-200/75" />
              <p className="mt-3 text-sm text-slate-400">
                Unrolling the Chamber Chronicle…
              </p>
            </div>
          </div>
        ) : snapshot && visibleProposals.length > 0 ? (
          <div className="space-y-5">
            {visibleProposals.map((proposal) => (
              <ProposalCard
                key={proposal.publicId}
                proposal={proposal}
                snapshot={snapshot}
                sendingKey={sendingKey}
                voteReason={voteReasons[proposal.publicId] || ""}
                commentDraft={commentDrafts[proposal.publicId] || ""}
                decisionNote={decisionNotes[proposal.publicId] || ""}
                onVoteReason={(value) =>
                  setVoteReasons((current) => ({
                    ...current,
                    [proposal.publicId]: value,
                  }))
                }
                onCommentDraft={(value) =>
                  setCommentDrafts((current) => ({
                    ...current,
                    [proposal.publicId]: value,
                  }))
                }
                onDecisionNote={(value) =>
                  setDecisionNotes((current) => ({
                    ...current,
                    [proposal.publicId]: value,
                  }))
                }
                onVote={(choice) => void castVote(proposal, choice)}
                onComment={() => void addComment(proposal)}
                onDecision={(action) => void decideProposal(proposal, action)}
              />
            ))}
          </div>
        ) : snapshot ? (
          <div className="rounded-[1.8rem] border border-dashed border-amber-100/15 bg-amber-100/[0.025] px-6 py-14 text-center">
            <Archive className="mx-auto h-8 w-8 text-amber-100/35" />
            <h3 className="mt-4 font-serif text-2xl font-bold text-amber-50">
              No scrolls in this alcove
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Choose another chamber filter, or place the first proposal when
              you enter with Steam.
            </p>
          </div>
        ) : (
          <div className="rounded-[1.8rem] border border-dashed border-rose-200/15 bg-rose-300/[0.025] px-6 py-14 text-center">
            <Archive className="mx-auto h-8 w-8 text-rose-100/35" />
            <h3 className="mt-4 font-serif text-2xl font-bold text-amber-50">
              The record room is unreachable
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              The chamber itself is still here, but its live Chronicle could not
              be read. Try again when the record keeper returns.
            </p>
            <button
              type="button"
              onClick={() => void loadSnapshot()}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/12 px-5 text-sm font-bold text-slate-200 transition hover:border-white/25 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" /> Reopen the record
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            icon: <ScrollText className="h-5 w-5" />,
            step: "01",
            title: "Present the scroll",
            body: "A signed citizen places a clear change before the Kingdom.",
          },
          {
            icon: <Swords className="h-5 w-5" />,
            step: "02",
            title: "Debate & cast",
            body: "The floor stays public; every account holds one support or oppose ballot.",
          },
          {
            icon: <Landmark className="h-5 w-5" />,
            step: "03",
            title: "Seal the decree",
            body: "A steward adopts, declines, or reopens—and the Chronicle never forgets.",
          },
        ].map((item) => (
          <article
            key={item.step}
            className="relative overflow-hidden border border-[#806139]/35 bg-[linear-gradient(145deg,rgba(20,16,11,0.95),rgba(3,3,4,0.99))] p-5 shadow-[inset_0_1px_0_rgba(255,224,163,0.05)]"
          >
            <div className="absolute right-4 top-2 font-serif text-6xl text-white/[0.025]">
              {item.step}
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-100/14 bg-amber-200/[0.055] text-amber-100/70">
              {item.icon}
            </div>
            <h3 className="mt-4 font-serif text-xl font-bold text-white">
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-[1.7rem] border border-amber-100/12 bg-[linear-gradient(110deg,rgba(47,34,15,0.7),rgba(4,8,15,0.96))] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100/55">
            Beyond the chamber
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Build ratified ambitions in the Forge, or forecast the Kingdom’s
            future at the Oracle.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/kingdom-forge"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:border-amber-100/25 hover:text-white"
          >
            Kingdom Forge <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/oracle"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:border-sky-100/25 hover:text-white"
          >
            The Oracle <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
