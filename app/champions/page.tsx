import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Flame,
  Gem,
  Globe2,
  Medal,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import {
  designationTitles,
  eloTitles,
  formatDailyTribute,
  nationalTitles,
  podiumTitles,
  tagTeamTitle,
  tributeLabel,
  type ChampionTitleDefinition,
  type ChampionTone,
  type TitleContender,
} from "@/lib/champions/titles";
import {
  getTitleState,
  loadChampionTitleEconomyState,
  type ChampionTitleState,
} from "@/lib/champions/titleState";
import {
  managedMediaPublicUrl,
  slugifyManagedMediaTarget,
} from "@/lib/managedMediaAssets";

export const metadata: Metadata = {
  title: "Championship Belts",
  description: "AoE2WAR titles, championship belts, national reigns, and title economy.",
};

export const dynamic = "force-dynamic";

const toneClasses: Record<ChampionTone, string> = {
  gold: "border-amber-200/30 from-amber-300/18 text-amber-100 shadow-amber-950/35",
  blue: "border-sky-200/24 from-sky-300/14 text-sky-100 shadow-sky-950/30",
  green: "border-emerald-200/22 from-emerald-300/13 text-emerald-100 shadow-emerald-950/28",
  violet: "border-violet-200/24 from-violet-300/14 text-violet-100 shadow-violet-950/32",
  silver: "border-slate-200/22 from-slate-100/12 text-slate-100 shadow-slate-950/25",
  red: "border-rose-200/24 from-rose-300/13 text-rose-100 shadow-rose-950/30",
  emerald: "border-emerald-200/24 from-emerald-300/14 text-emerald-100 shadow-emerald-950/30",
  slate: "border-slate-300/20 from-slate-300/10 text-slate-100 shadow-slate-950/30",
};

const PLAYER_BACKDROPS: Record<string, string> = {
  emaren: "/champions/players/emaren.webp",
  jim: "/champions/players/jim.webp",
  "julio alvarez": "/champions/players/julio.webp",
  julio: "/champions/players/julio.webp",
  sniper: "/champions/players/sniper.webp",
};

const SILHOUETTE_BACKDROP = "/champions/players/silhouette.webp";
const FEMALE_SILHOUETTE_BACKDROP = "/champions/players/female_silhouette.webp";

function isWomensTitle(title: ChampionTitleDefinition) {
  const id = title.id.toLowerCase();
  const slug = title.slug.toLowerCase();
  return id.includes("women") || slug.includes("women") || title.type === "womens";
}

function normalizedPlayerName(value: string) {
  return value.trim().toLowerCase();
}

function avatarForPlayerName(name: string) {
  const fallback = PLAYER_BACKDROPS[normalizedPlayerName(name)] || SILHOUETTE_BACKDROP;
  return managedMediaPublicUrl("avatar", slugifyManagedMediaTarget(name), fallback);
}

function backdropForTitle(title: ChampionTitleDefinition) {
  const holder = primaryHolder(title);
  if (holder) {
    return avatarForPlayerName(holder.name);
  }

  if (title.id === "national-canada") {
    return managedMediaPublicUrl("avatar", "emaren", PLAYER_BACKDROPS.emaren);
  }
  if (isWomensTitle(title)) {
    return managedMediaPublicUrl("avatar", "female-silhouette", FEMALE_SILHOUETTE_BACKDROP);
  }
  return managedMediaPublicUrl("avatar", "silhouette", SILHOUETTE_BACKDROP);
}

function statusLabel(title: ChampionTitleDefinition) {
  if (title.status === "held") return "Held";
  if (title.status === "vacant") return "Vacant";
  return "Opening soon";
}

function primaryHolder(title: ChampionTitleDefinition) {
  return title.holders[0] ?? null;
}

function dailyBudget(titles: ChampionTitleDefinition[]) {
  return titles.reduce((sum, title) => {
    const multiplier = title.type === "tag_team" ? 2 : 1;
    return sum + title.dailyWolo * multiplier;
  }, 0);
}

function challengeHrefForTitle(title: ChampionTitleDefinition) {
  const params = new URLSearchParams({
    title: title.id,
  });

  if (title.country) {
    params.set("country", title.country);
  }

  if (title.type === "national") {
    params.set("kind", "national");
  }

  return `/challenge?${params.toString()}#schedule-game`;
}

function flagForCountry(country: ChampionTitleDefinition["country"]) {
  switch (country) {
    case "Canada":
      return "🇨🇦";
    case "USA":
      return "🇺🇸";
    case "Mexico":
      return "🇲🇽";
    case "UK":
      return "🇬🇧";
    default:
      return "🌐";
  }
}

function BeltAsset({
  title,
  priority = false,
  className = "",
  backdropUrl,
  backdropClassName = "",
}: {
  title: ChampionTitleDefinition;
  priority?: boolean;
  className?: string;
  backdropUrl?: string | null;
  backdropClassName?: string;
}) {
  const characterUrl = backdropUrl === undefined ? backdropForTitle(title) : backdropUrl;
  const assetKind = title.type === "designation" ? "artifact" : "belt";
  const assetUrl = managedMediaPublicUrl(assetKind, title.id, title.assetUrl);
  const wearable = title.type !== "designation";

  return (
    <div className={`relative mx-auto w-full overflow-visible ${className}`}>
      {typeof title.currentBountyWolo === "number" ? (
        <div className="absolute inset-x-3 -top-3 z-[70] flex justify-center">
          <div className="rounded-full border border-amber-100/35 bg-[linear-gradient(180deg,rgba(53,32,7,0.96),rgba(8,6,3,0.96))] px-4 py-2 text-center shadow-[0_14px_40px_rgba(0,0,0,0.58)] backdrop-blur">
            <div className="text-[8px] font-black uppercase tracking-[0.28em] text-amber-200/72">
              {title.guardianHeld ? "Open activation reward" : "Estimated dethrone reward"}
            </div>
            <div className="mt-0.5 text-sm font-black text-amber-50">
              {title.currentBountyWolo.toLocaleString()} WOLO
              <span className="ml-2 text-[10px] font-semibold text-amber-200/65">
                +{title.bountyGrowthWolo ?? title.dailyWolo}/day
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {characterUrl && wearable ? (
        <Image
          src={characterUrl}
          alt=""
          fill
          priority={priority}
          unoptimized
          sizes="(min-width: 1280px) 340px, (min-width: 768px) 42vw, 90vw"
          className={`pointer-events-none z-0 object-contain object-bottom opacity-70 [mask-image:linear-gradient(180deg,black_0%,black_82%,transparent_100%)] ${backdropClassName}`}
        />
      ) : null}
      <div className={wearable ? "absolute inset-x-0 bottom-[-16%] z-10 h-[46%]" : "absolute inset-0 z-10"}>
        <Image
          src={assetUrl}
          alt=""
          fill
          priority={priority}
          unoptimized
          sizes="(min-width: 1280px) 360px, (min-width: 768px) 46vw, 92vw"
          className="object-contain drop-shadow-[0_18px_36px_rgba(0,0,0,0.55)]"
        />
      </div>
    </div>
  );
}

function HolderLine({ title, dense = false }: { title: ChampionTitleDefinition; dense?: boolean }) {
  const holder = primaryHolder(title);

  if (!holder) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3">
        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Holder</div>
        <div className={`${dense ? "text-lg" : "text-2xl"} mt-1 font-semibold text-white`}>Vacant</div>
        <div className="mt-1 text-sm text-slate-400">Awaiting verified challengers</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Holder</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Link
          href={holder.href || title.routeHref}
          className={`${dense ? "text-lg" : "text-2xl"} font-semibold text-white transition hover:text-amber-100`}
        >
          {holder.name}
        </Link>
        {holder.invaderChampion ? (
          <span className="rounded-full border border-amber-200/24 bg-amber-300/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-100">
            Invader Champion
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-slate-400">{holder.meta || "Reign active"}</div>
    </div>
  );
}

function txProofHref(txHash: string) {
  return `/api/wolo/tx/${encodeURIComponent(txHash)}`;
}

function shortTxHash(txHash: string) {
  return `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function LastTributeProof({ title, compact = false }: { title: ChampionTitleDefinition; compact?: boolean }) {
  if (!title.lastTributeTxHash) return null;

  const amount = title.lastTributeAmountWolo ?? title.dailyWolo;
  const paidAt = formatShortDate(title.lastTributePaidAt);

  return (
    <Link
      href={txProofHref(title.lastTributeTxHash)}
      className={`mt-2 block rounded-xl border border-emerald-300/15 bg-emerald-400/10 text-emerald-100 transition hover:border-emerald-200/35 hover:bg-emerald-400/15 ${
        compact ? "px-2.5 py-2 text-[10px]" : "px-3 py-2 text-xs"
      }`}
    >
      <span className="block uppercase tracking-[0.2em] text-emerald-100/65">Last tribute paid</span>
      <span className="mt-0.5 block font-semibold">
        {amount.toLocaleString()} WOLO{title.lastTributeRecipient ? ` → ${title.lastTributeRecipient}` : ""}
      </span>
      <span className="mt-0.5 block font-mono text-emerald-100/70">
        tx {shortTxHash(title.lastTributeTxHash)}{paidAt ? ` · ${paidAt} UTC` : ""}
      </span>
    </Link>
  );
}

function TributePill({ title, compact = false }: { title: ChampionTitleDefinition; compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-amber-200/18 bg-amber-300/10 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/70">
        {tributeLabel(title.tributeKind)}
      </div>
      <div className="mt-1 text-sm font-semibold text-amber-50">
        {title.type === "tag_team" ? `${title.dailyWolo} WOLO/day each` : `${title.dailyWolo} WOLO/day`}
      </div>
      <LastTributeProof title={title} compact={compact} />
    </div>
  );
}

function ChallengeButton({ title, compact = false }: { title: ChampionTitleDefinition; compact?: boolean }) {
  return (
    <Link
      href={challengeHrefForTitle(title)}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/18 bg-[linear-gradient(135deg,#f9d675,#d79a2f_58%,#7c4b12)] font-semibold text-slate-950 shadow-[0_14px_36px_rgba(0,0,0,0.28)] transition hover:brightness-110 ${
        compact ? "px-4 py-2 text-xs" : "px-5 py-3 text-sm"
      }`}
    >
      Challenge
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function ContenderList({
  title,
  maxRows = 10,
  compact = false,
}: {
  title: ChampionTitleState;
  maxRows?: number;
  compact?: boolean;
}) {
  const contenderRows = title.contenders.slice(0, 10);
  const visibleCount = Math.min(Math.max(maxRows, 1), 10);
  const slots = Array.from({ length: visibleCount }, (_, index) => contenderRows[index] ?? null);
  const liveCount = contenderRows.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Top 10</div>
        <span className="text-[11px] text-slate-500">
          {liveCount > 0 ? `${liveCount}/10 live` : "Queue forming"}
        </span>
      </div>

      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {slots.map((row, index) =>
          row ? (
            <ContenderRow key={`${title.id}-${row.rank}-${row.name}`} row={row} compact={compact} />
          ) : (
            <OpenContenderSlot key={`${title.id}-open-${index + 1}`} rank={index + 1} compact={compact} />
          )
        )}
      </div>

      {visibleCount < 10 ? (
        <Link
          href={title.routeHref}
          className="mt-2 inline-flex text-xs font-semibold text-amber-100/85 transition hover:text-amber-50"
        >
          View all 10 contender slots
        </Link>
      ) : null}
    </div>
  );
}

function ContenderRow({ row, compact = false }: { row: TitleContender; compact?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/8 bg-black/18 px-2.5 ${
        compact ? "py-1.5" : "py-2"
      }`}
    >
      <div className="font-mono text-xs text-amber-100/80">#{row.rank}</div>
      <div className="min-w-0">
        {row.href ? (
          <Link href={row.href} className="block truncate text-sm font-semibold text-white hover:text-amber-100">
            {row.name}
          </Link>
        ) : (
          <div className="truncate text-sm font-semibold text-white">{row.name}</div>
        )}
        <div className="truncate text-xs text-slate-500">{row.meta || row.ratingLabel || "Verified contender"}</div>
      </div>
      {row.badge ? (
        <span className="rounded-full border border-amber-200/10 bg-amber-300/5 px-2 py-0.5 text-[10px] text-amber-100/62">
          {row.badge}
        </span>
      ) : (
        <span className="text-xs text-slate-500">{row.rating ?? ""}</span>
      )}
    </div>
  );
}

function OpenContenderSlot({ rank, compact = false }: { rank: number; compact?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/12 px-2.5 ${
        compact ? "py-1.5" : "py-2"
      }`}
    >
      <div className="font-mono text-xs text-slate-500">#{rank}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-300">Open lane</div>
        <div className="truncate text-xs text-slate-600">Win proof to enter</div>
      </div>
      <span className="rounded-full border border-amber-200/10 bg-amber-300/[0.04] px-2 py-0.5 text-[10px] text-amber-100/55">
        Claimable
      </span>
    </div>
  );
}

function PodiumCard({
  title,
  titleState,
  position,
}: {
  title: ChampionTitleDefinition;
  titleState: ChampionTitleState;
  position: "left" | "center" | "right";
}) {
  const tone = toneClasses[title.tone];
  const isCenter = position === "center";
  const orderClass =
    position === "left" ? "lg:order-1 lg:translate-y-8" : position === "center" ? "lg:order-2" : "lg:order-3 lg:translate-y-8";

  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-[1.7rem] border bg-[radial-gradient(circle_at_50%_0%,var(--tw-gradient-from),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(0,0,0,0.28))] p-4 shadow-2xl ${tone} ${orderClass} ${
        isCenter ? "lg:-mt-3 lg:p-5" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-12 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{title.eyebrow}</div>
          <span className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs text-slate-200">
            {statusLabel(title)}
          </span>
        </div>
        <Link href={title.routeHref} className="mt-3 block">
          <h2 className={`${isCenter ? "text-3xl sm:text-4xl" : "text-2xl"} font-serif font-semibold leading-tight text-amber-50`}>
            {title.displayName}
          </h2>
        </Link>
      </div>

      <Link href={title.routeHref} className="block">
        <BeltAsset title={title} priority={isCenter} className={isCenter ? "h-[30rem] max-w-[30rem]" : "h-[24rem] max-w-[24rem]"} />
      </Link>

      <div className="relative z-10 space-y-3">
        <HolderLine title={title} dense={!isCenter} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <TributePill title={title} />
          <ChallengeButton title={title} />
        </div>
        <ContenderList title={titleState} compact={!isCenter} />
      </div>
    </article>
  );
}

function TagTeamDuoAsset({ title }: { title: ChampionTitleDefinition }) {
  const tagTeamAsset = managedMediaPublicUrl(
    "belt",
    "tag-team",
    "/champions/players/tagteam_champ.png",
  );

  return (
    <div className="relative mx-auto h-[17rem] w-full max-w-[36rem] overflow-visible sm:h-[19rem] lg:h-[20rem]">
      <div className="absolute inset-x-8 bottom-3 h-px bg-gradient-to-r from-transparent via-amber-200/24 to-transparent" />
      <Image
        src={tagTeamAsset}
        alt={`${title.displayName} artwork`}
        fill
        sizes="(max-width: 768px) 92vw, 36rem"
        className="object-contain object-bottom drop-shadow-[0_30px_42px_rgba(0,0,0,0.58)]"
        priority={false}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050910] via-[#050910]/35 to-transparent" />
    </div>
  );
}



function TagTeamCard({ titleState }: { titleState: ChampionTitleState }) {
  const title = titleState;

  return (
    <section className="relative overflow-hidden rounded-[1.8rem] border border-slate-200/16 bg-[radial-gradient(circle_at_15%_0%,rgba(226,232,240,0.15),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(251,191,36,0.12),transparent_28%),linear-gradient(135deg,rgba(8,13,22,0.98),rgba(3,7,13,0.99))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.78fr)] lg:items-stretch">
        <div className="min-w-0">
          <Link href={title.routeHref} className="block">
            <TagTeamDuoAsset title={title} />
          </Link>

          <div className="relative z-10 -mt-3 max-w-3xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-slate-400">
              <Users className="h-4 w-4 text-slate-200" />
              Tag Team Title
            </div>

            <Link href={title.routeHref}>
              <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight text-amber-50 sm:text-5xl">
                {title.displayName}
              </h2>
            </Link>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              {title.rule}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <HolderLine title={title} dense />
              <TributePill title={title} />
            </div>

            <div className="mt-5">
              <ChallengeButton title={title} />
            </div>
          </div>
        </div>

        <div className="min-w-0 self-stretch lg:pt-3">
          <ContenderList title={title} />
        </div>
      </div>
    </section>
  );
}



function NationalCard({ titleState }: { titleState: ChampionTitleState }) {
  const title = titleState;
  return (
    <article className="min-w-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.25))] p-4">
      <div className="relative z-10 flex justify-center">
        <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.055] px-4 py-2 text-6xl leading-none shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
          {flagForCountry(title.country)}
        </div>
      </div>
      <Link href={title.routeHref} className="block">
        <BeltAsset title={title} className="-mt-2 h-[18rem] max-w-[18rem]" />
      </Link>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Representing Country</div>
        <Link href={title.routeHref}>
          <h3 className="mt-1 text-xl font-semibold text-white">{title.displayName}</h3>
        </Link>
        <p className="mt-2 min-h-[2.5rem] text-sm leading-5 text-slate-400">{title.eligibility}</p>
      </div>
      <div className="mt-3 space-y-3">
        <HolderLine title={title} dense />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full border border-amber-200/16 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            {formatDailyTribute(title)}
          </span>
          <ChallengeButton title={title} compact />
        </div>
        <LastTributeProof title={title} compact />
        <ContenderList title={title} compact />
      </div>
    </article>
  );
}

function EloCard({ titleState }: { titleState: ChampionTitleState }) {
  const title = titleState;
  return (
    <article className="min-w-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.10),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.24))] p-4">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">{title.eyebrow}</div>
        <Link href={title.routeHref}>
          <h3 className="mt-1 font-serif text-2xl font-semibold text-amber-50">{title.displayName}</h3>
        </Link>
      </div>
      <Link href={title.routeHref} className="block">
        <BeltAsset title={title} className="h-[19rem] max-w-[18rem]" />
      </Link>
      <div className="space-y-3">
        <HolderLine title={title} dense />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:grid-cols-1">
          <TributePill title={title} compact />
          <ChallengeButton title={title} compact />
        </div>
        <ContenderList title={title} compact />
      </div>
    </article>
  );
}

function DesignationCard({ titleState }: { titleState: ChampionTitleState }) {
  const title = titleState;
  return (
    <article className="min-w-0 overflow-hidden rounded-[1.35rem] border border-amber-200/12 bg-[radial-gradient(circle_at_20%_0%,rgba(251,191,36,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.26))] p-4">
      <Link href={title.routeHref} className="block">
        <BeltAsset title={title} className="aspect-square max-w-[9.5rem]" />
      </Link>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/65">{title.eyebrow}</div>
        <Link href={title.routeHref}>
          <h3 className="mt-1 text-xl font-semibold text-white">{title.displayName}</h3>
        </Link>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Holder</div>
          <div className="mt-1 text-sm font-semibold text-white">{primaryHolder(title)?.name || "Vacant"}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Current Record</div>
          <div className="mt-1 text-sm font-semibold text-slate-200">{title.currentRecord || "No verified record yet"}</div>
        </div>
      </div>
      <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-slate-400">{title.rule}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-amber-200/16 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
          Artifact Bonus: {title.dailyWolo} WOLO/day
        </span>
        <Link href={title.routeHref} className="text-sm font-semibold text-amber-100 hover:text-amber-50">
          Rules
        </Link>
      </div>
      <div className="mt-3">
        <ChallengeButton title={title} compact />
      </div>
      <div className="mt-3">
        <ContenderList title={title} maxRows={4} compact />
      </div>
    </article>
  );
}

function RuleCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/16 bg-amber-300/10 text-amber-100">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div>
      </div>
    </div>
  );
}

function HeroRosterBackdrop() {
  const roster = [
    { src: PLAYER_BACKDROPS.emaren, className: "left-[2%] top-[16%] h-[86%] w-[34%] opacity-[0.18]" },
    { src: PLAYER_BACKDROPS.jim, className: "left-[24%] top-[8%] h-[92%] w-[36%] opacity-[0.20]" },
    { src: PLAYER_BACKDROPS.sniper, className: "left-[50%] top-[2%] h-[100%] w-[38%] opacity-[0.26]" },
    { src: PLAYER_BACKDROPS["julio alvarez"], className: "left-[72%] top-[12%] h-[90%] w-[34%] opacity-[0.19]" },
  ];

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] overflow-hidden lg:block">
      <div className="absolute inset-0 bg-gradient-to-r from-[#120d08] via-[#07111c]/30 to-transparent" />
      {roster.map((item) => (
        <div key={item.src} className={`absolute ${item.className}`}>
          <Image
            src={item.src}
            alt=""
            fill
            unoptimized
            sizes="28vw"
            className="object-contain object-bottom mix-blend-screen [mask-image:linear-gradient(180deg,transparent_0%,black_18%,black_72%,transparent_100%)]"
          />
        </div>
      ))}
    </div>
  );
}

export default async function ChampionsPage() {
  const state = await loadChampionTitleEconomyState(getPrisma());
  const world = getTitleState(state, podiumTitles[0]);
  const chaos = getTitleState(state, podiumTitles[1]);
  const womens = getTitleState(state, podiumTitles[2]);
  const tagTeam = getTitleState(state, tagTeamTitle);
  const nationalStates = nationalTitles.map((title) => getTitleState(state, title));
  const eloStates = eloTitles.map((title) => getTitleState(state, title));
  const designationStates = designationTitles.map((title) => getTitleState(state, title));
  const activeTitleCount = state.titles.filter((title) => title.status === "held").length;
  const vacantTitleCount = state.titles.filter((title) => title.status !== "held").length;
  const budget = dailyBudget(state.titles);

  return (
    <main className="space-y-8 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.24),transparent_28%),radial-gradient(circle_at_10%_25%,rgba(14,165,233,0.12),transparent_24%),linear-gradient(145deg,#120d08,#07111c_54%,#02040a)] px-5 py-10 shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />
        <HeroRosterBackdrop />
        <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
              <Crown className="h-4 w-4" />
              AoE2WAR title economy
            </div>
            <h1 className="mt-4 max-w-5xl font-serif text-4xl font-semibold uppercase tracking-[0.1em] text-amber-50 sm:text-6xl">
              Championship Belts
            </h1>
            <p className="mt-4 max-w-3xl text-sm uppercase tracking-[0.22em] text-slate-300 sm:text-base">
              Win the title. Hold the artifact. Make the room hunt you.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
              A living title economy for belts, national beacons, ELO ladders, and stealable records.
            </p>
          </div>

          <div className="grid min-w-[min(100%,22rem)] gap-2 rounded-2xl border border-white/10 bg-black/22 p-4 sm:grid-cols-3 lg:min-w-[28rem]">
            <HeroStat label="Active" value={String(activeTitleCount)} />
            <HeroStat label="Vacant" value={String(vacantTitleCount)} />
            <HeroStat label="Tribute pool" value={`${budget} WOLO/day`} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)_minmax(0,0.92fr)] lg:items-start">
        <PodiumCard title={world} titleState={world} position="center" />
        <PodiumCard title={chaos} titleState={chaos} position="left" />
        <PodiumCard title={womens} titleState={womens} position="right" />
      </section>

      <TagTeamCard titleState={tagTeam} />

      <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader
          icon={Globe2}
          eyebrow="National Champions"
          title="Representing Country decides the national target."
          body="A player representing Mexico can challenge Mexico, not USA or Canada. Country cooldown enforcement can attach to this same profile field later."
          actionHref="/challenge?title=national&kind=national#schedule-game"
          actionLabel="Challenge for your Nation's belt"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {nationalStates.map((title) => (
            <NationalCard key={title.id} titleState={title} />
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader
          icon={Medal}
          eyebrow="ELO Champions"
          title="Five ladders, and invaders are allowed."
          body="Contenders come from the belt's ELO band first. A lower-ELO player can still invade a higher belt by winning the verified title fight."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {eloStates.map((title) => (
            <EloCard key={title.id} titleState={title} />
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[1.8rem] border border-amber-200/12 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.24))] p-5 sm:p-6">
        <SectionHeader
          icon={Gem}
          eyebrow="Special Designation Artifacts"
          title="Records you steal, not badges you keep forever."
          body="Each artifact has a current holder, current record, and Artifact Bonus. Take it by beating the holder's verified metric."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {designationStates.map((title) => (
            <DesignationCard key={title.id} titleState={title} />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)]">
        <div className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
            <Trophy className="h-4 w-4" />
            How Titles Move
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <RuleCard icon={Shield} title="The System Decides Stakes" body="Users challenge through the match flow. Eligible belts and artifacts transfer after verified watcher/parser proof." />
            <RuleCard icon={Swords} title="Challenge Windows" body="Holders must answer and defend. Vacant belts can be claimed by eligible title matches." />
            <RuleCard icon={Flame} title="Invader Champions" body="A lower-ELO player can hold a higher-ELO belt after winning it, then becomes a target in that division." />
            <RuleCard icon={Sparkles} title="Artifacts Are Stealable" body="Special Designations use record metrics. Beat the current record, take the artifact." />
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-amber-200/14 bg-[linear-gradient(180deg,rgba(120,71,16,0.20),rgba(0,0,0,0.24))] p-5 sm:p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-amber-100/72">Identity</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Set your title lanes.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Representing Country and Gender Division live on your profile. Those settings decide national Women&apos;s title eligibility.
          </p>
          <Link
            href="/profile"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Open Profile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-amber-50">{value}</div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  body,
  actionHref = "/challenge#schedule-game",
  actionLabel = "Challenge",
}: {
  icon: typeof Shield;
  eyebrow: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-4xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
      </div>
      <Link
        href={actionHref}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-amber-200/35 hover:text-amber-100"
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
