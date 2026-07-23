"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Anvil,
  Bot,
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
  }
> = {
  milestone: {
    Icon: Sparkles,
    accent: "text-amber-100",
    glow: "from-amber-300/[0.12] via-orange-300/[0.035] to-transparent",
  },
  deployment: {
    Icon: Rocket,
    accent: "text-emerald-100",
    glow: "from-emerald-300/[0.10] via-cyan-300/[0.025] to-transparent",
  },
  parser_discovery: {
    Icon: Wrench,
    accent: "text-cyan-100",
    glow: "from-cyan-300/[0.10] via-blue-300/[0.025] to-transparent",
  },
  design_decision: {
    Icon: ShieldCheck,
    accent: "text-violet-100",
    glow: "from-violet-300/[0.10] via-fuchsia-300/[0.025] to-transparent",
  },
  ai_discussion: {
    Icon: Bot,
    accent: "text-fuchsia-100",
    glow: "from-fuchsia-300/[0.10] via-violet-300/[0.025] to-transparent",
  },
  build_note: {
    Icon: Hammer,
    accent: "text-orange-100",
    glow: "from-orange-300/[0.09] via-amber-300/[0.025] to-transparent",
  },
};

function presentation(entry: ChronicleEntry) {
  return (
    TYPE_PRESENTATION[entry.entryType] ?? {
      Icon: Anvil,
      accent: "text-slate-100",
      glow: "from-white/[0.07] via-white/[0.015] to-transparent",
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

  const alignmentByPublicId = useMemo(() => {
    return new Map<string, "left" | "right">(
      entries.map((entry, index) => [
        entry.publicId,
        index % 2 === 0 ? "left" : "right",
      ]),
    );
  }, [entries]);

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
      className="relative overflow-hidden rounded-[2.15rem] border border-amber-100/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.09),transparent_31%),linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.96))] px-5 py-8 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:px-8 sm:py-10"
    >
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.36em] text-amber-100/55">
            <ScrollText className="h-4 w-4" />
            Living History
          </div>

          <h2 className="mt-3 font-serif text-4xl sm:text-5xl">
            The Workshop Chronicle
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            The story of how Emaren, AI, and the Kingdom are forging AoE2WAR —
            newest work first, one build at a time.
          </p>
        </header>

        <div className="relative mt-10">
          <div className="pointer-events-none absolute bottom-0 left-[1.45rem] top-0 w-px bg-gradient-to-b from-amber-200/30 via-white/8 to-transparent sm:left-1/2" />

          <div className="space-y-12">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="relative z-10 mb-6 flex sm:justify-center">
                  <div className="rounded-full border border-amber-100/12 bg-slate-950 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/70 shadow-xl">
                    {group.label}
                  </div>
                </div>

                <div className="space-y-5">
                  {group.entries.map((entry) => (
                    <ChronicleEntry
                      key={entry.publicId}
                      entry={entry}
                      align={alignmentByPublicId.get(entry.publicId) ?? "left"}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div ref={sentinelRef} className="h-2" />

          {loading ? (
            <div className="mt-8 text-center text-xs uppercase tracking-[0.24em] text-slate-600">
              Opening older pages of the Chronicle…
            </div>
          ) : null}

          {automaticLoadFailed && hasMore ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                className="rounded-full border border-white/12 bg-white/[0.035] px-5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                Load older history
              </button>
            </div>
          ) : null}

          {!hasMore && entries.length > 7 ? (
            <div className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-slate-700">
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
  align,
}: {
  entry: ChronicleEntry;
  align: "left" | "right";
}) {
  const { Icon, accent, glow } = presentation(entry);
  const major = isMajor(entry);
  const strong = isStrong(entry);

  return (
    <article
      id={entry.publicId}
      className={[
        "relative grid sm:grid-cols-2",
        align === "right" ? "sm:[&>*]:col-start-2" : "",
      ].join(" ")}
    >
      <div
        className={[
          "relative ml-12 sm:ml-0",
          align === "left" ? "sm:pr-10" : "sm:pl-10",
        ].join(" ")}
      >
        <div
          className={[
            "absolute top-6 h-3.5 w-3.5 rounded-full border border-amber-50/60 bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.5)]",
            "-left-[2.98rem]",
            align === "left"
              ? "sm:-right-[0.45rem] sm:left-auto"
              : "sm:-left-[0.45rem]",
          ].join(" ")}
        />

        <div
          className={[
            "overflow-hidden border bg-gradient-to-br",
            glow,
            major
              ? "rounded-[1.8rem] border-amber-100/18 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-7"
              : strong
                ? "rounded-[1.55rem] border-white/11 p-5"
                : "rounded-[1.35rem] border-white/8 p-4",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4">
            <div
              className={[
                "flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em]",
                accent,
              ].join(" ")}
            >
              <Icon className={major ? "h-4 w-4" : "h-3.5 w-3.5"} />
              {TYPE_LABELS[entry.entryType] || entry.entryType}
            </div>

            <time className="shrink-0 text-[9px] text-slate-600">
              {moment(entry.occurredAt)}
            </time>
          </div>

          <h3
            className={[
              "font-semibold text-white",
              major
                ? "mt-4 font-serif text-3xl leading-tight"
                : strong
                  ? "mt-3 text-xl"
                  : "mt-2 text-base",
            ].join(" ")}
          >
            {entry.title}
          </h3>

          {entry.summary ? (
            <p
              className={[
                "text-slate-300",
                major ? "mt-4 text-base leading-7" : "mt-3 text-sm leading-6",
              ].join(" ")}
            >
              {entry.summary}
            </p>
          ) : null}

          {major && entry.body ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400">
              {entry.body}
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
                className="mt-5 max-h-[32rem] w-full rounded-2xl border border-white/10 object-cover"
                src={entry.mediaUrl}
                alt={entry.mediaAlt || entry.title}
                width={1200}
                height={800}
                sizes="(max-width: 640px) 100vw, 50vw"
                unoptimized
              />
            )
          ) : null}

          {entry.linkUrl ? (
            <Link
              href={entry.linkUrl}
              className="mt-5 inline-flex rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.06]"
            >
              {entry.linkLabel || "Open build"}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
