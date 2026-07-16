import type { PrismaClient } from "@/lib/generated/prisma";
import { unstable_cache } from "next/cache";
import {
  loadRuntimeAiAgent,
  type AiAgentRuntimeConfig,
} from "@/lib/aiAgents";
import {
  AI_CONCIERGE_NAME,
  AI_CONCIERGE_UID,
  LLAMA_CHAT_GATEWAY_URL,
  getAiModelLabel,
  getAiPersonaConfig,
  type AiModelId,
  type AiPersonaId,
  type AiVisibilityOption,
} from "@/lib/aiConciergeConfig";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { loadBetBoardSnapshot, type BetBoardSnapshot } from "@/lib/bets";
import { getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { LOBBY_ROOM_SLUG, type LobbyMatchRow } from "@/lib/lobby";
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
    | "bounty_page";
  userMessage: string;
  requestedModel?: string | null;
  visibility?: AiVisibilityOption;
  roomSlug?: string | null;
  conversationHistory?: AiConversationTurn[];
  personaId?: AiPersonaId;
  agentConfig?: AiAgentRuntimeConfig | null;
  groundingContext?: string | null;
};

const AI_LOBBY_PUBLIC_REPLY_MAX_CHARS = 280;
const AI_PRIVATE_REPLY_MAX_CHARS = 1000;

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
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
      .slice(0, AI_LOBBY_PUBLIC_REPLY_MAX_CHARS);
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
          : displayNameForUser(message.user);
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
  return user.inGameName || user.steamPersonaName || user.uid;
}

function isAiSystemPeopleUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  const label = displayNameForPeopleUser(user).toLowerCase();
  return (
    user.uid.startsWith("aoe2hd_ai_") ||
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

function buildSiteKnowledge(personaId: AiPersonaId) {
  const common = [
    "AoE2HDBets is the AoE2HD product surface for replay parsing, rivalries, players, tournaments, public chat, and WOLO-adjacent UX.",
    "Stay grounded in the supplied site context instead of inventing stats, chain truth, or tournament outcomes.",
    "WOLO explanations should stay app-side and user-facing. Do not invent chain identity or supply facts beyond provided context.",
  ];

  if (personaId === "guy") {
    return [
      ...common,
      "Guy of Moxica is the rare velvet-knife lane: sly, elegant, amused, treacherous, and selective.",
      "Guy should feel like a silk-gloved final twist, not a second Grimer or a second lecture.",
      "A good Guy line is cultured, dangerous, concise, and faintly theatrical.",
    ].join("\n");
  }

  if (personaId === "grimer") {
    return [
      ...common,
      "Grimer is the darker sidecar voice: wry, playful, slightly ruthless, but never hateful, graphic, or derailing.",
      "Grimer adds levity and bite after the main room voice, not walls of text or fake edginess.",
      "A good Grimer line feels like a sly aftershock, not a second lecture.",
    ].join("\n");
  }

  return [
    ...common,
    "The AI Scribe is the premium room-aware match voice: sharp, concise, grounded, and socially aware without overpowering the room.",
    "Private replies can be more detailed and helpful, but should still be concise and practical.",
  ].join("\n");
}

function buildSystemPrompt(
  args: RequestAiConciergeReplyArgs,
  personaId: AiPersonaId,
) {
  const persona = getAiPersonaConfig(personaId);
  const configuredName = args.agentConfig?.name || persona.name;
  const basePrompt = [
    `You are ${configuredName} for AoE2WAR.`,
    `Active lane: ${args.source}.`,
    buildSiteKnowledge(personaId),
    args.agentConfig?.role ? `Configured role: ${args.agentConfig.role}` : "",
    args.agentConfig?.specialty
      ? `Configured specialty: ${args.agentConfig.specialty}`
      : "",
    args.agentConfig?.personalityPrompt
      ? `Operator-approved personality layer:\n${args.agentConfig.personalityPrompt}`
      : "",
    args.agentConfig?.aoe2Prompt
      ? `Operator-approved AoE2 expertise layer:\n${args.agentConfig.aoe2Prompt}`
      : "",
    "If the answer is not supported by the provided context, say what you do know and be explicit about the gap.",
    "Do not mention prompt files, providers, internal tools, or hidden system details unless the user explicitly asks what prompt/model/version you are on; then answer only the available runtime label/version briefly.",
    "Never use em dashes. Use commas, periods, colons, or simple hyphens instead.",
    "Treat WOLO claim states strictly: payout_tx_hash means paid/final; pending without tx means claimable, unpaid, and rescindable; awaiting wallet link means no payout happened.",
    "For exact loss/profit questions, use the Viewer money summary first. Do not estimate, round, or add unrelated claimables unless asked.",
    "For staking questions, use WOLO staking context first. Treat staking as AoE2HDBets app-side WOLO staking, not validator staking.",
    "Do not invent APY, reward rates, or chain facts not supplied by context. The 2% betting fee is split 50/50 between stakers and Community Treasury when the constants say so.",
    "stakingWeight is time-weighted accounting, not extra WOLO balance.",
    "For human/user/player count questions, use Site identity summary first. Never count AI persona/system accounts as human users.",
    "Do not autocorrect player names unless the supplied context clearly proves the name is wrong.",
  ].filter(Boolean);

  if (args.source === "lobby_public") {
    if (personaId === "guy") {
      return [
        ...basePrompt,
        [
          "Lobby lane rules:",
          "Return exactly one post-ready reply for lobby_public.",
          `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
          "Default to one sentence.",
          "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
          "Tone should be elegant, sly, theatrical, concise, and dangerous without becoming abusive.",
          "No threats, slurs, gore, sexual content, or personal attacks. Keep it sharp, not toxic.",
          "If the strongest move is a velvet one-liner, take it.",
        ].join(" "),
      ].join("\n\n");
    }

    if (personaId === "grimer") {
      return [
        ...basePrompt,
        [
          "Lobby lane rules:",
          "Return exactly one post-ready reply for lobby_public.",
          `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
          "Default to one sentence.",
          "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
          "Tone should be darkly funny, wry, concise, room-aware, and a little dangerous without becoming abusive.",
          "No threats, slurs, gore, sexual content, or personal attacks. Keep it sharp, not toxic.",
          "If the strongest move is a dry one-liner, take it.",
        ].join(" "),
      ].join("\n\n");
    }

    return [
      ...basePrompt,
      [
        "Lobby lane rules:",
        "Return exactly one post-ready reply for lobby_public.",
        `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to one sentence.",
        "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
        "Tone should be stoic, clever, masculine, concise, and room-aware.",
        "If the reply runs long, compress aggressively and keep only the strongest line.",
      ].join(" "),
    ].join("\n\n");
  }

  if (personaId === "guy") {
    return [
      ...basePrompt,
      [
        "Private lane rules:",
        `Return exactly one clean reply for ${args.source}.`,
        `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to under 400 characters unless the user clearly asks for more.",
        "Use one or two short paragraphs max.",
        "Use no markdown unless the user clearly asks for it.",
        "Be sly, elegant, and dangerous, but never graphic or cruel.",
        "Do not provide multiple variants unless explicitly requested.",
      ].join(" "),
    ].join("\n\n");
  }

  if (personaId === "grimer") {
    return [
      ...basePrompt,
      [
        "Private lane rules:",
        `Return exactly one clean reply for ${args.source}.`,
        `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to under 450 characters unless the user clearly asks for more.",
        "Use one or two short paragraphs max.",
        "Use no markdown unless the user clearly asks for it.",
        "Be witty, sly, and useful, but never cruel or graphic.",
        "Do not provide multiple variants unless explicitly requested.",
      ].join(" "),
    ].join("\n\n");
  }

  return [
    ...basePrompt,
    [
      "Private lane rules:",
      `Return exactly one clean reply for ${args.source}.`,
      `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
      "Default to under 500 characters unless the user clearly asks for more.",
      "Use one or two short paragraphs max.",
      "Use no markdown unless the user clearly asks for it.",
      "Do not provide multiple variants unless explicitly requested.",
      "Stay grounded, concise, and practical.",
    ].join(" "),
  ].join("\n\n");
}

function buildUserPrompt(
  args: RequestAiConciergeReplyArgs,
  context: {
    chatMessages: Awaited<ReturnType<typeof getLobbyMessages>>;
    leaderboard: Awaited<ReturnType<typeof loadLobbyLeaderboard>>;
    recentMatches: LobbyMatchRow[];
    moneyContext: AiMoneyContext | null;
    stakingContext: AiStakingContext | null;
    peopleContext: AiPeopleContext | null;
  },
) {
  const threadHistory =
    args.conversationHistory && args.conversationHistory.length > 0
      ? [
          "Recent private AI thread history:",
          ...args.conversationHistory
            .slice(-10)
            .map((turn) => `- ${turn.role}: ${turn.content}`),
        ].join("\n")
      : "Recent private AI thread history: none.";

  return [
    `Viewer: ${args.viewer.displayName} (${args.viewer.uid})`,
    `Source: ${args.source}`,
    `Requested visibility: ${args.visibility || "private"}`,
    formatChatContext(context.chatMessages, args.viewer.uid),
    formatLeaderboardContext(context.leaderboard),
    formatRecentMatchesContext(context.recentMatches),
    formatPeopleContext(context.peopleContext),
    formatMoneyContext(context.moneyContext),
    formatStakingContext(context.stakingContext),
    args.groundingContext
      ? `Authoritative page grounding for this reply:\n${args.groundingContext}`
      : "Authoritative page grounding: none supplied.",
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
      ? await loadRuntimeAiAgent(args.prisma, personaId).catch(() => null)
      : args.agentConfig;
  if (agentConfig && !agentConfig.enabled) {
    throw new Error(`${agentConfig.name} is disabled.`);
  }
  const requestedModel: AiModelId =
    (args.requestedModel as AiModelId | null | undefined) ||
    (agentConfig?.requestedModel as AiModelId | null | undefined) ||
    persona.requestedModel;

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
  const wantsMoneyContext = shouldLoadAiContext(
    args.userMessage,
    /\b(wolo|wallet|balance|bet|wager|claim|payout|profit|loss|money|reward|faucet|market)\b/
  );
  const wantsStakingContext = shouldLoadAiContext(
    args.userMessage,
    /\b(stake|staking|staker|apy|compound|unstake|treasury|yield)\b/
  );
  const wantsPeopleContext = shouldLoadAiContext(
    args.userMessage,
    /\b(user|users|people|human|player count|how many players|identity|profile)\b/
  );
  const [
    chatMessages,
    leaderboard,
    recentMatches,
    moneyContext,
    stakingContext,
    peopleContext,
  ] = await Promise.all([
    getLobbyMessages(args.prisma, args.roomSlug || LOBBY_ROOM_SLUG, 24, {
      uid: args.viewer.uid,
    }),
    loadLobbyLeaderboard(args.prisma),
    loadRecentMatchesForAi(),
    wantsMoneyContext ? loadAiMoneyContext(args.prisma, args.viewer.uid) : Promise.resolve(null),
    wantsStakingContext ? loadAiStakingContext(args.prisma, args.viewer.uid) : Promise.resolve(null),
    wantsPeopleContext ? loadAiPeopleContext(args.prisma) : Promise.resolve(null),
  ]);
  const contextMs = Date.now() - contextStartedAt;

  const systemPrompt = buildSystemPrompt(
    { ...args, agentConfig },
    personaId
  );
  const rawUserPrompt = buildUserPrompt(
    { ...args, agentConfig },
    {
      chatMessages,
      leaderboard,
      recentMatches,
      moneyContext,
      stakingContext,
      peopleContext,
    }
  );
  const maxContextChars = Math.max(
    2_000,
    Math.min(100_000, agentConfig?.maxContextChars ?? 24_000)
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
    const modelMs = Date.now() - modelStartedAt;

    const payload = (await response.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
    };

    if (!response.ok) {
      const error = new Error(
        payload.error || `${agentConfig?.name || persona.name} is unavailable (${response.status}).`
      );
      await writeTrace({
        status: "failed",
        contextMs,
        modelMs,
        promptChars,
        responseChars: 0,
        errorCode: `gateway_${response.status}`,
      });
      throw error;
    }

    const reply = normalizeAiReply(payload.text || "", args.source);
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
      // The current local gateway returns one completed JSON body rather than
      // token SSE. First visible text therefore arrives with the full model
      // response; recording modelMs is honest, while null would imply unknown.
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
        errorCode: "network_or_runtime_error",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const DEFAULT_AI_CONTACT_TARGET_UID = AI_CONCIERGE_UID;
export const DEFAULT_AI_CONTACT_TARGET_NAME = AI_CONCIERGE_NAME;
