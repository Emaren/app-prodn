import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Anvil,
  Bot,
  Flame,
  Hammer,
  Radio,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import WorkshopAsk from "@/components/workshop/WorkshopAsk";
import WorkshopChronicle from "@/components/workshop/WorkshopChronicle";
import WorkshopSponsor from "@/components/workshop/WorkshopSponsor";
import { loadPublicParserObservatory } from "@/lib/parserObservatory";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicWorkshop,
  loadWorkshopChroniclePage,
  type PublicWorkshop,
} from "@/lib/workshop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The Workshop",
  description:
    "Follow AoE2WAR's current production state: battle truth, public Match Chronicles, challenge custody, DESYNC handling, settlement, speed proof, and the Parser Observatory.",
};

type Entry = PublicWorkshop["entries"][number];

const LANE_COPY = {
  on_anvil: {
    title: "On the Anvil",
    body: "Currently being built",
    icon: Anvil,
    tone: "amber",
  },
  next_forge: {
    title: "Next into the Forge",
    body: "Upcoming work deliberately published",
    icon: Wrench,
    tone: "cyan",
  },
  fresh_forge: {
    title: "Fresh from the Forge",
    body: "Recently completed",
    icon: Flame,
    tone: "emerald",
  },
  legendary: {
    title: "Legendary Builds",
    body: "Major historical milestones",
    icon: Sparkles,
    tone: "violet",
  },
} as const;

const TYPE_LABELS: Record<string, string> = {
  build_note: "Build Note",
  ai_discussion: "AI Discussion",
  design_decision: "Design Decision",
  screenshot: "Screenshot",
  image: "Image",
  deployment: "Deployment",
  parser_discovery: "Parser Discovery",
  video: "Video",
  livestream: "Livestream",
  audio: "Audio",
  milestone: "Milestone",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusCopy(data: PublicWorkshop) {
  if (!data.status.isOpen) return { label: "WORKSHOP RESTS", tone: "slate" };
  if (data.stream || data.status.activityMode === "streaming")
    return { label: "LIVE BUILD STREAM", tone: "red" };
  if (data.status.activityMode === "building_live")
    return { label: "LIVE CONSTRUCTION", tone: "red" };
  if (data.status.activityMode === "ai_session_live")
    return { label: "AI SESSION LIVE", tone: "cyan" };
  if (data.status.activityMode === "major_deployment")
    return { label: "MAJOR DEPLOYMENT", tone: "amber" };
  if (data.status.activityMode === "maintenance")
    return { label: "FORGE MAINTENANCE", tone: "amber" };
  if (data.status.activityMode === "special_event")
    return { label: "SPECIAL EVENT", tone: "violet" };
  return { label: "THE WORKSHOP IS OPEN", tone: "amber" };
}

function CampaignMetric({
  label,
  value,
  note,
  alert = false,
}: {
  label: string;
  value: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[1.35rem] border p-4 sm:p-5",
        alert
          ? "border-amber-200/16 bg-amber-300/[0.055]"
          : "border-white/9 bg-black/20",
      ].join(" ")}
    >
      <div
        className={[
          "text-2xl font-semibold sm:text-3xl",
          alert ? "text-amber-100" : "text-white",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-slate-600">
        {note}
      </div>
    </div>
  );
}

export default async function WorkshopPage() {
  const prisma = getPrisma();

  const [data, chronicle, observatory] = await Promise.all([
    loadPublicWorkshop(prisma),
    loadWorkshopChroniclePage(prisma, { take: 18 }),
    loadPublicParserObservatory(),
  ]);

  const signal = statusCopy(data);
  const feed = data.entries
    .filter((entry) => entry.lane === "work_feed" || entry.pinned)
    .slice(0, 14);

  return (
    <main className="space-y-7 py-7 text-white">
      <section className="relative overflow-hidden rounded-[2.35rem] border border-amber-100/14 bg-[radial-gradient(circle_at_16%_0%,rgba(251,146,60,0.22),transparent_31%),radial-gradient(circle_at_83%_8%,rgba(34,211,238,0.13),transparent_29%),linear-gradient(145deg,#1a0d08,#07111b_54%,#04070c)] px-6 py-9 shadow-[0_30px_120px_rgba(0,0,0,0.34)] sm:px-11 sm:py-12">
        <div className="pointer-events-none absolute -left-16 bottom-[-8rem] h-72 w-72 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="pointer-events-none absolute right-[8%] top-[-8rem] h-72 w-72 rounded-full bg-cyan-300/8 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-100/16 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-50">
              <span
                className={`h-2.5 w-2.5 rounded-full ${signal.tone === "red" ? "animate-pulse bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.8)]" : data.status.isOpen ? "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.6)]" : "bg-slate-500"}`}
              />
              {signal.label}
            </div>
            <div className="mt-6 text-xs font-bold uppercase tracking-[0.44em] text-orange-100/55">
              AoE2WAR · Live Build Culture
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="#workbench"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-200 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-100"
              >
                <Hammer className="h-4 w-4" /> Enter the forge
              </Link>
              <Link
                href="/radio"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-fuchsia-100/18 bg-fuchsia-300/[0.06] px-5 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-300/10"
              >
                <Radio className="h-4 w-4" /> Let the Workshop sing
              </Link>
            </div>
          </div>
          <div className="rounded-[1.7rem] border border-white/10 bg-black/28 p-6 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
              Current production state
            </div>
            <div className="mt-3 text-2xl font-semibold">
              Pass 7 · Live Betting · Human Review
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <SignalMetric
                label="Published records"
                value={String(data.entries.length)}
              />
              <SignalMetric
                label="Forge state"
                value={
                  data.status.isLive
                    ? "Live"
                    : data.status.isOpen
                      ? "Open"
                      : "Resting"
                }
              />
            </div>
            <div className="mt-4 text-[10px] leading-5 text-slate-500">
              Updated {formatDate(data.status.updatedAt)} · Public state is
              operator-controlled.
            </div>
          </div>
        </div>
      </section>

      <section
        id="current-campaign"
        className="relative overflow-hidden rounded-[2.15rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.15),transparent_31%),radial-gradient(circle_at_88%_15%,rgba(251,191,36,0.13),transparent_28%),linear-gradient(145deg,#061521,#080b12_56%,#120a05)] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.32)] sm:p-9"
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/35 to-transparent" />

        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-cyan-100/60">
                <Wrench className="h-4 w-4" />
                Current Campaign
              </div>

              <span className="rounded-full border border-amber-200/16 bg-amber-300/[0.07] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/75">
                Current Front · Deterministic Evidence
              </span>
            </div>

            <h2 className="mt-5 font-serif text-5xl leading-[0.92] text-white sm:text-6xl lg:text-7xl">
              Deterministic Evidence.
            </h2>

            {/* AOE2WAR_WORKSHOP_DETERMINISTIC_EVIDENCE_20260724 */}
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Pass 6 mapped the unresolved frontier without weakening result
              gates. Pass 7 now preserves exact uneven two-team structure inside
              the private Engine Room, while degraded metadata fragments remain
              fail-closed. Candidate runs still cannot rewrite public results,
              markets, wagers, or settlement. The human Review Desk remains the
              command tower for adjudication, DESYNC truth, corrections, and
              supersession. Automatic recovery is live, 111 exact rosters crossed
              a zero-result-authority bridge, and open winner markets now drive
              the Bet live action without allowing DESYNC markets to hijack the
              battle card.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <CampaignMetric
                label="Effective replay results"
                value={observatory.corpus.resolvedResults.toLocaleString()}
                note="Current public final replay-record grain."
              />

              <CampaignMetric
                label="Result coverage"
                value={`${(observatory.corpus.resultCoverageBps / 100).toFixed(1)}%`}
                note={`${observatory.corpus.unresolvedResults.toLocaleString()} replay records still lack decisive trustworthy result truth.`}
                alert={observatory.corpus.unresolvedResults > 0}
              />

              <CampaignMetric
                label="Pass 7 identity"
                value="Live"
                note="mgz 1.8.51 · schema 2026-07-24.1 · deterministic evidence pass 7."
              />

              <CampaignMetric
                label="Automatic recovery"
                value="1 min"
                note="Final recordings enter a candidate-only worker with no public or financial authority."
              />

              <CampaignMetric
                label="Human Review Desk"
                value="Preserved"
                note="Reviewers retain adjudication, DESYNC, correction, and supersession authority."
              />

              <CampaignMetric
                label="Live winner market"
                value="Bet live"
                note="Open or live winner markets drive the primary CTA; DESYNC markets remain separate."
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/challenge"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-100 px-5 text-sm font-bold text-slate-950 transition hover:bg-white"
              >
                <ShieldCheck className="h-4 w-4" />
                Open the Challenge Hall
              </Link>

              <Link
                href="/game-stats"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-100/18 bg-cyan-300/[0.06] px-5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/10"
              >
                Parser Observatory
              </Link>

              <Link
                href="/speed"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                Speed Observatory
              </Link>
            </div>
          </div>

          <aside className="rounded-[1.7rem] border border-amber-100/12 bg-black/28 p-6 sm:p-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/55">
              Current Production State
            </div>

            <h3 className="mt-3 font-serif text-3xl text-white">
              The observable war machine
            </h3>

            <div className="mt-6 space-y-4">
              {[
                ["Pass 7 candidate recovery", "Active"],
                ["Exact uneven teams", "Private only"],
                ["Metadata fragments", "Fail-closed"],
                ["Human Review Desk", "Preserved"],
                ["Winner-market live CTA", "Deployed"],
                ["DESYNC market separation", "Protected"],
                ["Settlement authority", "Unchanged"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="text-sm leading-5 text-slate-300">
                    {label}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/75">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-xs leading-6 text-slate-500">
              The machine now arrives at the Review Desk with stronger structured
              evidence. It does not remove the reviewer. Candidate evidence, human
              adjudication, DESYNC provenance, public projection, betting, and
              settlement remain distinct authority layers.
            </p>
          </aside>
        </div>

        <div className="relative mt-7 rounded-2xl border border-white/8 bg-black/20 px-5 py-4 text-xs leading-6 text-slate-500">
          <span className="font-semibold text-slate-300">Truth boundary:</span>{" "}
          Pass 7 observations remain candidate-only unless an explicit,
          append-only promotion grants a narrower authority. The human Review Desk
          remains available even as machine evidence improves. Winner markets may
          become visible during live play, but no live CTA grants result, payout, or
          settlement authority. DESYNC truth, adjudication, corrections, and
          supersession remain independently preserved.
        </div>
      </section>

      {data.stream ? (
        <section className="overflow-hidden rounded-[1.9rem] border border-red-300/20 bg-red-500/[0.06] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-red-100/70">
                Live from the Workshop
              </div>
              <h2 className="mt-2 text-3xl font-semibold">
                {data.stream.title}
              </h2>
            </div>
            <span className="animate-pulse rounded-full bg-red-400 px-4 py-2 text-xs font-bold text-red-950">
              LIVE
            </span>
          </div>
          {data.stream.description ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              {data.stream.description}
            </p>
          ) : null}
          {data.stream.playbackUrl ? (
            <video
              className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black"
              controls
              playsInline
              preload="metadata"
              poster={data.stream.thumbnailUrl || undefined}
              src={data.stream.playbackUrl}
            />
          ) : data.stream.embedUrl ? (
            <iframe
              className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black"
              src={data.stream.embedUrl}
              title={data.stream.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-slate-400">
              The live signal is active. Video is not attached to the public
              projection.
            </div>
          )}
        </section>
      ) : null}

      <WorkshopSponsor />

      <WorkshopChronicle
        initialEntries={chronicle.entries}
        initialHasMore={chronicle.hasMore}
        initialNextCursor={chronicle.nextCursor}
      />

      <section id="workbench" className="grid gap-5 md:grid-cols-2">
        {(
          Object.entries(LANE_COPY) as Array<
            [keyof typeof LANE_COPY, (typeof LANE_COPY)[keyof typeof LANE_COPY]]
          >
        ).map(([lane, copy]) => {
          const entries = data.entries
            .filter((entry) => entry.lane === lane)
            .slice(0, 8);
          const Icon = copy.icon;
          return (
            <section
              key={lane}
              className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-7"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-100/12 bg-amber-300/[0.06] text-amber-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.28em] text-amber-100/58">
                    {copy.title}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{copy.body}</div>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {entries.length ? (
                  entries.map((entry) => (
                    <ProjectRow key={entry.publicId} entry={entry} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
                    Nothing has been deliberately published in this lane.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </section>

      <section className="rounded-[1.9rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-orange-100/58">
              Live Work Feed
            </div>
            <h2 className="mt-2 text-3xl font-semibold">
              Selected sparks from the forge.
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-200" /> Explicitly
            published only
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {(feed.length ? feed : data.entries.slice(0, 12)).map((entry) => (
            <WorkshopEntryCard key={entry.publicId} entry={entry} />
          ))}
        </div>
      </section>

      <WorkshopAsk />

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.8rem] border border-fuchsia-100/12 bg-fuchsia-300/[0.045] p-6 sm:p-8">
          <div className="flex items-center gap-3 text-fuchsia-100">
            <Bot className="h-5 w-5" />
            <div className="text-xs font-bold uppercase tracking-[0.28em]">
              AI in the Workshop
            </div>
          </div>
          <h2 className="mt-4 text-3xl font-semibold">
            Selected collaboration can become canon.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Tony may publish a chosen Scribe, Grimer, or AI build exchange as
            a curated AI Discussion. Private chats are never mirrored
            automatically; each public excerpt is a separate app record.
          </p>
          <Link
            href="/ai"
            className="mt-5 inline-flex rounded-full border border-fuchsia-100/18 px-4 py-2 text-sm font-semibold text-fuchsia-50"
          >
            Meet the AI Council
          </Link>
        </div>
        <div className="rounded-[1.8rem] border border-emerald-100/12 bg-emerald-300/[0.045] p-6 sm:p-8">
          <div className="flex items-center gap-3 text-emerald-100">
            <ShieldCheck className="h-5 w-5" />
            <div className="text-xs font-bold uppercase tracking-[0.28em]">
              Publication Boundary
            </div>
          </div>
          <h2 className="mt-4 text-3xl font-semibold">
            The window is deliberate.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            No terminal output, credentials, environment values, database URLs,
            private DMs, security findings, signer material, raw prompts, or financial
            secrets can enter this page without an operator creating and publishing a
            sanitized Workshop record. Public Match Rooms are separate Challenge-scoped
            records and contain only their own participant conversation and protocol history.
          </p>
        </div>
      </section>
    </main>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function ProjectRow({ entry }: { entry: Entry }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.028] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-100/52">
            {TYPE_LABELS[entry.entryType] || entry.entryType}
          </div>
          <h3 className="mt-2 font-semibold text-white">{entry.title}</h3>
        </div>
        {entry.pinned ? (
          <Sparkles className="h-4 w-4 shrink-0 text-amber-200" />
        ) : null}
      </div>
      {entry.summary ? (
        <p className="mt-2 text-sm leading-6 text-slate-400">{entry.summary}</p>
      ) : null}
    </article>
  );
}

function WorkshopEntryCard({ entry }: { entry: Entry }) {
  return (
    <article
      id={entry.publicId}
      className="overflow-hidden rounded-[1.5rem] border border-white/9 bg-white/[0.028]"
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-100/58">
            {TYPE_LABELS[entry.entryType] || entry.entryType}
          </div>
          <time className="text-[10px] text-slate-600">
            {formatDate(entry.occurredAt)}
          </time>
        </div>
        <h3 className="mt-3 text-2xl font-semibold">{entry.title}</h3>
        {entry.summary ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {entry.summary}
          </p>
        ) : null}
        {entry.body ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400">
            {entry.body}
          </p>
        ) : null}
        {entry.dialogue.length ? (
          <div className="mt-5 space-y-3">
            {entry.dialogue.map((turn, index) => (
              <div
                key={`${turn.speaker}-${index}`}
                className="rounded-2xl border border-fuchsia-100/10 bg-fuchsia-300/[0.035] p-4"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-100/65">
                  {turn.speaker}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                  {turn.body}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {entry.mediaUrl ? (
          entry.mediaKind === "video" ? (
            <video
              className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black object-cover"
              controls
              preload="metadata"
              src={entry.mediaUrl}
            />
          ) : entry.mediaKind === "audio" ? (
            <audio
              className="mt-5 w-full"
              controls
              preload="none"
              src={entry.mediaUrl}
            />
          ) : (
            <Image
              className="mt-5 max-h-[34rem] w-full rounded-2xl border border-white/10 object-cover"
              src={entry.mediaUrl}
              alt={entry.mediaAlt || entry.title}
              width={1400}
              height={900}
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
            />
          )
        ) : null}
        {entry.linkUrl ? (
          <Link
            href={entry.linkUrl}
            className="mt-5 inline-flex rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-white"
          >
            {entry.linkLabel || "Open build"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
