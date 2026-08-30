export type StakerProfileTone = "gold" | "emerald" | "sky";

export type ActiveStakerPositionRow = {
  user_id: number | string | null;
  user_uid: string | null;
  in_game_name: string | null;
  steam_persona_name: string | null;
  steam_id: string | null;
  user_verified: boolean | null;
  verification_level: number | string | null;
  verified_at: Date | string | null;
  position_wallet_address: string | null;
  user_wallet_address: string | null;
  current_staked_wolo: number | string | null;
  accumulated_weight: bigint | number | string | null;
  created_at: Date | string | null;
  auto_compound_rewards: boolean | null;
  status: string | null;
  lifetime_rewards_wolo: number | string | null;
  claimed_rewards_wolo: number | string | null;
  compounded_rewards_wolo: number | string | null;
  pending_rewards_wolo: number | string | null;
  hall_rank?: number | string | null;
  total_stake_wolo?: number | string | null;
};

export type FeaturedStakerMetadata = {
  title: string;
  lane: string;
  line: string;
  badge: string;
  tone: StakerProfileTone;
  heroIcon: "guardian" | "scout" | "flame";
  championshipTitle: string;
  kingdomBenefit: string;
  nationalDesignation?: {
    label: string;
    meta: string;
    value: string;
  };
  ledgerChampionship?: string;
  ledgerDesignation?: string;
};

export type StakerProfilePresentation = {
  title: string;
  lane: string;
  line: string;
  badge: string;
  tone: StakerProfileTone;
  heroIcon: "guardian" | "scout" | "flame";
  championshipTitle: string;
  kingdomBenefit: string;
  nationalDesignation?: FeaturedStakerMetadata["nationalDesignation"];
};

export type ActiveStakerProfile = {
  slug: string;
  legacySlug: string;
  userId: number;
  player: string;
  walletAddress: string | null;
  identityVerified: boolean;
  walletIdentityVerified: boolean;
  rank: number;
  totalStakeWolo: number;
  position: Omit<
    ActiveStakerPositionRow,
    | "user_id"
    | "user_uid"
    | "in_game_name"
    | "steam_persona_name"
    | "steam_id"
    | "user_verified"
    | "verification_level"
    | "verified_at"
    | "position_wallet_address"
    | "user_wallet_address"
  > & {
    user_id: number;
    player: string;
    wallet_address: string | null;
  };
  presentation: StakerProfilePresentation;
  featured: FeaturedStakerMetadata | null;
};

export type StakerProfileQueryClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

const FEATURED_STAKERS_BY_USER_UID: Readonly<Record<string, FeaturedStakerMetadata>> = {
  u_0df73bdbb64646c19e4a9bfd225b3285: {
    title: "First Guardian",
    lane: "Crown Lane",
    line: "The first guardian keeps the gate.",
    badge: "Mainnet Founder",
    tone: "gold",
    heroIcon: "guardian",
    championshipTitle: "USA National Champion",
    kingdomBenefit: "US Champion lane · founding staking guardian · public kingdom proof",
    nationalDesignation: {
      label: "USA National Champion",
      meta: "National belt",
      value: "75 WOLO/mo",
    },
    ledgerChampionship: "United States Champion",
    ledgerDesignation: "First Guardian · Crown Lane",
  },
  u_79ce46af3d504ceca718e5fda83e3502: {
    title: "First Scout",
    lane: "Early Seat",
    line: "The first scout lit the road.",
    badge: "Watcher Pioneer",
    tone: "emerald",
    heroIcon: "scout",
    championshipTitle: "Mexico National Champion",
    kingdomBenefit: "Mexico Champion lane · first scout · early staking proof",
    nationalDesignation: {
      label: "Mexico National Champion",
      meta: "National belt",
      value: "75 WOLO/mo",
    },
    ledgerDesignation: "First Scout · Early Seat",
  },
  u_626ea6497a984dabbc2338ef54c5d333: {
    title: "Operator Founder",
    lane: "Verified Grind",
    line: "Operator founder, verified grind.",
    badge: "Verified Wallet",
    tone: "sky",
    heroIcon: "flame",
    championshipTitle: "Verified Grind",
    kingdomBenefit: "Operator lane · verified wallet · public economy rail",
    ledgerDesignation: "Operator Founder · Verified Grind",
  },
};

const MAX_ACTIVE_STAKER_PROFILES = 10_000;

const ACTIVE_STAKER_POSITION_QUERY = `
  with active_stakers as (
    select
      sp.user_id,
      u.uid::text as user_uid,
      u.in_game_name,
      u.steam_persona_name,
      u.steam_id,
      coalesce(u.verified, false) as user_verified,
      coalesce(u.verification_level, 0) as verification_level,
      u.verified_at,
      sp.wallet_address as position_wallet_address,
      u.wallet_address as user_wallet_address,
      sp.current_staked_wolo,
      sp.accumulated_weight,
      sp.created_at,
      sp.auto_compound_rewards,
      sp.status,
      sp.lifetime_rewards_wolo,
      sp.claimed_rewards_wolo,
      sp.compounded_rewards_wolo,
      sp.pending_rewards_wolo,
      coalesce(sp.current_staked_wolo, 0) + coalesce(sp.compounded_rewards_wolo, 0) as seat_wolo
    from staking_positions sp
    join users u on u.id = sp.user_id
    where lower(coalesce(sp.status, '')) = 'active'
      and (
        coalesce(sp.current_staked_wolo, 0) > 0
        or coalesce(sp.compounded_rewards_wolo, 0) > 0
      )
  ),
  ranked_stakers as (
    select
      active_stakers.*,
      row_number() over (
        order by seat_wolo desc, created_at asc, user_id asc
      ) as hall_rank,
      sum(seat_wolo) over () as total_stake_wolo
    from active_stakers
  )
  select
    sp.user_id,
    sp.user_uid,
    sp.in_game_name,
    sp.steam_persona_name,
    sp.steam_id,
    sp.user_verified,
    sp.verification_level,
    sp.verified_at,
    sp.position_wallet_address,
    sp.user_wallet_address,
    sp.current_staked_wolo,
    sp.accumulated_weight,
    sp.created_at,
    sp.auto_compound_rewards,
    sp.status,
    sp.lifetime_rewards_wolo,
    sp.claimed_rewards_wolo,
    sp.compounded_rewards_wolo,
    sp.pending_rewards_wolo,
    sp.hall_rank,
    sp.total_stake_wolo
  from ranked_stakers sp
`;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWalletAddress(value: unknown) {
  return cleanText(value).toLowerCase();
}

function shortWalletIdentity(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function stakerNameSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stakerCanonicalSlug(player: string, userId: number) {
  const base = stakerNameSlug(player) || "staker";
  return `${base}-u${Math.max(1, Math.trunc(userId))}`;
}

function rowIdentityVerified(row: ActiveStakerPositionRow) {
  return Boolean(
    row.user_verified ||
      asFiniteNumber(row.verification_level) > 0 ||
      cleanText(row.steam_id) ||
      row.verified_at,
  );
}

function trustedPlayerName(row: ActiveStakerPositionRow, userId: number, walletAddress: string | null) {
  if (rowIdentityVerified(row)) {
    const verifiedName =
      cleanText(row.in_game_name) ||
      cleanText(row.steam_persona_name) ||
      cleanText(row.user_uid);
    if (verifiedName) return verifiedName;
  }

  return walletAddress
    ? `Staker ${shortWalletIdentity(walletAddress)}`
    : `Staker #${userId}`;
}

function featuredMetadataForRow(row: ActiveStakerPositionRow) {
  if (!rowIdentityVerified(row)) return null;
  return FEATURED_STAKERS_BY_USER_UID[cleanText(row.user_uid)] || null;
}

function genericPresentation(
  player: string,
  rank: number,
  identityVerified: boolean,
  walletIdentityVerified: boolean,
): StakerProfilePresentation {
  const tone: StakerProfileTone = rank === 1 ? "gold" : rank === 2 ? "emerald" : "sky";
  const badge = identityVerified
    ? "Verified Staker"
    : walletIdentityVerified
      ? "Wallet-backed Seat"
      : "Active Staker";

  return {
    title: "Active Staker",
    lane: `Hall Rank #${rank}`,
    line: `${player} holds an active WOLO staking seat backed by the live ledger.`,
    badge,
    tone,
    heroIcon: "guardian",
    championshipTitle: "Active Staking Seat",
    kingdomBenefit: "Active WOLO staking seat · public reward history · ledger-backed receipts",
  };
}

export function buildActiveStakerProfiles(rows: ActiveStakerPositionRow[]): ActiveStakerProfile[] {
  const normalizedRows = rows
    .map((row) => ({ row, userId: Math.trunc(asFiniteNumber(row.user_id)) }))
    .filter(({ userId }) => userId > 0)
    .sort((left, right) => {
      const leftSeat =
        asFiniteNumber(left.row.current_staked_wolo) +
        asFiniteNumber(left.row.compounded_rewards_wolo);
      const rightSeat =
        asFiniteNumber(right.row.current_staked_wolo) +
        asFiniteNumber(right.row.compounded_rewards_wolo);
      if (leftSeat !== rightSeat) return rightSeat - leftSeat;

      const leftCreated = new Date(left.row.created_at || 0).getTime();
      const rightCreated = new Date(right.row.created_at || 0).getTime();
      if (leftCreated !== rightCreated) return leftCreated - rightCreated;
      return left.userId - right.userId;
    });
  const computedTotalStakeWolo = normalizedRows.reduce(
    (sum, item) =>
      sum +
      asFiniteNumber(item.row.current_staked_wolo) +
      asFiniteNumber(item.row.compounded_rewards_wolo),
    0,
  );

  return normalizedRows.map(({ row, userId }, index) => {
    const positionWallet = normalizeWalletAddress(row.position_wallet_address);
    const userWallet = normalizeWalletAddress(row.user_wallet_address);
    const walletAddress = positionWallet || userWallet || null;
    const identityVerified = rowIdentityVerified(row);
    const walletIdentityVerified = Boolean(
      positionWallet || (identityVerified && userWallet),
    );
    const player = trustedPlayerName(row, userId, walletAddress);
    const featured = featuredMetadataForRow(row);
    const persistedRank = Math.trunc(asFiniteNumber(row.hall_rank));
    const persistedTotal = asFiniteNumber(row.total_stake_wolo, -1);
    const rank = persistedRank > 0 ? persistedRank : index + 1;
    const totalStakeWolo = persistedTotal >= 0 ? persistedTotal : computedTotalStakeWolo;
    const generic = genericPresentation(
      player,
      rank,
      identityVerified,
      walletIdentityVerified,
    );

    return {
      slug: stakerCanonicalSlug(player, userId),
      legacySlug: stakerNameSlug(player) || `staker-${userId}`,
      userId,
      player,
      walletAddress,
      identityVerified,
      walletIdentityVerified,
      rank,
      totalStakeWolo,
      position: {
        user_id: userId,
        player,
        wallet_address: walletAddress,
        current_staked_wolo: row.current_staked_wolo,
        accumulated_weight: row.accumulated_weight,
        created_at: row.created_at,
        auto_compound_rewards: row.auto_compound_rewards,
        status: row.status,
        lifetime_rewards_wolo: row.lifetime_rewards_wolo,
        claimed_rewards_wolo: row.claimed_rewards_wolo,
        compounded_rewards_wolo: row.compounded_rewards_wolo,
        pending_rewards_wolo: row.pending_rewards_wolo,
      },
      presentation: featured ? { ...generic, ...featured } : generic,
      featured,
    };
  });
}

function normalizeLookupSlug(value: string) {
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

export function resolveStakerProfileFromRows(
  rows: ActiveStakerPositionRow[],
  rawSlug: string,
): ActiveStakerProfile | null {
  const slug = normalizeLookupSlug(rawSlug);
  if (!slug) return null;

  const profiles = buildActiveStakerProfiles(rows);
  const canonical = profiles.find((profile) => profile.slug === slug);
  if (canonical) return canonical;

  const legacyMatches = profiles.filter(
    (profile) => profile.legacySlug === slug && profile.slug !== slug,
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

export async function loadActiveStakerProfiles(
  prisma: StakerProfileQueryClient,
): Promise<ActiveStakerProfile[]> {
  const rows = await prisma.$queryRawUnsafe<ActiveStakerPositionRow[]>(
    `${ACTIVE_STAKER_POSITION_QUERY}
     order by sp.hall_rank asc
     limit ${MAX_ACTIVE_STAKER_PROFILES + 1}`,
  );
  if (rows.length > MAX_ACTIVE_STAKER_PROFILES) {
    throw new Error(
      `Active staker profile projection exceeded the ${MAX_ACTIVE_STAKER_PROFILES}-row safety bound.`,
    );
  }
  return buildActiveStakerProfiles(rows);
}

export async function resolveActiveStakerProfile(
  prisma: StakerProfileQueryClient,
  slug: string,
): Promise<ActiveStakerProfile | null> {
  const normalizedSlug = normalizeLookupSlug(slug);
  if (!normalizedSlug) return null;
  const canonicalUserId = Number(normalizedSlug.match(/-u(\d+)$/)?.[1]);
  if (Number.isSafeInteger(canonicalUserId) && canonicalUserId > 0) {
    const rows = await prisma.$queryRawUnsafe<ActiveStakerPositionRow[]>(
      `${ACTIVE_STAKER_POSITION_QUERY}
       where sp.user_id = $1
       limit 1`,
      canonicalUserId,
    );
    return resolveStakerProfileFromRows(rows, normalizedSlug);
  }

  const rows = await prisma.$queryRawUnsafe<ActiveStakerPositionRow[]>(
    `${ACTIVE_STAKER_POSITION_QUERY}
     order by sp.hall_rank asc
     limit ${MAX_ACTIVE_STAKER_PROFILES + 1}`,
  );
  if (rows.length > MAX_ACTIVE_STAKER_PROFILES) return null;
  return resolveStakerProfileFromRows(rows, normalizedSlug);
}
