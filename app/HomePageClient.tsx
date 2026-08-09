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
import { HeroCarousel } from "@/components/hero/HeroCarousel";
import Aoe2ShortsTile from "@/components/home/Aoe2ShortsTile";
import HeroTakeoverSlot from "@/components/home/HeroTakeoverSlot";
import { usePublicPresence } from "@/components/presence/PublicPresenceProvider";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { buildChatItems } from "@/components/lobby/utils";
import { useUserAuth } from "@/context/UserAuthContext";
import { AI_CONCIERGE_NAME, AI_CONCIERGE_UID, AI_GRIMER_NAME, AI_GRIMER_UID, type AiVisibilityOption } from "@/lib/aiConciergeConfig";
import type { HeroPlaylistView } from "@/lib/hero/types";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  type LobbyLeaderboardEntry,
  type LobbyLeaderboardSummary,
  type LobbyMessage,
  type LobbySnapshot,
} from "@/lib/lobby";
import type { LeaderboardLane } from "@/lib/leaderboardLane";
import {
  loadLeaderboardLaneCached,
  prefetchLeaderboardLane,
  readLeaderboardLaneCache,
  seedLeaderboardLaneCache,
} from "@/lib/leaderboardLaneClientCache";
import {
  avatarCardUrlForUser,
  avatarUrlForName,
  featuredAvatarCardUrlForUser,
} from "@/lib/avatarAssets";
import { resolveTimeZone } from "@/lib/timeDisplay";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";

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
const AI_SCRIBE_UID = AI_CONCIERGE_UID;
const GRIMER_UID = AI_GRIMER_UID;
const MOOSE_UID = "aoe2hd-moose";

const LEADERBOARD_LANE_PREFETCH_SIZE = 64;

const FEATURED_WARRIOR_SLOT_COUNT = 4;
const FEATURED_WARRIOR_ROTATE_MS = 3800;
const FEATURED_WARRIOR_FIRST_ROTATE_MS = 6200;
const FEATURED_WARRIOR_FADE_MS = 300;
const FEATURED_WARRIOR_HOLD_MS = 60;

const JULIO_FEATURED_SUBTITLE_LINES = [
  {
    key: "elo",
    className: "text-amber-100/95 [text-shadow:0_0_14px_rgba(251,191,36,0.28)]",
  },
  {
    key: "record",
    className: "text-sky-100/95 [text-shadow:0_0_14px_rgba(56,189,248,0.20)]",
  },
  {
    key: "rank",
    className: "text-emerald-100/95 [text-shadow:0_0_16px_rgba(52,211,153,0.24)]",
  },
  {
    key: "og",
    className: "text-yellow-100/95 [text-shadow:0_0_18px_rgba(250,204,21,0.28)]",
  },
] as const;

let julioFeaturedSubtitleCursor = 0;

function isFiniteFeaturedNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function featuredWarriorEloSubtitle(warrior: FeaturedWarrior) {
  const rating =
    warrior.elo ??
    warrior.primaryRating ??
    warrior.arenaElo ??
    warrior.steamRmRating ??
    warrior.steamDmRating;

  if (isFiniteFeaturedNumber(rating) && rating > 0) {
    return `ELO ${Math.round(rating)}`;
  }

  const ratingLabel = warrior.ratingLabel || warrior.primaryRatingLabel || "";

  if (ratingLabel && !/unrated|no rating/i.test(ratingLabel)) {
    return ratingLabel.toUpperCase();
  }

  return "ELO TBD";
}

function featuredWarriorRecordSubtitle(warrior: FeaturedWarrior) {
  if (
    isFiniteFeaturedNumber(warrior.wins) &&
    isFiniteFeaturedNumber(warrior.losses) &&
    isFiniteFeaturedNumber(warrior.unknowns)
  ) {
    return `${warrior.wins}W · ${warrior.losses}L · ${warrior.unknowns}U`;
  }

  return "W-L-U TBD";
}

function featuredWarriorRankSubtitle(warrior: FeaturedWarrior) {
  if (isFiniteFeaturedNumber(warrior.rank) && warrior.rank > 0) {
    return `Rank #${warrior.rank}`;
  }

  if (/^rank\s*#/i.test(warrior.role)) {
    return warrior.role;
  }

  return warrior.role || "Rank Pending";
}

function nextJulioFeaturedSubtitleLine(warrior: FeaturedWarrior) {
  const line = JULIO_FEATURED_SUBTITLE_LINES[julioFeaturedSubtitleCursor % JULIO_FEATURED_SUBTITLE_LINES.length];
  julioFeaturedSubtitleCursor += 1;

  const text =
    line.key === "elo"
      ? featuredWarriorEloSubtitle(warrior)
      : line.key === "record"
        ? featuredWarriorRecordSubtitle(warrior)
        : line.key === "rank"
          ? featuredWarriorRankSubtitle(warrior)
          : "AoE2WAR OG";

  return {
    ...line,
    text,
  };
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
  hasFeaturedAvatar?: boolean;
  rank?: number | null;
  elo?: number | null;
  arenaElo?: number | null;
  steamRmRating?: number | null;
  steamDmRating?: number | null;
  primaryRating?: number | null;
  primaryRatingLabel?: string | null;
  primaryRatingSourceLabel?: string | null;
  ratingLabel?: string | null;
  wins?: number | null;
  losses?: number | null;
  unknowns?: number | null;
  totalMatches?: number | null;
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
    role: "American Champion",
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
    key: "premium:ai-scribe",
    name: AI_CONCIERGE_NAME,
    lookupName: AI_CONCIERGE_NAME,
    role: "AI Scribe",
    href: "/contact-emaren",
    imageUrl: avatarCardUrlForUser(AI_SCRIBE_UID, AI_CONCIERGE_NAME),
  },
  {
    key: "premium:grimer",
    name: AI_GRIMER_NAME,
    lookupName: AI_GRIMER_NAME,
    role: "AI Advisor",
    href: "/players/by-name/Grimer",
    imageUrl: avatarCardUrlForUser(GRIMER_UID, AI_GRIMER_NAME),
  },
];

function normalizeFeaturedWarriorKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}



function featuredWarriorHonorSubtitle(
  warrior: Pick<FeaturedWarrior, "key" | "name" | "lookupName">
) {
  const identityKeys = [warrior.key, warrior.name, warrior.lookupName]
    .map((value) => normalizeFeaturedWarriorKey(value))
    .filter(Boolean);

  // Champion honors stay pinned regardless of RM/DM rating source or live leaderboard rank.
  const jimKeys = new Set(["jim", "premium-jim", normalizeFeaturedWarriorKey(JIM_UID)]);
  const zodiacKeys = new Set([
    "zodiac",
    "mystikal-zodiac",
    "premium-zodiac",
    normalizeFeaturedWarriorKey(ZODIAC_UID),
  ]);

  if (identityKeys.some((key) => jimKeys.has(key))) {
    return "American Champion";
  }

  if (identityKeys.some((key) => zodiacKeys.has(key))) {
    return "Chaos Champion";
  }

  return null;
}

function featuredRoleForLeaderboardEntry(entry: LobbyLeaderboardEntry) {
  if (entry.rank > 0) return `Rank #${entry.rank}`;
  if (entry.isOnline) return "In the Arena";
  if (entry.claimed) return "Claimed Warrior";
  return "Rising Warrior";
}



function featuredWarriorStatsFromEntry(entry?: LobbyLeaderboardEntry | null): Partial<FeaturedWarrior> {
  if (!entry) return {};

  return {
    rank: entry.rank > 0 ? entry.rank : null,
    elo: entry.elo,
    arenaElo: entry.arenaElo,
    steamRmRating: entry.steamRmRating,
    steamDmRating: entry.steamDmRating,
    primaryRating: entry.primaryRating,
    primaryRatingLabel: entry.primaryRatingLabel,
    primaryRatingSourceLabel: entry.primaryRatingSourceLabel,
    ratingLabel: entry.ratingLabel,
    wins: entry.wins,
    losses: entry.losses,
    unknowns: entry.unknowns,
    totalMatches: entry.totalMatches,
  };
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

    const honorSubtitle = featuredWarriorHonorSubtitle(warrior);

    warriors.push({
      ...warrior,

      href:
        leaderboardEntry?.href ||
        warrior.href,

      imageUrl:
        leaderboardEntry?.hasFeaturedAvatar &&
        leaderboardEntry.uid
          ? featuredAvatarCardUrlForUser(
              leaderboardEntry.uid,
              leaderboardEntry.name
            )
          : warrior.imageUrl,

      hasFeaturedAvatar:
        Boolean(
          leaderboardEntry?.hasFeaturedAvatar
        ) ||
        Boolean(warrior.hasFeaturedAvatar),

      role: honorSubtitle || (leaderboardEntry
        ? featuredRoleForLeaderboardEntry(leaderboardEntry)
        : warrior.role),
      ...featuredWarriorStatsFromEntry(leaderboardEntry),
    });
  };

  FEATURED_WARRIOR_PREMIUM_POOL.forEach(pushWarrior);

  entries.forEach((entry) => {
    const key = normalizeFeaturedWarriorKey(entry.name);
    if (!key || seen.has(key)) return;

    const qualifiedUid =
      entry.claimed &&
      entry.uid &&
      entry.hasFeaturedAvatar
        ? entry.uid
        : null;

    pushWarrior({
      key: qualifiedUid
        ? `featured:${qualifiedUid}`
        : `placeholder:${
            entry.key ||
            entry.href ||
            entry.name
          }`,

      name: entry.name,
      lookupName: entry.name,

      role:
        featuredRoleForLeaderboardEntry(entry),

      ...featuredWarriorStatsFromEntry(entry),

      href:
        entry.href ||
        `/players/by-name/${encodeURIComponent(
          entry.name
        )}`,

      imageUrl: qualifiedUid
        ? featuredAvatarCardUrlForUser(
            qualifiedUid,
            entry.name
          )
        : undefined,

      hasFeaturedAvatar:
        Boolean(qualifiedUid),

      isPlaceholder:
        !qualifiedUid,
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
  "premium:ai-scribe",
  "ai-scribe",
  "the-ai-scribe",
  "aoe2hd-ai-concierge",
  "premium:bdbpigman",
  "premium:sladk0eshka",
  "bdbpigman",
  "sladk0eshka",
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
  if (warrior.hasFeaturedAvatar) {
    return true;
  }

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
      FEATURED_WARRIOR_REAL_AVATAR_KEYS.has(normalizeFeaturedWarriorKey(warrior.key)) ||
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

function shuffleFeaturedWarriors(pool: FeaturedWarrior[]) {
  const candidates = [...pool];

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = candidates[index];
    const swap = candidates[swapIndex];

    if (!current || !swap) continue;

    candidates[index] = swap;
    candidates[swapIndex] = current;
  }

  return candidates;
}

const UNKNOWN_FEATURED_WARRIOR_IMAGE = "/champions/players/silhouette.card.webp";

function featuredWarriorBasePool(pool: FeaturedWarrior[]) {
  return dedupeFeaturedWarriors([
    ...pool,
    ...FEATURED_WARRIOR_PREMIUM_POOL,
    ...FEATURED_WARRIOR_FALLBACKS,
  ]);
}

function asUnknownFeaturedWarrior(candidate?: FeaturedWarrior | null): FeaturedWarrior {
  const displayName = candidate?.name || "Mystery Player";
  const lookupName = candidate?.lookupName || candidate?.name || displayName;

  return {
    key: candidate ? `unknown:${candidate.key}` : "unknown:mystery-player",
    name: displayName,
    lookupName,
    role: candidate?.role || "Rank Pending",
    rank: candidate?.rank ?? null,
    elo: candidate?.elo ?? null,
    arenaElo: candidate?.arenaElo ?? null,
    steamRmRating: candidate?.steamRmRating ?? null,
    steamDmRating: candidate?.steamDmRating ?? null,
    primaryRating: candidate?.primaryRating ?? null,
    primaryRatingLabel: candidate?.primaryRatingLabel ?? null,
    primaryRatingSourceLabel: candidate?.primaryRatingSourceLabel ?? null,
    ratingLabel: candidate?.ratingLabel ?? null,
    wins: candidate?.wins ?? null,
    losses: candidate?.losses ?? null,
    unknowns: candidate?.unknowns ?? null,
    totalMatches: candidate?.totalMatches ?? null,
    href: candidate?.href || "/players",
    imageUrl: UNKNOWN_FEATURED_WARRIOR_IMAGE,
    isPlaceholder: true,
  };
}

function featuredWarriorIsMystery(warrior?: FeaturedWarrior | null) {
  return Boolean(warrior?.isPlaceholder || warrior?.key.startsWith("unknown:"));
}

function pickUnknownFeaturedWarrior(
  pool: FeaturedWarrior[],
  blockedKeys = new Set<string>(),
  previousSlotKey: string | null = null,
  randomize = false
) {
  const previousRawKey = previousSlotKey?.startsWith("unknown:")
    ? previousSlotKey.slice("unknown:".length)
    : previousSlotKey;

  const candidates = featuredWarriorBasePool(pool).filter((warrior) => {
    if (featuredWarriorHasRealAvatar(warrior)) return false;
    if (!warrior.name || normalizeFeaturedWarriorKey(warrior.name) === "unknown-warrior") return false;
    if (blockedKeys.has(warrior.key)) return false;
    if (blockedKeys.has(`unknown:${warrior.key}`)) return false;
    if (warrior.key === previousSlotKey) return false;
    if (warrior.key === previousRawKey) return false;
    if (`unknown:${warrior.key}` === previousSlotKey) return false;
    return true;
  });

  const ordered = randomize ? shuffleFeaturedWarriors(candidates) : candidates;
  return asUnknownFeaturedWarrior(ordered[0] ?? null);
}

function pickRealFeaturedWarrior(
  pool: FeaturedWarrior[],
  blockedKeys = new Set<string>(),
  previousSlotKey: string | null = null
) {
  const candidates = featuredWarriorBasePool(pool).filter((warrior) => {
    if (featuredWarriorIsMystery(warrior)) return false;
    if (!featuredWarriorHasRealAvatar(warrior)) return false;
    if (blockedKeys.has(warrior.key)) return false;
    if (warrior.key === previousSlotKey) return false;
    return true;
  });

  const ordered = shuffleFeaturedWarriors(candidates);
  return ordered[0] ?? null;
}

function curatedFeaturedWarriorOpening(pool: FeaturedWarrior[], randomize = false) {
  const basePool = featuredWarriorBasePool(pool);
  const avatarPool = shuffleFeaturedWarriors(
    basePool.filter((warrior) => featuredWarriorHasRealAvatar(warrior) && !featuredWarriorIsMystery(warrior))
  );
  const selected: FeaturedWarrior[] = [];

  for (const warrior of avatarPool) {
    if (selected.length >= FEATURED_WARRIOR_SLOT_COUNT - 1) break;
    if (selected.some((item) => item.key === warrior.key)) continue;
    selected.push(warrior);
  }

  const mystery = pickUnknownFeaturedWarrior(
    basePool,
    new Set(selected.map((warrior) => warrior.key)),
    null,
    true
  );

  const lineup = [...selected.slice(0, FEATURED_WARRIOR_SLOT_COUNT - 1), mystery].slice(
    0,
    FEATURED_WARRIOR_SLOT_COUNT
  );

  return randomize ? shuffleFeaturedWarriors(lineup) : lineup;
}

function featuredWarriorImageSrc(warrior: FeaturedWarrior) {
  const identity = normalizeFeaturedWarriorKey(warrior.lookupName || warrior.name);

  if (identity === "grimer") {
    return featuredAvatarCardUrlForUser(GRIMER_UID, AI_GRIMER_NAME);
  }

  if (identity === "the-ai-scribe" || identity === "ai-scribe") {
    return featuredAvatarCardUrlForUser(AI_SCRIBE_UID, AI_CONCIERGE_NAME);
  }

  if (identity === "moose") {
    return featuredAvatarCardUrlForUser(MOOSE_UID, "Moose");
  }

  if (identity === "zodiac") {
    return featuredAvatarCardUrlForUser(ZODIAC_UID, "Zodiac");
  }

  if (identity === "julio" || identity === "julio-alvarez") {
    return featuredAvatarCardUrlForUser(JULIO_ALVAREZ_UID, "Julio Alvarez");
  }

  return warrior.imageUrl ?? avatarUrlForName(warrior.lookupName);
}

const featuredWarriorDecodeCache = new Map<string, Promise<void>>();

function decodeFeaturedWarriorImage(src: string) {
  if (typeof window === "undefined" || !src) {
    return Promise.resolve();
  }

  const cached = featuredWarriorDecodeCache.get(src);
  if (cached) {
    return cached;
  }

  const promise = new Promise<void>((resolve) => {
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

    const timeout = window.setTimeout(finish, 2800);

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

  featuredWarriorDecodeCache.set(src, promise);
  return promise;
}

function warmFeaturedWarriorLineup(lineup: FeaturedWarrior[]) {
  return Promise.all(lineup.map((warrior) => decodeFeaturedWarriorImage(featuredWarriorImageSrc(warrior)))).then(
    () => undefined
  );
}


function useRotatingFeaturedWarriors(pool: FeaturedWarrior[], paused: boolean) {
  const poolSignature = useMemo(
    () => pool.map((warrior) => `${warrior.key}:${featuredWarriorImageSrc(warrior)}`).join("|"),
    [pool]
  );

  const openingLineup = curatedFeaturedWarriorOpening(pool, false);
  const [visibleWarriors, setVisibleWarriors] = useState(openingLineup);
  const [featuredWarriorsReady, setFeaturedWarriorsReady] = useState(false);
  const [fadingSlot, setFadingSlot] = useState<number | null>(null);

  const poolRef = useRef<FeaturedWarrior[]>(pool);
  const visibleWarriorsRef = useRef<FeaturedWarrior[]>(openingLineup);
  const lastChangedSlotRef = useRef<number | null>(null);
  const lastWarriorBySlotRef = useRef<Record<number, string | null>>({});
  const transitionInFlightRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, delay: number) => {
    const timer = window.setTimeout(fn, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;

    clearTimers();
    transitionInFlightRef.current = false;
    lastChangedSlotRef.current = null;
    lastWarriorBySlotRef.current = {};
    setFadingSlot(null);
    setFeaturedWarriorsReady(false);

    const initialLineup = curatedFeaturedWarriorOpening(poolRef.current, true);
    initialLineup.forEach((warrior, index) => {
      lastWarriorBySlotRef.current[index] = warrior.key;
    });

    visibleWarriorsRef.current = initialLineup;
    setVisibleWarriors(initialLineup);

    void warmFeaturedWarriorLineup(initialLineup).then(() => {
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
  }, [poolSignature, clearTimers]);

  useEffect(() => {
    if (!featuredWarriorsReady || paused) {
      return;
    }

    let disposed = false;

    const pickSlot = () => {
      const slots = Array.from({ length: FEATURED_WARRIOR_SLOT_COUNT }, (_, index) => index);
      const previousSlot = lastChangedSlotRef.current;
      const eligibleSlots = previousSlot === null ? slots : slots.filter((slot) => slot !== previousSlot);
      const weightedSlots: number[] = [];

      for (const slot of eligibleSlots) {
        const isAdjacent = previousSlot !== null && Math.abs(slot - previousSlot) === 1;
        const weight = isAdjacent ? 1 : 4;

        for (let count = 0; count < weight; count += 1) {
          weightedSlots.push(slot);
        }
      }

      return weightedSlots[Math.floor(Math.random() * weightedSlots.length)] ?? eligibleSlots[0] ?? 0;
    };

    const pickNextWarrior = (slot: number) => {
      const current = visibleWarriorsRef.current;
      const currentKeys = new Set(current.map((warrior) => warrior.key));
      const outgoing = current[slot];
      const previousSlotKey = lastWarriorBySlotRef.current[slot];

      const mysteryCount = current.filter(featuredWarriorIsMystery).length;

      if (featuredWarriorIsMystery(outgoing)) {
        return pickRealFeaturedWarrior(poolRef.current, currentKeys, previousSlotKey);
      }

      if (mysteryCount === 0) {
        return pickUnknownFeaturedWarrior(poolRef.current, currentKeys, previousSlotKey, true);
      }

      return pickRealFeaturedWarrior(poolRef.current, currentKeys, previousSlotKey);
    };

    const rotateOnce = () => {
      if (disposed || paused) return;

      if (document.hidden) {
        later(rotateOnce, FEATURED_WARRIOR_ROTATE_MS);
        return;
      }

      if (transitionInFlightRef.current) {
        return;
      }

      const slot = pickSlot();
      const nextWarrior = pickNextWarrior(slot);

      if (!nextWarrior) {
        later(rotateOnce, FEATURED_WARRIOR_ROTATE_MS);
        return;
      }

      transitionInFlightRef.current = true;

      void decodeFeaturedWarriorImage(featuredWarriorImageSrc(nextWarrior))
        .catch(() => undefined)
        .then(() => {
          if (disposed || paused) {
            transitionInFlightRef.current = false;
            return;
          }

          setFadingSlot(slot);

          later(() => {
            if (disposed || paused) {
              transitionInFlightRef.current = false;
              return;
            }

            setVisibleWarriors((latest) => {
              const next = [...latest];
              const outgoing = next[slot];
              lastWarriorBySlotRef.current[slot] = outgoing?.key ?? null;
              next[slot] = nextWarrior;
              visibleWarriorsRef.current = next;
              return next;
            });

            lastChangedSlotRef.current = slot;

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

                    if (!disposed) {
                      later(rotateOnce, FEATURED_WARRIOR_ROTATE_MS);
                    }
                  }, FEATURED_WARRIOR_FADE_MS + 120);
                });
              });
            }, FEATURED_WARRIOR_HOLD_MS);
          }, FEATURED_WARRIOR_FADE_MS);
        });
    };

    later(rotateOnce, FEATURED_WARRIOR_FIRST_ROTATE_MS);

    return () => {
      disposed = true;
      clearTimers();
      transitionInFlightRef.current = false;
    };
  }, [paused, featuredWarriorsReady, poolSignature, clearTimers, later]);

  return { visibleWarriors, fadingSlot, featuredWarriorsReady };
}

type HomePageClientProps = {
  initialLobby: LobbySnapshot | null;
  initialHeroPlaylist: HeroPlaylistView;
};

function AdvancedFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const h = useHomeCopy();
  const { visibleWarriors, fadingSlot, featuredWarriorsReady } = useRotatingFeaturedWarriors(warriors, false);

  return (
    <section
      className="relative px-4 py-5 sm:px-5 bg-transparent overflow-visible shadow-none border-0 ring-0 rounded-none"
    >
      <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/28 to-transparent" />
      <div className="grid gap-4 lg:grid-cols-[minmax(9rem,0.42fr)_minmax(0,1fr)_minmax(8rem,0.35fr)] lg:items-center">
        <div className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-[0.38em] text-amber-100/72">
            {h("Featured Warriors")}
          </div>
          <div className="mt-2 text-sm leading-5 text-slate-400">
            {h("Elite competitors. Legendary rivalries.")}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleWarriors.map((warrior, index) => (
            <Link
              key={`${index}:${warrior.key}`}
              href={warrior.href}
              className={`block group relative min-h-[16rem] overflow-visible transform-gpu will-change-[opacity] transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 [backface-visibility:hidden] ${!featuredWarriorsReady ? "opacity-0" : fadingSlot === index ? "opacity-0" : "opacity-100"}`}
              style={{ transitionDuration: `${FEATURED_WARRIOR_FADE_MS}ms` }}
            >
              <Image
                src={featuredWarriorImageSrc(warrior)}
                alt=""
                fill
                sizes="(min-width: 1280px) 250px, (min-width: 640px) 45vw, 90vw"
                priority={index < FEATURED_WARRIOR_SLOT_COUNT}
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
          {h("View all warriors")}
        </Link>
      </div>
    </section>
  );
}

function FeaturedWarriorSubtitle({ warrior }: { warrior: FeaturedWarrior }) {
  const h = useHomeCopy();
  const identity = normalizeFeaturedWarriorKey(warrior.lookupName || warrior.name);
  const [julioLine] = useState(() =>
    identity === "julio" || identity === "julio-alvarez" ? nextJulioFeaturedSubtitleLine(warrior) : null
  );

  if ((identity === "julio" || identity === "julio-alvarez") && julioLine) {
    return (
      <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] ${julioLine.className}`}>
        {h(julioLine.text)}
      </div>
    );
  }

  const honorSubtitle = featuredWarriorHonorSubtitle(warrior);

  if (honorSubtitle) {
    return (
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100 [text-shadow:0_0_16px_rgba(251,191,36,0.30)]">
        {h(honorSubtitle)}
      </div>
    );
  }

  const subtitle =
    identity === "the-ai-scribe" || identity === "ai-scribe"
      ? "The AI Scribe"
      : identity === "grimer"
        ? "AI Advisor"
        : featuredWarriorRankSubtitle(warrior);

  return (
    <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
      {h(subtitle)}
    </div>
  );
}

function ExtremeFeaturedWarriors({ warriors }: { warriors: FeaturedWarrior[] }) {
  const h = useHomeCopy();
  const { visibleWarriors, fadingSlot, featuredWarriorsReady } = useRotatingFeaturedWarriors(warriors, false);

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
            {h("Featured Warriors")}
          </div>
          <div className="mt-2 max-w-[13rem] text-sm leading-5 text-slate-400">
            {h("Elite competitors. Legendary rivalries.")}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          {visibleWarriors.map((warrior, index) => {
            const avatarSrc = featuredWarriorImageSrc(warrior);
            return (
              <Link
                key={`${index}:${warrior.key}`}
                href={warrior.href}
                className={`block group relative min-h-[16rem] overflow-visible transform-gpu will-change-[opacity] transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 [backface-visibility:hidden] ${!featuredWarriorsReady ? "opacity-0" : fadingSlot === index ? "opacity-0" : "opacity-100"}`}
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
          {h("View all warriors")} <ChevronRight className="ml-2 h-4 w-4" />
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
  initialHeroPlaylist,
}: HomePageClientProps) {
  const h = useHomeCopy();
const { uid, isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();
  const {
    themeKey,
    tileThemeKey,
    viewMode,
    setViewMode,
    leaderboardLane,
    setLeaderboardLane,
    timeClockMode,
    browserTimeZone,
    appearanceLoaded,
  } = useLobbyAppearance();
  const communityLobbyTile = useTileViewPreference("community_lobby");
  const presence = usePublicPresence(initialLobby?.onlineUsers ?? []);

  const [lobby, setLobby] = useState<LobbySnapshot | null>(initialLobby);
  const [laneLeaderboard, setLaneLeaderboard] = useState<LobbyLeaderboardSummary | null>(
    initialLobby?.leaderboard ?? null
  );
  const [leaderboardLaneLoading, setLeaderboardLaneLoading] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [aiThinkingStartedAt, setAiThinkingStartedAt] = useState<number | null>(null);
  const [lastAiThoughtMs, setLastAiThoughtMs] = useState<number | null>(null);
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
  const baseLeaderboard = useMemo(
    () => lobby?.leaderboard ?? getFallbackLeaderboard(),
    [lobby?.leaderboard]
  );
  const selectedLeaderboard =
    laneLeaderboard?.lane === leaderboardLane ? laneLeaderboard : baseLeaderboard;
  const leaderboard = useMemo(
    () => ({
      ...selectedLeaderboard,
      // Use the exact same live sample as the Online Players panel.
      activePlayers: presence.activePlayers,
    }),
    [presence.activePlayers, selectedLeaderboard],
  );

  useEffect(() => {
    // The live lobby snapshot is already our warm RM lane.
    // Keep it in the shared client cache.
    seedLeaderboardLaneCache(
      baseLeaderboard,
    );

    if (
      leaderboardLane ===
      baseLeaderboard.lane
    ) {
      setLaneLeaderboard(
        baseLeaderboard,
      );
    }

    const alternateLane:
      LeaderboardLane =
      leaderboardLane === "rm"
        ? "dm"
        : "rm";

    // Warm the opposite lane immediately after paint.
    // Only the first visible chunk is needed; the panel's
    // existing infinite loader owns subsequent pages.
    void prefetchLeaderboardLane(
      alternateLane,
      LEADERBOARD_LANE_PREFETCH_SIZE,
    ).then((summary) => {
      if (
        summary &&
        summary.lane ===
          leaderboardLane
      ) {
        setLaneLeaderboard(
          summary,
        );
      }
    });
  }, [
    baseLeaderboard,
    leaderboardLane,
  ]);

  useEffect(() => {
    const cached =
      readLeaderboardLaneCache(
        leaderboardLane,
      );

    if (cached) {
      setLaneLeaderboard(
        cached,
      );

      setLeaderboardLaneLoading(
        false,
      );

      return;
    }

    let cancelled = false;

    // Do not disable the RM / DM control while this
    // background fallback request runs.
    setLeaderboardLaneLoading(
      false,
    );

    void loadLeaderboardLaneCached(
      leaderboardLane,
      {
        limit:
          LEADERBOARD_LANE_PREFETCH_SIZE,
        force: true,
      },
    )
      .then((summary) => {
        if (!cancelled) {
          setLaneLeaderboard(
            summary,
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            "Failed to load selected leaderboard lane:",
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leaderboardLane]);

  const handleLeaderboardLaneChange =
    useCallback(
      (
        lane:
          LeaderboardLane,
      ) => {
        if (
          lane ===
          leaderboardLane
        ) {
          return;
        }

        const cached =
          readLeaderboardLaneCache(
            lane,
          );

        // Apply the already-prefetched lane before the
        // state flip paints, making RM / DM a true tab.
        if (cached) {
          setLaneLeaderboard(
            cached,
          );
        }

        setLeaderboardLaneLoading(
          false,
        );

        setLeaderboardLane(
          lane,
        );

        // Warm the lane we just left as well.
        void prefetchLeaderboardLane(
          leaderboardLane,
          LEADERBOARD_LANE_PREFETCH_SIZE,
        );
      },
      [
        leaderboardLane,
        setLeaderboardLane,
      ],
    );
  const featuredWarriors = useMemo(
    () =>
      buildFeaturedWarriorPool([
        ...leaderboard.entries,
        ...(lobby?.featuredWarriorEntries ?? []),
      ]),
    [leaderboard.entries, lobby?.featuredWarriorEntries]
  );
  const onlineUsers = presence.onlineUsers;
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

  const chatTimeZone = useMemo(
    () =>
      appearanceLoaded
        ? resolveTimeZone(
            {
              timeDisplayMode: "local",
              timeClockMode,
              timezoneOverride: browserTimeZone,
            },
            browserTimeZone
          )
        : browserTimeZone || "UTC",
    [appearanceLoaded, browserTimeZone, timeClockMode]
  );
  const chatItems = useMemo(
    () => appearanceLoaded ? buildChatItems(messages, chatTimeZone) : [],
    [appearanceLoaded, chatTimeZone, messages]
  );
  
  const chatRoomTitle =
    messages.length > 0 && messages[0]?.roomSlug === tournament.roomSlug && !tournament.isFallback
      ? h("{title} Chat", { title: tournament.title })
      : h("Live Chat");

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
        throw new Error(typeof payload.detail === "string" ? payload.detail : h("Join failed."));
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
      setJoinError(error instanceof Error ? error.message : h("Join failed."));
    } finally {
      setJoinPending(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = messageBody.trim();
    if (!trimmed || chatPending) return;

    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setChatPending(true);
      const aiWillAnswer = aiEnabled && (aiScribeEnabled || aiGrimerEnabled);
      const requestStartedAt = Date.now();
      if (aiWillAnswer) {
        setAiThinkingStartedAt(requestStartedAt);
        setLastAiThoughtMs(null);
      }
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
        throw new Error(typeof payload.detail === "string" ? payload.detail : h("Message failed."));
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
      if (aiWillAnswer) {
        setLastAiThoughtMs(Date.now() - requestStartedAt);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : h("Message failed."));
      setChatNotice(null);
    } finally {
      setChatPending(false);
      setAiThinkingStartedAt(null);
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
        throw new Error(typeof payload.detail === "string" ? payload.detail : h("Reaction failed."));
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
      setChatError(error instanceof Error ? error.message : h("Reaction failed."));
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
        throw new Error(typeof payload.detail === "string" ? payload.detail : h("Message update failed."));
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
      setChatError(error instanceof Error ? error.message : h("Message update failed."));
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

return (
    <div className="space-y-4 overflow-x-hidden py-2 text-white sm:space-y-6 sm:py-3">
      <SpeedReadyMarker route="/" />
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
          <HeroTakeoverSlot>
            <HeroCarousel
              playlist={initialHeroPlaylist}
              presentation={
                isAdvancedLobby
                  ? "advanced"
                  : "default"
              }
            />
          </HeroTakeoverSlot>
          <Aoe2ShortsTile />
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
            leaderboardLane={leaderboardLane}
            leaderboardLaneLoading={leaderboardLaneLoading}
            onLeaderboardLaneChange={handleLeaderboardLaneChange}
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
            className={`grid min-h-0 min-w-0 overflow-visible gap-3.5 lg:grid-rows-[auto_minmax(0,1fr)] lg:self-stretch lg:pt-4 ${
              isExtremeLobby ? "lg:h-full lg:min-h-0" : ""
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
              className={`h-full min-h-0 overflow-visible ${
                isExtremeLobby ? "lg:h-[calc(100%+1px)] lg:min-h-0 lg:max-h-[calc(100%+1px)]" : ""
              }`}
            >
              <TopWoloEarnersTile
                wolo={wolo}
                board={woloEarners}
                themeKey={tileThemeKey}
                viewMode={viewMode}
                surface={isExtremeLobby ? "extreme" : "standard"}
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
          aiThinkingStartedAt={aiThinkingStartedAt}
          lastAiThoughtMs={lastAiThoughtMs}
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
