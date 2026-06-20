"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  CalendarDays,
  Crown,
  Flame,
  Play,
  Radio,
  Swords,
  Trophy,
  Wallet,
} from "lucide-react";

import {
  FALLBACK_EVENT_TILE,
  isSafeEventMediaUrl,
  type EventTileView,
} from "@/lib/events/types";

const ASSET_FALLBACKS = {
  belt: "/uploads/managed-assets/belt/world-1781561316794-0a26a86e.png",
  commissioner: "/uploads/managed-assets/avatar/emaren-1781569822986-d51b50eb.png",
  playerOne: "/uploads/managed-assets/avatar/jim-1781560436622-52fb61a1.png",
  playerTwo: "/uploads/managed-assets/avatar/julio-alvarez-1781569866259-256b2ad7.png",
};

type PromoImageProps = {
  src: string;
  fallback: string;
  alt: string;
  className: string;
};

function PromoImage({ src, fallback, alt, className }: PromoImageProps) {
  return (
    <img
      src={src || fallback}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackUsed === "1") {
          image.style.display = "none";
          return;
        }
        image.dataset.fallbackUsed = "1";
        image.src = fallback;
      }}
    />
  );
}

function isWolomaniaSeed(eventTile: EventTileView) {
  return (
    eventTile.eventTileId === "wolomania-i" ||
    eventTile.eventTileId === "wolomania-i-fallback"
  );
}

function usesLegacyWolomaniaPalette(eventTile: EventTileView) {
  return (
    isWolomaniaSeed(eventTile) &&
    !eventTile.backgroundImageUrl &&
    !eventTile.mobileBackgroundImageUrl &&
    eventTile.gradientFrom.toLowerCase() === "#150704" &&
    eventTile.gradientVia.toLowerCase() === "#05070d" &&
    eventTile.gradientTo.toLowerCase() === "#071225" &&
    eventTile.overlayOpacity === 0.24 &&
    eventTile.vignetteOpacity === 0.82 &&
    eventTile.theme === "royal"
  );
}

function backgroundStyle(
  eventTile: EventTileView,
  mobile: boolean
): CSSProperties {
  if (usesLegacyWolomaniaPalette(eventTile)) {
    return {
      backgroundImage: mobile
        ? "radial-gradient(circle at 50% 8%,rgba(251,191,36,0.24),transparent 28%),radial-gradient(circle at 5% 45%,rgba(127,29,29,0.48),transparent 38%),radial-gradient(circle at 95% 45%,rgba(30,64,175,0.35),transparent 38%),linear-gradient(160deg,#150704 0%,#05070d 52%,#071225 100%)"
        : "radial-gradient(circle at 50% 10%,rgba(251,191,36,0.25),transparent 30%),radial-gradient(circle at 8% 48%,rgba(127,29,29,0.44),transparent 34%),radial-gradient(circle at 92% 48%,rgba(30,64,175,0.30),transparent 34%),linear-gradient(135deg,#120704 0%,#05070d 48%,#071225 100%)",
    };
  }
  const requestedUrl =
    (mobile ? eventTile.mobileBackgroundImageUrl : eventTile.backgroundImageUrl) ||
    eventTile.backgroundImageUrl;
  const imageLayer =
    requestedUrl && isSafeEventMediaUrl(requestedUrl)
      ? `url("${requestedUrl}")`
      : null;
  const overlay = Math.min(1, Math.max(0, eventTile.overlayOpacity));
  const overlayLayers = [
    `radial-gradient(circle at 50% 10%, rgba(251,191,36,${Math.min(0.4, overlay + 0.01)}), transparent 30%)`,
    `radial-gradient(circle at 8% 48%, rgba(127,29,29,${Math.min(0.7, overlay + 0.2)}), transparent 36%)`,
    `radial-gradient(circle at 92% 48%, rgba(30,64,175,${Math.min(0.55, overlay + 0.08)}), transparent 36%)`,
  ];
  const backgroundLayers = imageLayer
    ? [
        ...overlayLayers,
        `linear-gradient(160deg, rgba(21,7,4,${overlay}), rgba(5,7,13,${overlay}) 50%, rgba(7,18,37,${overlay}))`,
        imageLayer,
        `linear-gradient(160deg, ${eventTile.gradientFrom} 0%, ${eventTile.gradientVia} 50%, ${eventTile.gradientTo} 100%)`,
      ]
    : [
        ...overlayLayers,
        `linear-gradient(160deg, ${eventTile.gradientFrom} 0%, ${eventTile.gradientVia} 50%, ${eventTile.gradientTo} 100%)`,
      ];
  return {
    backgroundImage: backgroundLayers.join(", "),
    backgroundPosition: "center",
    backgroundSize: imageLayer ? "auto, auto, auto, auto, cover, auto" : undefined,
  };
}

function countryLabel(country: string | null) {
  const flags: Record<string, string> = {
    Canada: "🇨🇦",
    USA: "🇺🇸",
    Mexico: "🇲🇽",
    UK: "🇬🇧",
  };
  if (!country) return "AoE2WAR";
  const display = country === "USA" ? "United States" : country;
  return `${flags[country] || "🌐"} ${display}`;
}

function eventTimeLabel(value: string | null) {
  if (!value) return "Time TBA";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Time TBA";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(parsed);
}

function EventWrapper({
  eventTile,
  preview,
  className,
  style,
  children,
}: {
  eventTile: EventTileView;
  preview: boolean;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  if (preview) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <Link
      href={eventTile.ctaUrl || "/lobby"}
      aria-label={`Open ${eventTile.name}`}
      className={className}
      style={style}
    >
      {children}
    </Link>
  );
}

function eventFacts(eventTile: EventTileView) {
  return [
    [eventTile.dateLabel || "Date TBA", CalendarDays],
    [eventTimeLabel(eventTile.eventStartsAt), Radio],
    [eventTile.matchFormat || "Format TBA", Swords],
    [eventTile.rulesSummary || eventTile.tournamentName || "AoE2WAR Event", Trophy],
  ] as const;
}

function displayTitle(eventTile: EventTileView) {
  return [eventTile.title, eventTile.subtitle].filter(Boolean).join(" ");
}

function mobilePlayerName(eventTile: EventTileView, slot: "one" | "two") {
  const name =
    slot === "one" ? eventTile.playerOneName : eventTile.playerTwoName;
  if (
    slot === "two" &&
    isWolomaniaSeed(eventTile) &&
    name.toLowerCase() === "julio alvarez"
  ) {
    return "Julio";
  }
  return name;
}

function footerTournamentLabel(eventTile: EventTileView) {
  if (
    isWolomaniaSeed(eventTile) &&
    eventTile.tournamentName === "AoE2HD Founders Cup"
  ) {
    return "Recorded forever on AoE2WAR";
  }
  return eventTile.tournamentName || "Recorded forever on AoE2WAR";
}

function footerDescription(eventTile: EventTileView) {
  if (
    isWolomaniaSeed(eventTile) &&
    eventTile.description === "The first AoE2WAR world championship event."
  ) {
    return "Verifiable · Immutable · On-chain";
  }
  return eventTile.description || "Verifiable · Immutable · On-chain";
}

function MobileEventTile({
  eventTile,
  preview,
}: {
  eventTile: EventTileView;
  preview: boolean;
}) {
  const facts = eventFacts(eventTile);
  return (
    <EventWrapper
      eventTile={eventTile}
      preview={preview}
      style={backgroundStyle(eventTile, true)}
      className="group relative block overflow-hidden rounded-[2.35rem] p-5 pb-6"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:34px_34px]" />
      {!usesLegacyWolomaniaPalette(eventTile) ? (
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"
          style={{ opacity: Math.min(1, Math.max(0, eventTile.vignetteOpacity)) }}
        />
      ) : null}

      <div className="relative z-10">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/28 bg-black/62 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-amber-100 backdrop-blur">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            {eventTile.chapterLabel || eventTile.dateLabel}
          </span>
        </div>

        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/48 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-200">
            <Crown className="h-3.5 w-3.5" />
            {eventTile.eyebrow}
          </div>
          <h2 className="mt-4 break-words font-serif text-[clamp(3.4rem,16vw,4.8rem)] font-black uppercase leading-[0.78] tracking-[-0.045em] text-amber-100 drop-shadow-[0_7px_0_rgba(0,0,0,0.72)]">
            {displayTitle(eventTile)}
          </h2>
        </div>

        <div className="relative mt-5 h-[19rem] overflow-hidden rounded-[1.6rem] border border-amber-200/14 bg-black/18">
          <PromoImage
            src={eventTile.playerOneAvatarUrl}
            fallback={ASSET_FALLBACKS.playerOne}
            alt={eventTile.playerOneName}
            className="absolute -bottom-4 -left-10 h-[94%] w-[70%] object-contain object-bottom drop-shadow-[0_24px_50px_rgba(0,0,0,0.85)] [mask-image:linear-gradient(to_bottom,black_0%,black_82%,transparent_100%)]"
          />
          <PromoImage
            src={eventTile.playerTwoAvatarUrl}
            fallback={ASSET_FALLBACKS.playerTwo}
            alt={eventTile.playerTwoName}
            className="absolute -bottom-4 -right-10 h-[94%] w-[70%] object-contain object-bottom drop-shadow-[0_24px_50px_rgba(0,0,0,0.85)] [mask-image:linear-gradient(to_bottom,black_0%,black_82%,transparent_100%)]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/65 to-transparent" />
          <PromoImage
            src={eventTile.beltImageUrl}
            fallback={ASSET_FALLBACKS.belt}
            alt={`${eventTile.name} championship belt`}
            className="absolute left-1/2 top-[57%] z-20 h-32 w-[92%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_24px_55px_rgba(0,0,0,0.9)] transition duration-500 group-hover:scale-[1.025]"
          />
          <div className="absolute inset-x-4 bottom-4 z-30 grid grid-cols-2 gap-5 text-center">
            <PlayerLabel name={mobilePlayerName(eventTile, "one")} country={eventTile.playerOneCountry} />
            <PlayerLabel name={mobilePlayerName(eventTile, "two")} country={eventTile.playerTwoCountry} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {facts.map(([label, Icon]) => (
            <span
              key={label}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-amber-200/14 bg-white/[0.045] px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.1em] text-stone-100"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="min-w-0 break-words">{label}</span>
            </span>
          ))}
        </div>

        <span className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[0_18px_55px_rgba(251,191,36,0.25)]">
          {eventTile.ctaLabel} <Play className="h-4 w-4 fill-black" />
        </span>
      </div>
    </EventWrapper>
  );
}

function PlayerLabel({ name, country }: { name: string; country: string | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xl font-black uppercase text-white">{name}</div>
      <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-stone-300">
        {countryLabel(country)}
      </div>
    </div>
  );
}

function DesktopEventTile({
  eventTile,
  preview,
}: {
  eventTile: EventTileView;
  preview: boolean;
}) {
  const facts = eventFacts(eventTile);
  return (
    <EventWrapper
      eventTile={eventTile}
      preview={preview}
      style={backgroundStyle(eventTile, false)}
      className="group relative block min-h-[48rem] overflow-hidden rounded-[2.35rem] xl:min-h-[51rem]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(120,20,20,0.30),transparent_25%,transparent_75%,rgba(20,55,150,0.28)),linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.24)_52%,rgba(0,0,0,0.97)_100%)]"
        style={
          usesLegacyWolomaniaPalette(eventTile)
            ? undefined
            : { opacity: Math.min(1, Math.max(0.25, eventTile.vignetteOpacity)) }
        }
      />

      <div className="absolute left-5 top-5 z-50 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/24 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100 backdrop-blur">
          <Flame className="h-3.5 w-3.5 text-amber-300" />
          {eventTile.chapterLabel || eventTile.dateLabel}
        </span>
        {eventTile.payoutBadgeText ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100 backdrop-blur">
            <Wallet className="h-3.5 w-3.5" />
            {eventTile.payoutBadgeText}
          </span>
        ) : null}
      </div>

      {eventTile.featuredBadgeText ? (
        <div className="absolute right-5 top-5 z-50 rounded-full border border-amber-200/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100 backdrop-blur">
          {eventTile.featuredBadgeText}
        </div>
      ) : null}

      <div className="absolute inset-x-4 top-14 z-40 text-center sm:top-16">
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/62 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
          <Crown className="h-3.5 w-3.5" />
          {eventTile.eyebrow}
        </div>
        <h2 className="mx-auto w-full break-words text-center font-serif text-[clamp(4.1rem,9.2vw,10rem)] font-black uppercase leading-[0.78] tracking-[-0.045em] text-amber-100 drop-shadow-[0_8px_0_rgba(0,0,0,0.72)]">
          {displayTitle(eventTile)}
        </h2>
      </div>

      <PromoImage
        src={eventTile.playerOneAvatarUrl}
        fallback={ASSET_FALLBACKS.playerOne}
        alt={eventTile.playerOneName}
        className="absolute bottom-[1.5rem] left-[5%] z-30 h-[64%] w-[33%] object-contain object-bottom opacity-98 drop-shadow-[0_24px_60px_rgba(0,0,0,0.82)] [mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] sm:h-[68%]"
      />
      <PromoImage
        src={eventTile.playerTwoAvatarUrl}
        fallback={ASSET_FALLBACKS.playerTwo}
        alt={eventTile.playerTwoName}
        className="absolute bottom-[1.5rem] right-[5%] z-30 h-[65%] w-[34%] object-contain object-bottom opacity-98 drop-shadow-[0_24px_60px_rgba(0,0,0,0.82)] [mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] sm:h-[69%]"
      />
      <PromoImage
        src={eventTile.commissionerAvatarUrl}
        fallback={ASSET_FALLBACKS.commissioner}
        alt={eventTile.commissionerName}
        className="absolute bottom-[15.35rem] left-[39%] z-[24] h-[38%] w-[17%] -translate-x-1/2 -rotate-2 object-contain object-bottom opacity-76 drop-shadow-[0_24px_70px_rgba(0,0,0,0.95)] [mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)]"
      />
      <div className="pointer-events-none absolute left-[39%] top-[47.6%] z-[80] -translate-x-1/2 text-center">
        <div className="relative isolate inline-block text-[10px] font-black uppercase tracking-[0.32em] text-amber-300 [text-shadow:0_2px_10px_rgba(0,0,0,0.98),0_0_20px_rgba(0,0,0,0.72),0_0_10px_rgba(251,191,36,0.30)] before:pointer-events-none before:absolute before:inset-[-0.16em_-0.36em] before:-z-10 before:rounded-[0.45rem] before:bg-black/42 before:blur-[7px] before:content-[''] drop-shadow-[0_0_14px_rgba(251,191,36,0.42)]">
          THE COMMISSIONER
        </div>
      </div>
      <div className="pointer-events-none absolute left-[39%] top-[56.8%] z-[28] h-[20rem] w-[25rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.70)_0%,rgba(0,0,0,0.48)_34%,rgba(0,0,0,0.24)_66%,transparent_100%)] blur-md" />
      <div className="pointer-events-none absolute left-[42%] top-[61.2%] z-[50] h-[19rem] w-[31rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.66)_34%,rgba(0,0,0,0.30)_66%,transparent_100%)] blur-xl" />
      <PromoImage
        src={eventTile.beltImageUrl}
        fallback={ASSET_FALLBACKS.belt}
        alt={`${eventTile.name} championship belt`}
        className="absolute left-1/2 top-[63.9%] z-[52] h-56 w-[42rem] max-w-[72%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-97 drop-shadow-[0_34px_90px_rgba(0,0,0,0.88)] transition duration-700 group-hover:scale-[1.02] sm:h-64 xl:h-72"
      />

      <div className="pointer-events-none absolute left-1/2 top-[84.4%] z-[70] -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="rounded-full border border-amber-200/38 bg-black/82 px-4 py-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.58)] backdrop-blur">
          <span className="font-serif text-[1.85rem] font-black leading-none text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.36)]">VS</span>
        </div>
      </div>

      <div className="absolute bottom-[8.1rem] left-[5%] z-50 w-[33%] text-center">
        <DesktopPlayerLabel name={eventTile.playerOneName} country={eventTile.playerOneCountry} />
      </div>
      <div className="absolute bottom-[8.1rem] right-[5%] z-50 w-[34%] text-center">
        <DesktopPlayerLabel name={eventTile.playerTwoName} country={eventTile.playerTwoCountry} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[5.8rem] z-[35] h-[9rem] bg-gradient-to-t from-black via-black/72 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/88 to-transparent px-5 pb-5 pt-28">
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([label, Icon]) => (
              <span
                key={label}
                className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-amber-200/16 bg-white/[0.045] px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-stone-100"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="min-w-0 break-words">{label}</span>
              </span>
            ))}
          </div>
          <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-7 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_55px_rgba(251,191,36,0.25)] transition group-hover:scale-[1.02]">
            {eventTile.ctaLabel} <Play className="h-4 w-4 fill-black" />
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
          <span>{footerTournamentLabel(eventTile)}</span>
          <span className="hidden h-1 w-1 rounded-full bg-amber-300/50 sm:block" />
          <span>{footerDescription(eventTile)}</span>
        </div>
      </div>
    </EventWrapper>
  );
}

function DesktopPlayerLabel({
  name,
  country,
}: {
  name: string;
  country: string | null;
}) {
  return (
    <>
      <div className="truncate text-3xl font-black uppercase tracking-[0.04em] text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.85)]">
        {name}
      </div>
      <div className="mt-1 truncate text-xs font-bold uppercase tracking-[0.22em] text-stone-200 drop-shadow-[0_3px_18px_rgba(0,0,0,0.85)]">
        {countryLabel(country)}
      </div>
    </>
  );
}

export function WolomaniaPromoTile({
  eventTile = FALLBACK_EVENT_TILE,
  previewMode = null,
}: {
  eventTile?: EventTileView | null;
  previewMode?: "desktop" | "mobile" | null;
}) {
  const resolved = eventTile || FALLBACK_EVENT_TILE;
  if (previewMode === "mobile") {
    return (
      <section className="relative overflow-hidden rounded-[2.35rem] border border-amber-200/18 bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)]">
        <MobileEventTile eventTile={resolved} preview />
      </section>
    );
  }
  if (previewMode === "desktop") {
    return (
      <section className="relative overflow-hidden rounded-[2.35rem] border border-amber-200/18 bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)]">
        <DesktopEventTile eventTile={resolved} preview />
      </section>
    );
  }
  return (
    <section className="relative overflow-hidden rounded-[2.35rem] border border-amber-200/18 bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)]">
      <div className="sm:hidden">
        <MobileEventTile eventTile={resolved} preview={false} />
      </div>
      <div className="hidden sm:block">
        <DesktopEventTile eventTile={resolved} preview={false} />
      </div>
    </section>
  );
}
