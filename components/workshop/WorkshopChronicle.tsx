"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Anvil,
  Bot,
  CalendarDays,
  ChevronDown,
  Clock3,
  ExternalLink,
  Hammer,
  Rocket,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChronicleEntry = {
  id: number;
  publicId: string;
  entryType: string;
  title: string;
  summary: string;
  body: string;
  dialogue: Array<{
    speaker: string;
    body: string;
    tone?: string | null;
  }>;
  lane: string;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  pinned: boolean;
  featuredOrder: number;
  occurredAt: string;
  publishedAt: string | null;
  artifacts: Array<{
    kind: string;
    label: string;
    url: string;
    alt: string | null;
    mimeType: string | null;
    sortOrder: number;
  }>;
};

type ChronicleCursor = {
  id: number;
};

type ChroniclePage = {
  entries: ChronicleEntry[];
  hasMore: boolean;
  nextCursor: ChronicleCursor | null;
};

type Props = {
  initialEntries: ChronicleEntry[];
  initialHasMore: boolean;
  initialNextCursor: ChronicleCursor | null;
};

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

const TYPE_PRESENTATION: Record<
  string,
  {
    Icon: typeof Hammer;
    accent: string;
    glow: string;
    dot: string;
  }
> = {
  milestone: {
    Icon: Sparkles,
    accent: "text-amber-100",
    glow: "from-amber-300/[0.12] via-orange-300/[0.035] to-transparent",
    dot: "bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.58)]",
  },
  deployment: {
    Icon: Rocket,
    accent: "text-emerald-100",
    glow: "from-emerald-300/[0.10] via-cyan-300/[0.025] to-transparent",
    dot: "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.5)]",
  },
  parser_discovery: {
    Icon: Wrench,
    accent: "text-cyan-100",
    glow: "from-cyan-300/[0.10] via-blue-300/[0.025] to-transparent",
    dot: "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.5)]",
  },
  design_decision: {
    Icon: ShieldCheck,
    accent: "text-violet-100",
    glow: "from-violet-300/[0.10] via-fuchsia-300/[0.025] to-transparent",
    dot: "bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.5)]",
  },
  ai_discussion: {
    Icon: Bot,
    accent: "text-fuchsia-100",
    glow: "from-fuchsia-300/[0.10] via-violet-300/[0.025] to-transparent",
    dot: "bg-fuchsia-300 shadow-[0_0_18px_rgba(240,171,252,0.5)]",
  },
  build_note: {
    Icon: Hammer,
    accent: "text-orange-100",
    glow: "from-orange-300/[0.09] via-amber-300/[0.025] to-transparent",
    dot: "bg-orange-300 shadow-[0_0_18px_rgba(253,186,116,0.5)]",
  },
};

function presentation(entry: ChronicleEntry) {
  return (
    TYPE_PRESENTATION[entry.entryType] ?? {
      Icon: Anvil,
      accent: "text-slate-100",
      glow: "from-white/[0.07] via-white/[0.015] to-transparent",
      dot: "bg-slate-300 shadow-[0_0_16px_rgba(203,213,225,0.36)]",
    }
  );
}

function dateKey(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(value) === dateKey(today.toISOString())) return "Today";
  if (dateKey(value) === dateKey(yesterday.toISOString())) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function moment(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isMajor(entry: ChronicleEntry) {
  return (
    entry.entryType === "milestone" ||
    entry.pinned ||
    entry.featuredOrder >= 100
  );
}

function isStrong(entry: ChronicleEntry) {
  return (
    isMajor(entry) ||
    entry.entryType === "deployment" ||
    entry.lane === "legendary"
  );
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export default function WorkshopChronicle({
  initialEntries,
  initialHasMore,
  initialNextCursor,
}: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [automaticLoadFailed, setAutomaticLoadFailed] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    () => new Set(),
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => {
    const ordered: Array<{
      key: string;
      label: string;
      entries: ChronicleEntry[];
    }> = [];

    for (const entry of entries) {
      const key = dateKey(entry.occurredAt);
      const existing = ordered.find((group) => group.key === key);

      if (existing) {
        existing.entries.push(entry);
      } else {
        ordered.push({
          key,
          label: dayLabel(entry.occurredAt),
          entries: [entry],
        });
      }
    }

    return ordered;
  }, [entries]);

  const toggleEntry = useCallback((publicId: string) => {
    setExpandedEntries((current) => {
      const next = new Set(current);

      if (next.has(publicId)) {
        next.delete(publicId);
      } else {
        next.add(publicId);
      }

      return next;
    });
  }, []);

  const loadOlder = useCallback(async () => {
    if (loading || !hasMore || !nextCursor) return;

    setLoading(true);

    try {
      const params = new URLSearchParams({
        beforeId: String(nextCursor.id),
        limit: "18",
      });

      const response = await fetch(
        `/api/workshop/chronicle?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Could not load older Workshop history.");
      }

      const payload = (await response.json()) as ChroniclePage;

      setEntries((current) => {
        const known = new Set(current.map((entry) => entry.publicId));
        const additions = payload.entries.filter(
          (entry) => !known.has(entry.publicId),
        );
        return [...current, ...additions];
      });

      setHasMore(payload.hasMore);
      setNextCursor(payload.nextCursor);
      setAutomaticLoadFailed(false);
    } catch (error) {
      console.warn("Workshop Chronicle pagination failed:", error);
      setAutomaticLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, nextCursor]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || automaticLoadFailed) return;

    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          void loadOlder();
        }
      },
      {
        rootMargin: "700px 0px",
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [automaticLoadFailed, hasMore, loadOlder]);

  if (entries.length === 0) return null;

  return (
    <section
      id="chronicle"
      className="relative overflow-hidden rounded-[2.15rem] border border-amber-100/12 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.09),transparent_29%),radial-gradient(circle_at_88%_4%,rgba(56,189,248,0.055),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.97))] px-4 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:px-7 sm:py-10 lg:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-white/[0.07] pb-7 sm:flex sm:items-end sm:justify-between sm:gap-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-100/58">
              <ScrollText className="h-4 w-4" />
              Living History
            </div>

            <h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl lg:text-5xl">
              The Workshop Chronicle
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">
              Verified releases and decisions, newest first. The important part
              stays visible; hashes, receipts, and technical detail open only
              when you need them.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
            <div className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {entries.length} loaded records
            </div>
            <div className="rounded-full border border-amber-200/12 bg-amber-300/[0.045] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/62">
              Newest first
            </div>
          </div>
        </header>

        <div className="relative mt-8">
          <div className="pointer-events-none absolute bottom-0 left-[1.08rem] top-0 w-px bg-gradient-to-b from-amber-200/38 via-white/10 to-transparent sm:left-[1.3rem]" />

          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <div className="relative z-10 flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-amber-100/18 bg-slate-950 text-amber-100 shadow-[0_8px_28px_rgba(0,0,0,0.38)] sm:h-10 sm:w-10">
                    <CalendarDays className="h-4 w-4" />
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-100 sm:text-base">
                      {group.label}
                    </h3>
                    <div className="h-px min-w-6 flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-600">
                      {group.entries.length} {group.entries.length === 1 ? "record" : "records"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-4 pl-12 sm:pl-16">
                  {group.entries.map((entry) => (
                    <ChronicleEntry
                      key={entry.publicId}
                      entry={entry}
                      expanded={expandedEntries.has(entry.publicId)}
                      onToggle={() => toggleEntry(entry.publicId)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div ref={sentinelRef} className="h-2" />

          {loading ? (
            <div className="mt-8 pl-12 text-xs uppercase tracking-[0.22em] text-slate-600 sm:pl-16">
              Opening older pages of the Chronicle…
            </div>
          ) : null}

          {automaticLoadFailed && hasMore ? (
            <div className="mt-8 pl-12 sm:pl-16">
              <button
                type="button"
                onClick={() => void loadOlder()}
                className="cursor-pointer rounded-full border border-white/12 bg-white/[0.035] px-5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                Load older history
              </button>
            </div>
          ) : null}

          {!hasMore && entries.length > 7 ? (
            <div className="mt-10 pl-12 text-[10px] uppercase tracking-[0.28em] text-slate-700 sm:pl-16">
              The Chronicle begins here.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ChronicleEntry({
  entry,
  expanded,
  onToggle,
}: {
  entry: ChronicleEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { Icon, accent, glow, dot } = presentation(entry);
  const major = isMajor(entry);
  const strong = isStrong(entry);
  const detailsId = `chronicle-details-${entry.publicId}`;
  const hasTechnicalRecord = Boolean(
    entry.body || entry.dialogue.length > 0 || entry.artifacts.length > 0,
  );
  const externalLink = entry.linkUrl ? isExternalUrl(entry.linkUrl) : false;

  return (
    <article id={entry.publicId} className="relative scroll-mt-28">
      <div
        className={[
          "absolute -left-[2.02rem] top-7 h-3 w-3 rounded-full border border-slate-950 sm:-left-[2.45rem]",
          dot,
        ].join(" ")}
        aria-hidden="true"
      />

      <div
        className={[
          "overflow-hidden border bg-gradient-to-br",
          glow,
          major
            ? "rounded-[1.55rem] border-amber-100/16 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-6"
            : strong
              ? "rounded-[1.4rem] border-white/10 p-5"
              : "rounded-[1.25rem] border-white/[0.075] p-4 sm:p-5",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div
            className={[
              "flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.22em]",
              accent,
            ].join(" ")}
          >
            <Icon className={major ? "h-4 w-4" : "h-3.5 w-3.5"} />
            {TYPE_LABELS[entry.entryType] || entry.entryType}
            {entry.pinned ? (
              <span className="rounded-full border border-current/15 px-2 py-0.5 text-[8px] tracking-[0.16em] opacity-65">
                Featured
              </span>
            ) : null}
          </div>

          <time className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-slate-600">
            <Clock3 className="h-3 w-3" />
            {moment(entry.occurredAt)}
          </time>
        </div>

        <h4
          className={[
            "max-w-4xl font-semibold text-white",
            major
              ? "mt-3 font-serif text-2xl leading-tight sm:text-3xl"
              : strong
                ? "mt-3 text-xl leading-snug"
                : "mt-2.5 text-base leading-snug sm:text-lg",
          ].join(" ")}
        >
          {entry.title}
        </h4>

        {entry.summary ? (
          <p
            className={[
              "max-w-4xl text-slate-300",
              major
                ? "mt-3 text-[15px] leading-7"
                : "mt-2.5 text-sm leading-6",
            ].join(" ")}
          >
            {entry.summary}
          </p>
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
              sizes="(max-width: 640px) 100vw, 80vw"
              unoptimized
            />
          )
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {hasTechnicalRecord ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/18 hover:bg-white/[0.05] hover:text-white"
            >
              {expanded ? "Hide technical record" : "Read technical record"}
              <ChevronDown
                className={[
                  "h-3.5 w-3.5 transition-transform",
                  expanded ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>
          ) : null}

          {entry.linkUrl ? (
            <Link
              href={entry.linkUrl}
              target={externalLink ? "_blank" : undefined}
              rel={externalLink ? "noreferrer" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/12 bg-amber-300/[0.045] px-3.5 py-2 text-xs font-semibold text-amber-100/78 transition hover:border-amber-200/24 hover:bg-amber-300/[0.08] hover:text-amber-50"
            >
              {entry.linkLabel || "Open build"}
              {externalLink ? <ExternalLink className="h-3.5 w-3.5" /> : null}
            </Link>
          ) : null}
        </div>

        {expanded && hasTechnicalRecord ? (
          <div
            id={detailsId}
            className="mt-4 border-t border-white/[0.075] pt-4"
          >
            {entry.body ? (
              <p className="max-w-5xl whitespace-pre-wrap text-sm leading-7 text-slate-400 [overflow-wrap:anywhere]">
                {entry.body}
              </p>
            ) : null}

            {entry.dialogue.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {entry.dialogue.map((line, index) => (
                  <blockquote
                    key={`${entry.publicId}-dialogue-${index}`}
                    className="rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3"
                  >
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      {line.speaker}
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">
                      {line.body}
                    </p>
                  </blockquote>
                ))}
              </div>
            ) : null}

            {entry.artifacts.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {entry.artifacts.map((artifact) => {
                  const artifactExternal = isExternalUrl(artifact.url);

                  return (
                    <Link
                      key={`${entry.publicId}-${artifact.kind}-${artifact.sortOrder}`}
                      href={artifact.url}
                      target={artifactExternal ? "_blank" : undefined}
                      rel={artifactExternal ? "noreferrer" : undefined}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      {artifact.label}
                      {artifactExternal ? (
                        <ExternalLink className="h-3.5 w-3.5" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
