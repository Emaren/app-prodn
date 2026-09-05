import {
  canonicalizeNumberedBountyTransfers,
  OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
} from "@/lib/bountyHall";
import { isInternalSystemUid } from "@/lib/internalSystemAccounts";
import { getPrisma } from "@/lib/prisma";
import { createStaleWhileRevalidateCache } from "@/lib/staleWhileRevalidateCache";
import {
  WOLO_MAINNET_NETWORK_ACCOUNTS,
} from "@/lib/woloMainnetNetworkAccounts";
import { formatWoloAmount } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";

export type KingdomCitizen = {
  name: string;
  href: string;
};

export type KingdomStat = {
  label: string;
  value: string;
};

export type KingdomSummary = {
  stats: KingdomStat[];
  ledgerStats: KingdomStat[];
  citizens: KingdomCitizen[];
  chronicleCount: number;
  latestBountyNumber: number;
  kingdomWealthWolo: string | null;
  activeWatcherCount: number;
  humanCitizenCount: number;
};

const ACTIVE_WATCHER_EVENT_TYPES = [
  "heartbeat",
  "app_open",
  "watcher_started",
  "watcher_ready",
  "watching_started",
] as const;

const KINGDOM_WEALTH_ACCOUNT_LABELS =
  new Set([
    "Community Treasury",
    "DEX Liquidity Reserve",
    "Faucet Growth Reserve",
    "Faucet Hot Wallet",
    "Validator Ops",
    "Ecosystem Bounties",
    "Workshop Sponsorships",
    "Wolo-Osmosis Relayer Gas",
  ]);

export const KINGDOM_WEALTH_ACCOUNTS =
  WOLO_MAINNET_NETWORK_ACCOUNTS.filter(
    (account) =>
      KINGDOM_WEALTH_ACCOUNT_LABELS.has(
        account.label,
      ),
  );

async function loadKingdomWealthWolo() {
  const uniqueAccounts = Array.from(
    new Map(
      KINGDOM_WEALTH_ACCOUNTS.map(
        (account) => [
          account.address.toLowerCase(),
          account,
        ],
      ),
    ).values(),
  );

  const balances = await Promise.all(
    uniqueAccounts.map(async (account) => ({
      account,
      amountUwolo:
        await fetchWoloBalanceAmount(
          account.address,
        ),
    })),
  );

  const totalUwolo = balances.reduce(
    (sum, row) =>
      sum +
      BigInt(
        row.amountUwolo,
      ),
    BigInt(0),
  );

  return formatWoloAmount(
    totalUwolo.toString(),
  );
}

const loadKingdomWealthCached =
  createStaleWhileRevalidateCache(
    loadKingdomWealthWolo,
    60_000,
  );

async function loadLatestBountyNumber() {
  const prisma = getPrisma();
  const candidates =
    await prisma.woloIndexedTransfer.findMany({
      where: {
        senderAddress: {
          in: [
            ...OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
          ],
        },
        memo: {
          contains: "bounty",
          mode: "insensitive",
        },
      },
      orderBy: [
        { timestamp: "asc" },
        { id: "asc" },
        { transferIndex: "asc" },
      ],
      select: {
        id: true,
        txHash: true,
        transferIndex: true,
        timestamp: true,
        senderAddress: true,
        recipientAddress: true,
        amountWoloDisplay: true,
        memo: true,
      },
    });

  const rows =
    canonicalizeNumberedBountyTransfers(
      candidates,
    );

  return rows.length > 0
    ? rows[rows.length - 1]
        .canonicalNumber
    : 0;
}

async function loadKingdomCore() {
  const prisma = getPrisma();
  const watcherCutoff =
    new Date(
      Date.now() -
        15 * 60 * 1000,
    );

  const [
    users,
    chronicleCount,
    latestBountyNumber,
    activeWatcherEvents,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    }),
    prisma.forumThread.count({
      where: {
        channel:
          "wolo-chronicles",
      },
    }),
    loadLatestBountyNumber(),
    prisma.watcherClientEvent.findMany({
      where: {
        createdAt: {
          gte: watcherCutoff,
        },
        eventType: {
          in: [
            ...ACTIVE_WATCHER_EVENT_TYPES,
          ],
        },
        OR: [
          {
            userId: {
              not: null,
            },
          },
          {
            userUid: {
              not: null,
            },
          },
        ],
      },
      select: {
        userUid: true,
        user: {
          select: {
            uid: true,
          },
        },
      },
    }),
  ]);

  const humanUsers =
    users.filter(
      (user) =>
        !isInternalSystemUid(
          user.uid,
        ),
    );

  const citizens =
    humanUsers.map(
      (user) => ({
        name:
          user.inGameName ||
          user.steamPersonaName ||
          user.uid,
        href:
          `/players/${encodeURIComponent(
            user.uid,
          )}`,
      }),
    );

  const activeWatcherUids =
    new Set(
      activeWatcherEvents
        .map(
          (event) =>
            event.user?.uid ||
            event.userUid,
        )
        .filter(
          (
            uid,
          ): uid is string =>
            Boolean(uid) &&
            !isInternalSystemUid(
              uid,
            ),
        ),
    );

  return {
    citizens,
    chronicleCount,
    latestBountyNumber,
    activeWatcherCount:
      activeWatcherUids.size,
    humanCitizenCount:
      humanUsers.length,
  };
}

const loadKingdomCoreCached =
  createStaleWhileRevalidateCache(
    loadKingdomCore,
    30_000,
  );

export async function loadKingdomSummary(): Promise<KingdomSummary> {
  const [
    core,
    kingdomWealthWolo,
  ] = await Promise.all([
    loadKingdomCoreCached(),
    loadKingdomWealthCached()
      .catch(() => null),
  ]);

  const bountyValue =
    core.latestBountyNumber > 0
      ? `#${core.latestBountyNumber}`
      : "—";

  const wealthValue =
    kingdomWealthWolo
      ? `${kingdomWealthWolo} WOLO`
      : "Unavailable";

  const stats: KingdomStat[] = [
    {
      label: "Current Age",
      value: "Feudal Age",
    },
    {
      label: "Chronicles",
      value: String(
        core.chronicleCount,
      ),
    },
    {
      label: "Latest Bounty",
      value: bountyValue,
    },
    {
      label: "Kingdom Wealth",
      value: wealthValue,
    },
    {
      label: "Watchers Active",
      value: String(
        core.activeWatcherCount,
      ),
    },
    {
      label: "Citizens",
      value: String(
        core.humanCitizenCount,
      ),
    },
    {
      label: "Joined The Quest",
      value: String(
        core.humanCitizenCount,
      ),
    },
  ];

  const ledgerStats: KingdomStat[] = [
    {
      label: "Chronicles written",
      value: String(
        core.chronicleCount,
      ),
    },
    {
      label: "Latest numbered bounty",
      value: bountyValue,
    },
    {
      label: "Kingdom wealth",
      value: wealthValue,
    },
    {
      label: "Watchers active",
      value: String(
        core.activeWatcherCount,
      ),
    },
    {
      label: "Citizens",
      value: String(
        core.humanCitizenCount,
      ),
    },
    {
      label: "Joined the quest",
      value: String(
        core.humanCitizenCount,
      ),
    },
  ];

  return {
    ...core,
    kingdomWealthWolo,
    stats,
    ledgerStats,
  };
}
