"use client";

import Link from "next/link";
import { ArrowUpRight, Crown, Feather, Quote, Swords } from "lucide-react";

import { WolomaniaPromoTile } from "@/components/lobby/WolomaniaPromoTile";
import type { HeroPlaylistItemView } from "@/lib/hero/types";

function editionDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Open edition";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Edmonton",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function mediaUrl(item: HeroPlaylistItemView, mobile = false) {
  const config = item.screen.config;
  return (
    (mobile ? config.mobileBackgroundImageUrl : config.backgroundImageUrl) ||
    config.backgroundImageUrl ||
    item.screen.mediaAsset?.url ||
    ""
  );
}

function mediaStyle(item: HeroPlaylistItemView) {
  const url = mediaUrl(item);
  return url
    ? {
        backgroundImage: `linear-gradient(rgba(2,6,23,${
          item.screen.config.overlayOpacity ?? 0.62
        }),rgba(2,6,23,0.94)),url("${url}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : undefined;
}

function ScreenLink({
  item,
  className,
  children,
}: {
  item: HeroPlaylistItemView;
  className: string;
  children: React.ReactNode;
}) {
  if (/^https:\/\//i.test(item.href)) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        aria-label={item.screen.ariaLabel}
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={item.href || "/"}
      aria-label={item.screen.ariaLabel}
      className={className}
    >
      {children}
    </Link>
  );
}

function ChronicleCover({ item }: { item: HeroPlaylistItemView }) {
  const thread = item.screen.forumThread;
  if (!thread) return null;
  const config = item.screen.config;
  return (
    <ScreenLink
      item={item}
      className="group relative block h-full min-h-[46rem] overflow-hidden rounded-[2.35rem] border border-amber-100/20 bg-[#07101f] text-white sm:min-h-[48rem] xl:min-h-[51rem]"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(37,99,235,0.24),transparent_34%),radial-gradient(circle_at_12%_12%,rgba(245,158,11,0.12),transparent_31%),linear-gradient(135deg,#151a24_0%,#081322_48%,#071b38_100%)]"
        style={mediaStyle(item)}
      />
      <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="absolute inset-y-0 left-[12%] w-px bg-gradient-to-b from-transparent via-amber-100/14 to-transparent" />
      <div className="absolute inset-y-0 right-[12%] w-px bg-gradient-to-b from-transparent via-sky-100/10 to-transparent" />

      <div className="relative flex h-full min-h-[46rem] flex-col p-5 sm:min-h-[48rem] sm:p-8 lg:p-10 xl:min-h-[51rem]">
        <header className="border-y border-amber-100/22 bg-black/14 px-3 py-4 backdrop-blur-sm sm:px-6">
          <div className="grid items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr]">
            <span className="hidden items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/65 sm:inline-flex">
              <Feather className="h-4 w-4" />
              {config.eyebrow}
            </span>
            <div>
              <div className="font-serif text-xl font-bold uppercase tracking-[0.16em] text-amber-50 sm:text-3xl lg:text-4xl">
                {config.masthead}
              </div>
              <div className="mt-1 text-[8px] uppercase tracking-[0.32em] text-slate-400 sm:text-[9px]">
                {config.editionLabel}
              </div>
            </div>
            <span className="hidden justify-end text-right text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-100/55 sm:block">
              {thread.tag}
            </span>
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-9 sm:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[9px] font-semibold uppercase tracking-[0.28em] text-amber-100/60 sm:text-[10px]">
            <span>{config.kicker}</span>
            <span>{editionDate(thread.createdAt)}</span>
          </div>
          <h2 className="mt-6 max-w-[72rem] font-serif text-[clamp(3.25rem,7.8vw,8.5rem)] font-semibold leading-[0.88] tracking-[-0.045em] text-amber-50 drop-shadow-[0_18px_60px_rgba(0,0,0,0.48)] transition duration-700 group-hover:translate-x-1">
            {thread.title}
          </h2>
          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
            <p className="max-w-4xl text-base leading-7 text-slate-200 sm:text-xl sm:leading-9">
              {thread.excerpt}
            </p>
            <div className="border-l border-amber-100/20 pl-5">
              <div className="text-sm font-semibold text-amber-50">
                {thread.authorLabel}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                {thread.authorRole}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/12 pt-5">
          <span className="text-[9px] uppercase tracking-[0.3em] text-slate-500">
            Dispatch from the long war
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/25 bg-amber-200/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition group-hover:bg-amber-200 group-hover:text-slate-950">
            Open the edition
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </footer>
      </div>
    </ScreenLink>
  );
}

function AmbientVideo({ item }: { item: HeroPlaylistItemView }) {
  const config = item.screen.config;
  const videoUrl =
    config.videoUrl ||
    (item.screen.mediaAsset?.mimeType.startsWith("video/")
      ? item.screen.mediaAsset.url
      : "");
  if (!videoUrl) return null;
  return (
    <video
      className="absolute inset-0 h-full w-full object-cover"
      src={videoUrl}
      poster={config.posterUrl || mediaUrl(item) || undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
    />
  );
}

function WarriorQuote({ item }: { item: HeroPlaylistItemView }) {
  const config = item.screen.config;
  const motion = config.motionPreset || "embers";
  return (
    <ScreenLink
      item={item}
      className="group relative block h-full min-h-[46rem] overflow-hidden rounded-[2.35rem] border border-amber-100/20 bg-[#090d13] text-white sm:min-h-[48rem] xl:min-h-[51rem]"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(245,158,11,0.14),transparent_28%),radial-gradient(circle_at_8%_80%,rgba(127,29,29,0.35),transparent_42%),radial-gradient(circle_at_92%_82%,rgba(30,64,175,0.22),transparent_40%),linear-gradient(155deg,#171008,#070b12_52%,#05080e)]"
        style={mediaStyle(item)}
      />
      <AmbientVideo item={item} />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/28 via-black/58 to-black/92"
        style={{ opacity: config.overlayOpacity ?? 0.62 }}
      />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(112deg,transparent_0%,rgba(255,255,255,.12)_48%,transparent_52%)] [background-size:220%_100%] [animation:hero-steel-shine_12s_ease-in-out_infinite]" />
      {motion === "embers" ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 16 }).map((_, index) => (
            <span
              key={index}
              className="absolute bottom-[-5%] h-1 w-1 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)] [animation:hero-ember-rise_var(--ember-speed)_linear_infinite]"
              style={
                {
                  left: `${4 + ((index * 17) % 93)}%`,
                  opacity: 0.25 + (index % 4) * 0.14,
                  "--ember-speed": `${7 + (index % 6) * 1.7}s`,
                  animationDelay: `${-(index % 8) * 1.3}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      <div className="relative flex h-full min-h-[46rem] flex-col items-center justify-center px-6 py-16 text-center sm:min-h-[48rem] sm:px-12 xl:min-h-[51rem]">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-100/24 bg-black/35 px-4 py-2 text-[9px] font-black uppercase tracking-[0.3em] text-amber-100 backdrop-blur sm:text-[10px]">
          <Swords className="h-4 w-4 text-amber-300" />
          {config.eyebrow}
        </div>
        <Quote className="mt-10 h-12 w-12 text-amber-200/70 sm:h-16 sm:w-16" />
        <blockquote
          className={`mt-7 max-w-[76rem] font-serif text-[clamp(3.1rem,7.4vw,8.2rem)] font-semibold leading-[0.91] tracking-[-0.04em] text-amber-50 drop-shadow-[0_20px_65px_rgba(0,0,0,0.82)] ${
            motion === "ink"
              ? "[animation:hero-ink-reveal_1.6s_ease-out_both]"
              : "transition duration-1000 group-hover:scale-[1.012]"
          }`}
        >
          “{config.quote}”
        </blockquote>
        <div className="mt-9 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
        <div className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-amber-100 sm:text-base">
          {config.attribution}
        </div>
        {config.subline ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            {config.subline}
          </p>
        ) : null}
        <span className="mt-9 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 transition group-hover:text-amber-100">
          Enter the War Room
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <style jsx>{`
        @keyframes hero-ember-rise {
          0% {
            transform: translate3d(0, 0, 0) scale(0.5);
            opacity: 0;
          }
          14% {
            opacity: 0.8;
          }
          100% {
            transform: translate3d(30px, -780px, 0) scale(1.5);
            opacity: 0;
          }
        }
        @keyframes hero-steel-shine {
          0%,
          72%,
          100% {
            background-position: 210% 0;
          }
          82% {
            background-position: -110% 0;
          }
        }
        @keyframes hero-ink-reveal {
          from {
            opacity: 0;
            filter: blur(12px);
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0);
          }
        }
      `}</style>
    </ScreenLink>
  );
}

function MediaTakeover({ item }: { item: HeroPlaylistItemView }) {
  const config = item.screen.config;
  return (
    <ScreenLink
      item={item}
      className="group relative block h-full min-h-[46rem] overflow-hidden rounded-[2.35rem] border border-white/15 bg-[#050914] text-white sm:min-h-[48rem] xl:min-h-[51rem]"
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(245,158,11,0.2),transparent_34%),linear-gradient(145deg,#111827,#020617)]"
        style={mediaStyle(item)}
      />
      <AmbientVideo item={item} />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black via-black/38 to-black/18"
        style={{ opacity: config.overlayOpacity ?? 0.45 }}
      />
      <div className="relative flex h-full min-h-[46rem] flex-col justify-end p-7 sm:min-h-[48rem] sm:p-12 xl:min-h-[51rem]">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-100/24 bg-black/45 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.26em] text-amber-100 backdrop-blur">
          <Crown className="h-4 w-4" />
          {config.eyebrow}
        </div>
        <h2 className="mt-6 max-w-5xl font-serif text-[clamp(3.6rem,8vw,9rem)] font-semibold leading-[0.86] tracking-[-0.05em] text-white">
          {config.title}
        </h2>
        {config.subtitle ? (
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
            {config.subtitle}
          </p>
        ) : null}
        <span className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-amber-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition group-hover:bg-white">
          {config.ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </ScreenLink>
  );
}

export function HeroScreenRenderer({
  item,
}: {
  item: HeroPlaylistItemView;
}) {
  if (item.screen.type === "featured_event" && item.screen.eventTile) {
    return (
      <WolomaniaPromoTile
        eventTile={{ ...item.screen.eventTile, ctaUrl: item.href }}
        embedded
      />
    );
  }
  if (item.screen.type === "chronicle_cover") {
    return <ChronicleCover item={item} />;
  }
  if (item.screen.type === "media_takeover") {
    return <MediaTakeover item={item} />;
  }
  return <WarriorQuote item={item} />;
}
