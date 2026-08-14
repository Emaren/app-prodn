import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Flame,
  Globe2,
  Map as MapIcon,
  Shield,
  Sparkles,
  Trophy,
} from "lucide-react";

import { nationalBeacons, type NationalBeacon } from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "National Champions",
  description:
    "AoE2WAR national championship belts, active champions, tribute, bounties, and vacant nations.",
};

const nationalBeltArt = {
  canada: "/champions/belts/national-canada-1fd048b9-lossless.webp",
  us: "/champions/belts/national-usa-04324bb5-lossless.webp",
  mexico: "/champions/belts/national-mexico-bf599444-lossless.webp",
  uk: "/champions/belts/national-uk-8976fc9d-lossless.webp",
} as const;

const championNationSlugs: Record<string, string> = {
  canada: "canada",
  us: "united-states",
  mexico: "mexico",
  uk: "united-kingdom",
};

const nationalBeltTargets: Record<string, string> = {
  canada: "national-canada",
  us: "national-usa",
  mexico: "national-mexico",
  uk: "national-uk",
};

function nationalBeltTarget(id: string) {
  return nationalBeltTargets[id] ?? `national-${id}`;
}

function beltPageHrefForNationalBelt(id: string) {
  return `/champions/nations/${encodeURIComponent(championNationSlugs[id] ?? id)}`;
}

function challengeHrefForNationalBelt(id: string, champion?: string | null) {
  const to = champion || "Emaren";
  return `/contact-emaren?challenge=${encodeURIComponent(
    nationalBeltTarget(id)
  )}&to=${encodeURIComponent(to)}&cc=${encodeURIComponent("Emaren")}&role=${encodeURIComponent(
    "Commissioner"
  )}`;
}

function playerHref(champion: string | null) {
  if (!champion) return null;
  return `/players/by-name/${encodeURIComponent(champion)}`;
}

function nationalBeltImage(id: string) {
  return nationalBeltArt[id as keyof typeof nationalBeltArt] ?? null;
}

function nationalBeltShortName(id: string, country: string) {
  if (id === "us") return "U.S. Championship";
  if (id === "uk") return "U.K. Championship";
  if (id === "canada") return "Canadian Championship";
  if (id === "mexico") return "Mexican Championship";
  return `${country} Championship`;
}

function countryPossessive(country: string) {
  if (country === "United States") return "America's";
  if (country === "United Kingdom") return "Britain's";
  if (country.endsWith("s")) return `${country}'`;
  return `${country}'s`;
}

function flameScore(beacon: NationalBeacon) {
  if (beacon.tier === "world") return 1.5;
  if (beacon.champion) return 1.12 + Math.min(0.28, beacon.tenureDays / 90);
  return 0.5;
}

function sortChampionBeacons(beacons: NationalBeacon[]) {
  const order = new Map([
    ["canada", 0],
    ["us", 1],
    ["mexico", 2],
  ]);
  return [...beacons].sort((left, right) => {
    const leftRank = order.get(left.id) ?? 50;
    const rightRank = order.get(right.id) ?? 50;
    return leftRank - rightRank || left.country.localeCompare(right.country);
  });
}

function BeaconMarker({ beacon }: { beacon: NationalBeacon }) {
  const lit = Boolean(beacon.champion);
  const scale = flameScore(beacon);
  const href = playerHref(beacon.champion);

  const markerStyle = {
    left: `${beacon.x}%`,
    top: `${beacon.y}%`,
    "--beacon-scale": String(scale),
  } as CSSProperties;

  const marker = (
    <div
      className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 ${
        lit ? "" : "opacity-60"
      }`}
      style={markerStyle}
    >
      <div className="relative flex flex-col items-center">
        <div className={`beacon-fire ${lit ? "beacon-fire-lit" : "beacon-fire-cold"}`} />

        <div
          className={`relative h-9 w-7 border-x border-t ${
            lit ? "border-amber-100/46 bg-amber-900/50" : "border-white/10 bg-black/45"
          }`}
        >
          <div className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/55" />
          <div className="absolute inset-x-[-5px] bottom-[-6px] h-2 rounded-full bg-black/55" />
        </div>

        <div
          className={`mt-2 min-w-[7.35rem] rounded-xl border px-3 py-2 text-center shadow-[0_18px_42px_rgba(0,0,0,0.42)] ${
            lit
              ? "border-amber-200/44 bg-[linear-gradient(180deg,rgba(82,54,18,0.88),rgba(6,10,22,0.90))] text-amber-50"
              : "border-white/10 bg-black/64 text-slate-300"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.17em] text-slate-400">
            {beacon.country}
          </div>
          <div className="mt-1 text-sm font-semibold">{beacon.champion || "Vacant"}</div>
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} aria-label={`${beacon.country} champion ${beacon.champion}`}>
      {marker}
    </Link>
  ) : (
    marker
  );
}

function Continent({ className }: { className: string }) {
  return (
    <div
      className={`absolute rounded-[45%] border border-amber-100/7 bg-[linear-gradient(145deg,rgba(194,155,88,0.12),rgba(255,255,255,0.035))] blur-[0.25px] ${className}`}
    />
  );
}

function WorldMap() {
  return (
    <div className="relative min-h-[31rem] overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_21%_33%,rgba(245,158,11,0.24),transparent_14%),radial-gradient(circle_at_52%_46%,rgba(251,191,36,0.13),transparent_24%),radial-gradient(circle_at_78%_64%,rgba(14,165,233,0.10),transparent_26%),linear-gradient(145deg,#030812,#0b1420_52%,#040608)] shadow-[0_40px_140px_rgba(0,0,0,0.54)] lg:min-h-[35rem]">
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0_44%,rgba(0,0,0,0.62)_88%)]" />
      <div className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.36),transparent)]" />
      <div className="absolute bottom-0 left-1/2 h-44 w-80 -translate-x-1/2 rounded-full bg-amber-300/8 blur-3xl" />

      <Continent className="left-[10%] top-[28%] h-[18rem] w-[20rem] rotate-[-18deg]" />
      <Continent className="left-[27%] top-[54%] h-[16rem] w-[11rem] rotate-[14deg]" />
      <Continent className="left-[43%] top-[25%] h-[18rem] w-[24rem] rotate-[4deg]" />
      <Continent className="left-[56%] top-[28%] h-[20rem] w-[30rem] rotate-[-8deg]" />
      <Continent className="left-[49%] top-[61%] h-[15rem] w-[11rem] rotate-[2deg]" />
      <Continent className="left-[75%] top-[68%] h-[10rem] w-[14rem] rotate-[14deg]" />

      {nationalBeacons.map((beacon) => (
        <BeaconMarker key={beacon.id} beacon={beacon} />
      ))}
    </div>
  );
}

function HeroStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-black/24 px-4 py-3 shadow-[0_14px_42px_rgba(0,0,0,0.24)] backdrop-blur-md">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-amber-50">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function ChampionShowcaseCard({ beacon, priority = false }: { beacon: NationalBeacon; priority?: boolean }) {
  const image = nationalBeltImage(beacon.id);
  const shortName = nationalBeltShortName(beacon.id, beacon.country);
  const champion = beacon.champion || "Vacant";
  const championHref = playerHref(beacon.champion);
  const beltHref = beltPageHrefForNationalBelt(beacon.id);
  const challengeHref = challengeHrefForNationalBelt(beacon.id, beacon.champion);

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-amber-200/20 bg-[radial-gradient(circle_at_70%_6%,rgba(251,191,36,0.16),transparent_28%),linear-gradient(135deg,rgba(20,27,41,0.92),rgba(6,10,20,0.96)_54%,rgba(30,12,18,0.88))] p-4 shadow-[0_32px_100px_rgba(0,0,0,0.32)] [content-visibility:auto] [contain-intrinsic-size:auto_32rem]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.96fr)_minmax(19rem,1.04fr)] lg:items-center">
        <div className="relative overflow-hidden rounded-[1.55rem] border border-amber-100/16 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.32)),#050b17] px-5 py-6">
          <Link href={beltHref} aria-label={`View ${shortName} NFT`} className="absolute inset-0 z-10 rounded-[1.55rem]" />
          <div className="absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.36),transparent)]" />
          <div className="relative mx-auto h-48 max-w-[25rem] sm:h-56">
            {image ? (
              <Image
                src={image}
                alt={`${shortName} belt`}
                fill
                sizes="(max-width: 1024px) 80vw, 400px"
                className="object-contain drop-shadow-[0_24px_42px_rgba(0,0,0,0.62)] transition duration-300 group-hover:scale-[1.028]"
                priority={priority}
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[1rem] border border-amber-100/10 bg-black/30 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">
                    Belt art pending
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-300">
                    Assign managed asset
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-1 py-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100">
            <Flame className="h-3.5 w-3.5" />
            Beacon Lit
          </div>

          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
            {beacon.country}
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-amber-50">{shortName}</h2>

          {championHref ? (
            <Link href={championHref} className="mt-3 block font-serif text-5xl font-semibold tracking-[-0.04em] text-white transition hover:text-amber-100">
              {champion}
            </Link>
          ) : (
            <div className="mt-3 font-serif text-5xl font-semibold tracking-[-0.04em] text-white">
              {champion}
            </div>
          )}

          <p className="mt-4 max-w-[32rem] text-sm leading-6 text-slate-400">
            {countryPossessive(beacon.country)} beacon is lit. {champion} holds the belt,
            earns daily Tribute, and becomes the named target for every eligible challenger
            representing {beacon.country}.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[1rem] border border-white/9 bg-black/22 px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.24em] text-slate-500">Tribute</div>
              <div className="mt-1 text-lg font-semibold text-amber-100">10 WOLO/day</div>
            </div>
            <div className="rounded-[1rem] border border-white/9 bg-black/22 px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.24em] text-slate-500">Bounty</div>
              <div className="mt-1 text-lg font-semibold text-amber-100">{beacon.bountyWolo} WOLO/day</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link
              href={beltHref}
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-black/24 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-200/28 hover:text-amber-100"
            >
              View NFT
            </Link>
            <Link
              href={challengeHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/30 bg-amber-300/12 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
            >
              Challenge {champion}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 sm:text-left">
            Challenge sent to the Champion · Emaren CC’d as Commissioner
          </div>
        </div>
      </div>
    </article>
  );
}

function VacantCrownCard({ beacon }: { beacon: NationalBeacon }) {
  const image = nationalBeltImage(beacon.id);
  const beltHref = beltPageHrefForNationalBelt(beacon.id);
  const challengeHref = challengeHrefForNationalBelt(beacon.id, "Emaren");
  const shortName = nationalBeltShortName(beacon.id, beacon.country);

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-white/9 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.20))] p-4 transition hover:border-amber-200/24 hover:bg-white/[0.055]">
      <div className="relative overflow-hidden rounded-[1.15rem] border border-white/9 bg-black/24 px-4 py-5">
        <Link href={beltHref} aria-label={`View ${shortName}`} className="absolute inset-0 z-10 rounded-[1.15rem]" />
        <div className="relative mx-auto h-28 max-w-[14rem]">
          {image ? (
            <Image
              src={image}
              alt={`${shortName} belt`}
              fill
              sizes="220px"
              className="object-contain opacity-88 drop-shadow-[0_16px_30px_rgba(0,0,0,0.54)] transition duration-300 group-hover:scale-[1.035] group-hover:opacity-100"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.025] text-center">
              <Crown className="h-8 w-8 text-slate-600" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{beacon.country}</div>
        <h3 className="mt-1 text-lg font-semibold text-amber-50">{shortName}</h3>
        <p className="mt-2 min-h-[3.4rem] text-sm leading-6 text-slate-400">
          Vacant crown. Represent {beacon.country}, win the verified title fight,
          and light the beacon.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Tribute</div>
            <div className="mt-1 text-sm font-semibold text-amber-100">10 WOLO/day</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Status</div>
            <div className="mt-1 text-sm font-semibold text-slate-300">Open</div>
          </div>
        </div>

        <Link
          href={challengeHref}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-200/24 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/18"
        >
          Claim the crown
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function ProcessCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/9 bg-white/[0.035] p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-100/16 bg-amber-300/10 text-amber-100">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

export default function NationalChampionsPage() {
  const litBeacons = sortChampionBeacons(nationalBeacons.filter((beacon) => beacon.champion));
  const vacantBeacons = nationalBeacons.filter((beacon) => !beacon.champion);
  const totalBounty = nationalBeacons.reduce((sum, beacon) => sum + beacon.bountyWolo, 0);
  const headlineChampions = litBeacons;
  const priorityChampionIds = new Set(["canada", "us"]);

  return (
    <main className="mx-auto w-full max-w-[96rem] space-y-8 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6">
      <section className="overflow-hidden rounded-[2.4rem] border border-amber-100/14 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.11),transparent_27%),radial-gradient(circle_at_78%_12%,rgba(59,130,246,0.12),transparent_28%),linear-gradient(135deg,rgba(8,14,26,0.96),rgba(4,8,16,0.98)_55%,rgba(19,8,13,0.94))] shadow-[0_44px_140px_rgba(0,0,0,0.46)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center lg:p-8">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/22 bg-amber-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100">
                <MapIcon className="h-3.5 w-3.5" />
                AoE2WAR Nations
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/14 bg-sky-300/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-sky-100/80">
                <Globe2 className="h-3.5 w-3.5" />
                Beacon Map Live
              </span>
            </div>

            <div>
              <p className="font-serif text-xl uppercase tracking-[0.48em] text-amber-100/72">
                National
              </p>
              <h1 className="mt-1 max-w-[11ch] font-serif text-[4.25rem] font-semibold uppercase leading-[0.82] tracking-[0.065em] text-amber-50 sm:text-[6.75rem]">
                Champions
              </h1>
              <p className="mt-5 max-w-[35rem] text-sm font-semibold uppercase tracking-[0.28em] text-slate-300/80">
                Represent your flag. Win the proof match. Hold the belt.
              </p>
              <p className="mt-4 max-w-[38rem] text-base leading-7 text-slate-400">
                Every national crown is a public target. Champions collect daily Tribute,
                challengers chase the bounty, and the map lights up one country at a time.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroStat label="Lit Nations" value={String(litBeacons.length)} detail="Active champions" />
              <HeroStat label="Open Crowns" value={String(vacantBeacons.length)} detail="Ready to claim" />
              <HeroStat label="Bounty Pool" value={`${totalBounty} WOLO/day`} detail="Total national pull" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="#champions"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-200/34 bg-[linear-gradient(135deg,rgba(138,99,22,0.34),rgba(3,7,18,0.54))] px-5 py-2.5 text-sm font-semibold text-amber-50 shadow-[0_18px_48px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-amber-300/12"
              >
                View Champions
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#open-crowns"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/24 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:-translate-y-0.5 hover:border-amber-200/24 hover:text-amber-100"
              >
                Claim a Nation
                <Sparkles className="h-4 w-4 text-amber-100/70" />
              </Link>
            </div>
          </div>

          <WorldMap />
        </div>
      </section>

      <section id="champions" className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="text-xs uppercase tracking-[0.34em] text-slate-500">
              Champions of the Realm
            </div>
            <h2 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.04em] text-white">
              Belts with names on them.
            </h2>
          </div>
          <div className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
            {litBeacons.length} active
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {headlineChampions.map((beacon) => (
            <ChampionShowcaseCard
              key={beacon.id}
              beacon={beacon}
              priority={priorityChampionIds.has(beacon.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.82),rgba(2,6,23,0.92))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100">
            <Trophy className="h-3.5 w-3.5" />
            Claim protocol
          </div>
          <h2 className="mt-5 font-serif text-4xl font-semibold tracking-[-0.04em] text-white">
            Become the target.
          </h2>
          <p className="mt-4 max-w-[38rem] text-sm leading-6 text-slate-400">
            National champions are not decorative. They are public proof, public pressure,
            and public invitation. Pick your country, answer the call, win the match,
            and make everyone else chase you.
          </p>

          <div className="mt-6 grid gap-3">
            <ProcessCard
              icon={Globe2}
              title="Represent a nation"
              body="Your profile country defines which national crown you can hold or challenge."
            />
            <ProcessCard
              icon={Shield}
              title="Win under proof"
              body="Verified game proof decides who holds the belt. No mystery, no handwave."
            />
            <ProcessCard
              icon={Flame}
              title="Light the beacon"
              body="The champion earns Tribute, carries the visible title, and becomes the next target."
            />
          </div>
        </div>

        <section id="open-crowns" className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs uppercase tracking-[0.34em] text-slate-500">Open Crowns</div>
              <h2 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.04em] text-white">
                Empty thrones still pay.
              </h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
              {vacantBeacons.length} vacant
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {vacantBeacons.slice(0, 6).map((beacon) => (
              <VacantCrownCard key={beacon.id} beacon={beacon} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
