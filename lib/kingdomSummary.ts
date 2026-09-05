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
  watchers: KingdomCitizen[];
  chronicleCount: number;
  latestBountyNumber: number;
  kingdomWealthWolo: string | null;
  watcherCount: number;
  humanCitizenCount: number;
};

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

  const [
    users,
    chronicleCount,
    latestBountyNumber,
    watcherFinals,
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
    prisma.gameStats.findMany({
      where: {
        is_final: true,
        parse_source: {
          startsWith: "watcher",
        },
        userUid: {
          not: null,
        },
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      distinct: [
        "userUid",
      ],
      select: {
        userUid: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
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

  const watchers =
    watcherFinals
      .map((row) => {
        const uid =
          row.user?.uid ||
          row.userUid;
        if (
          !uid ||
          isInternalSystemUid(
            uid,
          )
        ) {
          return null;
        }

        return {
          name:
            row.user?.inGameName ||
            row.user?.steamPersonaName ||
            uid,
          href:
            `/players/${encodeURIComponent(
              uid,
            )}`,
        };
      })
      .filter(
        (
          watcher,
        ): watcher is KingdomCitizen =>
          Boolean(watcher),
      );

  return {
    citizens,
    watchers,
    chronicleCount,
    latestBountyNumber,
    watcherCount:
      watchers.length,
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
      label: "Watchers",
      value: String(
        core.watcherCount,
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
      label: "Watchers",
      value: String(
        core.watcherCount,
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
