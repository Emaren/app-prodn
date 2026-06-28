"use client";

import {type CSSProperties, useCallback, useEffect, useMemo, useRef, useState} from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";
import { LobbyChat } from "@/components/lobby/LobbyChat";
import { LobbyHero } from "@/components/lobby/LobbyHero";
import { LiveTickerStrip } from "@/components/lobby/LiveTickerStrip";
import { getLobbyHeroBackground } from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { OnlinePlayersPanel } from "@/components/lobby/OnlinePlayersPanel";
import { RecentMatchesPanel } from "@/components/lobby/RecentMatchesPanel";
import { TopWoloEarnersTile } from "@/components/lobby/TopWoloEarnersTile";
import { TournamentPanel } from "@/components/lobby/TournamentPanel";
import { WatchAndChatHero } from "@/components/lobby/WatchAndChatHero";
import { WoloMarketTile } from "@/components/lobby/WoloMarketTile";
import { WolomaniaPromoTile } from "@/components/lobby/WolomaniaPromoTile";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { buildChatItems } from "@/components/lobby/utils";
import { useUserAuth } from "@/context/UserAuthContext";
import { type AiVisibilityOption } from "@/lib/aiConciergeConfig";
import type { EventTileView } from "@/lib/events/types";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  type LobbyLeaderboardEntry,
  type LobbyMessage,
  type LobbySnapshot,
} from "@/lib/lobby";
import { avatarCardUrlForUser, avatarUrlForName } from "@/lib/avatarAssets";

const EMPTY_MESSAGES: LobbyMessage[] = [];
const ZODIAC_UID = "u_06c16d39d25c476fac2c86fee7b4d189";

const FEATURED_WARRIOR_SLOT_COUNT = 4;
const FEATURED_WARRIOR_ROTATE_MS = 5200;
const FEATURED_WARRIOR_FADE_MS = 320;

type FeaturedWarrior = {
  key: string;
  name: string;
  lookupName: string;
  role: string;
  href: string;
  imageUrl?: string;
  isPlaceholder?: boolean;
};

const FEATURED_WARRIOR_FALLBACKS: FeaturedWarrior[] = [
  {
    name: "Dil_Pascana",
    key: "dil-pascana",
    lookupName: "Dil_Pascana",
    role: "The Specialist",
    href: "/players/by-name/Dil_Pascana",
    imageUrl: "/featured-warriors/thumbs/user-u-17816384361f4c8a8d57c6934265100b-1782240257384-64388f3d-thumb.webp",
  },
  {
    key: "premium:sniper",
    name: "Sniper",
    lookupName: "Sniper",
    role: "The Sharpshooter",
    href: "/players/by-name/Sniper",
    imageUrl: "/featured-warriors/thumbs/sniper-1781562832558-257d25a4-thumb.webp",
  },
  {
    key: "premium:julio-alvarez",
    name: "Julio",
    lookupName: "Julio Alvarez",
    role: "The Conquistador",
    href: "/players/by-name/Julio%20Alvarez",
    imageUrl: "/featured-warriors/thumbs/julio-alvarez-1781569866259-256b2ad7-thumb.webp",
  },
  {
    key: "premium:jim",
    name: "Jim",
    lookupName: "Jim",
    role: "The General",
    href: "/players/by-name/Jim",
    imageUrl: "/featured-warriors/thumbs/jim-1781560436622-52fb61a1-thumb.webp",
  },
  {
    key: "premium:emaren",
    name: "Emaren",
    lookupName: "Emaren",
    role: "The Tactician",
    href: "/players/by-name/Emaren",
    imageUrl: "/featured-warriors/thumbs/emaren-1781569822986-d51b50eb-thumb.webp",
  },
];

const FEATURED_WARRIOR_PREMIUM_POOL: FeaturedWarrior[] = [

  {
    key: "premium:zodiac",
    name: "Zodiac",
    lookupName: "Zodiac",
    role: "Chaos Champion",
    href: `/players/${encodeURIComponent(ZODIAC_UID)}`,
    imageUrl: avatarCardUrlForUser(ZODIAC_UID, "Zodiac"),
  },
  ...FEATURED_WARRIOR_FALLBACKS,
  {
    key: "premium:bdbpigman",
    name: "[BDB]PIGMAN",
    lookupName: "[BDB]Pigman",
    role: "Featured Contender",
    href: "/players/by-name/%5BBDB%5DPigman",
    imageUrl: "/featured-warriors/thumbs/bdbpigman-warrior-1782002565561-d8e58ddb-thumb.webp",
  },
  {
    key: "premium:ra",
    name: "- RA 𓁛𓇳",
    lookupName: "- Ra 𓁛𓇳",
    role: "Featured Contender",
    href: "/players/by-name/- %20Ra%20%F0%93%81%9B%F0%93%87%B3",
    imageUrl: "/featured-warriors/thumbs/user-u-510b020f19b5450793c95e05de791cc7-1782003774595-b1f6eb26-thumb.webp",
  },
  {
    key: "premium:moose",
    name: "Moose",
    lookupName: "Moose",
    role: "Featured Warrior",
    href: "/players/by-name/Moose",
    imageUrl: "/featured-warriors/thumbs/moose-warrior-1782004403325-b6064f9e-thumb.webp",
  },
  {
    key: "premium:deltaforce",
    name: "Deltaforce",
    lookupName: "Deltaforce",
    role: "Featured Warrior",
    href: "/players/by-name/Deltaforce",
    imageUrl: "/featured-warriors/thumbs/deltaforce-warrior-1782002519289-c30963fb-thumb.webp",
  },
  {
    key: "premium:sladk0eshka",
    name: "Sladk0Eshka",
    lookupName: "Sladk0Eshka",
    role: "Featured Warrior",
    href: "/players/by-name/Sladk0Eshka",
    imageUrl: "/featured-warriors/thumbs/sladk0eshka-warrior-1782002438579-ed41604f-thumb.webp",
  },
  {
    key: "premium:grimer",
    name: "Grimer",
    lookupName: "Grimer",
    role: "Featured Warrior",
    href: "/players/by-name/Grimer",
    imageUrl: "/featured-warriors/thumbs/grimer-1782001909186-43c9cb68-thumb.webp",
  },
];

function normalizeFeaturedWarriorKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function featuredRoleForLeaderboardEntry(entry: LobbyLeaderboardEntry) {
  if (entry.isOnline) return "In the Arena";
  if (entry.claimed) return "Claimed Warrior";
  if (entry.rank > 0) return `Rank #${entry.rank}`;
  return "Replay-Built Warrior";
}

function buildFeaturedWarriorPool(entries: LobbyLeaderboardEntry[]) {
  const entryByName = new Map(
    entries.map((entry) => [normalizeFeaturedWarriorKey(entry.name), entry])
  );

  const seen = new Set<string>();
  const warriors: FeaturedWarrior[] = [];

  const pushWarrior = (warrior: FeaturedWarrior) => {
    const dedupeKey = normalizeFeaturedWarriorKey(warrior.lookupName || warrior.name);
    if (!dedupeKey || seen.has(dedupeKey)) return;

    const leaderboardEntry = entryByName.get(dedupeKey);
    seen.add(dedupeKey);

    warriors.push({
      ...warrior,
      href: leaderboardEntry?.href || warrior.href,
      role: leaderboardEntry
        ? featuredRoleForLeaderboardEntry(leaderboardEntry)
        : warrior.role,
    });
  };

  FEATURED_WARRIOR_PREMIUM_POOL.forEach(pushWarrior);

  entries.slice(0, 32).forEach((entry) => {
    const key = normalizeFeaturedWarriorKey(entry.name);
    if (!key || seen.has(key)) return;

    pushWarrior({
      key: `placeholder:${entry.key || entry.href || entry.name}`,
      name: entry.name,
      lookupName: entry.name,
      role: featuredRoleForLeaderboardEntry(entry),
      href: entry.href || `/players/by-name/${encodeURIComponent(entry.name)}`,
      isPlaceholder: true,
    });
  });

  return warriors;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
}




const FEATURED_WARRIOR_MIN_REAL_AVATARS = 3;

const FEATURED_WARRIOR_REAL_AVATAR_KEYS = new Set([
  "premium:zodiac",
  "zodiac",
  "dil-pascana",
  "premium:sniper",
  "premium:julio",
  "premium:julio-alvarez",
  "premium:jim",
  "premium:ra",
  "premium:pigman",
  "premium:emaren",
  "premium:moose",
  "premium:grimer",
  "sniper",
  "julio",
  "julio-alvarez",
  "jim",
  "ra",
  "bdb-pigman",
  "pigman",
  "emaren",
  "moose",
  "grimer",
]);

function featuredWarriorHasRealAvatar(warrior: FeaturedWarrior) {
  const directImage = warrior.imageUrl || "";

  if (
    directImage &&
    !directImage.includes("no-avatar") &&
    !directImage.includes("silhouette") &&
    !directImage.includes("placeholder")
  ) {
    return true;
  }

  return Boolean(
    FEATURED_WARRIOR_REAL_AVATAR_KEYS.has(warrior.key) ||
      FEATURED_WARRIOR_REAL_AVATAR_KEYS.has(normalizeFeaturedWarriorKey(warrior.name)) ||
      FEATURED_WARRIOR_REAL_AVATAR_KEYS.has(normalizeFeaturedWarriorKey(warrior.lookupName))
  );
}

function dedupeFeaturedWarriors(pool: FeaturedWarrior[]) {
  const seen = new Set<string>();
  const unique: FeaturedWarrior[] = [];

  for (const warrior of pool) {
    const key = warrior.key || normalizeFeaturedWarriorKey(warrior.name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(warrior);
  }

  return unique;
}

function selectFeaturedWarriorLineup(pool: FeaturedWarrior[], current: FeaturedWarrior[] = []) {
  const combined = dedupeFeaturedWarriors([...current, ...pool, ...FEATURED_WARRIOR_FALLBACKS]);
  const real = combined.filter(featuredWarriorHasRealAvatar);
  const placeholder = combined.filter((warrior) => !featuredWarriorHasRealAvatar(warrior));

  const selected: FeaturedWarrior[] = [];

  for (const warrior of real) {
    if (selected.length >= FEATURED_WARRIOR_MIN_REAL_AVATARS) break;
    selected.push(warrior);
  }

  for (const warrior of [...combined, ...real, ...placeholder]) {
    if (selected.length >= FEATURED_WARRIOR_SLOT_COUNT) break;
    if (selected.some((candidate) => candidate.key === warrior.key)) continue;

    const next = [...selected, warrior];
    const placeholderCount = next.filter((candidate) => !featuredWarriorHasRealAvatar(candidate)).length;

    if (placeholderCount <= FEATURED_WARRIOR_SLOT_COUNT - FEATURED_WARRIOR_MIN_REAL_AVATARS) {
      selected.push(warrior);
    }
  }

  for (const warrior of combined) {
    if (selected.length >= FEATURED_WARRIOR_SLOT_COUNT) break;
    if (selected.some((candidate) => candidate.key === warrior.key)) continue;
    selected.push(warrior);
  }

  return selected.slice(0, FEATURED_WARRIOR_SLOT_COUNT);
}

function featuredWarriorLineupHasRealFloor(lineup: FeaturedWarrior[]) {
  return lineup.filter(featuredWarriorHasRealAvatar).length >= FEATURED_WARRIOR_MIN_REAL_AVATARS;
}


function deterministicFeaturedWarriorOpening(pool: FeaturedWarrior[]) {
  const byKey = new Map<string, FeaturedWarrior>();

  for (const warrior of [...FEATURED_WARRIOR_FALLBACKS, ...pool]) {
    byKey.set(warrior.key, warrior);
  }

  const preferredKeys = [
    "premium:zodiac",
    "dil-pascana",
    "premium:sniper",
    "premium:julio-alvarez",
    "premium:jim",
  ];

  const selected: FeaturedWarrior[] = [];

  for (const key of preferredKeys) {
    const warrior = byKey.get(key);
    if (warrior && !selected.some((item) => item.key === warrior.key)) {
      selected.push(warrior);
    }
  }

  for (const warrior of [...FEATURED_WARRIOR_FALLBACKS, ...pool]) {
    if (selected.length >= FEATURED_WARRIOR_SLOT_COUNT) break;
    if (!featuredWarriorHasRealAvatar(warrior)) continue;
    if (selected.some((item) => item.key === warrior.key)) continue;
    selected.push(warrior);
  }

  for (const warrior of [...FEATURED_WARRIOR_FALLBACKS, ...pool]) {
    if (selected.length >= FEATURED_WARRIOR_SLOT_COUNT) break;
    if (selected.some((item) => item.key === warrior.key)) continue;
    selected.push(warrior);
  }

  return selected.slice(0, FEATURED_WARRIOR_SLOT_COUNT);
}

function useRotatingFeaturedWarriors(pool: FeaturedWarrior[], paused: boolean) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [featuredWarriorsMounted, setFeaturedWarriorsMounted] = useState(false);
  const [visibleWarriors, setVisibleWarriors] = useState(() => deterministicFeaturedWarriorOpening(FEATURED_WARRIOR_FALLBACKS));
  const [fadingSlot, setFadingSlot] = useState<number | null>(null);
  const lastChangedSlotRef = useRef<number | null>(null);
  const slotBagRef = useRef<number[]>([]);

  useEffect(() => {
    setFeaturedWarriorsMounted(true);
  }, []);

  useEffect(() => {
    if (!featuredWarriorsMounted) {
      return;
    }

    setVisibleWarriors((current) => {
      const stillValid = current.filter((warrior) =>
        pool.some((candidate) => candidate.name === warrior.name)
      );
      const usedNames = new Set(stillValid.map((warrior) => warrior.name));
      const fill = pool.filter((warrior) => !usedNames.has(warrior.name));
      return selectFeaturedWarriorLineup([...stillValid, ...fill, ...pool], current);
    });
  }, [pool]);

  useEffect(() => {
    if (!featuredWarriorsMounted || paused || prefersReducedMotion || pool.length <= FEATURED_WARRIOR_SLOT_COUNT) {
      return;
    }

    let replaceTimer: number | null = null;
    let revealTimer: number | null = null;

    const shuffledSlots = () => {
      const slots = Array.from({ length: FEATURED_WARRIOR_SLOT_COUNT }, (_, index) => index).filter(
        (slot) => slot !== lastChangedSlotRef.current
      );

      for (let i = slots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = slots[i];
        slots[i] = slots[j];
        slots[j] = tmp;
      }

      return slots;
    };

    const rotate = () => {
      if (slotBagRef.current.length === 0) {
        slotBagRef.current = shuffledSlots();
      }

      const nextSlot = slotBagRef.current.shift();
      const slot = typeof nextSlot === "number" ? nextSlot : 0;
      lastChangedSlotRef.current = slot;

      setFadingSlot(slot);

      replaceTimer = window.setTimeout(() => {
        setVisibleWarriors((current) => {
          const currentNames = new Set(current.map((warrior) => warrior.name));
          const outgoingName = current[slot]?.name;

          const outsideCurrent = pool.filter((warrior) => !currentNames.has(warrior.name));
          const fallbackPool = pool.filter((warrior) => warrior.name !== outgoingName);
          const baseCandidatePool = outsideCurrent.length > 0 ? outsideCurrent : fallbackPool;
          const safeCandidatePool = baseCandidatePool.filter((candidate) => {
            const preview = [...current];
            preview[slot] = candidate;
            return featuredWarriorLineupHasRealFloor(preview);
          });
          const candidatePool = safeCandidatePool.length > 0 ? safeCandidatePool : baseCandidatePool;

          const nextWarrior = candidatePool[Math.floor(Math.random() * candidatePool.length)] ?? current[slot];
          const next = [...current];
          next[slot] = nextWarrior;
          return featuredWarriorLineupHasRealFloor(next) ? next : selectFeaturedWarriorLineup(pool, next);
        });

        revealTimer = window.setTimeout(() => {
          setFadingSlot(null);
        }, 90);
      }, FEATURED_WARRIOR_FADE_MS);
    };

    const interval = window.setInterval(rotate, FEATURED_WARRIOR_ROTATE_MS);

    return () => {
      window.clearInterval(interval);
      if (replaceTimer !== null) window.clearTimeout(replaceTimer);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
    };
  }, [featuredWarriorsMounted, paused, pool, prefersReducedMotion]);

  return { visibleWarriors, fadingSlot };
}

type HomePageClientProps = {
  initialLobby: LobbySnapshot | null;
  initialEventTile: EventTileView;
};

function AdvancedFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const [paused, setPaused] = useState(false);
  const { visibleWarriors, fadingSlot } = useRotatingFeaturedWarriors(warriors, paused);

  return (
    <section
      className="relative px-4 py-5 sm:px-5 bg-transparent overflow-visible bg-transparent shadow-none border-0 ring-0 rounded-none overflow-visible"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/28 to-transparent" />
      <div className="grid gap-4 lg:grid-cols-[minmax(9rem,0.42fr)_minmax(0,1fr)_minmax(8rem,0.35fr)] lg:items-center">
        <div className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-[0.38em] text-amber-100/72">
            Featured Warriors
          </div>
          <div className="mt-2 text-sm leading-5 text-slate-400">
            Elite competitors. Legendary rivalries.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleWarriors.map((warrior, index) => (
            <Link
              key={index}
              href={warrior.href}
                className={`block group relative min-h-[16rem] overflow-visible transition-all ease-out hover:-translate-y-0.5 ${fadingSlot === index ? "opacity-0 scale-[0.985]" : "opacity-100 scale-100"}`}
                style={{ transitionDuration: `${FEATURED_WARRIOR_FADE_MS}ms` }}
            >
              <Image
                key={warrior.imageUrl ?? warrior.lookupName}
                src={warrior.imageUrl ?? avatarUrlForName(warrior.lookupName)}
                alt=""
                fill
                sizes="(min-width: 1280px) 250px, (min-width: 640px) 45vw, 90vw"
                className={`object-contain object-top transition duration-700 group-hover:scale-[1.01] opacity-85`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/52 via-black/8 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.11),transparent_64%)]" />
              <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-amber-200/12 bg-black/48 px-2.5 py-2.5 text-center backdrop-blur">
                <div className="mx-auto max-w-full overflow-hidden text-balance break-words font-serif text-[clamp(0.78rem,1.02vw,1.05rem)] font-semibold uppercase leading-[1.05] tracking-[0.075em] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {warrior.name}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  {warrior.role}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          href="/players"
          className="hidden justify-self-end rounded-full border border-amber-200/14 px-4 py-2 text-sm text-slate-300 transition hover:border-amber-200/30 hover:text-amber-100 lg:inline-flex"
        >
          View all warriors
        </Link>
      </div>
    </section>
  );
}

function ExtremeFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const [paused, setPaused] = useState(false);
  const { visibleWarriors, fadingSlot } = useRotatingFeaturedWarriors(warriors, paused);

  return (
    <section
      className="relative rounded-none px-5 pb-4 pt-8 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:px-7 lg:px-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-0 overflow-visible rounded-none">
        <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/30 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/35 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black/45 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black/45 to-transparent" />
      </div>

      <div className="relative z-10 grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_10rem] lg:items-center xl:grid-cols-[14rem_minmax(0,1fr)_12rem]">
        <div className="lg:pl-3 xl:pl-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-amber-100/80">
            <Crown className="h-3.5 w-3.5 fill-amber-200/40 text-amber-200/70" />
            Featured Warriors
          </div>
          <div className="mt-2 max-w-[13rem] text-sm leading-5 text-slate-400">
            Elite competitors. Legendary rivalries.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          {visibleWarriors.map((warrior, index) => {
            const avatarSrc = warrior.imageUrl ?? avatarUrlForName(warrior.lookupName);
            return (
              <Link
                key={index}
                href={warrior.href}
                className={`block group relative min-h-[16rem] overflow-visible transition-all ease-out hover:-translate-y-0.5 ${fadingSlot === index ? "opacity-0 scale-[0.985]" : "opacity-100 scale-100"}`}
                style={{ transitionDuration: `${FEATURED_WARRIOR_FADE_MS}ms` }}
              >
                <div className="absolute inset-x-0 bottom-2 top-7 overflow-hidden rounded-[1.35rem] border border-amber-100/12 bg-slate-950/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_60px_rgba(0,0,0,0.24)] transition group-hover:border-amber-200/26">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_90%,rgba(251,191,36,0.10),transparent_58%)]" />
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className={`absolute inset-x-[-12%] -top-5 bottom-6 z-10 transition duration-700 group-hover:-translate-y-1 group-hover:scale-[1.012] opacity-100`}>
                  <Image
                    key={avatarSrc}
                    src={avatarSrc}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 280px, (min-width: 640px) 45vw, 90vw"
                    className="object-contain object-center drop-shadow-[0_18px_34px_rgba(0,0,0,0.56)] [mask-image:linear-gradient(180deg,black_0%,black_88%,transparent_100%)]"
                  />
                </div>
                <div className="absolute inset-x-4 bottom-4 z-20 rounded-xl bg-black/58 px-2.5 py-2.5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.34)] backdrop-blur">
                  <div className="mx-auto max-w-full overflow-hidden text-balance break-words font-serif text-[clamp(0.76rem,0.96vw,1rem)] font-semibold uppercase leading-[1.05] tracking-[0.07em] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {warrior.name}
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-300">
                    {warrior.role}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/players"
          className="inline-flex justify-self-start text-sm font-semibold text-slate-300 transition hover:text-amber-100 lg:justify-self-end"
        >
          View all warriors <ChevronRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export default function HomePageClient({


  initialLobby,
  initialEventTile,
}: HomePageClientProps) {
const { uid, isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();
  const { themeKey, tileThemeKey, viewMode, setViewMode } = useLobbyAppearance();
  const communityLobbyTile = useTileViewPreference("community_lobby");

  const [lobby, setLobby] = useState<LobbySnapshot | null>(initialLobby);
  const [liveConnected, setLiveConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [chatCardHeight, setChatCardHeight] = useState<number | null>(null);
  const [heroRailHeight, setHeroRailHeight] = useState<number | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<number | null>(null);
  const [moderatingMessageId, setModeratingMessageId] = useState<number | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiVisibility, setAiVisibility] = useState<AiVisibilityOption>("public");
  const [aiScribeEnabled, setAiScribeEnabled] = useState(true);
  const [aiGrimerEnabled, setAiGrimerEnabled] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  const loadLobby = useCallback(async () => {
    try {
      const response = await fetch("/api/lobby", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Lobby request failed: ${response.status}`);
      }

      const payload = (await response.json()) as LobbySnapshot;
      setLobby(payload);
      setLobbyError(null);
    } catch (error) {
      console.warn("Failed to load lobby:", error);
      setLobbyError("Lobby data is temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    void loadLobby();

    const interval = window.setInterval(() => {
      void loadLobby();
    }, 30_000);

return () => {
      window.clearInterval(interval);
    };
  }, [loadLobby]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource("/api/lobby/stream");

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as LobbySnapshot;
        setLobby(snapshot);
        setLobbyError(null);
        setLiveConnected(true);
      } catch (error) {
        console.warn("Failed to parse live lobby snapshot:", error);
      }
    };

    const handleStreamError = () => {
      setLiveConnected(false);
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.addEventListener("error", handleStreamError as EventListener);

    source.onopen = () => {
      setLiveConnected(true);
    };

    source.onerror = () => {
      setLiveConnected(false);
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.removeEventListener("error", handleStreamError as EventListener);
      source.close();
      setLiveConnected(false);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("auth") === "steam-error");
    setAuthDetail(params.get("detail"));
  }, []);

  const tournament = lobby?.tournament ?? getFallbackTournament(false);
  const leaderboard = lobby?.leaderboard ?? getFallbackLeaderboard();
  const featuredWarriors = useMemo(
    () => buildFeaturedWarriorPool(leaderboard.entries),
    [leaderboard.entries]
  );
  const onlineUsers = lobby?.onlineUsers ?? [];
  const recentMatches = lobby?.recentMatches ?? [];
  const messages = lobby?.messages ?? EMPTY_MESSAGES;
  const wolo = lobby?.wolo ?? null;
  const woloEarners = lobby?.woloEarners ?? null;
  const aoe2hdPulse = lobby?.aoe2hdPulse ?? null;
  const liveTicker = lobby?.liveTicker ?? null;
  const woloMarket = lobby?.woloMarket ?? null;
  const isAdvancedLobby = communityLobbyTile.viewMode === "advanced";
  const isExtremeLobby = communityLobbyTile.viewMode === "extreme";
  const shouldShowShowcaseLobby = isAdvancedLobby || isExtremeLobby;

  const chatItems = buildChatItems(messages);
  const latestChatMessageKey = useMemo(
    () =>
      messages.length > 0
        ? `${messages[messages.length - 1]?.id ?? "last"}:${messages[messages.length - 1]?.createdAt ?? ""}`
        : "empty",
    [messages]
  );

  const chatRoomTitle =
    messages.length > 0 && messages[0]?.roomSlug === tournament.roomSlug && !tournament.isFallback
      ? `${tournament.title} Chat`
      : "Live Chat";

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = chatScrollRef.current;
    if (!node) return;

    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (chatItems.length === 0) return;

    let secondFrame = 0;
    const timeout = window.setTimeout(() => {
      scrollChatToBottom();
    }, 140);

    const frame = window.requestAnimationFrame(() => {
      scrollChatToBottom();
      secondFrame = window.requestAnimationFrame(() => {
        scrollChatToBottom();
      });
    });

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [chatCardHeight, latestChatMessageKey, chatItems.length, scrollChatToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncHeroRailHeight = () => {
      if (window.innerWidth < 1024) {
        setHeroRailHeight(null);
        return;
      }

      const heroStack =
        document.querySelector<HTMLElement>("[data-lobby-hero-stack='true']") ||
        document.querySelector<HTMLElement>("[data-lobby-leaderboard-panel='true']");
      const nextHeight = heroStack?.getBoundingClientRect().height ?? 0;
      setHeroRailHeight(nextHeight > 0 ? Math.ceil(nextHeight) : null);
    };

    syncHeroRailHeight();

    const handleResize = () => {
      syncHeroRailHeight();
    };

    window.addEventListener("resize", handleResize);

    const heroStack =
      document.querySelector<HTMLElement>("[data-lobby-hero-stack='true']") ||
      document.querySelector<HTMLElement>("[data-lobby-leaderboard-panel='true']");

    if (typeof ResizeObserver === "undefined" || !heroStack) {
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver(() => {
      syncHeroRailHeight();
    });

    observer.observe(heroStack);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [
    communityLobbyTile.viewMode,
    leaderboard.entries.length,
    leaderboard.trackedPlayers,
    tileThemeKey,
    viewMode,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncChatHeightToRightColumn = () => {
      if (window.innerWidth < 1024) {
        setChatCardHeight(null);
        return;
      }

      const rightHeight = rightColumnRef.current?.getBoundingClientRect().height ?? 0;
      if (rightHeight > 0) {
        setChatCardHeight(Math.ceil(rightHeight));
      }
    };

    syncChatHeightToRightColumn();

    const handleResize = () => {
      syncChatHeightToRightColumn();
    };

    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver === "undefined" || !rightColumnRef.current) {
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver(() => {
      syncChatHeightToRightColumn();
    });

    observer.observe(rightColumnRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  async function handleJoinTournament() {
    if (!tournament.id) return;

    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setJoinPending(true);
      setJoinError(null);

      const response = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; tournament?: LobbySnapshot["tournament"] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Join failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              tournament: (payload.tournament as LobbySnapshot["tournament"]) || current.tournament,
            }
          : current
      );

      await loadLobby();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Join failed.");
    } finally {
      setJoinPending(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = messageBody.trim();
    if (!trimmed) return;

    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setChatPending(true);
      setChatError(null);

      const response = await fetch("/api/lobby/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          roomSlug: tournament.roomSlug,
          aiEnabled,
          aiVisibility,
          aiScribeEnabled,
          aiGrimerEnabled,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[]; aiWarning?: string | null }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message failed.");
      }

      setMessageBody("");
      setChatNotice(typeof payload.aiWarning === "string" ? payload.aiWarning : null);
      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message failed.");
      setChatNotice(null);
    } finally {
      setChatPending(false);
    }
  }

  async function handleToggleReaction(messageId: number, emoji: string) {
    try {
      setReactingMessageId(messageId);
      setChatError(null);

      const response = await fetch("/api/lobby/chat/reaction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Reaction failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Reaction failed.");
    } finally {
      setReactingMessageId(null);
    }
  }

  async function handleModerateMessage(
    action: "edit_message" | "delete_message",
    messageId: number,
    body?: string
  ) {
    try {
      setModeratingMessageId(messageId);
      setChatError(null);

      const response = await fetch("/api/lobby/chat", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          messageId,
          body,
          roomSlug: tournament.roomSlug,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message update failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message update failed.");
    } finally {
      setModeratingMessageId(null);
    }
  }

  const chatCardStyle: CSSProperties | undefined =
    chatCardHeight && typeof window !== "undefined" && window.innerWidth >= 1024
      ? { height: `${chatCardHeight}px` }
      : undefined;
  const heroRailStyle: CSSProperties | undefined =
    heroRailHeight && typeof window !== "undefined" && window.innerWidth >= 1024
      ? { height: `${heroRailHeight}px` }
      : undefined;

  const heroStyle: CSSProperties = {
    backgroundImage: getLobbyHeroBackground(themeKey, viewMode),
  };

  const heroShellClassName =
    viewMode === "field"
      ? "border-emerald-400/20 shadow-[0_28px_80px_rgba(5,46,22,0.32)]"
      : "border-white/10 shadow-[0_28px_80px_rgba(15,23,42,0.4)]";
  const lobbyHeroGridClassName = isExtremeLobby
    ? "grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.82fr)] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(27rem,0.82fr)]"
    : "grid gap-5 lg:grid-cols-[1.2fr_0.95fr] lg:items-start lg:gap-7";

    const [homepageHydrated, setHomepageHydrated] = useState(false);

  useEffect(() => {
    setHomepageHydrated(true);
  }, []);

  if (!homepageHydrated) {
    return (
      <main
        suppressHydrationWarning
        className="min-h-screen bg-[#07101f] text-slate-100"
      />
    );
  }

return (
    <div className="space-y-4 overflow-x-hidden py-2 text-white sm:space-y-6 sm:py-3">
      {shouldShowShowcaseLobby ? (
        <>
          {isExtremeLobby ? (
            <ExtremeFeaturedWarriors warriors={featuredWarriors} />
          ) : (
            <AdvancedFeaturedWarriors warriors={featuredWarriors} />
          )}
          <LiveTickerStrip
            ticker={liveTicker}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
          <WolomaniaPromoTile eventTile={initialEventTile} />
          <WatchAndChatHero
            tournament={tournament}
            recentMatches={recentMatches}
            messages={messages}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            variant={isExtremeLobby ? "extreme" : "standard"}
            isAuthenticated={isAuthenticated}
            messageBody={messageBody}
            chatPending={chatPending}
            onMessageBodyChange={setMessageBody}
            onSendMessage={() => {
              void handleSendMessage();
            }}
            onLogin={() => loginWithSteam("/")}
          />
          <WoloMarketTile
            market={woloMarket}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
        </>
      ) : null}

      <section
        className={`overflow-hidden rounded-[1.75rem] border p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-6 lg:p-8 ${heroShellClassName}`}
        style={heroStyle}
      >
        <div className={lobbyHeroGridClassName}>
          <div data-lobby-hero-stack="true" className={isExtremeLobby ? "flex min-w-0 flex-col gap-5" : "min-w-0"}>
            <LobbyHero
            liveConnected={liveConnected}
            authError={authError}
            authDetail={authDetail}
            lobbyError={lobbyError}
            isAuthenticated={isAuthenticated}
            loading={loading}
            leaderboard={leaderboard}
            recentMatches={recentMatches}
            wolo={wolo}
            aoe2hdPulse={aoe2hdPulse}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            tileViewMode={communityLobbyTile.viewMode}
            onTileViewModeChange={communityLobbyTile.setViewMode}
            onToggleTileViewMode={communityLobbyTile.toggleViewMode}
          />
          </div>

          <div
            className={`grid min-h-0 min-w-0 overflow-hidden gap-3.5 lg:grid-rows-[auto_minmax(0,1fr)] lg:self-start lg:pt-4 ${
              isExtremeLobby ? "lg:min-h-[96rem]" : ""
            }`}
            style={heroRailStyle}
          >
            <TournamentPanel
              tournament={tournament}
              themeKey={tileThemeKey}
              viewMode={viewMode}
              surface={isExtremeLobby ? "extreme" : "standard"}
              isAdmin={isAdmin}
              isAuthenticated={isAuthenticated}
              joinPending={joinPending}
              joinError={joinError}
              onJoinTournament={() => {
                void handleJoinTournament();
              }}
              onLogin={() => loginWithSteam("/")}
            />

            <div
              className={`h-full min-h-0 overflow-hidden ${
                isExtremeLobby ? "lg:h-[80rem] lg:min-h-[80rem] lg:max-h-[80rem]" : ""
              }`}
            >
              <TopWoloEarnersTile
                wolo={wolo}
                board={woloEarners}
                themeKey={tileThemeKey}
                viewMode={viewMode}
                surface={isExtremeLobby ? "extreme" : "standard"}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="lobby-chat" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <LobbyChat
          style={chatCardStyle}
          themeKey={tileThemeKey}
          viewMode={viewMode}
          chatRoomTitle={chatRoomTitle}
          messagesCount={messages.length}
          chatItems={chatItems}
          chatScrollRef={chatScrollRef}
          chatError={chatError}
          chatNotice={chatNotice}
          isAuthenticated={isAuthenticated}
          playerName={playerName}
          currentUserInGameName={user?.inGameName ?? null}
          currentUserSteamPersonaName={user?.steamPersonaName ?? null}
          currentUserUid={uid ?? null}
          currentUserIsAdmin={isAdmin}
          messageBody={messageBody}
          chatPending={chatPending}
          reactingMessageId={reactingMessageId}
          moderatingMessageId={moderatingMessageId}
          aiEnabled={aiEnabled}
          aiVisibility={aiVisibility}
          aiScribeEnabled={aiScribeEnabled}
          aiGrimerEnabled={aiGrimerEnabled}
          onMessageBodyChange={setMessageBody}
          onSendMessage={() => {
            void handleSendMessage();
          }}
          onAiEnabledChange={setAiEnabled}
          onAiVisibilityChange={setAiVisibility}
          onAiScribeEnabledChange={setAiScribeEnabled}
          onAiGrimerEnabledChange={setAiGrimerEnabled}
          onToggleReaction={(messageId, emoji) => {
            void handleToggleReaction(messageId, emoji);
          }}
          onEditMessage={(messageId, nextBody) => {
            void handleModerateMessage("edit_message", messageId, nextBody);
          }}
          onDeleteMessage={(messageId) => {
            void handleModerateMessage("delete_message", messageId);
          }}
          onLogin={() => loginWithSteam("/")}
          surface={isExtremeLobby ? "extreme" : "standard"}
        />

        <div ref={rightColumnRef} className="flex min-w-0 flex-col gap-6">
          <OnlinePlayersPanel
            onlineUsers={onlineUsers}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
          <RecentMatchesPanel
            recentMatches={recentMatches}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
        </div>
      </section>
    </div>
  );
}
