"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Expand,
  Flame,
  MessageCircle,
  MonitorPlay,
  Pause,
  Play,
  RectangleVertical,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";

import { useNearViewport } from "@/hooks/useNearViewport";

type ShortsView = "vertical" | "wide";
type ShortReaction = "up" | "down" | null;

type Aoe2Short = {
  id: string;
  title: string;
  signal: string;
  duration: string;
  videoSrc: string;
  posterSrc: string;
  uploader: string;
  uploaderHref: string;
  uploaderAvatar: string;
};

const SHORTS: readonly Aoe2Short[] = [
  {
    id: "chronotrigger-opening",
    title: "Emaren vs Chronotrigger",
    signal: "Imperial Age · Death Match",
    duration: "0:28",
    videoSrc: "/watch-loops/emaren-vs-chronotrigger.mp4",
    posterSrc: "/shorts/posters/castle-break.webp",
    uploader: "Emaren",
    uploaderHref: "/players/by-name/Emaren",
    uploaderAvatar: "/champions/players/emaren.thumb.webp",
  },
  {
    id: "julio-crossfire",
    title: "Julio enters the crossfire",
    signal: "Founders Cup tape",
    duration: "0:32",
    videoSrc: "/watch/previews/emaren-vs-julio-alvarez.mp4",
    posterSrc: "/shorts/posters/julio-crossfire.webp",
    uploader: "Emaren",
    uploaderHref: "/players/by-name/Emaren",
    uploaderAvatar: "/champions/players/emaren.thumb.webp",
  },
  {
    id: "koola-fortress",
    title: "The fortress wakes up",
    signal: "Emaren vs KoolaMuMoMu",
    duration: "0:43",
    videoSrc: "/watch/previews/emaren-vs-koolamumomu.mp4",
    posterSrc: "/shorts/posters/koola-fortress.webp",
    uploader: "Emaren",
    uploaderHref: "/players/by-name/Emaren",
    uploaderAvatar: "/champions/players/emaren.thumb.webp",
  },
  {
    id: "ghjam-siege",
    title: "Jungle siege line",
    signal: "Emaren vs Ghjambattista2B",
    duration: "1:12",
    videoSrc: "/watch-loops/emaren-vs-ghjambattista2b.mp4",
    posterSrc: "/shorts/posters/ghjam-siege.webp",
    uploader: "Emaren",
    uploaderHref: "/players/by-name/Emaren",
    uploaderAvatar: "/champions/players/emaren.thumb.webp",
  },
  {
    id: "divided-raid",
    title: "One raid changes the map",
    signal: "Emaren vs Divided",
    duration: "1:16",
    videoSrc: "/watch/previews/emaren-vs-divided.mp4",
    posterSrc: "/shorts/posters/divided-raid.webp",
    uploader: "Emaren",
    uploaderHref: "/players/by-name/Emaren",
    uploaderAvatar: "/champions/players/emaren.thumb.webp",
  },
];

const REACTION_STORAGE_KEY = "aoe2war:shorts-reactions:v1";

function ShortLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden border border-amber-100/28 bg-[linear-gradient(145deg,#50100e,#160809_52%,#05070d)] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_30px_rgba(185,28,28,0.2)] ${
        compact ? "h-9 w-9 rounded-[0.8rem]" : "h-12 w-12 rounded-[1rem]"
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-300 via-red-600 to-amber-400" />
      <Play
        className={compact ? "h-4 w-4 fill-current" : "h-5 w-5 fill-current"}
      />
    </span>
  );
}

function UploaderLink({
  short,
  compact = false,
}: {
  short: Aoe2Short;
  compact?: boolean;
}) {
  return (
    <Link
      href={short.uploaderHref}
      className="group/uploader inline-flex min-w-0 items-center gap-2.5"
      onClick={(event) => event.stopPropagation()}
    >
      <span
        className={`relative shrink-0 overflow-hidden rounded-full border border-amber-100/26 bg-black ${
          compact ? "h-7 w-7" : "h-9 w-9"
        }`}
      >
        <Image
          src={short.uploaderAvatar}
          alt=""
          fill
          sizes={compact ? "28px" : "36px"}
          className="object-cover"
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate font-semibold text-amber-50 transition group-hover/uploader:text-amber-200 ${
            compact ? "text-[11px]" : "text-sm"
          }`}
        >
          {short.uploader}
        </span>
        {!compact ? (
          <span className="block text-[9px] uppercase tracking-[0.2em] text-slate-500">
            Warrior channel
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export default function Aoe2ShortsTile() {
  const { ref: tileRef, isNear: mediaReady } = useNearViewport<HTMLElement>("0px");
  const [view, setView] = useState<ShortsView>("vertical");
  const [activeIndex, setActiveIndex] = useState(0);
  const [reelOpen, setReelOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, ShortReaction>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const activeShort = SHORTS[activeIndex];
  const activeReaction = reactions[activeShort.id] ?? null;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REACTION_STORAGE_KEY);
      if (stored) {
        setReactions(JSON.parse(stored) as Record<string, ShortReaction>);
      }
    } catch {
      // Local reactions are a progressive enhancement.
    }
  }, []);

  useEffect(() => {
    if (!reelOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReelOpen(false);
      if (event.key === "ArrowDown") {
        setCommentsOpen(false);
        setActiveIndex((current) => (current + 1) % SHORTS.length);
      }
      if (event.key === "ArrowUp") {
        setCommentsOpen(false);
        setActiveIndex(
          (current) => (current - 1 + SHORTS.length) % SHORTS.length
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [reelOpen]);

  useEffect(() => {
    if (!reelOpen) return;
    setShareNotice(null);
    setPlaying(true);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    void video.play().catch(() => {
      setPlaying(false);
    });
  }, [activeIndex, reelOpen]);

  const moveReel = useCallback((direction: 1 | -1) => {
    setCommentsOpen(false);
    setActiveIndex(
      (current) => (current + direction + SHORTS.length) % SHORTS.length
    );
  }, []);

  function openReel(index: number, showComments = false) {
    setActiveIndex(index);
    setCommentsOpen(showComments);
    setReelOpen(true);
  }

  function setReaction(reaction: Exclude<ShortReaction, null>) {
    setReactions((current) => {
      const nextReaction = current[activeShort.id] === reaction ? null : reaction;
      const next = { ...current, [activeShort.id]: nextReaction };
      try {
        window.localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The control still works for the current session.
      }
      return next;
    });
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  async function shareActiveShort() {
    const shareUrl = `${window.location.origin}/#aoe2-shorts`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: activeShort.title,
          text: `AoE2 Shorts · ${activeShort.title}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareNotice("Link copied");
      }
    } catch {
      // A dismissed share sheet should leave the reel untouched.
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startY = touchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY;
    touchStartYRef.current = null;
    if (startY == null || endY == null) return;
    const distance = endY - startY;
    if (Math.abs(distance) < 55) return;
    moveReel(distance < 0 ? 1 : -1);
  }

  return (
    <>
      <section
        ref={tileRef}
        id="aoe2-shorts"
        className="relative isolate scroll-mt-24 overflow-hidden rounded-[1.8rem] border border-amber-100/16 bg-[radial-gradient(circle_at_8%_0%,rgba(153,27,27,0.28),transparent_31%),radial-gradient(circle_at_95%_15%,rgba(30,64,175,0.18),transparent_28%),linear-gradient(145deg,#090b12,#03050a_58%,#090607)] p-4 shadow-[0_35px_120px_rgba(0,0,0,0.42)] sm:rounded-[2rem] sm:p-6"
      >
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-red-700/10 blur-3xl" />

        <header className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ShortLogo />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2 className="truncate font-serif text-2xl font-semibold tracking-[-0.035em] text-[#efe1bb] sm:text-3xl">
                  AoE2 Shorts
                </h2>
                <Flame className="hidden h-4 w-4 fill-red-500/50 text-red-300 sm:block" />
              </div>
              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.35em] text-amber-100/45 sm:text-[9px]">
                War in under 90 seconds
              </div>
            </div>
          </div>

          <div
            role="group"
            aria-label="Shorts view"
            className="inline-flex shrink-0 rounded-full border border-white/10 bg-black/38 p-1"
          >
            <button
              type="button"
              aria-label="Vertical Shorts view"
              aria-pressed={view === "vertical"}
              onClick={() => setView("vertical")}
              className={`grid h-9 w-9 place-items-center rounded-full transition ${
                view === "vertical"
                  ? "bg-[#d5b15d] text-black shadow-[0_8px_24px_rgba(213,177,93,0.22)]"
                  : "text-slate-500 hover:text-amber-100"
              }`}
            >
              <RectangleVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Wide Shorts view"
              aria-pressed={view === "wide"}
              onClick={() => setView("wide")}
              className={`grid h-9 w-9 place-items-center rounded-full transition ${
                view === "wide"
                  ? "bg-[#d5b15d] text-black shadow-[0_8px_24px_rgba(213,177,93,0.22)]"
                  : "text-slate-500 hover:text-amber-100"
              }`}
            >
              <MonitorPlay className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative mt-5 hidden sm:block">
          {view === "vertical" ? (
            <div className="grid gap-6 md:grid-cols-[minmax(17rem,0.46fr)_minmax(0,1fr)] lg:gap-8">
              <div
                className="group relative mx-auto aspect-[9/16] w-full max-w-[23rem] overflow-hidden rounded-[1.8rem] border border-amber-100/18 bg-black text-left shadow-[0_28px_90px_rgba(0,0,0,0.56)]"
              >
                <button
                  type="button"
                  aria-label={`Open ${activeShort.title}`}
                  onClick={() => openReel(activeIndex)}
                  className="absolute inset-0 z-10"
                />
                <video
                  key={activeShort.id}
                  src={mediaReady ? activeShort.videoSrc : undefined}
                  poster={activeShort.posterSrc}
                  muted
                  loop
                  autoPlay={mediaReady}
                  playsInline
                  preload={mediaReady ? "metadata" : "none"}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,3,8,0.18),transparent_36%,rgba(1,3,8,0.86)_100%)]" />
                <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-center justify-between">
                  <span className="rounded-full border border-white/16 bg-black/48 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-amber-50 backdrop-blur">
                    {activeShort.duration}
                  </span>
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/42 text-white backdrop-blur transition group-hover:scale-105 group-hover:bg-black/64">
                    <Expand className="h-4 w-4" />
                  </span>
                </div>
                <div className="pointer-events-none absolute inset-x-5 bottom-5 z-20">
                  <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-amber-100/60">
                    {activeShort.signal}
                  </div>
                  <div className="mt-2 font-serif text-2xl font-semibold leading-tight text-white">
                    {activeShort.title}
                  </div>
                  <div className="pointer-events-auto mt-4 w-fit">
                    <UploaderLink short={activeShort} />
                  </div>
                </div>
                <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/32 bg-black/42 text-amber-50 shadow-[0_0_40px_rgba(220,38,38,0.18)] backdrop-blur transition group-hover:scale-110">
                  <Play className="ml-1 h-6 w-6 fill-current" />
                </span>
              </div>

              <div className="flex min-w-0 flex-col justify-between py-2">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-red-200/55">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                    {String(activeIndex + 1).padStart(2, "0")} /{" "}
                    {String(SHORTS.length).padStart(2, "0")}
                  </div>
                  <button
                    type="button"
                    onClick={() => openReel(activeIndex)}
                    className="mt-4 max-w-3xl text-left font-serif text-4xl font-medium leading-[0.98] tracking-[-0.045em] text-[#ded3bd] transition hover:text-amber-100 lg:text-6xl"
                  >
                    {activeShort.title}
                  </button>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <UploaderLink short={activeShort} />
                    <span className="h-4 w-px bg-white/10" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      {activeShort.signal}
                    </span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReaction("up")}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition ${
                        activeReaction === "up"
                          ? "border-amber-200/42 bg-amber-200/14 text-amber-50"
                          : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-white"
                      }`}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Like
                    </button>
                    <button
                      type="button"
                      onClick={() => setReaction("down")}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition ${
                        activeReaction === "down"
                          ? "border-red-200/32 bg-red-300/10 text-red-100"
                          : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-white"
                      }`}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => openReel(activeIndex, true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-xs font-bold text-slate-400 transition hover:text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Comment
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareActiveShort()}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-xs font-bold text-slate-400 transition hover:text-white"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-5 gap-2">
                  {SHORTS.map((short, index) => (
                    <button
                      key={short.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`Select ${short.title}`}
                      aria-pressed={activeIndex === index}
                      className={`group/thumb relative aspect-[9/16] min-w-0 overflow-hidden rounded-[1rem] border bg-black transition ${
                        activeIndex === index
                          ? "border-amber-200/55 shadow-[0_0_28px_rgba(213,177,93,0.15)]"
                          : "border-white/8 opacity-68 hover:border-white/20 hover:opacity-100"
                      }`}
                    >
                      <Image
                        src={short.posterSrc}
                        alt=""
                        fill
                        sizes="130px"
                        className="object-cover transition duration-500 group-hover/thumb:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/10 to-transparent" />
                      <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-left text-[9px] font-bold leading-3 text-white">
                        {short.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div
                className="group relative block aspect-video w-full overflow-hidden rounded-[1.7rem] border border-amber-100/16 bg-black text-left shadow-[0_26px_90px_rgba(0,0,0,0.52)]"
              >
                <button
                  type="button"
                  aria-label={`Open ${activeShort.title}`}
                  onClick={() => openReel(activeIndex)}
                  className="absolute inset-0 z-10"
                />
                <video
                  key={activeShort.id}
                  src={mediaReady ? activeShort.videoSrc : undefined}
                  poster={activeShort.posterSrc}
                  muted
                  loop
                  autoPlay={mediaReady}
                  playsInline
                  preload={mediaReady ? "metadata" : "none"}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,4,9,0.82),rgba(2,4,9,0.18)_50%,rgba(2,4,9,0.45)),linear-gradient(180deg,transparent_55%,rgba(1,3,8,0.84))]" />
                <div className="pointer-events-none absolute left-6 top-6 z-20 flex items-center gap-3">
                  <ShortLogo compact />
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/72">
                    AoE2 Shorts · {activeShort.duration}
                  </span>
                </div>
                <div className="pointer-events-none absolute bottom-7 left-7 z-20 max-w-2xl">
                  <div className="text-[9px] font-bold uppercase tracking-[0.27em] text-red-200/60">
                    {activeShort.signal}
                  </div>
                  <div className="mt-2 font-serif text-4xl font-medium tracking-[-0.04em] text-white lg:text-6xl">
                    {activeShort.title}
                  </div>
                  <div className="pointer-events-auto mt-4 w-fit">
                    <UploaderLink short={activeShort} />
                  </div>
                </div>
                <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/30 bg-black/45 text-amber-50 backdrop-blur transition group-hover:scale-110">
                  <Play className="ml-1 h-7 w-7 fill-current" />
                </span>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {SHORTS.map((short, index) => (
                  <button
                    key={short.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Select ${short.title}`}
                    aria-pressed={activeIndex === index}
                    className={`group/thumb relative aspect-video w-[16rem] shrink-0 overflow-hidden rounded-[1rem] border bg-black transition ${
                      activeIndex === index
                        ? "border-amber-200/50"
                        : "border-white/8 opacity-66 hover:opacity-100"
                    }`}
                  >
                    <Image
                      src={short.posterSrc}
                      alt=""
                      fill
                      sizes="256px"
                      className="object-cover transition duration-500 group-hover/thumb:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    <span className="absolute inset-x-3 bottom-2 text-left text-[10px] font-bold text-white">
                      {short.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative mt-5 sm:hidden">
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SHORTS.map((short, index) => (
              <div
                key={short.id}
                className={`group/mobile relative shrink-0 snap-start overflow-hidden border bg-black text-left shadow-[0_18px_48px_rgba(0,0,0,0.38)] ${
                  view === "vertical"
                    ? "aspect-[9/16] w-[10.8rem] rounded-[1.35rem]"
                    : "aspect-video w-[17rem] rounded-[1.2rem]"
                } ${
                  activeIndex === index
                    ? "border-amber-200/45"
                    : "border-white/10"
                  }`}
              >
                <button
                  type="button"
                  aria-label={`Open ${short.title}`}
                  onClick={() => openReel(index)}
                  className="absolute inset-0 z-10"
                />
                <Image
                  src={short.posterSrc}
                  alt=""
                  fill
                  sizes={view === "vertical" ? "173px" : "272px"}
                  className="object-cover transition duration-500 group-hover/mobile:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/5 to-black/18" />
                <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-white/14 bg-black/55 px-2 py-1 text-[8px] font-bold text-white backdrop-blur">
                  {short.duration}
                </span>
                <span className="pointer-events-none absolute left-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border border-amber-100/18 bg-black/45 text-amber-50 backdrop-blur">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </span>
                <span className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
                  <span className="block text-[8px] font-bold uppercase tracking-[0.2em] text-amber-100/55">
                    {short.signal}
                  </span>
                  <span className="mt-1.5 block font-serif text-lg font-semibold leading-[1.05] text-white">
                    {short.title}
                  </span>
                  <span className="pointer-events-auto relative z-30 mt-2 block w-fit">
                    <UploaderLink short={short} compact />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {reelOpen && typeof document !== "undefined"
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AoE2 Shorts reel"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-[#010205]/96 backdrop-blur-xl"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className={`relative h-full w-full overflow-hidden bg-black shadow-[0_0_100px_rgba(0,0,0,0.78)] md:h-[calc(100vh-2rem)] md:rounded-[1.8rem] md:border md:border-amber-100/16 ${
              view === "vertical"
                ? "md:aspect-[9/16] md:w-auto"
                : "md:aspect-video md:h-auto md:max-h-[calc(100vh-2rem)] md:max-w-[calc(100vw-2rem)]"
            }`}
          >
            <video
              ref={videoRef}
              key={`reel-${activeShort.id}`}
              src={activeShort.videoSrc}
              poster={activeShort.posterSrc}
              autoPlay
              muted={muted}
              loop
              playsInline
              preload="auto"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={togglePlayback}
              className={`absolute inset-0 h-full w-full ${
                view === "vertical"
                  ? "object-cover"
                  : "object-cover md:object-contain"
              }`}
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.52),transparent_24%,transparent_55%,rgba(0,0,0,0.9))]" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <ShortLogo compact />
                <span className="text-[9px] font-bold uppercase tracking-[0.27em] text-amber-50">
                  {activeIndex + 1} / {SHORTS.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={muted ? "Unmute Short" : "Mute Short"}
                  onClick={() => setMuted((current) => !current)}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/14 bg-black/48 text-white backdrop-blur transition hover:bg-black/70"
                >
                  {muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Close AoE2 Shorts"
                  onClick={() => setReelOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/14 bg-black/48 text-white backdrop-blur transition hover:bg-black/70"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {!playing ? (
              <button
                type="button"
                aria-label="Play Short"
                onClick={togglePlayback}
                className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/30 bg-black/48 text-amber-50 backdrop-blur"
              >
                <Play className="ml-1 h-8 w-8 fill-current" />
              </button>
            ) : (
              <div className="pointer-events-none absolute left-4 top-20 rounded-full bg-black/35 p-2 text-white/45 opacity-0 transition hover:opacity-100">
                <Pause className="h-4 w-4" />
              </div>
            )}

            <div className="absolute bottom-5 left-4 right-[5.2rem] z-10 sm:bottom-7 sm:left-6 sm:right-[6rem]">
              <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-100/60">
                {activeShort.signal} · {activeShort.duration}
              </div>
              <div className="mt-2 text-balance font-serif text-2xl font-semibold leading-[1.04] text-white sm:text-3xl">
                {activeShort.title}
              </div>
              <div className="mt-3">
                <UploaderLink short={activeShort} />
              </div>
              <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35 md:hidden">
                Swipe for the next war
              </div>
            </div>

            <div className="absolute bottom-5 right-3 z-20 flex flex-col items-center gap-3 sm:bottom-7 sm:right-4">
              <button
                type="button"
                aria-label="Like Short"
                aria-pressed={activeReaction === "up"}
                onClick={() => setReaction("up")}
                className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur transition ${
                  activeReaction === "up"
                    ? "border-amber-200/45 bg-amber-200/20 text-amber-50"
                    : "border-white/14 bg-black/48 text-white"
                }`}
              >
                <ThumbsUp className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Dislike Short"
                aria-pressed={activeReaction === "down"}
                onClick={() => setReaction("down")}
                className={`grid h-12 w-12 place-items-center rounded-full border backdrop-blur transition ${
                  activeReaction === "down"
                    ? "border-red-200/35 bg-red-300/16 text-red-100"
                    : "border-white/14 bg-black/48 text-white"
                }`}
              >
                <ThumbsDown className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Open Short comments"
                aria-pressed={commentsOpen}
                onClick={() => setCommentsOpen((current) => !current)}
                className="grid h-12 w-12 place-items-center rounded-full border border-white/14 bg-black/48 text-white backdrop-blur transition hover:bg-black/70"
              >
                <MessageCircle className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Share Short"
                onClick={() => void shareActiveShort()}
                className="grid h-12 w-12 place-items-center rounded-full border border-white/14 bg-black/48 text-white backdrop-blur transition hover:bg-black/70"
              >
                <Share2 className="h-5 w-5" />
              </button>
            </div>

            <div className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 md:flex">
              <button
                type="button"
                aria-label="Previous Short"
                onClick={() => moveReel(-1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-black/42 text-white backdrop-blur transition hover:border-amber-100/28 hover:text-amber-100"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next Short"
                onClick={() => moveReel(1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-black/42 text-white backdrop-blur transition hover:border-amber-100/28 hover:text-amber-100"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            {commentsOpen ? (
              <aside className="absolute inset-x-3 bottom-3 z-30 overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#070a10]/96 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:right-20 sm:w-[21rem]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-100/65">
                    Comments
                  </div>
                  <button
                    type="button"
                    aria-label="Close comments"
                    onClick={() => setCommentsOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-white/5 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-8 text-center">
                  <MessageCircle className="mx-auto h-7 w-7 text-slate-700" />
                  <div className="mt-3 font-serif text-lg text-slate-300">
                    First word wins.
                  </div>
                  <Link
                    href="/lobby#lobby-chat"
                    className="mt-4 inline-flex min-h-10 items-center rounded-full border border-amber-100/18 bg-amber-200/[0.07] px-5 text-xs font-bold text-amber-100 transition hover:bg-amber-200/12"
                  >
                    Open the war room
                  </Link>
                </div>
              </aside>
            ) : null}

            {shareNotice ? (
              <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-emerald-100/18 bg-emerald-950/82 px-4 py-2 text-xs font-bold text-emerald-100 backdrop-blur">
                {shareNotice}
              </div>
            ) : null}
          </div>
        </div>,
            document.body
          )
        : null}
    </>
  );
}
