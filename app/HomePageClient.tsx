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
const DIL_PASCANA_UID = "u_17816384361f4c8a8d57c6934265100b";
const SNIPER_UID = "u_1301e0492fdf4a229d941940413497e1";
const JULIO_ALVAREZ_UID = "u_79ce46af3d504ceca718e5fda83e3502";
const JIM_UID = "u_0df73bdbb64646c19e4a9bfd225b3285";
const RA_UID = "u_510b020f19b5450793c95e05de791cc7";
const BDB_PIGMAN_UID = "u_a0923530e82d43ceb3f6926c004748dc";
const DELTAFORCE_UID = "u_f206dd9c3c1c40799b43a3faf7af986e";
const SLADK0ESHKA_UID = "u_73b78fcddb90417180495c1468937049";
const GRIMER_UID = "aoe2hd_ai_grimer";
const MOOSE_UID = "aoe2hd-moose";

const FEATURED_WARRIOR_SLOT_COUNT = 4;
const FEATURED_WARRIOR_ROTATE_MS = 4600;
const FEATURED_WARRIOR_FADE_MS = 720;
const FEATURED_WARRIOR_HOLD_MS = 180;

const JULIO_FEATURED_SUBTITLE_LINES = [
  {
    key: "elo",
    text: "ELO SCORE",
    className: "text-amber-100/95 [text-shadow:0_0_14px_rgba(251,191,36,0.28)]",
  },
  {
    key: "record",
    text: "RECORD",
    className: "text-sky-100/95 [text-shadow:0_0_14px_rgba(56,189,248,0.20)]",
  },
  {
    key: "streak",
    text: "STREAK 🔥",
    className: "text-red-200/95 [text-shadow:0_0_16px_rgba(248,113,113,0.32)]",
  },
  {
    key: "ranking",
    text: "RANKING",
    className: "text-emerald-100/95 [text-shadow:0_0_16px_rgba(52,211,153,0.24)]",
  },
  {
    key: "og",
    text: "OG",
    className: "text-yellow-100/95 [text-shadow:0_0_18px_rgba(250,204,21,0.28)]",
  },
] as const;

let julioFeaturedSubtitleCursor = 0;

function nextJulioFeaturedSubtitleLine() {
  const line = JULIO_FEATURED_SUBTITLE_LINES[julioFeaturedSubtitleCursor % JULIO_FEATURED_SUBTITLE_LINES.length];
  julioFeaturedSubtitleCursor += 1;
  return line;
}

type FeaturedWarrior = {
  key: string;
  name: string;
  lookupName: string;
  role: string;
  premiumSubtitle?: string;
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
    imageUrl: avatarCardUrlForUser(DIL_PASCANA_UID, "Dil_Pascana"),
  },
  {
    key: "premium:sniper",
    name: "Sniper",
    lookupName: "Sniper",
    role: "The Sharpshooter",
    href: "/players/by-name/Sniper",
    imageUrl: avatarCardUrlForUser(SNIPER_UID, "Sniper"),
  },
  {
    key: "premium:julio-alvarez",
    name: "Julio",
    lookupName: "Julio Alvarez",
    role: "The Conquistador",
    premiumSubtitle: "ELO ᛫ RECORD ᛫ STREAK",
    href: "/players/by-name/Julio%20Alvarez",
    imageUrl: avatarCardUrlForUser(JULIO_ALVAREZ_UID, "Julio Alvarez"),
  },
  {
    key: "premium:jim",
    name: "Jim",
    lookupName: "Jim",
    role: "The General",
    href: "/players/by-name/Jim",
    imageUrl: avatarCardUrlForUser(JIM_UID, "Jim"),
  },
  {
    key: "premium:emaren",
    name: "Emaren",
    lookupName: "Emaren",
    role: "The Tactician",
    href: "/players/by-name/Emaren",
    imageUrl: avatarCardUrlForUser("u_626ea6497a984dabbc2338ef54c5d333", "Emaren"),
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
    imageUrl: avatarCardUrlForUser(BDB_PIGMAN_UID, "[BDB]Pigman"),
  },
  {
    key: "premium:ra",
    name: "- RA 𓁛𓇳",
    lookupName: "- Ra 𓁛𓇳",
    role: "Featured Contender",
    href: "/players/by-name/- %20Ra%20%F0%93%81%9B%F0%93%87%B3",
    imageUrl: avatarCardUrlForUser(RA_UID, "- Ra 𓁛𓇳"),
  },
  {
    key: "premium:moose",
    name: "Moose",
    lookupName: "Moose",
    role: "Ranked Warrior",
    href: "/players/by-name/Moose",
    imageUrl: avatarCardUrlForUser(MOOSE_UID, "Moose"),
  },
  {
    key: "premium:deltaforce",
    name: "Deltaforce",
    lookupName: "Deltaforce",
    role: "Featured Warrior",
    href: "/players/by-name/Deltaforce",
    imageUrl: avatarCardUrlForUser(DELTAFORCE_UID, "Deltaforce"),
  },
  {
    key: "premium:sladk0eshka",
    name: "Sladk0Eshka",
    lookupName: "Sladk0Eshka",
    role: "Featured Warrior",
    href: "/players/by-name/Sladk0Eshka",
    imageUrl: avatarCardUrlForUser(SLADK0ESHKA_UID, "Sladk0Eshka"),
  },
  {
    key: "premium:grimer",
    name: "Grimer",
    lookupName: "Grimer",
    role: "AI Advisor",
    href: "/players/by-name/Grimer",
    imageUrl: avatarCardUrlForUser(GRIMER_UID, "Grimer"),
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
  if (entry.rank > 0) return `Rank #${entry.rank}`;
  if (entry.isOnline) return "In the Arena";
  if (entry.claimed) return "Claimed Warrior";
  return "Rising Warrior";
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

function randomFeaturedWarriorOpening(pool: FeaturedWarrior[]) {
  const realAvatarPool = pool.filter(featuredWarriorHasRealAvatar);
  const source = realAvatarPool.length >= FEATURED_WARRIOR_SLOT_COUNT ? realAvatarPool : pool;
  const candidates = [...source];

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = candidates[index];
    const swap = candidates[swapIndex];

    if (!current || !swap) {
      continue;
    }

    candidates[index] = swap;
    candidates[swapIndex] = current;
  }

  const lineup = candidates.slice(0, FEATURED_WARRIOR_SLOT_COUNT);

  if (lineup.length >= FEATURED_WARRIOR_SLOT_COUNT) {
    return lineup;
  }

  return deterministicFeaturedWarriorOpening(pool);
}



function featuredWarriorImageSrc(warrior: FeaturedWarrior) {
  const identity = normalizeFeaturedWarriorKey(warrior.lookupName || warrior.name);

  if (identity === "grimer") {
    return avatarCardUrlForUser(GRIMER_UID, "Grimer");
  }

  if (identity === "moose") {
    return avatarCardUrlForUser(MOOSE_UID, "Moose");
  }

  if (identity === "zodiac") {
    return avatarCardUrlForUser(ZODIAC_UID, "Zodiac");
  }

  if (identity === "julio" || identity === "julio-alvarez") {
    return avatarCardUrlForUser(JULIO_ALVAREZ_UID, "Julio Alvarez");
  }

  return warrior.imageUrl ?? avatarUrlForName(warrior.lookupName);
}

function decodeFeaturedWarriorImage(src: string) {
  if (typeof window === "undefined" || !src) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.loading = "eager";
    (image as HTMLImageElement & { fetchPriority?: "high" | "low" | "auto" }).fetchPriority = "high";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (typeof image.decode === "function") {
        image.decode().catch(() => undefined).finally(resolve);
      } else {
        resolve();
      }
    };

    const timeout = window.setTimeout(finish, 2200);
    image.onload = () => {
      window.clearTimeout(timeout);
      finish();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      finish();
    };
    image.src = src;

    if (image.complete) {
      window.clearTimeout(timeout);
      finish();
    }
  });
}

function decodeFeaturedWarriorLineup(lineup: FeaturedWarrior[]) {
  return Promise.all(lineup.map((warrior) => decodeFeaturedWarriorImage(featuredWarriorImageSrc(warrior)))).then(
    () => undefined
  );
}


function preloadFeaturedWarriorImages(pool: FeaturedWarrior[]) {
  if (typeof window === "undefined") return;

  const urls = dedupeFeaturedWarriors([...pool, ...FEATURED_WARRIOR_PREMIUM_POOL, ...FEATURED_WARRIOR_FALLBACKS])
    .map(featuredWarriorImageSrc)
    .filter(Boolean);

  for (const url of urls) {
    void decodeFeaturedWarriorImage(url);
  }
}




function useRotatingFeaturedWarriors(pool: FeaturedWarrior[], paused: boolean) {
  const poolSignature = useMemo(
    () => pool.map((warrior) => `${warrior.key}:${featuredWarriorImageSrc(warrior)}`).join("|"),
    [pool]
  );

  const openingLineup = deterministicFeaturedWarriorOpening(pool);
  const [visibleWarriors, setVisibleWarriors] = useState(openingLineup);
  const [featuredWarriorsReady, setFeaturedWarriorsReady] = useState(false);
  const [fadingSlot, setFadingSlot] = useState<number | null>(null);

  const poolRef = useRef<FeaturedWarrior[]>(pool);
  const visibleWarriorsRef = useRef<FeaturedWarrior[]>(openingLineup);
  const lastChangedSlotRef = useRef<number | null>(null);
  const lastWarriorBySlotRef = useRef<Record<number, string | null>>({});
  const slotCursorRef = useRef(0);
  const transitionInFlightRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
  };

  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
      callback();
    }, delay);

    timersRef.current.push(timer);
    return timer;
  };

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  useEffect(() => {
    visibleWarriorsRef.current = visibleWarriors;
  }, [visibleWarriors]);

  useEffect(() => {
    let disposed = false;

    clearTimers();
    transitionInFlightRef.current = false;
    setFadingSlot(null);
    setFeaturedWarriorsReady(false);

    const initialLineup = randomFeaturedWarriorOpening(poolRef.current);
    initialLineup.forEach((warrior, index) => {
      lastWarriorBySlotRef.current[index] = warrior.key;
    });

    visibleWarriorsRef.current = initialLineup;
    setVisibleWarriors(initialLineup);
    preloadFeaturedWarriorImages(poolRef.current);

    void decodeFeaturedWarriorLineup(initialLineup).then(() => {
      if (disposed) return;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!disposed) setFeaturedWarriorsReady(true);
        });
      });
    });

    return () => {
      disposed = true;
      clearTimers();
      transitionInFlightRef.current = false;
    };
  }, [poolSignature]);

  useEffect(() => {
    if (paused || !featuredWarriorsReady || poolRef.current.length <= FEATURED_WARRIOR_SLOT_COUNT) {
      return;
    }

    let disposed = false;

    const pickSlot = () => {
      const slots = Array.from({ length: FEATURED_WARRIOR_SLOT_COUNT }, (_, index) => index);
      const ordered = slots.filter((slot) => slot !== lastChangedSlotRef.current);

      const slot = ordered[slotCursorRef.current % ordered.length] ?? 0;
      slotCursorRef.current += 1;
      lastChangedSlotRef.current = slot;

      return slot;
    };

    const pickNextWarrior = (slot: number) => {
      const current = visibleWarriorsRef.current;
      const activePool = poolRef.current;
      const outgoing = current[slot];
      const currentKeys = new Set(current.map((warrior) => warrior.key));
      const previousSlotKey = lastWarriorBySlotRef.current[slot];

      const freshCandidates = activePool.filter(
        (warrior) => !currentKeys.has(warrior.key) && warrior.key !== previousSlotKey
      );

      const fallbackCandidates = activePool.filter(
        (warrior) => warrior.key !== outgoing?.key && warrior.key !== previousSlotKey
      );

      const candidates = freshCandidates.length > 0 ? freshCandidates : fallbackCandidates;
      const realCandidates = candidates.filter(featuredWarriorHasRealAvatar);
      const finalCandidates = realCandidates.length > 0 ? realCandidates : candidates;

      if (finalCandidates.length === 0) {
        return null;
      }

      return finalCandidates[Math.floor(Math.random() * finalCandidates.length)] ?? null;
    };

    const rotateOnce = () => {
      if (disposed || transitionInFlightRef.current) {
        return;
      }

      const slot = pickSlot();
      const nextWarrior = pickNextWarrior(slot);

      if (!nextWarrior) {
        return;
      }

      transitionInFlightRef.current = true;

      void decodeFeaturedWarriorImage(featuredWarriorImageSrc(nextWarrior)).then(() => {
        if (disposed) {
          transitionInFlightRef.current = false;
          return;
        }

        setFadingSlot(slot);

        later(() => {
          if (disposed) {
            transitionInFlightRef.current = false;
            return;
          }

          setVisibleWarriors((latest) => {
            const next = [...latest];
            next[slot] = nextWarrior;
            lastWarriorBySlotRef.current[slot] = nextWarrior.key;
            visibleWarriorsRef.current = next;
            return next;
          });

          later(() => {
            if (disposed) {
              transitionInFlightRef.current = false;
              return;
            }

            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                if (disposed) {
                  transitionInFlightRef.current = false;
                  return;
                }

                setFadingSlot(null);

                later(() => {
                  transitionInFlightRef.current = false;
                  later(rotateOnce, FEATURED_WARRIOR_ROTATE_MS);
                }, FEATURED_WARRIOR_FADE_MS + 120);
              });
            });
          }, FEATURED_WARRIOR_HOLD_MS);
        }, FEATURED_WARRIOR_FADE_MS);
      });
    };

    later(rotateOnce, FEATURED_WARRIOR_ROTATE_MS);

    return () => {
      disposed = true;
      clearTimers();
      transitionInFlightRef.current = false;
    };
  }, [paused, featuredWarriorsReady, poolSignature]);

  return { visibleWarriors, fadingSlot };
}

type HomePageClientProps = {
  initialLobby: LobbySnapshot | null;
  initialEventTile: EventTileView;
};

function AdvancedFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const { visibleWarriors, fadingSlot } = useRotatingFeaturedWarriors(warriors, false);

  return (
    <section
      className="relative px-4 py-5 sm:px-5 bg-transparent overflow-visible shadow-none border-0 ring-0 rounded-none"
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
              className={`block group relative min-h-[16rem] overflow-visible transform-gpu will-change-[opacity,filter] transition-[opacity,filter] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 ${fadingSlot === index ? "opacity-0 blur-sm" : "opacity-100 blur-0"}`}
              style={{ transitionDuration: `${FEATURED_WARRIOR_FADE_MS}ms` }}
            >
              <Image
                src={featuredWarriorImageSrc(warrior)}
                alt=""
                fill
                sizes="(min-width: 1280px) 250px, (min-width: 640px) 45vw, 90vw"
                priority={index < FEATURED_WARRIOR_SLOT_COUNT}
                quality={100}
                unoptimized
                className="object-contain object-top transition duration-500 ease-out group-hover:scale-[1.01] opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/52 via-black/8 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.11),transparent_64%)]" />
              <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-amber-200/12 bg-black/48 px-2.5 py-2.5 text-center backdrop-blur">
                <div className="mx-auto max-w-full overflow-hidden text-balance break-words font-serif text-[clamp(0.78rem,1.02vw,1.05rem)] font-semibold uppercase leading-[1.05] tracking-[0.075em] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {warrior.name}
                </div>
                <FeaturedWarriorSubtitle key={warrior.key} warrior={warrior} />
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

function FeaturedWarriorSubtitle({ warrior }: { warrior: FeaturedWarrior }) {
  const identity = normalizeFeaturedWarriorKey(warrior.lookupName || warrior.name);
  const [julioLine] = useState(() =>
    identity === "julio" || identity === "julio-alvarez" ? nextJulioFeaturedSubtitleLine() : null
  );

  if ((identity === "julio" || identity === "julio-alvarez") && julioLine) {
    return (
      <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] ${julioLine.className}`}>
        {julioLine.text}
      </div>
    );
  }

  const subtitle =
    identity === "zodiac"
      ? "Chaos Champion"
      : identity === "grimer"
        ? "AI Advisor"
        : identity === "moose" && warrior.role.startsWith("Rank #")
          ? warrior.role
          : identity === "moose"
            ? "Ranked Warrior"
            : warrior.role;

  return (
    <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
      {subtitle}
    </div>
  );
}

function ExtremeFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const { visibleWarriors, fadingSlot } = useRotatingFeaturedWarriors(warriors, false);

  return (
    <section
      className="relative rounded-none px-5 pb-4 pt-8 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:px-7 lg:px-8"
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
            const avatarSrc = featuredWarriorImageSrc(warrior);
            return (
              <Link
                key={index}
                href={warrior.href}
                className={`block group relative min-h-[16rem] overflow-visible transform-gpu will-change-[opacity,filter] transition-[opacity,filter] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 ${fadingSlot === index ? "opacity-0 blur-sm" : "opacity-100 blur-0"}`}
                style={{ transitionDuration: `${FEATURED_WARRIOR_FADE_MS}ms` }}
              >
                <div className="absolute inset-x-0 bottom-2 top-7 overflow-hidden rounded-[1.35rem] border border-amber-100/12 bg-slate-950/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_60px_rgba(0,0,0,0.24)] transition group-hover:border-amber-200/26">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_90%,rgba(251,191,36,0.10),transparent_58%)]" />
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className={`absolute inset-x-[-12%] -top-5 bottom-6 z-10 transition duration-700 group-hover:-translate-y-1 group-hover:scale-[1.012] opacity-100`}>
                  <Image
                    src={avatarSrc}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 280px, (min-width: 640px) 45vw, 90vw"
                    priority={index < FEATURED_WARRIOR_SLOT_COUNT}
                    quality={100}
                    unoptimized
                    className="object-contain object-center drop-shadow-[0_18px_34px_rgba(0,0,0,0.56)] transition duration-500 ease-out [mask-image:linear-gradient(180deg,black_0%,black_88%,transparent_100%)]"
                  />
                </div>
                <div className="absolute inset-x-4 bottom-4 z-20 rounded-xl bg-black/58 px-2.5 py-2.5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.34)] backdrop-blur">
                  <div className="mx-auto max-w-full overflow-hidden text-balance break-words font-serif text-[clamp(0.76rem,0.96vw,1rem)] font-semibold uppercase leading-[1.05] tracking-[0.07em] text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {warrior.name}
                  </div>
                  <FeaturedWarriorSubtitle key={warrior.key} warrior={warrior} />
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

function mergeLobbyMessagesById(...groups: LobbyMessage[][]) {
  const byId = new Map<number, LobbyMessage>();

  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
  }

  return Array.from(byId.values()).sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : left.id - right.id;
  });
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
  const chatHistoryPendingRef = useRef(false);
  const chatHistoryExhaustedRef = useRef(false);
  const chatInitialBottomScrollDoneRef = useRef(false);
  const lastNewestChatMessageIdRef = useRef<number | null>(null);

  const loadLobby = useCallback(async () => {
    try {
      const response = await fetch("/api/lobby", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Lobby request failed: ${response.status}`);
      }

      const payload = (await response.json()) as LobbySnapshot;
      setLobby((current) =>
        current
          ? {
              ...payload,
              messages: mergeLobbyMessagesById(current.messages, payload.messages),
            }
          : payload
      );
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
        setLobby((current) =>
          current
            ? {
                ...snapshot,
                messages: mergeLobbyMessagesById(current.messages, snapshot.messages),
              }
            : snapshot
        );
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
  
  const chatRoomTitle =
    messages.length > 0 && messages[0]?.roomSlug === tournament.roomSlug && !tournament.isFallback
      ? `${tournament.title} Chat`
      : "Live Chat";

  const settleChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const run = () => {
      const node = chatScrollRef.current;
      if (!node) return;

      node.scrollTo({ top: node.scrollHeight, behavior });
    };

    window.requestAnimationFrame(() => {
      run();
      window.requestAnimationFrame(run);
    });

    window.setTimeout(run, 80);
    window.setTimeout(run, 180);
    window.setTimeout(run, 360);
    window.setTimeout(run, 720);
    window.setTimeout(run, 1200);
  }, []);

  const isChatNearBottom = useCallback((threshold = 360) => {
    const node = chatScrollRef.current;
    if (!node) return true;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    return distanceFromBottom <= threshold;
  }, []);


  const loadOlderChatMessages = useCallback(async () => {
    if (chatHistoryPendingRef.current || chatHistoryExhaustedRef.current) return;

    const oldestMessage = messages[0];
    if (!oldestMessage?.id) return;

    const viewport = chatScrollRef.current;
    const previousScrollHeight = viewport?.scrollHeight ?? 0;
    const previousScrollTop = viewport?.scrollTop ?? 0;

    chatHistoryPendingRef.current = true;

    try {
      const params = new URLSearchParams({
        roomSlug: tournament.roomSlug,
        beforeId: String(oldestMessage.id),
        limit: "50",
      });

      const response = await fetch(`/api/lobby/chat?${params.toString()}`, {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        messages?: LobbyMessage[];
        hasMore?: boolean;
      };

      const olderMessages = Array.isArray(payload.messages) ? payload.messages : [];

      if (!response.ok || olderMessages.length === 0) {
        chatHistoryExhaustedRef.current = true;
        return;
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              messages: mergeLobbyMessagesById(olderMessages, current.messages),
            }
          : current
      );

      if (payload.hasMore === false) {
        chatHistoryExhaustedRef.current = true;
      }

      const restoreChatScrollPosition = () => {
        const nextViewport = chatScrollRef.current;
        if (!nextViewport) return;

        nextViewport.scrollTop = Math.max(
          0,
          nextViewport.scrollHeight - previousScrollHeight + previousScrollTop
        );
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restoreChatScrollPosition);
      });
      window.setTimeout(restoreChatScrollPosition, 90);
      window.setTimeout(restoreChatScrollPosition, 240);
    } catch (error) {
      console.warn("Failed to load older lobby messages:", error);
    } finally {
      chatHistoryPendingRef.current = false;
    }
  }, [messages, tournament.roomSlug]);

  useEffect(() => {
    chatHistoryExhaustedRef.current = false;
    chatHistoryPendingRef.current = false;
    chatInitialBottomScrollDoneRef.current = false;
    lastNewestChatMessageIdRef.current = null;
  }, [tournament.roomSlug]);

  useEffect(() => {
    const newestMessageId = messages[messages.length - 1]?.id ?? null;
    const previousNewestMessageId = lastNewestChatMessageIdRef.current;

    lastNewestChatMessageIdRef.current = newestMessageId;

    if (!newestMessageId) return;

    if (!chatInitialBottomScrollDoneRef.current) {
      chatInitialBottomScrollDoneRef.current = true;
      settleChatToBottom("auto");
      return;
    }

    // Older history prepends and reaction-only changes do not change the newest id.
    // Do not move the user's viewport for those.
    if (previousNewestMessageId === newestMessageId) {
      return;
    }

    // A genuinely newer chat message arrived. Only follow it if the user was
    // already near the live edge.
    if (!isChatNearBottom(520)) {
      return;
    }

    settleChatToBottom("smooth");
  }, [messages, isChatNearBottom, settleChatToBottom]);

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

    let frame = 0;
    let observer: ResizeObserver | null = null;

    const measureChatHeight = () => {
      if (window.innerWidth < 1024) {
        setChatCardHeight(null);
        return;
      }

      const rightHeight = rightColumnRef.current?.getBoundingClientRect().height ?? 0;
      const nextHeight = rightHeight > 0 ? Math.ceil(rightHeight) : null;

      setChatCardHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleMeasure = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measureChatHeight();
      });
    };

    const attachObserver = () => {
      if (observer || typeof ResizeObserver === "undefined" || !rightColumnRef.current) {
        return;
      }

      observer = new ResizeObserver(() => {
        scheduleMeasure();
      });

      observer.observe(rightColumnRef.current);
    };

    const settleTimers = [0, 50, 150, 300, 700, 1200].map((delay) =>
      window.setTimeout(() => {
        attachObserver();
        scheduleMeasure();
      }, delay)
    );

    const handleResize = () => {
      attachObserver();
      scheduleMeasure();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("load", handleResize);

    if (document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          attachObserver();
          scheduleMeasure();
        })
        .catch(() => {});
    }

    attachObserver();
    scheduleMeasure();

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }

      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("load", handleResize);
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
      ? { height: `${chatCardHeight}px`, minHeight: `${chatCardHeight}px`, maxHeight: `${chatCardHeight}px`, overflow: "hidden" }
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
          onLoadOlderMessages={() => {
            void loadOlderChatMessages();
          }}
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
