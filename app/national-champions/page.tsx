import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Crown, Flame, Map, Shield, Sparkles, Trophy } from "lucide-react";

import { nationalBeacons, type NationalBeacon } from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "National Champions",
  description: "AoE2WAR on-chain national championship belts, tribute, bounties, and vacant nations.",
};

const nationalBeltArt = {
  canada: "/uploads/managed-assets/belt/national-canada-1781562091096-163be1f7.png",
  us: "/uploads/managed-assets/belt/national-usa-1781561984182-c5fa08c6.png",
  mexico: "/uploads/managed-assets/belt/national-mexico-1781562178354-696c5763.png",
  uk: "/uploads/managed-assets/belt/national-uk-1781562877273-5b3d1e75.png",
} as const;

const beltChainMeta = {
  chainId: "wolo-1",
  contractAddress: null as string | null,
};

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
  return `/contact-emaren?challenge=${encodeURIComponent(nationalBeltTarget(id))}&to=${encodeURIComponent(to)}&cc=${encodeURIComponent("Emaren")}&role=${encodeURIComponent("Commissioner")}`;
}


const featuredVacantBelts = [
  {
    id: "us",
    country: "United States",
    shortName: "U.S. Championship",
    image: nationalBeltArt.us,
    copy: "The American belt is vacant. Win a valid U.S. title game and light the beacon.",
  },
  {
    id: "mexico",
    country: "Mexico",
    shortName: "Mexican Championship",
    image: nationalBeltArt.mexico,
    copy: "Mexico is open. Take the vacant title and start collecting Tribute.",
  },
  {
    id: "uk",
    country: "United Kingdom",
    shortName: "U.K. Championship",
    image: nationalBeltArt.uk,
    copy: "The U.K. crown is waiting. Claim the belt, defend it, and make it real.",
  },
];

function flameScore(beacon: NationalBeacon) {
  if (beacon.tier === "world") return 1.5;
  if (beacon.champion) return 1.12 + Math.min(0.28, beacon.tenureDays / 90);
  return 0.5;
}

function playerHref(champion: string | null) {
  if (!champion) return null;
  return `/players/by-name/${encodeURIComponent(champion)}`;
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

  const content = (
    <div
      className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 ${lit ? "" : "opacity-68"}`}
      style={markerStyle}
    >
      <div className="relative flex flex-col items-center">
        <div className={`beacon-fire ${lit ? "beacon-fire-lit" : "beacon-fire-cold"}`} />

        <div
          className={`relative h-9 w-7 border-x border-t ${
            lit ? "border-amber-100/42 bg-amber-900/45" : "border-white/10 bg-black/45"
          }`}
        >
          <div className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/55" />
          <div className="absolute inset-x-[-5px] bottom-[-6px] h-2 rounded-full bg-black/55" />
        </div>

        <div
          className={`mt-2 min-w-[7.35rem] rounded-xl border px-3 py-2 text-center shadow-[0_18px_42px_rgba(0,0,0,0.42)] ${
            lit
              ? "border-amber-200/40 bg-[linear-gradient(180deg,rgba(82,54,18,0.86),rgba(6,10,22,0.88))] text-amber-50"
              : "border-white/10 bg-black/64 text-slate-300"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.17em] text-slate-400">{beacon.country}</div>
          <div className="mt-1 text-sm font-semibold">{beacon.champion || "Vacant"}</div>
        </div>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={`${beacon.country} champion ${beacon.champion}`}>
      {content}
    </Link>
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
    <div className="relative min-h-[33rem] overflow-hidden rounded-[2rem] border border-amber-200/12 bg-[radial-gradient(circle_at_21%_33%,rgba(245,158,11,0.22),transparent_14%),radial-gradient(circle_at_52%_46%,rgba(251,191,36,0.12),transparent_24%),radial-gradient(circle_at_78%_64%,rgba(14,165,233,0.10),transparent_26%),linear-gradient(145deg,#030812,#0b1420_52%,#040608)] shadow-[0_40px_140px_rgba(0,0,0,0.54)]">
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0_44%,rgba(0,0,0,0.62)_88%)]" />
      <div className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.32),transparent)]" />
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

function FeaturedVacantBeltCard({
  belt,
}: {
  belt: {
    id: string;
    country: string;
    shortName: string;
    image: string | null;
    copy: string;
  };
}) {
  const beltHref = beltPageHrefForNationalBelt(belt.id);
  const challengeHref = challengeHrefForNationalBelt(belt.id, "Emaren");

  return (
    <article className="group overflow-hidden rounded-[1.7rem] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.24))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition hover:border-amber-200/26 hover:bg-white/[0.055]">
      <div className="relative overflow-hidden rounded-[1.25rem] border border-amber-100/14 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.08),transparent_42%),#050b17] px-4 py-5">
        <Link href={beltHref} aria-label={`View ${belt.shortName} NFT`} className="absolute inset-0 z-10 rounded-[1.25rem]" />
        <div className="absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.28),transparent)]" />
        <div className="relative mx-auto h-32 max-w-[18rem] sm:h-36">
          {belt.image ? (
            <Image
              src={belt.image}
              alt={`${belt.shortName} belt`}
              fill
              sizes="(max-width: 768px) 80vw, 280px"
              className="object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)] transition duration-300 group-hover:scale-[1.035]"
              priority={belt.id === "us"}
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-[1rem] border border-amber-100/10 bg-[radial-gradient(circle_at_50%_35%,rgba(251,191,36,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] text-center">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">Belt art pending</div>
                <div className="mt-2 text-sm font-semibold text-slate-300">Assign managed asset</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{belt.country}</div>
        <h3 className="mt-1 text-lg font-semibold text-amber-50">{belt.shortName}</h3>
        <p className="mt-2 min-h-[3rem] text-sm leading-6 text-slate-400">{belt.copy}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Tribute</div>
            <div className="mt-1 text-sm font-semibold text-amber-100">10 WOLO/day</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Bounty</div>
            <div className="mt-1 text-sm font-semibold text-amber-100">10 WOLO/day</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={beltHref}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-amber-200/28 hover:text-amber-100"
          >
            View NFT
          </Link>
          <Link
            href={challengeHref}
            className="inline-flex items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/12 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
          >
            Challenge Emaren
          </Link>
        </div>
      </div>
    </article>
  );
}

function BeaconListCard({ beacon }: { beacon: NationalBeacon }) {
  const lit = Boolean(beacon.champion);
  const href = playerHref(beacon.champion);
  const vacantChallengeHref = challengeHrefForNationalBelt(beacon.id, "Emaren");

  const body = (
    <article
      className={`group rounded-[1.15rem] border p-3.5 transition ${
        lit
          ? "border-amber-200/32 bg-[radial-gradient(circle_at_12%_20%,rgba(251,191,36,0.18),transparent_32%),linear-gradient(135deg,rgba(92,58,13,0.38),rgba(5,10,24,0.74))] shadow-[0_18px_48px_rgba(0,0,0,0.26)]"
          : "border-white/9 bg-white/[0.032] hover:border-amber-200/18 hover:bg-white/[0.045]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] uppercase tracking-[0.22em] text-slate-500">{beacon.country}</div>
          <div className="mt-1 truncate text-base font-semibold text-white">{beacon.champion || "Vacant"}</div>
          <div className="mt-1 text-xs text-slate-500">
            {lit ? `${beacon.tenureDays} day reign` : "Open title"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-base font-semibold text-amber-100">{beacon.bountyWolo}</div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">WOLO/day</div>
        </div>
      </div>

      {!lit ? (
        <Link
          href={vacantChallengeHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-200/25 hover:text-amber-100"
        >
          Challenge
        </Link>
      ) : null}
    </article>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-amber-100">{value}</div>
    </div>
  );
}

export default function NationalChampionsPage() {
  const litBeacons = nationalBeacons.filter((beacon) => beacon.champion);
  const vacantBeacons = nationalBeacons.filter((beacon) => !beacon.champion);
  const currentChampion = litBeacons[0] ?? null;
  const totalBounty = nationalBeacons.reduce((sum, beacon) => sum + beacon.bountyWolo, 0);
  const championChallengeHref = currentChampion
    ? challengeHrefForNationalBelt(currentChampion.id, currentChampion.champion)
    : challengeHrefForNationalBelt("canada", "Emaren");

  return (
    <main className="mx-auto max-w-[76rem] space-y-8 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="grid gap-7 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
            <Map className="h-4 w-4" />
            AoE2WAR Belts
          </div>

          <div>
            <div className="font-serif text-2xl uppercase tracking-[0.45em] text-amber-100/78">
              National
            </div>
            <h1 className="font-serif text-6xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-8xl">
              Champions
            </h1>
            <p className="mt-5 max-w-xl text-sm uppercase tracking-[0.22em] text-slate-300 sm:text-base">
              Canada is lit. Every vacant nation awaits its first champion.
            </p>
          </div>

          <div className="overflow-hidden rounded-[1.55rem] border border-amber-200/18 bg-[radial-gradient(circle_at_15%_18%,rgba(251,191,36,0.22),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.055),rgba(0,0,0,0.28))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            <div className="flex items-start gap-3">
              <Shield className="mt-1 h-5 w-5 text-amber-100" />
              <div>
                <div className="text-sm font-semibold text-white">On-chain national titles</div>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Hold the belt, earn daily Tribute. Take the belt, collect the Bounty. Refuse valid challenges for 7 days and the crown falls.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <WorldMap />
        </div>
      </section>

      <section className="lg:hidden">
        <div className="rounded-[1.7rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
            <Flame className="h-4 w-4" />
            Nation list
          </div>
          <div className="mt-4 grid gap-3">
            {nationalBeacons.map((beacon) => (
              <BeaconListCard key={beacon.id} beacon={beacon} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.10),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.24))] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Crown className="h-4 w-4" />
                First Flame
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {currentChampion ? `${currentChampion.country} has its champion` : "No national champion yet"}
              </h2>
            </div>

            <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              {litBeacons.length} / {nationalBeacons.length} lit
            </span>
          </div>

          {currentChampion ? (
            <div className="relative mt-5 overflow-hidden rounded-[1.7rem] border border-amber-200/22 bg-[radial-gradient(circle_at_80%_18%,rgba(245,179,58,0.12),transparent_38%),linear-gradient(135deg,rgba(56,37,15,0.70)_0%,rgba(17,16,21,0.93)_44%,rgba(5,10,23,0.975)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,245,214,0.04),0_24px_80px_rgba(0,0,0,0.30)] sm:p-6">
              <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-amber-300/7 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-amber-900/10 blur-3xl" />

              <div className="relative z-10">
                <div className="float-right ml-6 mb-4 hidden w-[44%] max-w-[26rem] min-w-[19rem] sm:block">
                  <Link
                    href={beltPageHrefForNationalBelt(currentChampion.id)}
                    aria-label="View Canadian Championship NFT"
                    className="mb-1 flex justify-center"
                  >
                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200/10 bg-black/20 px-2.5 py-1 text-[8px] uppercase tracking-[0.08em] text-amber-100/64 transition group-hover:border-amber-200/18 group-hover:text-amber-100">
                      NFT title · {beltChainMeta.chainId} · {nationalBeltTarget(currentChampion.id)}
                    </span>
                  </Link>
                  <Link
                    href={beltPageHrefForNationalBelt(currentChampion.id)}
                    aria-label="View Canadian Championship NFT"
                    className="group relative block h-40 sm:h-48 lg:h-52"
                  >
                    <Image
                      src={nationalBeltArt.canada}
                      alt="Canadian Championship belt"
                      fill
                      sizes="(max-width: 768px) 80vw, 420px"
                      className="object-contain drop-shadow-[0_28px_54px_rgba(0,0,0,0.72)] transition duration-300 group-hover:scale-[1.025]"
                      priority
                      unoptimized
                    />
                  </Link>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/16 bg-black/16 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-amber-100/78">
                  <Crown className="h-3.5 w-3.5" />
                  Canadian Champion
                </div>

                <div className="mt-4 font-serif text-5xl font-semibold leading-none tracking-[-0.02em] text-amber-50 sm:text-6xl">
                  {currentChampion.champion}
                </div>

                <div className="mt-4 sm:hidden">
                  <Link
                    href={beltPageHrefForNationalBelt(currentChampion.id)}
                    aria-label="View Canadian Championship NFT"
                    className="mb-1 flex justify-center"
                  >
                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200/10 bg-black/20 px-2.5 py-1 text-[8px] uppercase tracking-[0.08em] text-amber-100/64">
                      NFT title · {beltChainMeta.chainId} · {nationalBeltTarget(currentChampion.id)}
                    </span>
                  </Link>
                  <Link
                    href={beltPageHrefForNationalBelt(currentChampion.id)}
                    aria-label="View Canadian Championship NFT"
                    className="relative block h-40"
                  >
                    <Image
                      src={nationalBeltArt.canada}
                      alt="Canadian Championship belt"
                      fill
                      sizes="90vw"
                      className="object-contain drop-shadow-[0_28px_54px_rgba(0,0,0,0.72)]"
                      priority
                      unoptimized
                    />
                  </Link>
                </div>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                  The first National Championship beacon is lit. Canada now pays daily Tribute to its champion, and every vacant nation is waiting for someone to claim the belt.
                </p>

                <div className="clear-both pt-5">
                  <div className="mx-auto max-w-[34rem] text-center">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.05rem] border border-white/8 bg-black/18 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Tribute</div>
                        <div className="mt-2 text-lg font-semibold text-amber-100">10 WOLO/day</div>
                      </div>
                      <div className="rounded-[1.05rem] border border-white/8 bg-black/18 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Bounty</div>
                        <div className="mt-2 text-lg font-semibold text-amber-100">{currentChampion.bountyWolo} WOLO/day</div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Link
                        href={beltPageHrefForNationalBelt(currentChampion.id)}
                        className="inline-flex items-center justify-center rounded-full border border-white/9 bg-black/18 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-amber-200/24 hover:text-amber-100"
                      >
                        View NFT
                      </Link>
                      <Link
                        href={championChallengeHref}
                        className="inline-flex items-center justify-center rounded-full border border-amber-200/28 bg-amber-300/11 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/18"
                      >
                        Challenge {currentChampion.champion}
                      </Link>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Challenge sent to the Champion · Emaren CC’d as Commissioner
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-7">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Featured Vacant Belts</div>
                <h3 className="mt-1 text-xl font-semibold text-white">Three crowns waiting for a fight</h3>
              </div>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-slate-400 sm:inline-flex">
                Tribute + bounty active
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {featuredVacantBelts.map((belt) => (
                <FeaturedVacantBeltCard key={belt.id} belt={belt} />
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
                All Vacant Nations
              </h3>
              <span className="text-xs text-slate-500">{vacantBeacons.length} open belts</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {vacantBeacons.slice(0, 12).map((beacon) => (
                <BeaconListCard key={beacon.id} beacon={beacon} />
              ))}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-[1.8rem] border border-amber-200/16 bg-[radial-gradient(circle_at_20%_10%,rgba(251,191,36,0.20),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.28))] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-100/72">
              <Trophy className="h-4 w-4" />
              Claim Your Nation
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Any vacant national belt can be activated by winning a valid game for that nation.
            </p>
            <Link
              href="/bets"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-amber-200/28 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/16"
            >
              View Open Bets
            </Link>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Sparkles className="h-4 w-4" />
              Belt Economy
            </div>
            <div className="mt-5 grid gap-3">
              <Stat label="Beacons Lit" value={`${litBeacons.length} / ${nationalBeacons.length}`} />
              <Stat label="Total Bounty Pool" value={`${totalBounty} WOLO/day`} />
              <Stat label="First Flame" value={currentChampion?.country ?? "Awaiting champion"} />
              <Stat label="Vacant Nations" value={String(vacantBeacons.length)} />
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Claim a vacant nation", "Step into an empty national belt slot."],
            ["Win the title game", "Prove the claim on the battlefield."],
            ["Light the beacon", "Become your nation's champion."],
            ["Defend the crown", "Earn Tribute and answer valid challenges."],
          ].map(([title, body], index) => (
            <div key={title} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/18 bg-amber-300/10 text-amber-100">
                {index + 1}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
