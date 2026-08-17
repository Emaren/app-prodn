import type { PrismaClient } from "@/lib/generated/prisma";
import { unstable_cache } from "next/cache";
import {
  loadAiAgentBySlug,
  type AiAgentRuntimeConfig,
} from "@/lib/aiAgents";
import {
  AI_CONCIERGE_NAME,
  AI_CONCIERGE_UID,
  LLAMA_CHAT_GATEWAY_URL,
  getAiModelLabel,
  getAiModelOption,
  getAiPersonaConfig,
  type AiModelId,
  type AiPersonaId,
  type AiVisibilityOption,
} from "@/lib/aiConciergeConfig";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import {
  loadKingdomKnowledgeContext,
} from "@/lib/kingdomKnowledgeRouter";
import { normalizeAiKnowledgeQuery } from "@/lib/aiKnowledgeQuery";
import {
  buildPositivePairEvidenceGuard,
  providerReplyContradictsPositivePairEvidence,
  type PositivePairEvidenceGuard,
} from "@/lib/aiPairEvidenceGuard";
import {
  DirectOpenAiError,
  requestDirectOpenAiResponse,
} from "@/lib/openAiResponses";
import { loadBetBoardSnapshot, type BetBoardSnapshot } from "@/lib/bets";
import { getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import {
  LOBBY_ROOM_SLUG,
  getFallbackLeaderboard,
  type LobbyMatchRow,
} from "@/lib/lobby";
import { buildReplayEvidenceLanes } from "@/lib/replayEvidenceLanes";
import { isInternalSystemUid } from "@/lib/internalSystemAccounts";
import {
  AI_CLAN_HALL_REPLY_MAX_CHARS,
  AI_CLAN_HALL_REPLY_MAX_SENTENCES,
  AI_PRIVATE_REPLY_MAX_CHARS,
  AI_PUBLIC_REPLY_MAX_CHARS,
  buildAiSystemPrompt,
  getAiPromptContextPolicy,
} from "@/lib/aiPromptPolicy";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  STAKER_SHARE_BPS,
  loadStakingLeaderboard,
  loadStakingMe,
  loadStakingSummary,
} from "@/lib/staking";

type AiConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type RequestAiConciergeReplyArgs = {
  prisma: PrismaClient;
  viewer: {
    uid: string;
    displayName: string;
  };
  source:
    | "lobby_public"
    | "lobby_private"
    | "contact_thread"
    | "council"
    | "bounty_page"
    | "clan_hall";
  userMessage: string;
  requestedModel?: string | null;
  visibility?: AiVisibilityOption;
  roomSlug?: string | null;
  conversationHistory?: AiConversationTurn[];
  personaId?: AiPersonaId;
  agentConfig?: AiAgentRuntimeConfig | null;
  groundingContext?: string | null;
};

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function publicDisplayNameForUser(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || "community member";
}

function clampHallReply(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (!compact) return "";

  const sentenceParts =
    compact.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [compact];

  const sentenceLimited = sentenceParts
    .slice(0, AI_CLAN_HALL_REPLY_MAX_SENTENCES)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (sentenceLimited.length <= AI_CLAN_HALL_REPLY_MAX_CHARS) {
    return sentenceLimited;
  }

  const clipped = sentenceLimited.slice(
    0,
    AI_CLAN_HALL_REPLY_MAX_CHARS + 1,
  );
  const lastSpace = clipped.lastIndexOf(" ");

  return (
    lastSpace > Math.floor(AI_CLAN_HALL_REPLY_MAX_CHARS * 0.7)
      ? clipped.slice(0, lastSpace)
      : clipped.slice(0, AI_CLAN_HALL_REPLY_MAX_CHARS)
  ).trim();
}

function normalizeAiReply(
  value: string,
  source: RequestAiConciergeReplyArgs["source"],
) {
  const collapsed = value.replace(/[—–]/g, ",").replace(/\r\n?/g, "\n").trim();
  if (!collapsed) {
    return "";
  }

  if (source === "lobby_public") {
    return collapsed
      .replace(/\s+/g, " ")
      .slice(0, AI_PUBLIC_REPLY_MAX_CHARS);
  }

  if (source === "clan_hall") {
    return clampHallReply(collapsed);
  }

  return collapsed.slice(0, AI_PRIVATE_REPLY_MAX_CHARS);
}

const loadRecentMatchesForAi = unstable_cache(async (): Promise<LobbyMatchRow[]> => {
  try {
    const response = await fetch(`${getBackendUpstreamBase()}/api/game_stats?limit=24`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 6) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for AI lane:", error);
    return [];
  }
}, ["ai-recent-matches-v1"], { revalidate: 15 });

function shouldLoadAiContext(message: string, pattern: RegExp) {
  return pattern.test(message.toLowerCase());
}

function formatLeaderboardContext(
  leaderboard: Awaited<ReturnType<typeof loadLobbyLeaderboard>>,
) {
  if (leaderboard.entries.length === 0) {
    return "Leaderboard: no ranked entries loaded right now.";
  }

  const topRows = leaderboard.entries
    .slice(0, 8)
    .map(
      (entry) =>
        `${entry.rank}. ${entry.name} (${entry.primaryRatingLabel}: ${entry.primaryRating ?? "n/a"}, ${entry.wins}-${entry.losses})`,
    )
    .join("\n");

  return `Leaderboard snapshot (${leaderboard.statusLabel}):\n${topRows}`;
}

function formatRecentMatchesContext(matches: LobbyMatchRow[]) {
  if (matches.length === 0) {
    return "Recent matches: no parsed games available right now.";
  }

  const rows = matches
    .slice(0, 6)
    .map((match) => {
      const players = Array.isArray(match.players)
        ? match.players.map((player) => player.name).join(" vs ")
        : typeof match.players === "string"
          ? match.players
          : "unknown players";
      const mapName =
        typeof match.map === "string"
          ? match.map
          : typeof match.map === "object" && match.map && "name" in match.map
            ? String(match.map.name || "Unknown map")
            : "Unknown map";

      return `- ${players} on ${mapName} (${match.winner || "winner unknown"})`;
    })
    .join("\n");

  return `Recently parsed games:\n${rows}`;
}

type AiReplayEvidenceContext = {
  logicalFinalRows: number;
  latestArtifacts: number;
  latestCompleted: number;
  latestFailures: number;
  savedSnapshots: number;
  effectiveResultCorrections: number;
  advancedLanes: ReturnType<typeof buildReplayEvidenceLanes>;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadAiReplayEvidenceContext(
  prisma: PrismaClient
): Promise<AiReplayEvidenceContext | null> {
  try {
    const [logicalFinalRows, effectiveResultCorrections, fields, latestRuns] =
      await Promise.all([
        prisma.gameStats.count({ where: { is_final: true } }),
        prisma.replayEvidenceArtifact.count({
          where: { evidenceKind: "effective_projection_receipt" },
        }),
        prisma.replayObservation.groupBy({
          by: ["fieldPath"],
          _count: { _all: true, confidenceBps: true },
          orderBy: { _count: { fieldPath: "desc" } },
          take: 100,
        }),
        prisma.replayParseRun.findMany({
          distinct: ["artifactId"],
          orderBy: [
            { artifactId: "asc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: { status: true, metrics: true },
        }),
      ]);
    const completed = latestRuns.filter((run) => run.status === "completed");
    return {
      logicalFinalRows,
      latestArtifacts: latestRuns.length,
      latestCompleted: completed.length,
      latestFailures: latestRuns.length - completed.length,
      savedSnapshots: completed.filter((run) =>
        String(jsonRecord(run.metrics).parse_mode || "").startsWith(
          "mgz_hd_saved_game_"
        )
      ).length,
      effectiveResultCorrections,
      advancedLanes: buildReplayEvidenceLanes(
        fields.map((field) => ({
          fieldPath: field.fieldPath,
          observations: field._count._all,
          scoredObservations: field._count.confidenceBps,
        }))
      ),
    };
  } catch (error) {
    console.warn("Failed to load structured replay evidence for AI:", error);
    return null;
  }
}

function formatReplayEvidenceContext(context: AiReplayEvidenceContext | null) {
  if (!context) return "Replay evidence context: unavailable for this reply.";
  const lanes = context.advancedLanes.map(
    (lane) =>
      `- ${lane.label}: ${lane.observations} observations, ${lane.scoredObservations} confidence-scored, maturity ${lane.maturity}. ${lane.truthRule}`
  );
  return [
    "Structured replay evidence context:",
    `Effective final game rows: ${context.logicalFinalRows}.`,
    `Latest Engine Room artifact dispositions: ${context.latestCompleted}/${context.latestArtifacts} completed, ${context.latestFailures} current failures.`,
    `Saved checkpoint candidates: ${context.savedSnapshots}. They are non-final and cannot establish a winner.`,
    `Strict receipt-backed effective result corrections: ${context.effectiveResultCorrections}.`,
    "Advanced candidate coverage follows. Coverage is extraction readiness, not player-specific effective truth:",
    ...lanes,
    "Use only effective recent-match context for battle claims. Never turn candidate coverage, unscored commands, or saved checkpoints into a result, build-order claim, eAPM claim, or financial fact.",
  ].join("\n");
}

type AiMoneyContext = {
  viewerUid: string;
  betBoard: BetBoardSnapshot;
  woloEarners: Awaited<ReturnType<typeof loadLobbyWoloEarnersBoard>>;
  recentClaims: Array<{
    id: number;
    displayPlayerName: string;
    amountWolo: number;
    claimKind: string;
    status: string;
    payoutTxHash: string | null;
    errorState: string | null;
    note: string | null;
    claimedAt: Date | null;
    payoutAttemptedAt: Date | null;
    createdAt: Date;
  }>;
  recentWagers: Array<{
    amountWolo: number;
    payoutWolo: number | null;
    status: string;
    side: string;
    createdAt: Date;
    user: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
    };
    market: {
      title: string;
      eventLabel: string;
      leftLabel: string;
      rightLabel: string;
    };
  }>;
};

type AiStakingContext = {
  summary24h: Awaited<ReturnType<typeof loadStakingSummary>>;
  summary7d: Awaited<ReturnType<typeof loadStakingSummary>>;
  stakersLeaderboard: Awaited<ReturnType<typeof loadStakingLeaderboard>>;
  earnersLeaderboard: Awaited<ReturnType<typeof loadStakingLeaderboard>>;
  viewer: Awaited<ReturnType<typeof loadStakingMe>> | null;
};

async function loadAiMoneyContext(
  prisma: PrismaClient,
  viewerUid: string,
): Promise<AiMoneyContext | null> {
  try {
    const [betBoard, woloEarners, recentClaims, recentWagers] =
      await Promise.all([
        loadBetBoardSnapshot(prisma, viewerUid),
        loadLobbyWoloEarnersBoard(prisma, { mode: "weekly" }),
        prisma.pendingWoloClaim.findMany({
          where: { rescindedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 12,
          select: {
            id: true,
            displayPlayerName: true,
            amountWolo: true,
            claimKind: true,
            status: true,
            payoutTxHash: true,
            errorState: true,
            note: true,
            claimedAt: true,
            payoutAttemptedAt: true,
            createdAt: true,
          },
        }),
        prisma.betWager.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
          select: {
            amountWolo: true,
            payoutWolo: true,
            status: true,
            side: true,
            createdAt: true,
            user: {
              select: {
                uid: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
            market: {
              select: {
                title: true,
                eventLabel: true,
                leftLabel: true,
                rightLabel: true,
              },
            },
          },
        }),
      ]);

    return { viewerUid, betBoard, woloEarners, recentClaims, recentWagers };
  } catch (error) {
    console.warn("Failed to load AI money context:", error);
    return null;
  }
}

async function loadAiStakingContext(
  prisma: PrismaClient,
  viewerUid: string,
): Promise<AiStakingContext | null> {
  try {
    const viewerUser = await prisma.user.findUnique({
      where: { uid: viewerUid },
      select: { id: true },
    });

    const [
      summary24h,
      summary7d,
      stakersLeaderboard,
      earnersLeaderboard,
      viewer,
    ] = await Promise.all([
      loadStakingSummary(prisma, "24h"),
      loadStakingSummary(prisma, "7d"),
      loadStakingLeaderboard(prisma, "stakers"),
      loadStakingLeaderboard(prisma, "earners"),
      viewerUser
        ? loadStakingMe(prisma, viewerUser.id)
        : Promise.resolve(null),
    ]);

    return {
      summary24h,
      summary7d,
      stakersLeaderboard,
      earnersLeaderboard,
      viewer,
    };
  } catch (error) {
    console.warn("Failed to load AI staking context:", error);
    return null;
  }
}

function formatSignedWolo(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getWagerPickedLabel(wager: AiMoneyContext["recentWagers"][number]) {
  return wager.side === "left"
    ? wager.market.leftLabel
    : wager.market.rightLabel;
}

function formatViewerWagerSummary(context: AiMoneyContext) {
  const viewerWagers = context.recentWagers.filter(
    (wager) => wager.user.uid === context.viewerUid,
  );

  if (viewerWagers.length === 0) {
    return "Viewer money summary: no recent WOLO wagers for this viewer.";
  }

  const grouped = new Map<
    string,
    {
      actor: string;
      marketTitle: string;
      pickedLabel: string;
      stakeWolo: number;
      payoutWolo: number;
      latestAtMs: number;
      statuses: Set<string>;
    }
  >();

  for (const wager of viewerWagers) {
    const pickedLabel = getWagerPickedLabel(wager);
    const key = `${wager.market.title}|${pickedLabel}`;
    const existing = grouped.get(key) || {
      actor: displayNameForUser(wager.user),
      marketTitle: wager.market.title,
      pickedLabel,
      stakeWolo: 0,
      payoutWolo: 0,
      latestAtMs: 0,
      statuses: new Set<string>(),
    };

    existing.stakeWolo += wager.amountWolo;
    existing.payoutWolo += wager.payoutWolo ?? 0;
    existing.latestAtMs = Math.max(
      existing.latestAtMs,
      wager.createdAt.getTime(),
    );
    existing.statuses.add(wager.status);
    grouped.set(key, existing);
  }

  const rows = Array.from(grouped.values())
    .sort((a, b) => b.latestAtMs - a.latestAtMs)
    .slice(0, 6)
    .map((row) => {
      const netWolo = row.payoutWolo - row.stakeWolo;
      const outcome =
        netWolo < 0
          ? `lost ${Math.abs(netWolo)} WOLO`
          : netWolo > 0
            ? `profited ${netWolo} WOLO`
            : "broke even";

      return `- ${row.marketTitle}: ${row.actor} picked ${row.pickedLabel}, total stake ${row.stakeWolo} WOLO, payout ${row.payoutWolo} WOLO, exact net ${formatSignedWolo(netWolo)} WOLO, ${outcome}; statuses ${Array.from(row.statuses).join("/")}`;
    });

  return [
    "Viewer money summary, use this first for exact loss/profit questions:",
    ...rows,
  ].join("\n");
}

function formatMoneyContext(context: AiMoneyContext | null) {
  if (!context) {
    return "WOLO / War Chest context: unavailable for this reply.";
  }

  const settled = context.betBoard.settledResults
    .slice(0, 5)
    .map(
      (market) =>
        `- ${market.title}: winner ${market.winner}, pot ${market.totalPotWolo} WOLO, payout ${market.payoutWolo} WOLO`,
    );

  const open = context.betBoard.openMarkets
    .slice(0, 3)
    .map((market) => `- ${market.title}: open pot ${market.totalPotWolo} WOLO`);

  const earners = context.woloEarners.entries
    .slice(0, 8)
    .map(
      (entry) =>
        `${entry.rank}. ${entry.name}: weekly ${entry.weeklyTakeWolo} WOLO, settled ${entry.settledWolo} WOLO, wagered ${entry.wageredWolo} WOLO, claimable ${entry.claimableWolo} WOLO, ${entry.claimed ? "linked" : "unlinked"}`,
    );

  const claims = context.recentClaims.slice(0, 10).map((claim) => {
    const txState = claim.payoutTxHash
      ? `paid/final tx ${claim.payoutTxHash.slice(0, 12)}`
      : claim.status === "pending"
        ? "pending/unpaid/rescindable"
        : claim.status;
    const error = claim.errorState ? `, ${claim.errorState}` : "";
    return `- #${claim.id} ${claim.displayPlayerName}: ${claim.amountWolo} WOLO ${claim.claimKind}, ${txState}${error}`;
  });

  const wagers = context.recentWagers.slice(0, 8).map((wager) => {
    const actor = displayNameForUser(wager.user);
    const picked =
      wager.side === "left" ? wager.market.leftLabel : wager.market.rightLabel;
    return `- ${actor} staked ${wager.amountWolo} WOLO on ${picked} in ${wager.market.title}, status ${wager.status}, payout ${wager.payoutWolo ?? 0} WOLO`;
  });

  return [
    "WOLO / War Chest context:",
    "Settlement truth: tx hash means paid and final. Pending without tx means unpaid and rescindable. Awaiting wallet link means no payout happened.",
    formatViewerWagerSummary(context),
    settled.length
      ? `Latest settled bet markets:\n${settled.join("\n")}`
      : "Latest settled bet markets: none.",
    open.length
      ? `Open bet markets:\n${open.join("\n")}`
      : "Open bet markets: none.",
    earners.length
      ? `War Chest weekly board:\n${earners.join("\n")}`
      : "War Chest weekly board: empty.",
    claims.length
      ? `Recent WOLO claims:\n${claims.join("\n")}`
      : "Recent WOLO claims: none.",
    wagers.length
      ? `Recent wagers:\n${wagers.join("\n")}`
      : "Recent wagers: none.",
  ].join("\n");
}

function formatBps(value: number) {
  return `${(value / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatStakingSummaryRow(
  label: string,
  summary: AiStakingContext["summary24h"],
) {
  return `- ${label}: totalStakedWolo ${summary.totalStakedWolo}, activeStakers ${summary.activeStakers}, betVolumeWolo ${summary.betVolumeWolo}, betsPlaced ${summary.betsPlaced}, stakerFeePoolWolo ${summary.stakerFeePoolWolo}, treasuryShareWolo ${summary.treasuryShareWolo}`;
}

function formatStakingBoardRows(
  label: string,
  rows: AiStakingContext["stakersLeaderboard"]["rows"],
) {
  if (rows.length === 0) {
    return `${label}: none.`;
  }

  return [
    `${label}:`,
    ...rows.slice(0, 5).map(
      (row, index) =>
        `- ${index + 1}. ${row.player}: staked ${row.stakedWolo} WOLO, rewards ${row.rewardsWolo} WOLO, stakingWeight ${row.stakingWeight}, status ${row.status}`,
    ),
  ].join("\n");
}

function formatViewerStakingContext(viewer: AiStakingContext["viewer"]) {
  if (!viewer) {
    return "Viewer staking position: no logged-in staking position found for this viewer.";
  }

  const events = viewer.recentEvents.slice(0, 5).map((event) => {
    const tx = event.txHash ? `, tx ${event.txHash.slice(0, 10)}` : "";
    return `- ${event.type} ${event.amountWolo} WOLO, status ${event.status}${tx}, at ${event.createdAt}`;
  });

  return [
    `Viewer staking position for ${viewer.user.playerName}: currentStakedWolo ${viewer.position.currentStakedWolo}, pendingRewardsWolo ${viewer.position.pendingRewardsWolo}, lifetimeRewardsWolo ${viewer.position.lifetimeRewardsWolo}, claimedRewardsWolo ${viewer.position.claimedRewardsWolo}, lifetimeTxFeesWolo ${viewer.position.lifetimeTxFeesWolo}, lastRewardAmountWolo ${viewer.position.lastRewardAmountWolo}, lastRewardPaymentAt ${viewer.position.lastRewardPaymentAt ?? "none"}, stakingWeight ${viewer.position.stakingWeight}, status ${viewer.position.status}.`,
    events.length
      ? `Recent viewer staking events:\n${events.join("\n")}`
      : "Recent viewer staking events: none.",
  ].join("\n");
}

function formatStakingContext(context: AiStakingContext | null) {
  if (!context) {
    return "WOLO staking context: unavailable for this reply.";
  }

  const treasuryShareBps = BPS_DENOMINATOR - STAKER_SHARE_BPS;
  const activity = context.summary24h.activity.slice(0, 6).map((item) => {
    const amount = item.amountLabel ? `, ${item.amountLabel}` : "";
    return `- ${item.label}${amount}: ${item.detail} (${item.meta})`;
  });

  return [
    "WOLO staking context, use this first for staking questions.",
    `Fee rules from code constants: betting fee rate ${formatBps(BETTING_FEE_RATE_BPS)}, staker share ${formatBps(STAKER_SHARE_BPS)}, Community Treasury share ${formatBps(treasuryShareBps)}.`,
    "This is AoE2HDBets app-side WOLO staking/custody/reward UX, not validator staking.",
    formatStakingSummaryRow("24h totals", context.summary24h),
    formatStakingSummaryRow("7d totals", context.summary7d),
    formatViewerStakingContext(context.viewer),
    formatStakingBoardRows("Top stakers", context.stakersLeaderboard.topStakers),
    formatStakingBoardRows("Top earners", context.earnersLeaderboard.topEarners),
    activity.length
      ? `Recent staking activity:\n${activity.join("\n")}`
      : "Recent staking activity: none.",
    "Important staking rules: currentStakedWolo is principal. stakingWeight is time-weighted stake-seconds, not extra WOLO. pendingRewardsWolo is not paid until credited/claimed/payout flow says so. Do not invent APY. Do not call this validator staking.",
  ].join("\n");
}

function formatChatContext(
  messages: Awaited<ReturnType<typeof getLobbyMessages>>,
  viewerUid: string,
) {
  if (messages.length === 0) {
    return "Lobby chat: no recent messages.";
  }

  return [
    "Recent lobby chat:",
    ...messages.slice(-16).map((message) => {
      const prefix =
        message.user.uid === viewerUid
          ? "viewer"
          : publicDisplayNameForUser(message.user);
      return `- ${prefix}: ${message.body}`;
    }),
  ].join("\n");
}

// BEGIN AI PEOPLE CONTEXT
type AiPeopleContext = {
  claimedHumanCount: number;
  aiProfileCount: number;
  claimedProfileCount: number;
  claimableIdentityCount: number;
  aiProfiles: string[];
  recentHumans: string[];
};

function displayNameForPeopleUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || "unnamed profile";
}

function isAiSystemPeopleUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  const label = displayNameForPeopleUser(user).toLowerCase();
  return (
    isInternalSystemUid(user.uid) ||
    label === "grimer" ||
    label === "the ai scribe"
  );
}

async function loadAiPeopleContext(
  prisma: PrismaClient,
): Promise<AiPeopleContext | null> {
  try {
    const [claimedUsers, claimableClaims] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ id: "desc" }],
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      }),
      prisma.pendingWoloClaim.findMany({
        where: {
          status: "pending",
          claimedByUserId: null,
          rescindedAt: null,
        },
        distinct: ["normalizedPlayerName"],
        select: {
          normalizedPlayerName: true,
          displayPlayerName: true,
        },
      }),
    ]);

    const aiProfiles = claimedUsers
      .filter((user) => isAiSystemPeopleUser(user))
      .map((user) => displayNameForPeopleUser(user));

    const humanProfiles = claimedUsers.filter(
      (user) => !isAiSystemPeopleUser(user),
    );

    return {
      claimedHumanCount: humanProfiles.length,
      aiProfileCount: aiProfiles.length,
      claimedProfileCount: claimedUsers.length,
      claimableIdentityCount: claimableClaims.length,
      aiProfiles,
      recentHumans: humanProfiles
        .slice(0, 12)
        .map((user) => displayNameForPeopleUser(user)),
    };
  } catch (error) {
    console.warn("Failed to load AI people context:", error);
    return null;
  }
}

function formatPeopleContext(context: AiPeopleContext | null) {
  if (!context) {
    return "Site identity summary: unavailable for this reply.";
  }

  return [
    "Site identity summary, use this first for people/user/player count questions:",
    `Claimed/logged-in profiles total: ${context.claimedProfileCount}.`,
    `Human claimed/logged-in profiles: ${context.claimedHumanCount}.`,
    `AI system profiles: ${context.aiProfileCount}${context.aiProfiles.length ? ` (${context.aiProfiles.join(", ")})` : ""}.`,
    `Unclaimed/claimable replay identities: ${context.claimableIdentityCount}.`,
    context.recentHumans.length
      ? `Recent human profiles: ${context.recentHumans.join(", ")}.`
      : "Recent human profiles: none.",
    "Important: AI system profiles are not human users. Claimable replay identities are not logged-in humans.",
  ].join("\n");
}
// END AI PEOPLE CONTEXT

function buildUserPrompt(
  args: RequestAiConciergeReplyArgs,
  context: {
    chatMessages: Awaited<ReturnType<typeof getLobbyMessages>>;
    leaderboard: Awaited<ReturnType<typeof loadLobbyLeaderboard>>;
    recentMatches: LobbyMatchRow[];
    moneyContext: AiMoneyContext | null;
    stakingContext: AiStakingContext | null;
    peopleContext: AiPeopleContext | null;
    replayEvidenceContext: AiReplayEvidenceContext | null;
    kingdomKnowledgeContext: string;
    pairEvidenceGuard: PositivePairEvidenceGuard | null;
  },
) {
  const promptPolicy = getAiPromptContextPolicy(args.source);
  const viewerDisplayName =
    args.source === "lobby_public" && args.viewer.displayName === args.viewer.uid
      ? "community member"
      : args.viewer.displayName;
  const threadHistory =
    promptPolicy.includePrivateThreadHistory &&
    args.conversationHistory &&
    args.conversationHistory.length > 0
      ? [
          "Recent private AI thread history:",
          ...args.conversationHistory
            .slice(-10)
            .map((turn) => `- ${turn.role}: ${turn.content}`),
        ].join("\n")
      : promptPolicy.includePrivateThreadHistory
        ? "Recent private AI thread history: none."
        : "Recent private AI thread history: excluded from this surface.";

  return [
    promptPolicy.includeViewerUid
      ? `Viewer: ${viewerDisplayName} (${args.viewer.uid})`
      : `Viewer: ${viewerDisplayName} (public display name only)`,
    `Source: ${args.source}`,
    `Requested visibility: ${args.visibility || "private"}`,
    args.source === "clan_hall"
      ? "Public lobby chat: intentionally excluded from the Clan Hall lane."
      : formatChatContext(context.chatMessages, args.viewer.uid),
    args.source === "clan_hall"
      ? "Generic lobby leaderboard snapshot: intentionally excluded from the Clan Hall lane; use current Kingdom Knowledge Router evidence."
      : formatLeaderboardContext(context.leaderboard),
    args.source === "clan_hall"
      ? "Generic recent-match snapshot: intentionally excluded from the Clan Hall lane; use current Kingdom Knowledge Router battle evidence."
      : formatRecentMatchesContext(context.recentMatches),
    formatReplayEvidenceContext(context.replayEvidenceContext),
    formatPeopleContext(context.peopleContext),
    formatMoneyContext(context.moneyContext),
    formatStakingContext(context.stakingContext),
    args.source === "clan_hall"
      ? args.groundingContext
        ? `Clan Hall conversation context (quoted roster/history; not authoritative for current site facts):\n${args.groundingContext}`
        : "Clan Hall conversation context: none supplied."
      : args.groundingContext
        ? `Authoritative page grounding for this reply:\n${args.groundingContext}`
        : "Authoritative page grounding: none supplied.",
    context.kingdomKnowledgeContext,
    args.source === "clan_hall" && context.pairEvidenceGuard
      ? [
          "Canonical positive pair verdict:",
          context.pairEvidenceGuard.summary,
          "Positive pair history is established by the targeted public archive. A zero-meeting result from a bounded recent repository does not negate this history. Do not claim these players have no public record, no matches, or never played together.",
        ].join("\n")
      : "",
    args.source === "clan_hall"
      ? "Evidence precedence: current Kingdom Knowledge Router repository evidence overrides conflicting factual claims in Clan Hall history, including prior Hall Scribe messages. If current canonical evidence disproves an earlier Hall Scribe statement, correct the earlier statement."
      : "Evidence precedence: current canonical repository evidence governs current site facts.",
    threadHistory,
    `Question or message to answer:\n${args.userMessage}`,
  ].join("\n\n");
}

export async function ensureAiPersonaUser(
  prisma: PrismaClient,
  personaId: AiPersonaId = "scribe",
) {
  const persona = getAiPersonaConfig(personaId);

  return prisma.user.upsert({
    where: { uid: persona.uid },
    update: {
      inGameName: persona.name,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    create: {
      uid: persona.uid,
      inGameName: persona.name,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      isAdmin: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });
}

export async function ensureAiConciergeUser(prisma: PrismaClient) {
  return ensureAiPersonaUser(prisma, "scribe");
}

export async function requestAiConciergeReply(
  args: RequestAiConciergeReplyArgs,
) {
  const personaId = args.personaId ?? "scribe";
  const persona = getAiPersonaConfig(personaId);
  const startedAt = Date.now();
  const agentConfig =
    args.agentConfig === undefined
      ? await loadAiAgentBySlug(args.prisma, personaId, { enabledOnly: true }).catch(() => null)
      : args.agentConfig;
  if (!agentConfig || !agentConfig.enabled) {
    throw new Error(`${agentConfig?.name || persona.name} is disabled or unavailable.`);
  }
  const requestedModel: AiModelId =
    (args.requestedModel as AiModelId | null | undefined) ||
    (agentConfig?.requestedModel as AiModelId | null | undefined) ||
    persona.requestedModel;
  const modelOption = getAiModelOption(requestedModel);
  if (!modelOption) {
    throw new Error(`Unknown AI model route: ${requestedModel}`);
  }

  let traceRecorded = false;
  const writeTrace = async (input: {
    status: "succeeded" | "failed" | "timed_out";
    contextMs: number | null;
    modelMs: number | null;
    promptChars: number;
    responseChars: number;
    firstTokenMs?: number | null;
    errorCode?: string | null;
  }) => {
    try {
      await args.prisma.aiRequestTrace.create({
        data: {
          agentId: agentConfig?.id ?? null,
          agentSlugSnapshot: agentConfig?.slug ?? personaId,
          viewerUid: args.viewer.uid,
          source: args.source,
          status: input.status,
          requestedModel,
          contextMs: input.contextMs,
          modelMs: input.modelMs,
          firstTokenMs: input.firstTokenMs ?? null,
          totalMs: Math.max(0, Date.now() - startedAt),
          promptChars: input.promptChars,
          responseChars: input.responseChars,
          errorCode: input.errorCode?.slice(0, 120) || null,
        },
      });
      traceRecorded = true;
    } catch (traceError) {
      console.warn("Failed to persist AI request telemetry:", traceError);
    }
  };

  const contextStartedAt = Date.now();
  const promptPolicy = getAiPromptContextPolicy(args.source);
  const wantsMoneyContext =
    promptPolicy.allowViewerMoneyContext &&
    shouldLoadAiContext(
      args.userMessage,
      /\b(wolo|wallet|balance|bet|wager|claim|payout|profit|loss|money|reward|faucet|market)\b/
    );
  const wantsStakingContext =
    promptPolicy.allowViewerStakingContext &&
    shouldLoadAiContext(
      args.userMessage,
      /\b(stake|staking|staker|apy|compound|unstake|treasury|yield)\b/
    );
  const wantsPeopleContext = shouldLoadAiContext(
    args.userMessage,
    /\b(user|users|people|human|player count|how many players|identity|profile)\b/
  );
  const wantsReplayEvidenceContext = shouldLoadAiContext(
    args.userMessage,
    /\b(replay|parser|engine room|game stats|build order|age up|research|eapm|apm|resign|tribute|trade|map control|recorded game|saved game)\b/
  );
  const [
    chatMessages,
    leaderboard,
    recentMatches,
    moneyContext,
    stakingContext,
    peopleContext,
    replayEvidenceContext,
    kingdomKnowledge,
  ] = await Promise.all([
    args.source === "clan_hall"
      ? Promise.resolve([])
      : getLobbyMessages(
          args.prisma,
          args.roomSlug || LOBBY_ROOM_SLUG,
          24,
          { uid: args.viewer.uid },
        ),
    args.source === "clan_hall"
      ? Promise.resolve(getFallbackLeaderboard())
      : loadLobbyLeaderboard(args.prisma),
    args.source === "clan_hall"
      ? Promise.resolve([] as LobbyMatchRow[])
      : loadRecentMatchesForAi(),
    wantsMoneyContext ? loadAiMoneyContext(args.prisma, args.viewer.uid) : Promise.resolve(null),
    wantsStakingContext ? loadAiStakingContext(args.prisma, args.viewer.uid) : Promise.resolve(null),
    wantsPeopleContext ? loadAiPeopleContext(args.prisma) : Promise.resolve(null),
    wantsReplayEvidenceContext
      ? loadAiReplayEvidenceContext(args.prisma)
      : Promise.resolve(null),
    loadKingdomKnowledgeContext({
      prisma: args.prisma,
      viewer: args.viewer,
      source: args.source,
      message: normalizeAiKnowledgeQuery(args.source, args.userMessage),
      maxRepositories: 6,
      maxContextChars: 28_000,
    }),
  ]);
  const contextMs = Date.now() - contextStartedAt;

  const pairEvidenceGuard =
    args.source === "clan_hall"
      ? buildPositivePairEvidenceGuard({
          kingdomKnowledgeContext: kingdomKnowledge.context,
          userMessage: args.userMessage,
        })
      : null;

  const systemPrompt = buildAiSystemPrompt({
    source: args.source,
    personaId,
    agentConfig,
  });
  const rawUserPrompt = buildUserPrompt(
    { ...args, agentConfig },
    {
      chatMessages,
      leaderboard,
      recentMatches,
      moneyContext,
      stakingContext,
      peopleContext,
      replayEvidenceContext,
      kingdomKnowledgeContext: kingdomKnowledge.context,
      pairEvidenceGuard,
    }
  );
  const maxContextChars = Math.max(
    40_000,
    Math.min(100_000, agentConfig?.maxContextChars ?? 40_000),
  );
  const userPrompt =
    rawUserPrompt.length <= maxContextChars
      ? rawUserPrompt
      : `${rawUserPrompt.slice(0, 7_000)}\n\n[Middle context compacted]\n\n${rawUserPrompt.slice(
          -(maxContextChars - 7_040)
        )}`;
  const promptChars = systemPrompt.length + userPrompt.length;
  const timeoutMs = Math.max(
    5_000,
    Math.min(120_000, agentConfig?.timeoutMs ?? 45_000)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const modelStartedAt = Date.now();

  try {
    let providerText = "";

    if (modelOption.provider === "openai") {
      const direct = await requestDirectOpenAiResponse({
        promptId: modelOption.promptId,
        promptVersion: modelOption.promptVersion,
        model: modelOption.model,
        instructions: systemPrompt,
        input: userPrompt,
        signal: controller.signal,
      });
      providerText = direct.text;
    } else {
      const response = await fetch(LLAMA_CHAT_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: requestedModel,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };

      if (!response.ok) {
        const error = new Error(
          payload.error ||
            `${agentConfig?.name || persona.name} is unavailable (${response.status}).`,
        );
        await writeTrace({
          status: "failed",
          contextMs,
          modelMs: Date.now() - modelStartedAt,
          promptChars,
          responseChars: 0,
          errorCode: `gateway_${response.status}`,
        });
        throw error;
      }

      providerText = payload.text || "";
    }

    const modelMs = Date.now() - modelStartedAt;
    const factualProviderText =
      pairEvidenceGuard &&
      providerReplyContradictsPositivePairEvidence(providerText)
        ? pairEvidenceGuard.summary
        : providerText;
    const reply = normalizeAiReply(factualProviderText, args.source);
    if (!reply) {
      await writeTrace({
        status: "failed",
        contextMs,
        modelMs,
        promptChars,
        responseChars: 0,
        errorCode: "empty_reply",
      });
      throw new Error(`${agentConfig?.name || persona.name} returned an empty reply.`);
    }

    await writeTrace({
      status: "succeeded",
      contextMs,
      modelMs,
      // House voices currently return one completed provider response rather than
      // token SSE. First visible text therefore arrives with the full model
      // response; recording modelMs remains the honest first-visible proxy.
      firstTokenMs: modelMs,
      promptChars,
      responseChars: reply.length,
    });

    return {
      body: reply,
      requestedModel,
      requestedModelLabel: getAiModelLabel(requestedModel),
      personaId,
      personaName: agentConfig?.name || persona.name,
      personaUid: persona.uid,
      timing: {
        contextMs,
        modelMs,
        totalMs: Date.now() - startedAt,
        firstTokenMs: modelMs,
        contextProfile: {
          money: wantsMoneyContext,
          staking: wantsStakingContext,
          people: wantsPeopleContext,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      await writeTrace({
        status: "timed_out",
        contextMs,
        modelMs: Date.now() - modelStartedAt,
        promptChars,
        responseChars: 0,
        errorCode: "timeout",
      });
      throw new Error(`${agentConfig?.name || persona.name} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    if (!traceRecorded) {
      await writeTrace({
        status: "failed",
        contextMs,
        modelMs: Date.now() - modelStartedAt,
        promptChars,
        responseChars: 0,
        errorCode:
          error instanceof DirectOpenAiError
            ? error.code
            : "network_or_runtime_error",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const DEFAULT_AI_CONTACT_TARGET_UID = AI_CONCIERGE_UID;
export const DEFAULT_AI_CONTACT_TARGET_NAME = AI_CONCIERGE_NAME;
