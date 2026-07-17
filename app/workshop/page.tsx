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
    "Watch AoE2WAR being forged through curated build notes, parser discoveries, AI discussions, and deployments.",
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

export default async function WorkshopPage() {
  const prisma = getPrisma();

  const [data, chronicle] = await Promise.all([
    loadPublicWorkshop(prisma),
    loadWorkshopChroniclePage(prisma, { take: 18 }),
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
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:items-end">
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
            <h1 className="mt-4 max-w-5xl font-serif text-5xl leading-[0.95] sm:text-7xl lg:text-[5.6rem]">
              The strange machine is forged in public.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              {data.status.description}
            </p>
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
              Now on the workbench
            </div>
            <div className="mt-3 text-2xl font-semibold">
              {data.status.currentProject || "Published kingdom work"}
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
            Tony may publish a chosen Scribe, Grimer, or Codex exchange as a
            curated AI Discussion. Private chats are never mirrored
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
            private messages, security findings, signer material, raw prompts,
            or financial secrets can enter this page without an operator
            creating and publishing a sanitized Workshop record.
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
