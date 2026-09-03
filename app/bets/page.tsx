"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { Monitor, Play } from "lucide-react";
import { toast } from "sonner";

import BetsDisplayRail from "@/components/bets/BetsDisplayRail";
import ResultCard from "@/components/bets/ResultCard";
import YourBookSection from "@/components/bets/YourBookSection";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import FounderBonusModal from "@/components/bets/FounderBonusModal";
import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import { BattleLoopPreview } from "@/components/media/BattleLoopPreview";
import WarTape from "@/components/bets/WarTape";
import {
  buildBetGameStatsHref,
  buildBetMarketHistoryHref,
  isRecoveryBookOpen,
} from "@/components/bets/page-shared";
import {
  trackBetsViewEvent,
} from "@/lib/betsViewTelemetry";
import {
  LEGACY_BETS_VIEW_STORAGE_KEY,
  betsViewFamily,
  legacyBetsViewToVersion,
  normalizeBetsViewVersion,
  type BetsViewVersion,
} from "@/lib/betsViewVersions";
import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { resolveVerifiedWalletStakeCap } from "@/lib/woloBalanceRead";
import {
  isExplicitlyAttachedBroadcastFeed,
  readStoredBattleCamVisibility,
  type BattleCamVisibility,
  writeStoredBattleCamVisibility,
} from "@/lib/broadcastPresentation";
import { battleLoopForSeed } from "@/lib/battleLoopClips";
import {
  DESYNC_SIDE_MARKET_TYPE,
} from "@/lib/desyncSideMarket";
import { buildBetStakeMemo } from "@/lib/betStakeMemo";
import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  toUwoLoAmount,
  woloChainConfig,
} from "@/lib/woloChain";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.webp";
const BETTING_HALL_HERO_SRC = "/bets/betting_hall2.png";
const STAKE_OPTIONS = [10, 25, 50, 100] as const;
const BETS_POLL_INTERVAL_MS = 5_000;
const STAKE_RECOVERY_STORAGE_KEY = "aoe2hdbets.betStakeRecovery.v1";
const TICKET_RECOVERY_STORAGE_KEY = "aoe2hdbets.betTicketRecovery.v1";
const BETS_VIEW_STORAGE_KEY = "aoe2hdbets.betsViewVersion.v1";
const BETS_VIEW_ROLLOUT_KEY =
  "aoe2hdbets.betsViewRollout.v1";
const BETS_VIEW_ROLLOUT = "E4";
const BETS_VIEW_DEFAULT: BetsViewVersion = "E4";

function isSettlementProofState(state: BetSettledResult["payoutState"]) {
  return state === "executed" || state === "corrected";
}

type BetSide = "left" | "right";
type BetStatus =
  | "open"
  | "closing"
  | "live"
  | "awaiting_final_proof"
  | "settled"
  | "voided"
  | "under_review";
type FounderBonusType = "participants" | "winner";
type BroadcastViewKey = "left" | "god" | "right";

type BroadcastFeed = {
  id: number;
  sessionKey: string;
  provider: "aoe2war" | "twitch" | "youtube" | "steam" | "discord" | "custom";
  sourceType: string;
  role:
    "caster" | "observer" | "player_pov" | "team_pov" | "postgame" | "external";
  label: string;
  title: string | null;
  url: string;
  playbackUrl: string | null;
  embedId: string | null;
  playerLabel: string | null;
  thumbnailUrl: string | null;
  mediaMimeType: string | null;
  isPrimary: boolean;
  status: string;
  chunkCount: number;
  latestChunkSeq: number;
  lastHeartbeatAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  canEmbed: boolean;
  externalOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

type BroadcastFeeds = {
  left: BroadcastFeed | null;
  god: BroadcastFeed | null;
  right: BroadcastFeed | null;
};

type BroadcastPreviewUrls = {
  left: string | null;
  god: string | null;
  right: string | null;
};

const EMPTY_BROADCAST_FEEDS: BroadcastFeeds = {
  left: null,
  god: null,
  right: null,
};

const EMPTY_BROADCAST_PREVIEW_URLS: BroadcastPreviewUrls = {
  left: null,
  god: null,
  right: null,
};

type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

type BetBoardMarket = {
  id: number;
  parentMarketId?: number | null;
  battleNumber?: number | null;
  slug: string;
  title: string;
  eventLabel: string;
  marketType: string;
  href: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  status: BetStatus;
  bettingOpen: boolean;
  bettingCloseReason: string | null;
  teamFormat: string | null;
  teamResolutionStatus: string | null;
  teamResolutionProvenance: string | null;
  teamConfidence: string | null;
  integrityStatus: string;
  integrityReason: string | null;
  rosterLockedAt: string | null;
  featured: boolean;
  closeLabel: string;
  scheduledStartAt: string | null;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  founderBonuses: BetFounderChip[];
  warTape: BetWarTapeRow[];
  broadcastFeeds: BroadcastFeeds;
  broadcastPreviewUrls: BroadcastPreviewUrls;
  viewerWager: {
    side: BetSide;
    amountWolo: number;
    slipCount: number;
    executionMode: "app_only" | "onchain_escrow";
    stakeTxHash: string | null;
    stakeWalletAddress: string | null;
    stakeLockedAt: string | null;
  } | null;
  winnerSide: BetSide | null;
  desyncMarket: BetBoardMarket | null;
};

type BetFounderChip = {
  id: number;
  bonusType: FounderBonusType;
  totalAmountWolo: number;
  note: string | null;
  status: string;
  createdAt: string;
};

type BetWarTapeRow = {
  id: string;
  kind: "tx" | "event";
  label: string;
  actor: string | null;
  amountWolo: number | null;
  side: BetSide | null;
  note: string | null;
  txHash: string | null;
  txUrl: string | null;
  createdAt: string;
};

type BetBookEntry = {
  marketId: number;
  marketSlug: string;
  title: string;
  eventLabel: string;
  side: BetSide;
  pickedLabel: string;
  amountWolo: number;
  slipCount: number;
  projectedReturnWolo: number;
  closeLabel: string;
  scheduledStartAt: string | null;
  status: BetStatus;
  executionMode: "app_only" | "onchain_escrow";
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
};

type BetSettledResult = {
  id: number;
  battleNumber?: number | null;
  title: string;
  eventLabel: string;
  winner: string;
  resolutionStatus: "settled" | "voided" | "under_review";
  resolutionReason: string | null;
  refundStatus: string | null;
  settlementStatus: string | null;
  settlementFailureCode: string | null;
  settlementAttemptedAt: string | null;
  settlementExecutedAt: string | null;
  payoutState: "executed" | "pending" | "partial" | "failed" | "corrected";
  payoutTxHashes: string[];
  payoutProofUrls: string[];
  teamFormat: string | null;
  teamResolutionProvenance: string | null;
  integrityStatus: string;
  integrityReason: string | null;
  integritySummary: string | null;
  correctionStatus: string | null;
  amountStillOwedWolo: number;
  overpaymentWolo: number;
  mapName: string;
  totalPotWolo: number;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
  linkedSessionKey: string | null;
  broadcastFeeds: BroadcastFeeds;
  broadcastPreviewUrls: BroadcastPreviewUrls;
  founderBonuses: BetFounderChip[];
};

type BetBoardSnapshot = {
  generatedAt: string;
  viewerName: string | null;
  wolo: {
    betEscrowMode: "disabled" | "optional" | "required";
    betEscrowAddress: string | null;
    onchainEscrowEnabled: boolean;
    onchainEscrowRequired: boolean;
    escrowConfigError: string | null;
    betTestMode: boolean;
    settlementServiceConfigured: boolean;
    settlementAuthConfigured: boolean;
    settlementExecutionMode:
      "settlement_service" | "local_signer_fallback" | "unconfigured";
    groupedRunCapability:
      | "supported"
      | "fallback_to_singles"
      | "not_configured"
      | "auth_required"
      | "auth_failed"
      | "unknown";
    escrowVerifyCapability:
      "supported" | "not_configured" | "unavailable" | "unknown";
    escrowRecentCapability:
      "supported" | "not_configured" | "unavailable" | "unknown";
    settlementSurfaceWarnings: string[];
    settlementSurfaceDetail: string | null;
  };
  recovery: {
    unresolvedStakeIntents: Array<{
      id: number;
      marketId: number;
      marketStatus: BetStatus;
      title: string;
      eventLabel: string;
      side: BetSide;
      amountWolo: number;
      status: string;
      stakeTxHash: string | null;
      walletAddress: string | null;
      errorDetail: string | null;
      updatedAt: string;
    }>;
    unresolvedStakeTickets: Array<{
      id: number;
      version: number;
      status: string;
      totalAmountWolo: number;
      stakeTxHash: string | null;
      walletAddress: string;
      memo: string;
      errorDetail: string | null;
      updatedAt: string;
      legs: Array<{
        marketId: number;
        marketStatus: BetStatus;
        title: string;
        eventLabel: string;
        legRole: string;
        side: BetSide;
        amountWolo: number;
      }>;
    }>;
  };
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
  awaitingProofMarkets: BetBoardMarket[];
  settledResults: BetSettledResult[];
  yourBook: {
    activeCount: number;
    stakedWolo: number;
    projectedReturnWolo: number;
    openWagers: BetBookEntry[];
  };
  heat: {
    biggestPot: {
      label: string;
      potWolo: number;
    } | null;
    bestReturn: {
      label: string;
      returnMultiplier: number;
    } | null;
    liveCount: number;
  };
};


type BetsDesignFixture =
  | "e2-1v1"
  | "e2-4v4"
  | "e3-1v1"
  | "e3-4v4"
  | "e4-1v1"
  | "e4-4v4";

function readBetsDesignFixture():
  BetsDesignFixture | null {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV === "production"
  ) {
    return null;
  }

  const value =
    new URLSearchParams(
      window.location.search,
    ).get("fixture");

  if (
    value === "e2-1v1" ||
    value === "e2-4v4" ||
    value === "e3-1v1" ||
    value === "e3-4v4" ||
    value === "e4-1v1" ||
    value === "e4-4v4"
  ) {
    return value;
  }

  return null;
}

function buildBetsDesignFixture(
  fixture: BetsDesignFixture,
): BetBoardSnapshot {
  const now =
    new Date().toISOString();

  const isFourVFour =
    fixture.endsWith("-4v4");

  const feeds: BroadcastFeeds = {
    left: null,
    god: null,
    right: null,
  };

  const previews: BroadcastPreviewUrls = {
    left: null,
    god: null,
    right: null,
  };

  function makeSide(
    key: BetSide,
    name: string,
    poolWolo: number,
    crowdPercent: number,
    slips: number,
  ): BetBoardSide {
    return {
      key,
      name,
      href: null,
      poolWolo,
      crowdPercent,
      slips,
      seededWolo: 0,
    };
  }

  function makeMarket(input: {
    id: number;
    battleNumber: number;
    leftName: string;
    rightName: string;
    eventLabel: string;
    teamFormat: string;
    leftPool: number;
    rightPool: number;
    featured?: boolean;
    desyncMarket?: BetBoardMarket | null;
  }): BetBoardMarket {
    const totalPotWolo =
      input.leftPool + input.rightPool;

    const leftPercent =
      totalPotWolo > 0
        ? Math.round(
            (input.leftPool /
              totalPotWolo) *
              100,
          )
        : 50;

    return {
      id: input.id,
      parentMarketId: null,
      battleNumber:
        input.battleNumber,
      slug:
        `design-battle-${input.battleNumber}`,
      title:
        `${input.leftName} vs ${input.rightName}`,
      eventLabel:
        input.eventLabel,
      marketType:
        "winner",
      href: null,
      linkedSessionKey:
        `design:e2:${input.battleNumber}`,
      linkedGameStatsId: null,
      status: "live",
      bettingOpen: false,
      bettingCloseReason:
        "watcher_battle_already_started",
      teamFormat:
        input.teamFormat,
      teamResolutionStatus:
        "resolved",
      teamResolutionProvenance:
        "design_fixture",
      teamConfidence:
        "high",
      integrityStatus:
        "verified",
      integrityReason: null,
      rosterLockedAt: now,
      featured:
        Boolean(input.featured),
      closeLabel:
        "Live",
      scheduledStartAt: null,
      totalPotWolo,
      left: makeSide(
        "left",
        input.leftName,
        input.leftPool,
        leftPercent,
        12,
      ),
      right: makeSide(
        "right",
        input.rightName,
        input.rightPool,
        100 - leftPercent,
        8,
      ),
      founderBonuses: [],
      warTape: [
        {
          id:
            `design-${input.id}-open`,
          kind: "event",
          label:
            "Book opened",
          actor:
            "Watcher",
          amountWolo: null,
          side: null,
          note:
            input.eventLabel,
          txHash: null,
          txUrl: null,
          createdAt: now,
        },
      ],
      broadcastFeeds:
        feeds,
      broadcastPreviewUrls:
        previews,
      viewerWager: null,
      winnerSide: null,
      desyncMarket:
        input.desyncMarket ??
        null,
    };
  }

  const desyncMarket =
    makeMarket({
      id: 990002,
      battleNumber: 3043,
      leftName: "NO DESYNC",
      rightName: "DESYNC",
      eventLabel:
        "Watcher Live · Yucatan",
      teamFormat: "1v1",
      leftPool: 185,
      rightPool: 195,
    });

  desyncMarket.marketType =
    DESYNC_SIDE_MARKET_TYPE;

  desyncMarket.parentMarketId =
    990001;

  const featured =
    makeMarket({
      id: 990001,
      battleNumber: 3043,
      leftName: isFourVFour
        ? "Matt Rhodes + Hera + TheViper + Liereyy"
        : "Matt Rhodes",
      rightName: isFourVFour
        ? "Zodiac + DauT + Villese + MBL"
        : "Zodiac",
      eventLabel:
        "Watcher Live · Yucatan",
      teamFormat:
        isFourVFour
          ? "4v4"
          : "1v1",
      leftPool: 620,
      rightPool: 380,
      featured: true,
      desyncMarket,
    });

  const capochHera =
    makeMarket({
      id: 990003,
      battleNumber: 3042,
      leftName: "Capoch",
      rightName: "Hera",
      eventLabel:
        "Watcher Live · Arabia",
      teamFormat: "1v1",
      leftPool: 270,
      rightPool: 430,
    });

  const viperTeam =
    makeMarket({
      id: 990004,
      battleNumber: 3041,
      leftName:
        "TheViper + MBL",
      rightName:
        "DauT + Villese",
      eventLabel:
        "Watcher Live · Arena",
      teamFormat: "2v2",
      leftPool: 760,
      rightPool: 640,
    });

  const fourVFour =
    makeMarket({
      id: 990005,
      battleNumber: 3040,
      leftName:
        "Jim + Emaren + Ra + MouldyBoars",
      rightName:
        "Somniosator + Deltaforce + Zodiac + Hera",
      eventLabel:
        "Watcher Live · Hideout",
      teamFormat: "4v4",
      leftPool: 1170,
      rightPool: 930,
    });

  return {
    generatedAt: now,
    viewerName: "Emaren",

    wolo: {
      betEscrowMode:
        "optional",
      betEscrowAddress: null,
      onchainEscrowEnabled:
        false,
      onchainEscrowRequired:
        false,
      escrowConfigError: null,
      betTestMode: true,
      settlementServiceConfigured:
        true,
      settlementAuthConfigured:
        true,
      settlementExecutionMode:
        "settlement_service",
      groupedRunCapability:
        "supported",
      escrowVerifyCapability:
        "supported",
      escrowRecentCapability:
        "supported",
      settlementSurfaceWarnings:
        [],
      settlementSurfaceDetail:
        null,
    },

    recovery: {
      unresolvedStakeIntents:
        [],
      unresolvedStakeTickets:
        [],
    },

    featuredMarket:
      featured,

    openMarkets: [
      featured,
      capochHera,
      viperTeam,
      fourVFour,
    ],

    awaitingProofMarkets:
      [],

    settledResults:
      [],

    yourBook: {
      activeCount: 1,
      stakedWolo: 100,
      projectedReturnWolo: 161,
      openWagers: [
        {
          marketId:
            featured.id,
          marketSlug:
            featured.slug,
          title:
            featured.title,
          eventLabel:
            featured.eventLabel,
          side: "left",
          pickedLabel:
            featured.left.name,
          amountWolo: 100,
          slipCount: 1,
          projectedReturnWolo:
            161,
          closeLabel:
            "Live",
          scheduledStartAt:
            null,
          status: "live",
          executionMode:
            "app_only",
          stakeTxHash: null,
          stakeProofUrl: null,
        },
      ],
    },

    heat: {
      biggestPot: {
        label:
          fourVFour.title,
        potWolo:
          fourVFour.totalPotWolo,
      },
      bestReturn: {
        label:
          featured.right.name,
        returnMultiplier:
          2.63,
      },
      liveCount: 4,
    },
  };
}

type SelectionState = {
  marketId: number;
  side: BetSide;
  stake: number;
  desync: {
    marketId: number;
    side: BetSide;
    stake: number;
  } | null;
};

type LockWorkflow = {
  marketId: number;
  phase: "awaiting_wallet" | "confirming_chain" | "recording_wager";
  stakeTxHash: string | null;
};

type FounderComposerState = {
  requestId: string;
  marketId: number;
  marketTitle: string;
  participantCount: number;
  bonusType: FounderBonusType;
  amountValue: string;
  noteValue: string;
};

function defaultFounderParticipantAmount(participantCount: number) {
  const count = Math.max(2, participantCount);

  return String(count * 2);
}

type KeplrKey = {
  bech32Address?: string;
  isNanoLedger?: boolean;
};

type BetBrowserWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (
      config: typeof woloChainConfig,
    ) => Promise<void>;
    getOfflineSignerAuto?: (chainId: string) => Promise<unknown>;
    getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
    getKey?: (chainId: string) => Promise<{ bech32Address: string }>;
  };
  getOfflineSigner?: (chainId: string) => unknown;
  getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
};

type BetSignerResolution = {
  signer: OfflineSigner;
  signerAddress: string;
  isLedger: boolean;
};

type StakeExecutionResult = {
  walletAddress: string | null;
  stakeTxHash: string | null;
  executionMode: "app_only" | "onchain_escrow";
  walletProvider: "keplr" | null;
  walletType: "ledger" | "keplr" | null;
};

type PreparedStakeWallet = {
  signer: OfflineSigner;
  walletAddress: string;
  walletProvider: "keplr";
  walletType: "ledger" | "keplr";
  isLedger: boolean;
};

type PendingStakeRecovery = {
  intentId: number;
  marketId: number;
  side: BetSide;
  amountWolo: number;
  walletAddress: string | null;
  stakeTxHash: string | null;
  walletProvider: string | null;
  walletType: string | null;
  browserInfo: string | null;
  routePath: string;
  updatedAt: string;
};

type PendingTicketRecovery = {
  ticketId: number;
  clientRequestId: string;
  marketId: number;
  totalAmountWolo: number;
  memo: string;
  walletAddress: string;
  stakeTxHash: string | null;
  updatedAt: string;
};

type PreparedBetStakeTicket = {
  id: number;
  version: number;
  status: string;
  totalAmountWolo: number;
  memo: string;
};

function newClientRequestId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function shortTxHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function isOnchainViewerWager(
  wager: BetBoardMarket["viewerWager"],
): wager is NonNullable<BetBoardMarket["viewerWager"]> {
  return Boolean(wager && wager.executionMode === "onchain_escrow");
}

function normalizePendingStakeRecovery(input: Partial<PendingStakeRecovery>) {
  if (!Number.isFinite(input.intentId)) return null;
  if (!Number.isFinite(input.marketId)) return null;
  if (input.side !== "left" && input.side !== "right") return null;
  if (!Number.isFinite(input.amountWolo) || (input.amountWolo ?? 0) < 1)
    return null;

  return {
    intentId: input.intentId as number,
    marketId: input.marketId as number,
    side: input.side,
    amountWolo: Math.round(input.amountWolo as number),
    walletAddress:
      typeof input.walletAddress === "string"
        ? input.walletAddress.trim() || null
        : null,
    stakeTxHash:
      typeof input.stakeTxHash === "string"
        ? input.stakeTxHash.trim() || null
        : null,
    walletProvider:
      typeof input.walletProvider === "string"
        ? input.walletProvider.trim() || null
        : null,
    walletType:
      typeof input.walletType === "string"
        ? input.walletType.trim() || null
        : null,
    browserInfo:
      typeof input.browserInfo === "string"
        ? input.browserInfo.trim() || null
        : null,
    routePath:
      typeof input.routePath === "string"
        ? input.routePath.trim() || "/bets"
        : "/bets",
    updatedAt:
      typeof input.updatedAt === "string"
        ? input.updatedAt.trim() || new Date().toISOString()
        : new Date().toISOString(),
  } satisfies PendingStakeRecovery;
}

function readPendingStakeRecoveries() {
  if (typeof window === "undefined") return [] as PendingStakeRecovery[];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STAKE_RECOVERY_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        normalizePendingStakeRecovery(
          entry && typeof entry === "object"
            ? (entry as Partial<PendingStakeRecovery>)
            : {},
        ),
      )
      .filter((entry): entry is PendingStakeRecovery => Boolean(entry));
  } catch {
    return [];
  }
}

function writePendingStakeRecoveries(items: PendingStakeRecovery[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STAKE_RECOVERY_STORAGE_KEY,
    JSON.stringify(items),
  );
}

function upsertPendingStakeRecovery(item: PendingStakeRecovery) {
  const current = readPendingStakeRecoveries().filter(
    (entry) => entry.intentId !== item.intentId,
  );
  current.unshift(item);
  writePendingStakeRecoveries(current.slice(0, 20));
}

function removePendingStakeRecovery(intentId: number) {
  writePendingStakeRecoveries(
    readPendingStakeRecoveries().filter((entry) => entry.intentId !== intentId),
  );
}

function normalizePendingTicketRecovery(input: Partial<PendingTicketRecovery>) {
  if (!Number.isSafeInteger(input.ticketId) || (input.ticketId ?? 0) < 1)
    return null;
  if (!Number.isSafeInteger(input.marketId) || (input.marketId ?? 0) < 1)
    return null;
  if (
    !Number.isSafeInteger(input.totalAmountWolo) ||
    (input.totalAmountWolo ?? 0) < 1
  )
    return null;
  const clientRequestId =
    typeof input.clientRequestId === "string"
      ? input.clientRequestId.trim()
      : "";
  const memo = typeof input.memo === "string" ? input.memo.trim() : "";
  const walletAddress =
    typeof input.walletAddress === "string" ? input.walletAddress.trim() : "";
  if (!clientRequestId || !memo || !walletAddress) return null;

  return {
    ticketId: input.ticketId as number,
    clientRequestId,
    marketId: input.marketId as number,
    totalAmountWolo: input.totalAmountWolo as number,
    memo,
    walletAddress,
    stakeTxHash:
      typeof input.stakeTxHash === "string"
        ? input.stakeTxHash.trim() || null
        : null,
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : new Date().toISOString(),
  } satisfies PendingTicketRecovery;
}

function readPendingTicketRecoveries() {
  if (typeof window === "undefined") return [] as PendingTicketRecovery[];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TICKET_RECOVERY_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        normalizePendingTicketRecovery(
          entry && typeof entry === "object"
            ? (entry as Partial<PendingTicketRecovery>)
            : {},
        ),
      )
      .filter((entry): entry is PendingTicketRecovery => Boolean(entry));
  } catch {
    return [];
  }
}

function writePendingTicketRecoveries(items: PendingTicketRecovery[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TICKET_RECOVERY_STORAGE_KEY,
    JSON.stringify(items),
  );
}

function upsertPendingTicketRecovery(item: PendingTicketRecovery) {
  const current = readPendingTicketRecoveries().filter(
    (entry) => entry.ticketId !== item.ticketId,
  );
  current.unshift(item);
  writePendingTicketRecoveries(current.slice(0, 10));
}

function removePendingTicketRecovery(ticketId: number) {
  writePendingTicketRecoveries(
    readPendingTicketRecoveries().filter(
      (entry) => entry.ticketId !== ticketId,
    ),
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatExactWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function isBettingSettlementRailPaused(
  snapshot: BetBoardSnapshot | null | undefined,
) {
  const wolo = snapshot?.wolo;

  const onchainBetEscrowRequired = wolo?.onchainEscrowRequired ?? false;

  const settlementExecutionMode =
    wolo?.settlementExecutionMode || "unconfigured";

  const groupedRunCapability = wolo?.groupedRunCapability || "not_configured";

  return (
    onchainBetEscrowRequired &&
    (settlementExecutionMode === "unconfigured" ||
      (settlementExecutionMode === "settlement_service" &&
        groupedRunCapability === "unknown"))
  );
}

function validateStakeAmount(stake: number, maxStake: number) {
  if (!Number.isFinite(stake) || !Number.isInteger(stake)) {
    return "Whole numbers only.";
  }
  if (stake < 1) {
    return "Enter at least 1 WOLO.";
  }
  if (stake > maxStake) {
    return `Max ${maxStake.toLocaleString()} WOLO with the current wallet/app limit.`;
  }
  return null;
}

function formatSettledTime(value: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScheduledStart(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStartsIn(diffMs: number) {
  if (diffMs <= 0) return "Live now";

  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    return `Starts in ${days}d ${hours}h`;
  }

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${totalMinutes}m`;
}

function getMarketTiming(market: BetBoardMarket, nowMs: number) {
  const startLabel = formatScheduledStart(market.scheduledStartAt);
  if (!startLabel) {
    return null;
  }

  const startMs = new Date(market.scheduledStartAt || "").getTime();
  const countdownLabel =
    market.status === "live" || startMs <= nowMs
      ? "Live now"
      : formatStartsIn(startMs - nowMs);

  return {
    startLabel,
    countdownLabel,
  };
}

function useNowTicker(intervalMs = 30_000) {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    refresh();

    const interval = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [intervalMs]);

  return nowMs;
}

function projectReturn(
  stakeWolo: number,
  selectedPoolWolo: number,
  oppositePoolWolo: number,
) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool)),
  );
}

function safePlayerName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function sameBroadcastSource(
  first: BroadcastFeed | null | undefined,
  second: BroadcastFeed | null | undefined,
) {
  if (!first || !second) return false;
  const firstUrl = first.url.trim().toLowerCase();
  const secondUrl = second.url.trim().toLowerCase();
  return Boolean(firstUrl && firstUrl === secondUrl);
}

function isPendingLivePlaceholderMarket(
  market: BetBoardMarket | null | undefined,
) {
  if (!market) return false;

  const label = market.eventLabel.toLowerCase();
  const title = market.title.toLowerCase();
  const rightName = market.right?.name?.toLowerCase?.() ?? "";

  return (
    label.includes("book pending") ||
    label.includes("players parsing") ||
    title === "live 4v4 detected" ||
    rightName === "parsing"
  );
}

function describeStakeLockError(
  error: unknown,
  options?: { isLedger?: boolean },
) {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  const fallback = "Could not lock the wager.";
  const normalized = (message || fallback).toLowerCase();

  if (
    normalized.includes("rejected") ||
    normalized.includes("denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return options?.isLedger
      ? "Ledger approval was cancelled before the WOLO stake broadcast finished."
      : "Keplr approval was cancelled before the WOLO stake broadcast finished.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch balance") ||
    normalized.includes("network error")
  ) {
    return options?.isLedger
      ? "Keplr lost the Ledger handoff before the WOLO stake broadcast finished. Keep the Ledger unlocked in the Cosmos app, approve on-device, then retry once."
      : "Keplr lost the chain handshake before the WOLO stake broadcast finished. Refresh and retry once.";
  }

  if (
    normalized.includes("ledger") ||
    normalized.includes("transportstatuserror") ||
    normalized.includes("device") ||
    normalized.includes("usb")
  ) {
    return "Ledger did not finish signing the WOLO stake. Unlock the device, open the Cosmos app, then approve the transaction in both Keplr and on the Ledger.";
  }

  return message || fallback;
}

async function resolveBetSigner(
  keplrWindow: BetBrowserWindow,
  fallbackAddress: string,
): Promise<BetSignerResolution> {
  const key = keplrWindow.keplr?.getKey
    ? ((await keplrWindow.keplr
        .getKey(WOLO_CHAIN_ID)
        .catch(() => null)) as KeplrKey | null)
    : null;
  const keyAddress = key?.bech32Address?.trim() || "";
  const isLedger = Boolean(key?.isNanoLedger);

  if (isLedger) {
    const aminoSigner = (keplrWindow.keplr?.getOfflineSignerOnlyAmino?.(
      WOLO_CHAIN_ID,
    ) || keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID)) as
      OfflineSigner | undefined;

    if (!aminoSigner) {
      throw new Error(
        "Ledger account detected, but Keplr Amino signer is unavailable in this browser.",
      );
    }

    const accounts = await aminoSigner.getAccounts();
    const signerAddress =
      accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error(
        "Connected Ledger returned no WOLO address for this bet.",
      );
    }

    return {
      signer: aminoSigner,
      signerAddress,
      isLedger: true,
    };
  }

  if (keplrWindow.keplr?.getOfflineSignerAuto) {
    const signer = (await keplrWindow.keplr.getOfflineSignerAuto(
      WOLO_CHAIN_ID,
    )) as OfflineSigner;
    const accounts = await signer.getAccounts();
    const signerAddress =
      accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error(
        "Connected wallet returned no WOLO address for this bet.",
      );
    }

    return {
      signer,
      signerAddress,
      isLedger: false,
    };
  }

  const signer = (keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
    keplrWindow.getOfflineSigner?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined;

  if (!signer) {
    throw new Error("Keplr offline signer was not found in this browser.");
  }

  const accounts = await signer.getAccounts();
  const signerAddress =
    accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

  if (!signerAddress) {
    throw new Error("Connected wallet returned no WOLO address for this bet.");
  }

  return {
    signer,
    signerAddress,
    isLedger: false,
  };
}

function statusPill(status: BetStatus) {
  if (status === "live") {
    return "border-emerald-300/22 bg-[linear-gradient(135deg,rgba(6,95,70,0.58),rgba(16,185,129,0.16))] text-emerald-50";
  }
  if (status === "closing") {
    return "border-amber-300/18 bg-[linear-gradient(135deg,rgba(146,64,14,0.50),rgba(217,119,6,0.16))] text-amber-50";
  }
  if (status === "settled") {
    return "border-sky-300/18 bg-[linear-gradient(135deg,rgba(14,116,144,0.42),rgba(14,165,233,0.12))] text-sky-50";
  }
  return "border-emerald-300/18 bg-[linear-gradient(135deg,rgba(6,95,70,0.42),rgba(16,185,129,0.13))] text-emerald-50";
}

function groupedSettlementLabel(
  capability:
    | "supported"
    | "fallback_to_singles"
    | "not_configured"
    | "auth_required"
    | "auth_failed"
    | "unknown",
) {
  switch (capability) {
    case "supported":
      return "batch payouts ready";
    case "fallback_to_singles":
      return "single payout mode";
    case "auth_required":
      return "operator auth needed";
    case "auth_failed":
      return "operator auth blocked";
    case "not_configured":
      return "settlement unavailable";
    default:
      return "settlement checking";
  }
}

function groupedSettlementTone(
  capability:
    | "supported"
    | "fallback_to_singles"
    | "not_configured"
    | "auth_required"
    | "auth_failed"
    | "unknown",
) {
  switch (capability) {
    case "supported":
      return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
    case "fallback_to_singles":
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
    case "auth_required":
    case "auth_failed":
      return "border-rose-300/20 bg-rose-400/10 text-rose-100";
    case "not_configured":
      return "border-white/[0.08] bg-white/[0.04] text-slate-300";
    default:
      return "border-indigo-300/20 bg-indigo-400/10 text-indigo-100";
  }
}

function stakeRailLabel({
  required,
  enabled,
  mode,
}: {
  required: boolean;
  enabled: boolean;
  mode: "disabled" | "optional" | "required";
}) {
  if (required && enabled) return "wallet stake required";
  if (required) return "wallet stake pending";
  if (mode === "optional" && enabled) return "wallet stake ready";
  return "app slips live";
}

function settlementRailLabel(
  mode: "settlement_service" | "local_signer_fallback" | "unconfigured",
) {
  if (mode === "settlement_service") return "settlement rail online";
  if (mode === "local_signer_fallback") return "operator signer ready";
  return "settlement unavailable";
}

function publicRailMessage(value: string | null | undefined) {
  const normalized = (value || "").toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("payout_reserve_floor_hit") ||
    normalized.includes("reserve floor") ||
    normalized.includes("payout signer balance")
  ) {
    return {
      title: "Settlement rail waiting for operator top-up.",
      body: "Queued payouts remain recorded; settlement resumes after the operator top-up clears.",
      tone: "amber" as const,
    };
  }
  if (normalized.includes("auth")) {
    return {
      title: "Settlement rail waiting for operator auth.",
      body: "Queued payouts remain visible and will settle after the operator check clears.",
      tone: "amber" as const,
    };
  }
  if (
    normalized.includes("settlement_health") ||
    normalized.includes("settlement service") ||
    normalized.includes("signer") ||
    normalized.includes("not configured")
  ) {
    return {
      title: "Settlement status unavailable.",
      body: "Queued payouts remain visible while the operator rail reports current health.",
      tone: "slate" as const,
    };
  }
  return {
    title: "Settlement status unavailable.",
    body: "Queued payouts remain visible while the settlement rail confirms current health.",
    tone: "slate" as const,
  };
}

function buildPublicRailNotice(detail: string | null, warnings: string[]) {
  const messages = [detail, ...warnings]
    .map((item) => item?.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        !/settlement capability check deferred for fast bet-board load/i.test(
          item as string,
        ),
    ) as string[];
  if (!messages.length) return null;
  return publicRailMessage(messages.join(" "));
}

function publicEscrowConfigMessage(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized.includes("escrow") ||
    normalized.includes("wallet") ||
    normalized.includes("address")
  ) {
    return "Wallet stake rail is waiting for operator configuration.";
  }
  return "Wallet stake rail is temporarily unavailable.";
}

function sideSurface(selected: boolean, emphasis: "warm" | "cool") {
  if (selected && emphasis === "warm") {
    return "border-amber-200/18 bg-[linear-gradient(155deg,rgba(251,191,36,0.32),rgba(180,83,9,0.18)_58%,rgba(15,23,42,0.72))] text-white shadow-[0_16px_38px_rgba(245,158,11,0.18)]";
  }
  if (selected) {
    return "border-white/[0.12] bg-[linear-gradient(155deg,rgba(148,163,184,0.16),rgba(51,65,85,0.18)_58%,rgba(15,23,42,0.72))] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_28px_rgba(2,6,23,0.28)]";
  }
  return "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] text-slate-100 hover:border-white/10 hover:bg-white/[0.06]";
}

function edgeButton(kind: "gold" | "blue" | "glass") {
  if (kind === "gold") {
    return "border border-amber-200/14 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.18)] hover:brightness-105";
  }
  if (kind === "blue") {
    return "border border-white/[0.12] bg-[linear-gradient(135deg,rgba(226,232,240,0.18)_0%,rgba(148,163,184,0.16)_34%,rgba(51,65,85,0.22)_72%,rgba(15,23,42,0.82)_100%)] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(2,6,23,0.28)] hover:border-white/[0.18] hover:bg-white/[0.10]";
  }
  return "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 hover:border-white/14 hover:bg-white/[0.08]";
}

function shellClass() {
  return "min-w-0 w-full max-w-full rounded-[1.9rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_30%),linear-gradient(180deg,rgba(13,20,36,0.98),rgba(8,13,24,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.36)]";
}

function insetClass() {
  return "min-w-0 max-w-full rounded-[1.55rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.024))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
}

function cardClass() {
  return "min-w-0 max-w-full rounded-[1.45rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.02))] shadow-[0_18px_42px_rgba(2,6,23,0.22)]";
}

function CoinMark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src={WOLO_LOGO_SRC}
      alt=""
      width={small ? 18 : 22}
      height={small ? 18 : 22}
      className={
        small
          ? "h-[18px] w-[18px] object-contain"
          : "h-[22px] w-[22px] object-contain"
      }
    />
  );
}

function MarketStatusPill({ market }: { market: BetBoardMarket }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusPill(market.status)}`}
    >
      {market.status === "live" ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
      ) : null}
      <span>{market.status === "live" ? "Live" : market.closeLabel}</span>
    </span>
  );
}

function MarketTimingRail({
  market,
  nowMs,
}: {
  market: BetBoardMarket;
  nowMs: number;
}) {
  const timing = getMarketTiming(market, nowMs);
  if (!timing) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
        Start {timing.startLabel}
      </span>
      <span
        className={`rounded-full border px-3 py-1 ${
          timing.countdownLabel === "Live now"
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-white/[0.04] text-slate-300"
        }`}
      >
        {timing.countdownLabel}
      </span>
    </div>
  );
}

function BettingHallImageHero() {
  return (
    <section className="relative mx-auto w-full max-w-[min(92rem,calc(100vw-2rem))] overflow-hidden rounded-[2.35rem] border border-amber-100/18 bg-slate-950 shadow-[0_34px_110px_rgba(2,6,23,0.50)]">
      <div className="relative min-h-[30rem] sm:min-h-[37rem] lg:min-h-[43rem] xl:min-h-[45rem]">
        <Image
          src={BETTING_HALL_HERO_SRC}
          alt="The Betting Hall"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 92rem"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.02)_44%,rgba(2,6,23,0.08)_100%),linear-gradient(180deg,rgba(2,6,23,0.02)_0%,rgba(2,6,23,0.00)_50%,rgba(2,6,23,0.34)_100%)]"
        />
      </div>
    </section>
  );
}

function BetsMutedToggleCss() {
  return (
    <style>{`
      main[data-bets-view] button[class*="#3b82f6"],
      main[data-bets-view] button[class*="#1d4ed8"],
      main[data-bets-view] button[class*="#93c5fd"],
      main[data-bets-view] button[class*="59,130,246"],
      main[data-bets-view] button[class*="37,99,235"],
      main[data-bets-view] button[class*="bg-sky"][class*="text-slate-950"],
      main[data-bets-view] button[class*="border-sky"][class*="text-slate-950"] {
        border-color: rgba(255,255,255,0.14) !important;
        background: linear-gradient(135deg, rgba(226,232,240,0.16) 0%, rgba(100,116,139,0.18) 42%, rgba(30,41,59,0.30) 72%, rgba(15,23,42,0.86) 100%) !important;
        color: rgb(226 232 240) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 28px rgba(2,6,23,0.32) !important;
        filter: none !important;
      }

      main[data-bets-view] button[class*="#3b82f6"] *,
      main[data-bets-view] button[class*="#1d4ed8"] *,
      main[data-bets-view] button[class*="#93c5fd"] *,
      main[data-bets-view] button[class*="59,130,246"] *,
      main[data-bets-view] button[class*="37,99,235"] *,
      main[data-bets-view] button[class*="bg-sky"][class*="text-slate-950"] *,
      main[data-bets-view] button[class*="border-sky"][class*="text-slate-950"] * {
        color: inherit !important;
      }
    `}</style>
  );
}

export default function BetsPage() {
  const { isAdmin, isAuthenticated, loading, loginWithSteam, user } =
    useUserAuth();
  const { address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const walletBalance = useWoloBalance(
    connectedWalletAddress || undefined,
  );
  const nowMs = useNowTicker();
  const [board, setBoard] = useState<BetBoardSnapshot | null>(null);
  const [betsView, setBetsView] =
    useState<BetsViewVersion>(BETS_VIEW_DEFAULT);
  const [betsViewReady, setBetsViewReady] =
    useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [lockWorkflow, setLockWorkflow] = useState<LockWorkflow | null>(null);
  const [recoveringIntentId, setRecoveringIntentId] = useState<number | null>(
    null,
  );
  const [recoveringTicketId, setRecoveringTicketId] = useState<number | null>(
    null,
  );
  const [attemptedAutoRecoverIds, setAttemptedAutoRecoverIds] = useState<
    number[]
  >([]);
  const [attemptedTicketRecoveryIds, setAttemptedTicketRecoveryIds] = useState<
    number[]
  >([]);
  const [founderComposer, setFounderComposer] =
    useState<FounderComposerState | null>(null);
  const [savingFounderBonus, setSavingFounderBonus] = useState(false);
  const [founderBonusError, setFounderBonusError] = useState<string | null>(
    null,
  );
  const [battleCamVisibility, setBattleCamVisibility] =
    useState<BattleCamVisibility>("closed");
  const [pendingStakeRecoveries, setPendingStakeRecoveries] = useState<
    PendingStakeRecovery[]
  >([]);

  const syncPendingStakeRecoveries = useCallback(() => {
    setPendingStakeRecoveries(readPendingStakeRecoveries());
  }, []);

  const savePendingStakeRecovery = useCallback(
    (item: PendingStakeRecovery) => {
      upsertPendingStakeRecovery(item);
      syncPendingStakeRecoveries();
    },
    [syncPendingStakeRecoveries],
  );

  const clearPendingStakeRecovery = useCallback(
    (intentId: number) => {
      removePendingStakeRecovery(intentId);
      syncPendingStakeRecoveries();
    },
    [syncPendingStakeRecoveries],
  );

  useEffect(() => {
    syncPendingStakeRecoveries();
  }, [syncPendingStakeRecoveries]);

  const loadBoard = useCallback(async (
    quiet = false,
    signal?: AbortSignal,
  ) => {
    try {
      const designFixture =
        readBetsDesignFixture();

      if (designFixture) {
        return buildBetsDesignFixture(
          designFixture,
        );
      }

      const response = await fetch("/api/bets", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        throw new Error("Bet board failed to load.");
      }
      return (await response.json()) as BetBoardSnapshot;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      console.error("Failed to load bet board:", error);
      if (!quiet) {
        toast.error("The book is quiet right now.");
      }
      return null;
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const designFixture =
      readBetsDesignFixture();

    if (designFixture) {
      setBetsView(
        designFixture.startsWith("e4-")
          ? "E4"
          : designFixture.startsWith("e3-")
            ? "E3"
            : "E2",
      );
      setBetsViewReady(true);
      return;
    }

    const appliedRollout =
      window.localStorage.getItem(
        BETS_VIEW_ROLLOUT_KEY,
      );

    if (
      appliedRollout !==
      BETS_VIEW_ROLLOUT
    ) {
      window.localStorage.setItem(
        BETS_VIEW_ROLLOUT_KEY,
        BETS_VIEW_ROLLOUT,
      );

      window.localStorage.setItem(
        BETS_VIEW_STORAGE_KEY,
        BETS_VIEW_DEFAULT,
      );

      setBetsView(
        BETS_VIEW_DEFAULT,
      );
      setBetsViewReady(true);
      return;
    }

    const storedView =
      normalizeBetsViewVersion(
        window.localStorage.getItem(
          BETS_VIEW_STORAGE_KEY,
        ),
      );

    const legacyView =
      legacyBetsViewToVersion(
        window.localStorage.getItem(
          LEGACY_BETS_VIEW_STORAGE_KEY,
        ),
      );

    const resolvedView =
      storedView ?? legacyView;

    if (resolvedView) {
      setBetsView(resolvedView);

      if (!storedView) {
        window.localStorage.setItem(
          BETS_VIEW_STORAGE_KEY,
          resolvedView,
        );
      }
    }

    setBetsViewReady(true);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !betsViewReady
    ) {
      return;
    }

    window.localStorage.setItem(
      BETS_VIEW_STORAGE_KEY,
      betsView,
    );

    trackBetsViewEvent({
      type: "bets_view_impression",
      metadata: {
        view: betsView,
      },
    });
  }, [betsView, betsViewReady]);

  useEffect(() => {
    setBattleCamVisibility(readStoredBattleCamVisibility());
  }, []);

  function handleBetsViewChange(
    next: BetsViewVersion,
  ) {
    if (next === betsView) return;

    trackBetsViewEvent({
      type: "bets_view_selected",
      metadata: {
        from: betsView,
        to: next,
      },
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        BETS_VIEW_STORAGE_KEY,
        next,
      );
    }

    setBetsView(next);
  }

  function handleBattleCamToggle() {
    setBattleCamVisibility((current) => {
      const next = current === "open" ? "closed" : "open";
      writeStoredBattleCamVisibility(next);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    let activeRequest: AbortController | null = null;

    function refreshBoard(
      quiet: boolean,
      supersede = false,
    ) {
      if (activeRequest && !supersede) {
        return;
      }

      if (supersede) {
        activeRequest?.abort();
      }
      const request = new AbortController();
      activeRequest = request;

      void loadBoard(quiet, request.signal)
        .then((payload) => {
          if (
            !cancelled &&
            activeRequest === request &&
            payload
          ) {
            setBoard(payload);
          }
        })
        .finally(() => {
          if (activeRequest === request) {
            activeRequest = null;
          }
        });
    }

    function handleForegroundRefresh() {
      if (document.visibilityState === "visible") {
        refreshBoard(true, true);
      }
    }

    refreshBoard(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshBoard(true);
      }
    }, BETS_POLL_INTERVAL_MS);

    window.addEventListener("focus", handleForegroundRefresh);
    document.addEventListener("visibilitychange", handleForegroundRefresh);

    return () => {
      cancelled = true;
      activeRequest?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", handleForegroundRefresh);
      document.removeEventListener("visibilitychange", handleForegroundRefresh);
    };
  }, [loadBoard]);

  const [focusedMarketId, setFocusedMarketId] = useState<number | null>(null);
  const marketOrderRef = useRef<Map<number, number>>(new Map());
  const knownLiveMarketIdsRef = useRef<Set<number> | null>(null);

  const featuredMarket = board?.featuredMarket ?? null;

  const orderedBookMarkets = useMemo(() => {
    const rawMarkets = [...(board?.openMarkets || [])].filter(
      (market) => market.marketType !== DESYNC_SIDE_MARKET_TYPE,
    );

    if (
      featuredMarket &&
      !rawMarkets.some((market) => market.id === featuredMarket.id)
    ) {
      rawMarkets.unshift(featuredMarket);
    }

    const order = marketOrderRef.current;
    const liveIds = new Set(rawMarkets.map((market) => market.id));

    for (const marketId of Array.from(order.keys())) {
      if (!liveIds.has(marketId)) {
        order.delete(marketId);
      }
    }

    for (const market of rawMarkets) {
      if (!order.has(market.id)) {
        order.set(market.id, order.size);
      }
    }

    const statusRank = (market: BetBoardMarket) => {
      if (market.status === "live") return 0;
      if (market.status === "open") return 1;
      return 2;
    };

    return rawMarkets.sort((left, right) => {
      const statusDelta = statusRank(left) - statusRank(right);
      if (statusDelta !== 0) return statusDelta;

      const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;

      return left.id - right.id;
    });
  }, [board?.openMarkets, featuredMarket]);

  useEffect(() => {
    if (focusedMarketId !== null) return;
    if (orderedBookMarkets.length > 0) {
      setFocusedMarketId(orderedBookMarkets[0].id);
    }
  }, [focusedMarketId, orderedBookMarkets]);

  useEffect(() => {
    if (focusedMarketId === null) return;
    if (!orderedBookMarkets.some((market) => market.id === focusedMarketId)) {
      setFocusedMarketId(orderedBookMarkets[0]?.id ?? null);
    }
  }, [focusedMarketId, orderedBookMarkets]);

  const spotlightMarket = useMemo(() => {
    const focusedMarket = focusedMarketId
      ? orderedBookMarkets.find((market) => market.id === focusedMarketId)
      : null;

    if (focusedMarket) return focusedMarket;

    return orderedBookMarkets[0] ?? null;
  }, [focusedMarketId, orderedBookMarkets]);

  const openMarkets = useMemo(
    () =>
      orderedBookMarkets.filter(
        (market) => !spotlightMarket || market.id !== spotlightMarket.id,
      ),
    [orderedBookMarkets, spotlightMarket],
  );

  useEffect(() => {
    if (!board) return;

    const currentIds = new Set(orderedBookMarkets.map((market) => market.id));
    const knownIds = knownLiveMarketIdsRef.current;
    if (knownIds === null) {
      knownLiveMarketIdsRef.current = currentIds;
      return;
    }

    const arrivals = orderedBookMarkets.filter(
      (market) => !knownIds.has(market.id),
    );
    if (arrivals.length > 0) {
      const newest = [...arrivals].sort((left, right) => {
        const leftNumber = left.battleNumber ?? left.id;
        const rightNumber = right.battleNumber ?? right.id;
        return rightNumber - leftNumber;
      })[0];
      const battleLabel = newest.battleNumber
        ? `Battle #${newest.battleNumber.toLocaleString()}`
        : "A new battle";
      toast.info(
        `${battleLabel} is live. Your current ticket stayed in focus.`,
      );
    }

    knownLiveMarketIdsRef.current = currentIds;
  }, [board, orderedBookMarkets]);

  const spotlightDesyncMarket = spotlightMarket?.desyncMarket ?? null;

  const totalBookPot = useMemo(() => {
    const openPot = orderedBookMarkets.reduce(
      (sum, market) => sum + market.totalPotWolo,
      0,
    );
    if (openPot > 0) {
      return openPot;
    }

    return board?.settledResults?.[0]?.totalPotWolo || 0;
  }, [orderedBookMarkets, board?.settledResults]);
  const liveCount =
    orderedBookMarkets.filter((market) => market.status === "live").length ||
    board?.heat.liveCount ||
    0;
  const openCount = orderedBookMarkets.length;
  const recentResults = board?.settledResults || [];
  const payoutProofResults = recentResults.filter(
    (result) =>
      result.resolutionStatus !== "under_review" &&
      isSettlementProofState(result.payoutState),
  );
  const payoutQueueResults = recentResults.filter(
    (result) =>
      result.resolutionStatus !== "under_review" &&
      !isSettlementProofState(result.payoutState),
  );
  const reviewResults = recentResults.filter(
    (result) => result.resolutionStatus === "under_review",
  );
  const latestResult =
    recentResults.find(
      (result) => result.resolutionStatus !== "under_review",
    ) ??
    reviewResults[0] ??
    null;
  const awaitingProofMarkets = board?.awaitingProofMarkets || [];
  const runtimeBetEscrowMode = board?.wolo.betEscrowMode || "disabled";
  const runtimeBetEscrowAddress = board?.wolo.betEscrowAddress?.trim() || "";
  const onchainBetEscrowEnabled = board?.wolo.onchainEscrowEnabled ?? false;
  const onchainBetEscrowRequired = board?.wolo.onchainEscrowRequired ?? false;
  const runtimeBetEscrowConfigError = board?.wolo.escrowConfigError ?? null;
  const runtimeBetTestMode = board?.wolo.betTestMode ?? false;
  const settlementExecutionMode =
    board?.wolo.settlementExecutionMode || "unconfigured";
  const groupedRunCapability =
    board?.wolo.groupedRunCapability || "not_configured";
  const settlementSurfaceWarnings = board?.wolo.settlementSurfaceWarnings || [];
  const settlementSurfaceDetail = board?.wolo.settlementSurfaceDetail ?? null;
  const bettingPaused = isBettingSettlementRailPaused(board);
  const publicSettlementNotice = buildPublicRailNotice(
    settlementSurfaceDetail,
    settlementSurfaceWarnings,
  );
  const publicEscrowConfig = publicEscrowConfigMessage(
    runtimeBetEscrowConfigError,
  );
  const unresolvedStakeIntents = board?.recovery.unresolvedStakeIntents || [];
  const unresolvedStakeTickets = board?.recovery.unresolvedStakeTickets || [];
  const maxStakeWolo = useMemo(
    () =>
      walletBalance.isError
        ? 0
        : resolveVerifiedWalletStakeCap(walletBalance.data),
    [walletBalance.data, walletBalance.isError],
  );

  const refreshBoard = useCallback(
    async (nextPayload?: BetBoardSnapshot) => {
      if (nextPayload) {
        setBoard(nextPayload);
        return;
      }

      const payload = await loadBoard(true);
      if (!payload) {
        throw new Error("Book refresh failed.");
      }
      setBoard(payload);
    },
    [loadBoard],
  );

  function openFounderComposer(
    market: BetBoardMarket,
    bonusType: FounderBonusType,
  ) {
    const roster = buildExtremeMarketRoster(market);

    const participantCount = Math.max(2, roster.players.length);

    setFounderBonusError(null);

    setFounderComposer({
      requestId: newClientRequestId("founder-award"),
      marketId: market.id,
      marketTitle: market.title,
      participantCount,
      bonusType,
      amountValue:
        bonusType === "participants"
          ? defaultFounderParticipantAmount(participantCount)
          : "1000",
      noteValue: "",
    });
  }

  async function submitFounderBonus() {
    if (!founderComposer) {
      return;
    }

    setSavingFounderBonus(true);
    setFounderBonusError(null);

    try {
      const response = await fetch(
        `/api/admin/bets/markets/${founderComposer.marketId}/founders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": founderComposer.requestId,
          },
          body: JSON.stringify({
            requestId: founderComposer.requestId,
            bonusType: founderComposer.bonusType,
            amountWolo: founderComposer.amountValue,
            note: founderComposer.noteValue || undefined,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Founder bonus could not be saved.");
      }

      await refreshBoard();
      toast.success(
        founderComposer.bonusType === "winner"
          ? "Founders Win attached."
          : "Founders Bonus attached.",
      );
      setFounderComposer(null);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Founder bonus could not be saved.";
      setFounderBonusError(detail);
    } finally {
      setSavingFounderBonus(false);
    }
  }

  function handleBetsSignIn(
    returnTo = "/bets",
  ) {
    if (readBetsDesignFixture()) {
      toast.info(
        "Design fixture: signing is disabled.",
      );
      return;
    }

    loginWithSteam(returnTo);
  }

  function requireSignIn() {
    if (fixtureInteractionMode) {
      return true;
    }

    if (isAuthenticated) return true;

    handleBetsSignIn("/bets");
    return false;
  }

  async function createStakeIntent(input: {
    marketId: number;
    side: BetSide;
    amountWolo: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
  }) {
    const response = await fetch("/api/bets/stake-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: input.marketId,
        side: input.side,
        amountWolo: input.amountWolo,
        walletAddress: input.walletAddress || undefined,
        walletProvider: input.walletProvider || undefined,
        walletType: input.walletType || undefined,
        browserInfo:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 500)
            : undefined,
        routePath: "/bets",
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: number;
      detail?: string;
    };

    if (!response.ok || !Number.isFinite(payload.id)) {
      throw new Error(payload.detail || "Could not prepare stake recovery.");
    }

    return payload.id as number;
  }

  async function prepareStakeTicket(input: {
    clientRequestId: string;
    wallet: PreparedStakeWallet;
    totalAmountWolo: number;
    legs: Array<{
      marketId: number;
      side: BetSide;
      amountWolo: number;
    }>;
  }) {
    const response = await fetch("/api/bets/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        clientRequestId: input.clientRequestId,
        walletAddress: input.wallet.walletAddress,
        walletProvider: input.wallet.walletProvider,
        walletType: input.wallet.walletType,
        totalAmountWolo: input.totalAmountWolo,
        legs: input.legs,
        browserInfo:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 500)
            : undefined,
        routePath: "/bets",
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      ticket?: Partial<PreparedBetStakeTicket>;
    };
    const ticket = payload.ticket;
    if (
      !response.ok ||
      !ticket ||
      !Number.isSafeInteger(ticket.id) ||
      !Number.isSafeInteger(ticket.totalAmountWolo) ||
      typeof ticket.memo !== "string" ||
      !ticket.memo.trim()
    ) {
      throw new Error(
        payload.detail || "Could not prepare the combined betting ticket.",
      );
    }
    return ticket as PreparedBetStakeTicket;
  }

  const commitStakeTicket = useCallback(
    async (recovery: PendingTicketRecovery, action: "commit" | "recover") => {
      if (!recovery.stakeTxHash) {
        throw new Error(
          "The combined ticket is waiting for its wallet transaction hash.",
        );
      }
      const response = await fetch(
        `/api/bets/tickets/${recovery.ticketId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stakeTxHash: recovery.stakeTxHash,
            walletAddress: recovery.walletAddress,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        board?: BetBoardSnapshot;
      };
      if (!response.ok) {
        throw new Error(
          payload.detail || "Could not record the combined betting ticket.",
        );
      }
      return payload.board ?? null;
    },
    [],
  );

  async function recordStakeIntentBroadcast(
    intentId: number,
    recovery: PendingStakeRecovery,
  ) {
    const response = await fetch(`/api/bets/stake-intents/${intentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_broadcast",
        walletAddress: recovery.walletAddress,
        walletProvider: recovery.walletProvider,
        walletType: recovery.walletType,
        browserInfo: recovery.browserInfo,
        routePath: recovery.routePath,
        stakeTxHash: recovery.stakeTxHash,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw new Error(payload.detail || "Could not record the signed stake.");
    }
  }

  async function recordStakeIntentFailure(input: {
    intentId: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    step: string;
    rawError: string;
    status?: "failed" | "suspect" | "orphaned";
  }) {
    await fetch(`/api/bets/stake-intents/${input.intentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_failure",
        walletAddress: input.walletAddress,
        walletProvider: input.walletProvider,
        walletType: input.walletType,
        browserInfo:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 500)
            : null,
        routePath: "/bets",
        step: input.step,
        rawError: input.rawError,
        status: input.status ?? "failed",
      }),
    }).catch(() => null);
  }

  async function recordBetWalletError(input: {
    marketId: number;
    side: BetSide;
    amountWolo: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    step: string;
    rawError: string;
  }) {
    await fetch("/api/bets/wallet-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: input.marketId,
        side: input.side,
        amountWolo: input.amountWolo,
        walletAddress: input.walletAddress,
        walletProvider: input.walletProvider,
        walletType: input.walletType,
        browserInfo:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 500)
            : null,
        routePath: "/bets",
        step: input.step,
        rawError: input.rawError,
      }),
    }).catch(() => null);
  }

  function isKeplrUnavailableError(rawError: string) {
    const normalized = rawError.toLowerCase();
    return (
      normalized.includes("keplr extension not found") ||
      normalized.includes("keplr is not available") ||
      normalized.includes("keplr offline signer was not found")
    );
  }

  function describeBetWalletError(rawError: string) {
    if (isKeplrUnavailableError(rawError)) {
      return "Keplr is not available in this browser. No bet was placed and no WOLO moved. Open AoE2WAR in the Chrome profile where Keplr is installed, enable Keplr for aoe2war.com, then try again.";
    }

    if (/insufficient|not enough|balance/i.test(rawError)) {
      return "Not enough mainnet WOLO is available in this wallet for that bet. No bet was placed and no WOLO moved.";
    }

    if (/reject|denied|declined|cancel/i.test(rawError)) {
      return "Wallet approval was cancelled or rejected. No bet was placed and no WOLO moved.";
    }

    return rawError;
  }

  const recoverStakeIntent = useCallback(
    async (intentId: number, options?: { automatic?: boolean }) => {
      const recovery =
        readPendingStakeRecoveries().find(
          (entry) => entry.intentId === intentId,
        ) || null;
      const unresolvedIntent =
        board?.recovery.unresolvedStakeIntents.find(
          (entry) => entry.id === intentId,
        ) || null;
      const hasStakeProof = Boolean(
        unresolvedIntent?.stakeTxHash || recovery?.stakeTxHash,
      );
      const canRecoverNow = Boolean(
        unresolvedIntent &&
        isRecoveryBookOpen(unresolvedIntent.marketStatus) &&
        hasStakeProof,
      );

      if (!canRecoverNow) {
        if (!options?.automatic) {
          toast.message(
            unresolvedIntent &&
              !isRecoveryBookOpen(unresolvedIntent.marketStatus)
              ? "This signed stake belongs to a closed book. Keep the stake proof for manual review."
              : "The recovery rail is still waiting on a usable stake proof.",
          );
        }
        return;
      }

      setRecoveringIntentId(intentId);

      try {
        if (recovery?.stakeTxHash) {
          await recordStakeIntentBroadcast(intentId, recovery);
        }

        const response = await fetch(`/api/bets/stake-intents/${intentId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "recover",
            walletAddress:
              recovery?.walletAddress || connectedWalletAddress || null,
            stakeTxHash: recovery?.stakeTxHash || null,
          }),
        });

        const payload = (await response
          .json()
          .catch(() => ({}))) as BetBoardSnapshot & {
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.detail || "Could not recover this signed stake.",
          );
        }

        clearPendingStakeRecovery(intentId);
        await refreshBoard(payload);
        if (!options?.automatic) {
          toast.success("Recovered the signed WOLO stake into the book.");
        }
      } catch (error) {
        if (!options?.automatic) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not recover this signed stake.",
          );
        }
      } finally {
        setRecoveringIntentId((current) =>
          current === intentId ? null : current,
        );
      }
    },
    [board, clearPendingStakeRecovery, connectedWalletAddress, refreshBoard],
  );

  useEffect(() => {
    if (
      !isAuthenticated ||
      !board ||
      recoveringIntentId ||
      workingKey ||
      lockWorkflow
    ) {
      return;
    }

    const unresolved = board.recovery.unresolvedStakeIntents.find((intent) => {
      if (attemptedAutoRecoverIds.includes(intent.id)) return false;
      const pending = readPendingStakeRecoveries().find(
        (entry) => entry.intentId === intent.id,
      );
      if (!isRecoveryBookOpen(intent.marketStatus)) return false;
      if (pending?.stakeTxHash) return true;
      return (
        Boolean(intent.stakeTxHash) &&
        [
          "broadcast_submitted",
          "verified_unrecorded",
          "suspect",
          "orphaned",
        ].includes(intent.status)
      );
    });

    if (!unresolved) {
      return;
    }

    setAttemptedAutoRecoverIds((current) =>
      current.includes(unresolved.id) ? current : [...current, unresolved.id],
    );
    void recoverStakeIntent(unresolved.id, { automatic: true });
  }, [
    attemptedAutoRecoverIds,
    board,
    isAuthenticated,
    lockWorkflow,
    recoverStakeIntent,
    recoveringIntentId,
    workingKey,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !board ||
      recoveringTicketId ||
      workingKey ||
      lockWorkflow
    )
      return;
    const recoveryById = new Map(
      readPendingTicketRecoveries().map(
        (entry) => [entry.ticketId, entry] as const,
      ),
    );
    for (const ticket of board.recovery.unresolvedStakeTickets || []) {
      const current = recoveryById.get(ticket.id);
      const winnerLeg =
        ticket.legs.find((leg) => leg.legRole === "winner") ??
        ticket.legs[0] ??
        null;
      recoveryById.set(ticket.id, {
        ticketId: ticket.id,
        clientRequestId:
          current?.clientRequestId || `server-ticket:${ticket.id}`,
        marketId: current?.marketId || winnerLeg?.marketId || 0,
        totalAmountWolo: ticket.totalAmountWolo,
        memo: ticket.memo,
        walletAddress: ticket.walletAddress,
        stakeTxHash: ticket.stakeTxHash || current?.stakeTxHash || null,
        updatedAt: ticket.updatedAt,
      });
    }
    const recovery = [...recoveryById.values()].find(
      (entry) =>
        entry.stakeTxHash &&
        !attemptedTicketRecoveryIds.includes(entry.ticketId),
    );
    if (!recovery) return;

    setAttemptedTicketRecoveryIds((current) => [...current, recovery.ticketId]);
    setRecoveringTicketId(recovery.ticketId);

    void (async () => {
      try {
        const refreshedBoard = await commitStakeTicket(recovery, "recover");
        removePendingTicketRecovery(recovery.ticketId);
        if (refreshedBoard) {
          await refreshBoard(refreshedBoard);
        } else {
          const latestBoard = await loadBoard(true);
          if (latestBoard) await refreshBoard(latestBoard);
        }
        toast.success("Recovered the signed Winner + Desync ticket.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The signed combined ticket still needs recovery. Its proof remains saved.",
        );
      } finally {
        setRecoveringTicketId((current) =>
          current === recovery.ticketId ? null : current,
        );
      }
    })();
  }, [
    attemptedTicketRecoveryIds,
    board,
    commitStakeTicket,
    isAuthenticated,
    loadBoard,
    lockWorkflow,
    recoveringTicketId,
    refreshBoard,
    workingKey,
  ]);

  function handleSelect(market: BetBoardMarket, side: BetSide) {
    if (!requireSignIn()) return;
    const viewerWager = market.viewerWager;
    if (viewerWager && viewerWager.side !== side) {
      toast.message(
        "This book is locked to your first side for now. Add more to that same side only.",
      );
      return;
    }
    setSelection({
      marketId: market.id,
      side: viewerWager?.side || side,
      stake:
        selection &&
        selection.marketId === market.id &&
        selection.side === (viewerWager?.side || side)
          ? selection.stake
          : Math.max(1, Math.min(25, maxStakeWolo)),
      desync: selection?.marketId === market.id ? selection.desync : null,
    });
  }

  function handleDesyncSelection(
    winnerMarket: BetBoardMarket,
    desyncMarket: BetBoardMarket,
    side: BetSide | null,
  ) {
    if (!requireSignIn()) return;
    if (!selection || selection.marketId !== winnerMarket.id) {
      toast.message(
        "Choose the winning side first, then add an optional Desync call.",
      );
      return;
    }

    if (
      side &&
      desyncMarket.viewerWager &&
      desyncMarket.viewerWager.side !== side
    ) {
      toast.message(
        "Your Desync side is already locked to the first accepted side.",
      );
      return;
    }

    if (side && maxStakeWolo - selection.stake < 1) {
      toast.message(
        "Reduce the Winner amount by at least 1 WOLO to add a Desync leg.",
      );
      return;
    }

    setSelection((current) => {
      if (!current || current.marketId !== winnerMarket.id) return current;
      if (!side) return { ...current, desync: null };

      return {
        ...current,
        desync: {
          marketId: desyncMarket.id,
          side: desyncMarket.viewerWager?.side || side,
          stake:
            current.desync?.marketId === desyncMarket.id
              ? current.desync.stake
              : Math.max(1, Math.min(10, maxStakeWolo - current.stake)),
        },
      };
    });
  }

  function handleDesyncStakeChange(winnerMarketId: number, stake: number) {
    setSelection((current) =>
      current && current.marketId === winnerMarketId && current.desync
        ? { ...current, desync: { ...current.desync, stake } }
        : current,
    );
  }

  async function ensureWalletAddress() {
    if (!onchainBetEscrowEnabled) {
      return null;
    }

    if (connectedWalletAddress) {
      return connectedWalletAddress;
    }

    return connectKeplr();
  }

  async function prepareStakeWallet(
    market: BetBoardMarket,
  ): Promise<PreparedStakeWallet> {
    if (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress) {
      throw new Error(
        runtimeBetEscrowConfigError ||
          "WOLO escrow is not available for this market in the current environment.",
      );
    }

    setLockWorkflow({
      marketId: market.id,
      phase: "awaiting_wallet",
      stakeTxHash: null,
    });

    const walletAddress = await ensureWalletAddress();
    if (!walletAddress) {
      throw new Error("Connect Keplr before locking a verified WOLO stake.");
    }

    const keplrWindow = window as BetBrowserWindow;

    if (!keplrWindow.keplr) {
      throw new Error(
        "Keplr is not available in this browser. No bet was placed and no WOLO moved. Open AoE2WAR in the Chrome profile where Keplr is installed, enable Keplr for aoe2war.com, then try again.",
      );
    }

    if (keplrWindow.keplr?.experimentalSuggestChain) {
      try {
        await keplrWindow.keplr.experimentalSuggestChain(woloChainConfig);
      } catch (error) {
        console.warn("WoloChain suggest failed or already exists:", error);
      }
    }

    if (keplrWindow.keplr?.enable) {
      await keplrWindow.keplr.enable(WOLO_CHAIN_ID);
    }

    const signerResolution = await resolveBetSigner(keplrWindow, walletAddress);
    return {
      signer: signerResolution.signer,
      walletAddress: signerResolution.signerAddress,
      walletProvider: "keplr",
      walletType: signerResolution.isLedger ? "ledger" : "keplr",
      isLedger: signerResolution.isLedger,
    };
  }

  async function lockStakeOnChain(
    market: BetBoardMarket,
    amountWolo: number,
    preparedWallet?: PreparedStakeWallet | null,
    memo = buildBetStakeMemo(market.id),
  ): Promise<StakeExecutionResult> {
    if (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress) {
      if (onchainBetEscrowRequired) {
        throw new Error(
          runtimeBetEscrowConfigError ||
            "Verified WOLO escrow is required here, but the WOLO escrow rail is not ready.",
        );
      }

      return {
        walletAddress: null as string | null,
        stakeTxHash: null as string | null,
        executionMode: "app_only" as const,
        walletProvider: null,
        walletType: null,
      };
    }

    const signerResolution =
      preparedWallet || (await prepareStakeWallet(market));

    setLockWorkflow({
      marketId: market.id,
      phase: "confirming_chain",
      stakeTxHash: null,
    });

    const [{ GasPrice, SigningStargateClient }] = await Promise.all([
      import("@cosmjs/stargate"),
    ]);

    let client: Awaited<
      ReturnType<typeof SigningStargateClient.connectWithSigner>
    > | null = null;

    try {
      client = await SigningStargateClient.connectWithSigner(
        WOLO_RPC_URL,
        signerResolution.signer,
        {
          gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
        },
      );

      const result = await client.sendTokens(
        signerResolution.walletAddress,
        runtimeBetEscrowAddress,
        [{ amount: toUwoLoAmount(amountWolo), denom: WOLO_BASE_DENOM }],
        "auto",
        memo,
      );

      return {
        walletAddress: signerResolution.walletAddress,
        stakeTxHash: result.transactionHash,
        executionMode: "onchain_escrow" as const,
        walletProvider: signerResolution.walletProvider,
        walletType: signerResolution.walletType,
      };
    } catch (error) {
      throw new Error(
        describeStakeLockError(error, { isLedger: signerResolution.isLedger }),
      );
    } finally {
      client?.disconnect();
    }
  }

  async function handleCombinedTicketLock(
    market: BetBoardMarket,
    ticketSelection: SelectionState & {
      desync: NonNullable<SelectionState["desync"]>;
    },
  ) {
    if (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress) {
      toast.error(
        "A combined Winner + Desync ticket requires the verified one-signature WOLO rail.",
      );
      return;
    }

    const totalAmountWolo =
      ticketSelection.stake + ticketSelection.desync.stake;
    const totalError = validateStakeAmount(totalAmountWolo, maxStakeWolo);
    const desyncError = validateStakeAmount(
      ticketSelection.desync.stake,
      maxStakeWolo,
    );
    if (desyncError || totalError) {
      toast.error(
        desyncError || totalError || "The combined ticket amount is invalid.",
      );
      return;
    }

    setWorkingKey(`lock-${market.id}`);
    setLockWorkflow({
      marketId: market.id,
      phase: "awaiting_wallet",
      stakeTxHash: null,
    });
    let preparedWallet: PreparedStakeWallet | null = null;
    let recovery: PendingTicketRecovery | null = null;

    try {
      preparedWallet = await prepareStakeWallet(market);
      const clientRequestId = newClientRequestId("manual-ticket");
      const ticket = await prepareStakeTicket({
        clientRequestId,
        wallet: preparedWallet,
        totalAmountWolo,
        legs: [
          {
            marketId: market.id,
            side: ticketSelection.side,
            amountWolo: ticketSelection.stake,
          },
          {
            marketId: ticketSelection.desync.marketId,
            side: ticketSelection.desync.side,
            amountWolo: ticketSelection.desync.stake,
          },
        ],
      });

      recovery = {
        ticketId: ticket.id,
        clientRequestId,
        marketId: market.id,
        totalAmountWolo: ticket.totalAmountWolo,
        memo: ticket.memo,
        walletAddress: preparedWallet.walletAddress,
        stakeTxHash: null,
        updatedAt: new Date().toISOString(),
      };
      upsertPendingTicketRecovery(recovery);

      const stakeExecution = await lockStakeOnChain(
        market,
        ticket.totalAmountWolo,
        preparedWallet,
        ticket.memo,
      );
      if (!stakeExecution.stakeTxHash) {
        throw new Error(
          "The combined ticket transfer returned no transaction hash.",
        );
      }

      recovery = {
        ...recovery,
        stakeTxHash: stakeExecution.stakeTxHash,
        updatedAt: new Date().toISOString(),
      };
      upsertPendingTicketRecovery(recovery);
      setLockWorkflow({
        marketId: market.id,
        phase: "recording_wager",
        stakeTxHash: stakeExecution.stakeTxHash,
      });

      const refreshedBoard = await commitStakeTicket(recovery, "commit");
      removePendingTicketRecovery(ticket.id);
      if (refreshedBoard) {
        await refreshBoard(refreshedBoard);
      } else {
        const latestBoard = await loadBoard(true);
        if (latestBoard) await refreshBoard(latestBoard);
      }
      setSelection(null);
      toast.success(
        `One signature locked ${ticket.totalAmountWolo} WOLO across Winner + Desync · ${shortTxHash(stakeExecution.stakeTxHash)}`,
      );
    } catch (error) {
      const rawError =
        error instanceof Error
          ? error.message
          : "Could not lock the combined ticket.";
      console.error("Failed to lock combined betting ticket:", error);
      if (recovery && !recovery.stakeTxHash) {
        removePendingTicketRecovery(recovery.ticketId);
      }
      toast.error(
        recovery?.stakeTxHash
          ? `${describeBetWalletError(rawError)} The signed ticket proof is saved for automatic recovery.`
          : describeBetWalletError(rawError),
      );
    } finally {
      setWorkingKey(null);
      setLockWorkflow(null);
    }
  }

  async function handleLock(market: BetBoardMarket) {
    if (fixtureInteractionMode) {
      toast.info(
        "Design fixture: wager locking is disabled.",
      );
      return;
    }

    if (!market.bettingOpen) {
      toast.error(
        "Pre-game betting is closed.",
      );
      return;
    }

    if (isPendingLivePlaceholderMarket(market)) {
      toast.error(
        "This battle is already underway. Pre-game betting is closed.",
      );
      return;
    }

    if (!selection || selection.marketId !== market.id) return;
    if (!requireSignIn()) return;

    /*
     * Settlement capability is operational readiness,
     * not a stake-balance limit.
     *
     * Never turn a transient "unknown" capability into
     * "Max 0 WOLO".
     *
     * If the board previously observed an uncertain rail,
     * refresh the authoritative board immediately before
     * beginning any wallet or escrow action.
     */
    if (bettingPaused) {
      try {
        const freshBoard = await loadBoard(true);

        if (!freshBoard) {
          toast.error(
            "Betting rail is refreshing. No WOLO moved. Try again in a moment.",
          );
          return;
        }

        setBoard(freshBoard);

        if (isBettingSettlementRailPaused(freshBoard)) {
          toast.error(
            "Betting settlement is temporarily unavailable. No WOLO moved.",
          );
          return;
        }
      } catch {
        toast.error(
          "Betting rail could not be verified. No WOLO moved. Try again in a moment.",
        );
        return;
      }
    }

    const stakeValidation = validateStakeAmount(selection.stake, maxStakeWolo);
    if (stakeValidation) {
      toast.error(stakeValidation);
      return;
    }
    if (market.viewerWager && market.viewerWager.side !== selection.side) {
      toast.error("This book is locked to your first side for now.");
      return;
    }
    if (
      onchainBetEscrowRequired &&
      (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress)
    ) {
      toast.error(
        runtimeBetEscrowConfigError ||
          "Verified WOLO escrow is required here, but the WOLO escrow rail is not ready.",
      );
      return;
    }

    if (selection.desync) {
      await handleCombinedTicketLock(
        market,
        selection as SelectionState & {
          desync: NonNullable<SelectionState["desync"]>;
        },
      );
      return;
    }

    setWorkingKey(`lock-${market.id}`);
    let intentId: number | null = null;
    let pendingRecovery: PendingStakeRecovery | null = null;
    let preparedWallet: PreparedStakeWallet | null = null;
    let workflowStep: LockWorkflow["phase"] | "stake_intent" | "lock_wager" =
      "awaiting_wallet";

    try {
      if (onchainBetEscrowEnabled && runtimeBetEscrowAddress) {
        workflowStep = "awaiting_wallet";
        preparedWallet = await prepareStakeWallet(market);
        workflowStep = "stake_intent";
        intentId = await createStakeIntent({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: preparedWallet.walletAddress,
          walletProvider: preparedWallet.walletProvider,
          walletType: preparedWallet.walletType,
        });

        pendingRecovery = {
          intentId,
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: preparedWallet.walletAddress,
          stakeTxHash: null,
          walletProvider: preparedWallet.walletProvider,
          walletType: preparedWallet.walletType,
          browserInfo:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 500)
              : null,
          routePath: "/bets",
          updatedAt: new Date().toISOString(),
        };
        savePendingStakeRecovery(pendingRecovery);
      }

      workflowStep =
        onchainBetEscrowEnabled && runtimeBetEscrowAddress
          ? "confirming_chain"
          : "lock_wager";
      const stakeExecution = await lockStakeOnChain(
        market,
        selection.stake,
        preparedWallet,
      );
      if (pendingRecovery) {
        pendingRecovery = {
          ...pendingRecovery,
          walletAddress: stakeExecution.walletAddress,
          stakeTxHash: stakeExecution.stakeTxHash,
          walletProvider: stakeExecution.walletProvider,
          walletType: stakeExecution.walletType,
          updatedAt: new Date().toISOString(),
        };
        savePendingStakeRecovery(pendingRecovery);
      }

      setLockWorkflow({
        marketId: market.id,
        phase: "recording_wager",
        stakeTxHash: stakeExecution.stakeTxHash,
      });
      workflowStep = "recording_wager";

      if (intentId && pendingRecovery?.stakeTxHash) {
        await recordStakeIntentBroadcast(intentId, pendingRecovery);
      }

      const response = await fetch("/api/bets/wager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: stakeExecution.walletAddress,
          stakeTxHash: stakeExecution.stakeTxHash,
          intentId,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not lock the wager.");
      }

      if (intentId) {
        clearPendingStakeRecovery(intentId);
      }
      await refreshBoard(payload);
      setSelection(null);
      if (
        stakeExecution.executionMode === "onchain_escrow" &&
        stakeExecution.stakeTxHash
      ) {
        toast.success(
          `Escrow confirmed for ${selection.stake} WOLO on ${selection.side === "left" ? market.left.name : market.right.name}. ${shortTxHash(stakeExecution.stakeTxHash)}`,
        );
      } else {
        toast.success(
          `Added ${selection.stake} WOLO to ${selection.side === "left" ? market.left.name : market.right.name}.`,
        );
      }
    } catch (error) {
      console.error("Failed to lock wager:", error);
      const rawError =
        error instanceof Error ? error.message : "Could not lock the wager.";
      const displayError = describeBetWalletError(rawError);
      if (intentId) {
        await recordStakeIntentFailure({
          intentId,
          walletAddress:
            pendingRecovery?.walletAddress || connectedWalletAddress || null,
          walletProvider: pendingRecovery?.walletProvider || "keplr",
          walletType: pendingRecovery?.walletType || null,
          step: workflowStep,
          rawError,
          status: pendingRecovery?.stakeTxHash ? "suspect" : "failed",
        });
        if (!pendingRecovery?.stakeTxHash) {
          clearPendingStakeRecovery(intentId);
        }
      } else if (onchainBetEscrowEnabled && runtimeBetEscrowAddress) {
        await recordBetWalletError({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress:
            preparedWallet?.walletAddress || connectedWalletAddress || null,
          walletProvider: preparedWallet?.walletProvider || "keplr",
          walletType: preparedWallet?.walletType || null,
          step: workflowStep,
          rawError,
        });
      }
      toast.error(displayError);
    } finally {
      setWorkingKey(null);
      setLockWorkflow(null);
    }
  }

  async function handleClear(marketId: number) {
    if (!requireSignIn()) return;

    const market =
      board?.openMarkets
        .flatMap((entry) => [entry, entry.desyncMarket])
        .find(
          (entry): entry is BetBoardMarket =>
            Boolean(entry && entry.id === marketId),
        ) ?? null;
    if (market && isOnchainViewerWager(market.viewerWager)) {
      toast.error("Escrowed WOLO slips cannot be cleared from the app.");
      return;
    }

    setWorkingKey(`clear-${marketId}`);
    try {
      const response = await fetch(`/api/bets/wager?marketId=${marketId}`, {
        method: "DELETE",
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear the wager.");
      }
      await refreshBoard(payload);
      setSelection((current) => {
        if (!current) return current;
        if (current.marketId === marketId) return null;
        if (current.desync?.marketId === marketId) {
          return { ...current, desync: null };
        }
        return current;
      });
      toast.success("Slip cleared.");
    } catch (error) {
      console.error("Failed to clear wager:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not clear the wager.",
      );
    } finally {
      setWorkingKey(null);
    }
  }

  const viewerName =
    board?.viewerName ||
    user?.inGameName ||
    user?.steamPersonaName ||
    "Your book";
  const betsFamily =
    betsViewFamily(betsView);

  const isExchangeBetsView =
    betsView === "E2" ||
    betsView === "E3" ||
    betsView === "E4";

  const fixtureInteractionMode =
    betsViewReady &&
    Boolean(readBetsDesignFixture());
  const broadcastSurface = useMemo(() => {
    if (spotlightMarket) {
      return {
        key: `market-${spotlightMarket.id}`,
        sessionKey: spotlightMarket.linkedSessionKey,
        leftName: safePlayerName(spotlightMarket.left.name, "Player 1"),
        rightName: safePlayerName(spotlightMarket.right.name, "Player 2"),
        marketTitle: spotlightMarket.title,
        eventLabel: spotlightMarket.eventLabel,
        feeds: spotlightMarket.broadcastFeeds ?? EMPTY_BROADCAST_FEEDS,
        previews:
          spotlightMarket.broadcastPreviewUrls ?? EMPTY_BROADCAST_PREVIEW_URLS,
      };
    }

    return {
      key: "broadcast-empty",
      sessionKey: null,
      leftName: "Player 1",
      rightName: "Player 2",
      marketTitle: "",
      eventLabel: "",
      feeds: EMPTY_BROADCAST_FEEDS,
      previews: EMPTY_BROADCAST_PREVIEW_URLS,
    };
  }, [spotlightMarket]);

  return (
    <main
      data-bets-view={betsView}
      className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-5"
    >
      <SpeedReadyMarker route="/bets" ready={!loadingBoard} />
      <BetsMutedToggleCss />

      {!isExchangeBetsView ? (
        <BettingHallImageHero />
      ) : null}

      {!isExchangeBetsView ? (
        <BroadcastHeroTile
          key={broadcastSurface.key}
          sessionKey={broadcastSurface.sessionKey}
          leftName={broadcastSurface.leftName}
          rightName={broadcastSurface.rightName}
          marketTitle={broadcastSurface.marketTitle}
          eventLabel={broadcastSurface.eventLabel}
          feeds={broadcastSurface.feeds}
          previews={broadcastSurface.previews}
          open={battleCamVisibility === "open"}
          onToggle={handleBattleCamToggle}
        />
      ) : null}

      {betsFamily === "extreme" || orderedBookMarkets.length > 1 ? (
        <LiveBattleDeck
          markets={orderedBookMarkets}
          focusedMarketId={spotlightMarket?.id ?? null}
          selectionMarketId={selection?.marketId ?? null}
          onFocus={setFocusedMarketId}
        />
      ) : null}

      <TicketRecoveryRail
        tickets={unresolvedStakeTickets}
        recoveringTicketId={recoveringTicketId}
      />

      {betsFamily === "basic" ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[0.84fr_1.16fr]">
            <div className={`${shellClass()} p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-amber-200/12 bg-amber-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.28em] text-amber-100">
                    Bets
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {openCount} books
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {liveCount} live
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-[0.38em] text-slate-400">
                  The War Book
                </div>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Bets
                </h1>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
                <MiniMetric label="Open" value={String(openCount)} />
                <MiniMetric label="In Play" value={String(liveCount)} />
                <MiniMetric
                  label="Book Pot"
                  value={`${formatExactWolo(totalBookPot || 0)} WOLO`}
                />
                <MiniMetric
                  label="Your Slips"
                  value={
                    isAuthenticated
                      ? String(board?.yourBook.activeCount || 0)
                      : "Sign in"
                  }
                />
              </div>

              <div
                className={`mt-4 ${insetClass()} px-3 py-3 sm:mt-5 sm:px-4 sm:py-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                      Your Book
                    </div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {viewerName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      If Right
                    </div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {isAuthenticated
                        ? `${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`
                        : "Open"}
                    </div>
                  </div>
                </div>
              </div>

              {publicEscrowConfig ? (
                <div
                  className={`mt-4 ${insetClass()} border-rose-300/15 bg-rose-500/[0.08] px-4 py-4 text-sm text-rose-100`}
                >
                  {publicEscrowConfig}
                </div>
              ) : null}
            </div>

            <section
              className={`${shellClass()} relative overflow-hidden p-5 sm:p-6`}
            >
              <div className="pointer-events-none absolute right-[-1.25rem] top-[-1.25rem] opacity-[0.08]">
                <Image
                  src={WOLO_LOGO_SRC}
                  alt=""
                  width={260}
                  height={265}
                  className="h-[12rem] w-[12rem] object-contain sm:h-[14rem] sm:w-[14rem]"
                />
              </div>

              {loadingBoard ? (
                <LoadingMarket />
              ) : spotlightMarket ? (
                <>
                  <MarketFeature
                    market={spotlightMarket}
                    desyncMarket={spotlightDesyncMarket}
                    eyebrowLabel={
                      spotlightMarket.featured
                        ? "Featured Market"
                        : "Current Book"
                    }
                    detailMode="basic"
                    selection={selection}
                    workingKey={workingKey}
                    lockWorkflow={lockWorkflow}
                    nowMs={nowMs}
                    isAuthenticated={isAuthenticated}
                    isAdmin={isAdmin}
                    loadingAuth={loading}
                    maxStakeWolo={maxStakeWolo}
                    onSelect={handleSelect}
                    onStakeChange={(stake) =>
                      setSelection((current) =>
                        current && current.marketId === spotlightMarket.id
                          ? { ...current, stake }
                          : current,
                      )
                    }
                    onDesyncSideChange={(side) =>
                      spotlightDesyncMarket
                        ? handleDesyncSelection(
                            spotlightMarket,
                            spotlightDesyncMarket,
                            side,
                          )
                        : undefined
                    }
                    onDesyncStakeChange={(stake) =>
                      setSelection((current) =>
                        current &&
                        current.marketId === spotlightMarket.id &&
                        current.desync
                          ? { ...current, desync: { ...current.desync, stake } }
                          : current,
                      )
                    }
                    onLock={() => handleLock(spotlightMarket)}
                    onClear={handleClear}
                    onOpenFounderBonus={openFounderComposer}
                  />
                  <WarTape
                    rows={spotlightMarket.warTape.slice(0, 5)}
                    emptyLabel="Slips and payout proof will stamp in here as the game moves."
                  />
                </>
              ) : latestResult ? (
                <RecentResultFeature result={latestResult} />
              ) : (
                <EmptyShell label="No books armed yet. The first live or settled book will land here." />
              )}
            </section>
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[1.04fr_0.96fr]">
            <RecentBetsSection results={recentResults} />

            <YourBookSection
              board={board}
              isAuthenticated={isAuthenticated}
              loadingAuth={loading}
              loginWithSteam={handleBetsSignIn}
              unresolvedStakeIntents={unresolvedStakeIntents}
              pendingStakeRecoveries={pendingStakeRecoveries}
              recoveringIntentId={recoveringIntentId}
              onRecover={recoverStakeIntent}
            />
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[0.98fr_1.02fr]">
            <OpenBooksSection
              eyebrow={spotlightMarket ? "Other Live Books" : "Open Books"}
              title={
                spotlightMarket ? "Every war stays reachable." : "Pick a side."
              }
              detailMode="basic"
              markets={openMarkets}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={handleSelect}
              onDesyncSelect={handleDesyncSelection}
              onDesyncStakeChange={handleDesyncStakeChange}
              onStakeChange={(marketId, stake) =>
                setSelection((current) =>
                  current && current.marketId === marketId
                    ? { ...current, stake }
                    : current,
                )
              }
              onLock={handleLock}
              onClear={handleClear}
              onOpenFounderBonus={openFounderComposer}
              loadingBoard={loadingBoard}
              limit={null}
              emptyLabel={
                recentResults.length
                  ? "No extra open books right now. Recent settled books are carrying the page until the next one arms."
                  : "No open books right now. The first live book will show up here."
              }
              footerNote={null}
            />

            <BoardPulseSection
              openCount={openCount}
              liveCount={liveCount}
              bestReturnMultiplier={
                board?.heat.bestReturn?.returnMultiplier ?? null
              }
              biggestPotLabel={board?.heat.biggestPot?.label || "Market arming"}
              biggestPotWolo={board?.heat.biggestPot?.potWolo ?? null}
              latestResult={payoutProofResults[0] ?? null}
            />
          </section>

          <AwaitingProofSection markets={awaitingProofMarkets} />

          <section className="grid items-start gap-5 xl:grid-cols-2">
            <SettledSection results={payoutProofResults} />
            <div className="space-y-5">
              <PayoutQueueSection results={payoutQueueResults} />
              <ResolutionQueueSection results={reviewResults} />
              <HeatSection board={board} />
            </div>
          </section>
        </>
      ) : betsFamily === "advanced" ? (
        <>
          <section
            data-testid="advanced-heritage-betting-hall"
            className="relative isolate min-w-0 w-full max-w-full overflow-hidden rounded-[2.2rem] border border-white/[0.055] bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.14),transparent_34%),radial-gradient(circle_at_84%_10%,rgba(56,189,248,0.11),transparent_32%),linear-gradient(180deg,rgba(13,20,36,0.98),rgba(7,12,22,0.98))] px-5 py-7 shadow-[0_34px_100px_rgba(2,6,23,0.42)] sm:px-8 sm:py-9 lg:px-10 lg:py-11"
          >
            <div className="pointer-events-none absolute -right-16 -top-20 -z-10 opacity-[0.08]">
              <Image
                src={WOLO_LOGO_SRC}
                alt=""
                width={380}
                height={388}
                className="h-[22rem] w-[22rem] object-contain"
              />
            </div>

            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
              <div className="min-w-0 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-200/[0.12] bg-amber-400/[0.08] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-amber-100">
                    Advanced
                  </span>
                  <span className="rounded-full border border-emerald-200/[0.10] bg-emerald-400/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-emerald-100">
                    Team markets · 1v1 to 4v4
                  </span>
                </div>
                <div className="mt-6 text-[11px] uppercase tracking-[0.4em] text-slate-400">
                  The War Book
                </div>
              </div>

              <div className="grid w-full grid-cols-2 overflow-hidden rounded-[1.4rem] bg-black/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ring-1 ring-white/[0.045] sm:grid-cols-4 xl:w-auto xl:min-w-[38rem]">
                <ExtremeMetric label="Open" value={String(openCount)} />
                <ExtremeMetric label="In Play" value={String(liveCount)} />
                <ExtremeMetric
                  label="Book Pot"
                  value={`${formatExactWolo(totalBookPot || 0)} WOLO`}
                />
                <ExtremeMetric
                  label="Your Slips"
                  value={
                    isAuthenticated
                      ? String(board?.yourBook.activeCount || 0)
                      : "Sign in"
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                  onchainBetEscrowRequired && onchainBetEscrowEnabled
                    ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                    : onchainBetEscrowRequired
                      ? "border border-rose-300/20 bg-rose-400/10 text-rose-100"
                      : onchainBetEscrowEnabled
                        ? "border border-amber-300/20 bg-amber-400/10 text-amber-100"
                        : "border border-white/[0.08] bg-white/[0.04] text-slate-300"
                }`}
              >
                {stakeRailLabel({
                  required: onchainBetEscrowRequired,
                  enabled: onchainBetEscrowEnabled,
                  mode: runtimeBetEscrowMode,
                })}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${groupedSettlementTone(groupedRunCapability)}`}
              >
                {groupedSettlementLabel(groupedRunCapability)}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                {settlementRailLabel(settlementExecutionMode)}
              </span>
            </div>

            {runtimeBetTestMode ? (
              <div
                className={`mt-5 ${insetClass()} px-4 py-4 text-sm text-slate-300`}
              >
                Testing mode keeps the book open until official result or
                finalization. Same wallet, same team side only for now.
              </div>
            ) : null}
            {publicEscrowConfig ? (
              <div
                className={`mt-5 ${insetClass()} border-rose-300/15 bg-rose-500/[0.08] px-4 py-4 text-sm text-rose-100`}
              >
                {publicEscrowConfig}
              </div>
            ) : null}
            {publicSettlementNotice ? (
              <div
                className={`mt-5 ${insetClass()} px-4 py-4 text-sm ${
                  publicSettlementNotice.tone === "amber"
                    ? "border-amber-300/15 bg-amber-500/[0.08] text-amber-100"
                    : "text-slate-300"
                }`}
              >
                <div className="font-semibold text-white">
                  {publicSettlementNotice.title}
                </div>
                <div className="mt-1 leading-6">
                  {publicSettlementNotice.body}
                </div>
              </div>
            ) : null}
          </section>

          <section
            data-testid="advanced-heritage-featured-market"
            className="relative min-w-0 w-full max-w-full overflow-hidden rounded-[2.2rem] border border-white/[0.055] bg-[radial-gradient(circle_at_8%_8%,rgba(245,158,11,0.08),transparent_28%),radial-gradient(circle_at_92%_12%,rgba(56,189,248,0.08),transparent_28%),linear-gradient(180deg,rgba(10,17,31,0.99),rgba(6,11,20,0.99))] px-4 py-7 shadow-[0_34px_100px_rgba(2,6,23,0.4)] sm:px-8 sm:py-9 lg:px-10 lg:py-11"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/25 to-transparent" />
            {loadingBoard ? (
              <LoadingMarket />
            ) : spotlightMarket ? (
              <MarketFeature
                market={spotlightMarket}
                desyncMarket={spotlightDesyncMarket}
                eyebrowLabel={
                  spotlightMarket.featured ? "Featured Market" : "Current Book"
                }
                detailMode="extreme"
                selection={selection}
                workingKey={workingKey}
                lockWorkflow={lockWorkflow}
                nowMs={nowMs}
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                loadingAuth={loading}
                maxStakeWolo={maxStakeWolo}
                onSelect={handleSelect}
                onStakeChange={(stake) =>
                  setSelection((current) =>
                    current && current.marketId === spotlightMarket.id
                      ? { ...current, stake }
                      : current,
                  )
                }
                onDesyncSideChange={(side) =>
                  spotlightDesyncMarket
                    ? handleDesyncSelection(
                        spotlightMarket,
                        spotlightDesyncMarket,
                        side,
                      )
                    : undefined
                }
                onDesyncStakeChange={(stake) =>
                  setSelection((current) =>
                    current &&
                    current.marketId === spotlightMarket.id &&
                    current.desync
                      ? { ...current, desync: { ...current.desync, stake } }
                      : current,
                  )
                }
                onLock={() => handleLock(spotlightMarket)}
                onClear={handleClear}
                onOpenFounderBonus={openFounderComposer}
              />
            ) : latestResult ? (
              <RecentResultFeature result={latestResult} />
            ) : (
              <EmptyShell label="No books armed yet. The latest closed book will linger here once proof lands." />
            )}
          </section>

          <OpenBooksSection
            eyebrow="More Open Books"
            title=""
            detailMode="extreme"
            markets={openMarkets}
            selection={selection}
            workingKey={workingKey}
            lockWorkflow={lockWorkflow}
            nowMs={nowMs}
            isAdmin={isAdmin}
            maxStakeWolo={maxStakeWolo}
            onSelect={handleSelect}
            onDesyncSelect={handleDesyncSelection}
            onDesyncStakeChange={handleDesyncStakeChange}
            onStakeChange={(marketId, stake) =>
              setSelection((current) =>
                current && current.marketId === marketId
                  ? { ...current, stake }
                  : current,
              )
            }
            onLock={handleLock}
            onClear={handleClear}
            onOpenFounderBonus={openFounderComposer}
            loadingBoard={loadingBoard}
            limit={null}
            emptyLabel="No additional open books right now."
            wide
          />

          <AwaitingProofSection markets={awaitingProofMarkets} />

          <section className="grid items-start gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <YourBookSection
              board={board}
              isAuthenticated={isAuthenticated}
              loadingAuth={loading}
              loginWithSteam={handleBetsSignIn}
              unresolvedStakeIntents={unresolvedStakeIntents}
              pendingStakeRecoveries={pendingStakeRecoveries}
              recoveringIntentId={recoveringIntentId}
              onRecover={recoverStakeIntent}
            />

            <div className="space-y-5">
              <SettledSection results={payoutProofResults} />
              <PayoutQueueSection results={payoutQueueResults} />
              <ResolutionQueueSection results={reviewResults} />
              <HeatSection board={board} />
            </div>
          </section>
        </>
      ) : betsView === "E1" ? (
        <>
          <ExtremeCommandHeader
            openCount={openCount}
            liveCount={liveCount}
            totalBookPot={totalBookPot}
            activeSlipCount={board?.yourBook.activeCount || 0}
            isAuthenticated={isAuthenticated}
            stakeRail={stakeRailLabel({
              required: onchainBetEscrowRequired,
              enabled: onchainBetEscrowEnabled,
              mode: runtimeBetEscrowMode,
            })}
            settlementRail={settlementRailLabel(settlementExecutionMode)}
          />

          <section
            data-testid="extreme-next-arena"
            className="grid items-start gap-5 xl:grid-cols-[0.68fr_1.32fr]"
          >
            <div className={`${shellClass()} p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-amber-200/12 bg-amber-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.28em] text-amber-100">
                    Live ticket
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {openCount} books
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {liveCount} live
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                      onchainBetEscrowRequired && onchainBetEscrowEnabled
                        ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                        : onchainBetEscrowRequired
                          ? "border border-rose-300/20 bg-rose-400/10 text-rose-100"
                          : onchainBetEscrowEnabled
                            ? "border border-amber-300/20 bg-amber-400/10 text-amber-100"
                            : "border border-white/[0.08] bg-white/[0.04] text-slate-300"
                    }`}
                  >
                    {stakeRailLabel({
                      required: onchainBetEscrowRequired,
                      enabled: onchainBetEscrowEnabled,
                      mode: runtimeBetEscrowMode,
                    })}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${groupedSettlementTone(groupedRunCapability)}`}
                  >
                    {groupedSettlementLabel(groupedRunCapability)}
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                    {settlementRailLabel(settlementExecutionMode)}
                  </span>
                </div>
              </div>

              <div className="mt-5 text-[11px] uppercase tracking-[0.38em] text-slate-400">
                One slip · one signature
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
                <MiniMetric label="Open" value={String(openCount)} />
                <MiniMetric label="In Play" value={String(liveCount)} />
                <MiniMetric
                  label="Book Pot"
                  value={`${formatExactWolo(totalBookPot || 0)} WOLO`}
                />
                <MiniMetric
                  label="Your Slips"
                  value={
                    isAuthenticated
                      ? String(board?.yourBook.activeCount || 0)
                      : "Sign in"
                  }
                />
              </div>

              <div
                className={`mt-4 ${insetClass()} px-3 py-3 sm:mt-5 sm:px-4 sm:py-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                      Your Book
                    </div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {viewerName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      If Right
                    </div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {isAuthenticated
                        ? `${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`
                        : "Open"}
                    </div>
                  </div>
                </div>
              </div>

              {runtimeBetTestMode ? (
                <div
                  className={`mt-4 ${insetClass()} px-4 py-4 text-sm text-slate-300`}
                >
                  Testing mode keeps the book open until official result or
                  finalization. Same wallet, same side only for now.
                </div>
              ) : null}

              {publicEscrowConfig ? (
                <div
                  className={`mt-4 ${insetClass()} border-rose-300/15 bg-rose-500/[0.08] px-4 py-4 text-sm text-rose-100`}
                >
                  {publicEscrowConfig}
                </div>
              ) : null}
              {publicSettlementNotice ? (
                <div
                  className={`mt-4 ${insetClass()} px-4 py-4 text-sm ${
                    publicSettlementNotice.tone === "amber"
                      ? "border-amber-300/15 bg-amber-500/[0.08] text-amber-100"
                      : "text-slate-300"
                  }`}
                >
                  <div className="font-semibold text-white">
                    {publicSettlementNotice.title}
                  </div>
                  <div className="mt-1 leading-6">
                    {publicSettlementNotice.body}
                  </div>
                </div>
              ) : null}
            </div>

            <section
              className={`${shellClass()} relative overflow-hidden p-5 sm:p-6`}
            >
              <div className="pointer-events-none absolute right-[-1.25rem] top-[-1.25rem] opacity-[0.08]">
                <Image
                  src={WOLO_LOGO_SRC}
                  alt=""
                  width={260}
                  height={265}
                  className="h-[12rem] w-[12rem] object-contain sm:h-[14rem] sm:w-[14rem]"
                />
              </div>

              {loadingBoard ? (
                <LoadingMarket />
              ) : spotlightMarket ? (
                <MarketFeature
                  market={spotlightMarket}
                  desyncMarket={spotlightDesyncMarket}
                  eyebrowLabel={
                    spotlightMarket.featured
                      ? "Featured Market"
                      : "Current Book"
                  }
                  detailMode="extreme"
                  selection={selection}
                  workingKey={workingKey}
                  lockWorkflow={lockWorkflow}
                  nowMs={nowMs}
                  isAuthenticated={isAuthenticated}
                  isAdmin={isAdmin}
                  loadingAuth={loading}
                  maxStakeWolo={maxStakeWolo}
                  onSelect={handleSelect}
                  onStakeChange={(stake) =>
                    setSelection((current) =>
                      current && current.marketId === spotlightMarket.id
                        ? { ...current, stake }
                        : current,
                    )
                  }
                  onDesyncSideChange={(side) =>
                    spotlightDesyncMarket
                      ? handleDesyncSelection(
                          spotlightMarket,
                          spotlightDesyncMarket,
                          side,
                        )
                      : undefined
                  }
                  onDesyncStakeChange={(stake) =>
                    setSelection((current) =>
                      current &&
                      current.marketId === spotlightMarket.id &&
                      current.desync
                        ? { ...current, desync: { ...current.desync, stake } }
                        : current,
                    )
                  }
                  onLock={() => handleLock(spotlightMarket)}
                  onClear={handleClear}
                  onOpenFounderBonus={openFounderComposer}
                />
              ) : latestResult ? (
                <RecentResultFeature result={latestResult} />
              ) : (
                <EmptyShell label="No books armed yet. The latest closed book will linger here once proof lands." />
              )}
            </section>
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <OpenBooksSection
              eyebrow="Open Books"
              title="Pick a side."
              detailMode="advanced"
              markets={openMarkets}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={handleSelect}
              onDesyncSelect={handleDesyncSelection}
              onDesyncStakeChange={handleDesyncStakeChange}
              onStakeChange={(marketId, stake) =>
                setSelection((current) =>
                  current && current.marketId === marketId
                    ? { ...current, stake }
                    : current,
                )
              }
              onLock={handleLock}
              onClear={handleClear}
              onOpenFounderBonus={openFounderComposer}
              loadingBoard={loadingBoard}
              limit={null}
              emptyLabel="No open books right now."
            />

            <AwaitingProofSection markets={awaitingProofMarkets} />

            <div className="space-y-5">
              <YourBookSection
                board={board}
                isAuthenticated={isAuthenticated}
                loadingAuth={loading}
                loginWithSteam={handleBetsSignIn}
                unresolvedStakeIntents={unresolvedStakeIntents}
                pendingStakeRecoveries={pendingStakeRecoveries}
                recoveringIntentId={recoveringIntentId}
                onRecover={recoverStakeIntent}
              />

              <SettledSection results={payoutProofResults} />
              <PayoutQueueSection results={payoutQueueResults} />
              <ResolutionQueueSection results={reviewResults} />
              <HeatSection board={board} />
            </div>
          </section>
        </>
      ) : (
        <>
          <section
            data-testid="bets-e2-exchange"
            className="relative isolate overflow-hidden rounded-[2.35rem] border border-white/[0.055] bg-[radial-gradient(circle_at_0%_18%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_100%_18%,rgba(245,158,11,0.15),transparent_34%),linear-gradient(180deg,rgba(8,17,31,0.99),rgba(3,9,18,0.99))] px-4 py-6 shadow-[0_38px_120px_rgba(2,6,23,0.52)] sm:px-7 sm:py-8 lg:px-9 lg:py-9"
          >
            <div className="pointer-events-none absolute inset-x-[10%] top-0 h-px bg-gradient-to-r from-transparent via-amber-100/35 to-transparent" />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.055] pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    spotlightMarket?.status === "live"
                      ? "animate-pulse bg-emerald-300"
                      : "bg-amber-300"
                  }`}
                />

                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.34em] text-cyan-100/60">
                    Live War Exchange
                  </div>

                  <div className="mt-1 truncate text-xs text-slate-500">
                    {spotlightMarket?.eventLabel ||
                      "Waiting for the next armed battle"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5 text-right">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-slate-600">
                    Live
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {liveCount}
                  </div>
                </div>

                <div>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-slate-600">
                    Book Pot
                  </div>
                  <div className="mt-1 text-sm font-semibold text-amber-100">
                    {formatCompact(
                      totalBookPot,
                    )}{" "}
                    W
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8">
              {loadingBoard ? (
                <LoadingMarket />
              ) : spotlightMarket ? (
                <MarketFeature
                  market={spotlightMarket}
                  desyncMarket={
                    spotlightDesyncMarket
                  }
                  eyebrowLabel={
                    spotlightMarket.featured
                      ? "Featured Market"
                      : "Current Book"
                  }
                  detailMode="exchange"
                  exchangePresentation={
                    betsView === "E4"
                      ? "instrument"
                      : betsView === "E3"
                        ? "cinematic"
                        : "panel"
                  }
                  selection={selection}
                  workingKey={workingKey}
                  lockWorkflow={
                    lockWorkflow
                  }
                  nowMs={nowMs}
                  isAuthenticated={isAuthenticated || fixtureInteractionMode}
                  isAdmin={false}
                  loadingAuth={loading}
                  maxStakeWolo={
                    maxStakeWolo
                  }
                  onSelect={
                    handleSelect
                  }
                  onStakeChange={(stake) =>
                    setSelection(
                      (current) =>
                        current &&
                        current.marketId ===
                          spotlightMarket.id
                          ? {
                              ...current,
                              stake,
                            }
                          : current,
                    )
                  }
                  onDesyncSideChange={(
                    side,
                  ) =>
                    spotlightDesyncMarket
                      ? handleDesyncSelection(
                          spotlightMarket,
                          spotlightDesyncMarket,
                          side,
                        )
                      : undefined
                  }
                  onDesyncStakeChange={(
                    stake,
                  ) =>
                    setSelection(
                      (current) =>
                        current &&
                        current.marketId ===
                          spotlightMarket.id &&
                        current.desync
                          ? {
                              ...current,
                              desync: {
                                ...current.desync,
                                stake,
                              },
                            }
                          : current,
                    )
                  }
                  onLock={() =>
                    handleLock(
                      spotlightMarket,
                    )
                  }
                  onClear={
                    handleClear
                  }
                  onOpenFounderBonus={
                    openFounderComposer
                  }
                />
              ) : latestResult ? (
                <RecentResultFeature
                  result={latestResult}
                />
              ) : (
                <EmptyShell label="No books armed yet. The next watcher battle will enter here." />
              )}
            </div>
          </section>

          <section
            data-testid="bets-e2-ledger"
            className="grid items-start gap-5 xl:grid-cols-[1.08fr_0.92fr]"
          >
            <YourBookSection
              board={board}
              isAuthenticated={
                isAuthenticated
              }
              loadingAuth={loading}
              loginWithSteam={
                loginWithSteam
              }
              unresolvedStakeIntents={
                unresolvedStakeIntents
              }
              pendingStakeRecoveries={
                pendingStakeRecoveries
              }
              recoveringIntentId={
                recoveringIntentId
              }
              onRecover={
                recoverStakeIntent
              }
            />

            <div className="space-y-5">
              <SettledSection
                results={
                  payoutProofResults
                }
              />
              <PayoutQueueSection
                results={
                  payoutQueueResults
                }
              />
              <ResolutionQueueSection
                results={reviewResults}
              />
            </div>
          </section>
        </>
      )}

      <BetsDisplayRail
        value={betsView}
        onChange={handleBetsViewChange}
        battleCamOpen={
          battleCamVisibility === "open"
        }
        onBattleCamToggle={
          handleBattleCamToggle
        }
      />

      <FounderBonusModal
        open={Boolean(founderComposer)}
        marketTitle={founderComposer?.marketTitle || "Market"}
        participantCount={founderComposer?.participantCount || 2}
        bonusType={founderComposer?.bonusType || "participants"}
        amountValue={founderComposer?.amountValue || ""}
        noteValue={founderComposer?.noteValue || ""}
        saving={savingFounderBonus}
        error={founderBonusError}
        onClose={() => {
          if (savingFounderBonus) {
            return;
          }
          setFounderComposer(null);
          setFounderBonusError(null);
        }}
        onBonusTypeChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  bonusType: value,
                  amountValue:
                    value === "participants"
                      ? defaultFounderParticipantAmount(
                          current.participantCount,
                        )
                      : "1000",
                }
              : current,
          )
        }
        onAmountChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  amountValue: value,
                }
              : current,
          )
        }
        onNoteChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  noteValue: value,
                }
              : current,
          )
        }
        onSubmit={() => {
          void submitFounderBonus();
        }}
      />
    </main>
  );
}

function ExtremeCommandHeader({
  openCount,
  liveCount,
  totalBookPot,
  activeSlipCount,
  isAuthenticated,
  stakeRail,
  settlementRail,
}: {
  openCount: number;
  liveCount: number;
  totalBookPot: number;
  activeSlipCount: number;
  isAuthenticated: boolean;
  stakeRail: string;
  settlementRail: string;
}) {
  return (
    <section
      data-testid="extreme-next-command-header"
      className="relative isolate overflow-hidden rounded-[2.35rem] border border-cyan-200/[0.12] bg-[radial-gradient(circle_at_12%_-10%,rgba(34,211,238,0.2),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.2),transparent_32%),linear-gradient(135deg,rgba(6,13,26,0.99),rgba(10,19,34,0.99)_52%,rgba(5,11,22,0.99))] px-5 py-7 shadow-[0_34px_110px_rgba(2,6,23,0.55)] sm:px-8 sm:py-9 lg:px-10"
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-amber-200/60" />
      <div className="pointer-events-none absolute -right-20 -top-24 -z-10 opacity-[0.09]">
        <Image
          src={WOLO_LOGO_SRC}
          alt=""
          width={440}
          height={448}
          className="h-[25rem] w-[25rem] object-contain"
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.82fr)] xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-100">
              Extreme E
            </span>
            <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
              Live war exchange
            </span>
          </div>

          <div className="mt-6 text-[11px] font-black uppercase tracking-[0.44em] text-slate-400">
            The Betting Hall · Command Deck
          </div>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-[1.55rem] border border-white/[0.07] bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:grid-cols-4">
          <ExtremeMetric label="Live" value={String(liveCount)} />
          <ExtremeMetric label="Open" value={String(openCount)} />
          <ExtremeMetric
            label="Book Pot"
            value={`${formatExactWolo(totalBookPot || 0)} W`}
          />
          <ExtremeMetric
            label="Your Tickets"
            value={isAuthenticated ? String(activeSlipCount) : "Sign in"}
          />
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
        <span className="rounded-full border border-cyan-200/15 bg-cyan-300/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
          {stakeRail}
        </span>
        <span className="rounded-full border border-emerald-200/15 bg-emerald-300/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
          {settlementRail}
        </span>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
          Proof · queue · review stay separate
        </span>
      </div>
    </section>
  );
}

function TicketRecoveryRail({
  tickets,
  recoveringTicketId,
}: {
  tickets: BetBoardSnapshot["recovery"]["unresolvedStakeTickets"];
  recoveringTicketId: number | null;
}) {
  if (tickets.length === 0) return null;

  return (
    <section className="rounded-[1.5rem] border border-amber-200/[0.12] bg-amber-300/[0.045] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/70">
            Signed ticket recovery
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            These Winner + Desync tickets are reconciled from their exact wallet
            memo, amount, and sender. The page never asks for a duplicate
            transfer.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
          {tickets.length} unresolved
        </span>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {tickets.map((ticket) => {
          const hasProof = Boolean(ticket.stakeTxHash);
          const recovering = recoveringTicketId === ticket.id;
          return (
            <div
              key={ticket.id}
              className="rounded-2xl border border-white/[0.06] bg-slate-950/30 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">
                  Ticket #{ticket.id} ·{" "}
                  {ticket.totalAmountWolo.toLocaleString()} WOLO
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                    hasProof
                      ? "border-emerald-200/15 bg-emerald-300/[0.08] text-emerald-100"
                      : ticket.status === "failed" ||
                          ticket.status === "suspect"
                        ? "border-rose-200/15 bg-rose-300/[0.08] text-rose-100"
                        : "border-amber-200/15 bg-amber-300/[0.08] text-amber-100"
                  }`}
                >
                  {recovering
                    ? "Recovering"
                    : hasProof
                      ? "Proof found"
                      : ticket.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-400">
                {ticket.legs
                  .map((leg) => `${leg.legRole}: ${leg.amountWolo} W`)
                  .join(" · ")}
              </div>
              {!hasProof ? (
                <div className="mt-1 text-[11px] leading-5 text-slate-500">
                  Waiting for a verifiable wallet transaction. No wager is
                  counted until proof is found.
                </div>
              ) : null}
              {ticket.errorDetail ? (
                <div className="mt-1 break-words text-[11px] leading-5 text-rose-100/75">
                  {ticket.errorDetail}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LiveBattleDeck({
  markets,
  focusedMarketId,
  selectionMarketId,
  onFocus,
}: {
  markets: BetBoardMarket[];
  focusedMarketId: number | null;
  selectionMarketId: number | null;
  onFocus: (marketId: number) => void;
}) {
  const deckMarkets = useMemo(
    () =>
      [...markets].sort((left, right) => {
        const leftNumber = left.battleNumber ?? Number.MIN_SAFE_INTEGER;
        const rightNumber = right.battleNumber ?? Number.MIN_SAFE_INTEGER;
        if (leftNumber !== rightNumber) return rightNumber - leftNumber;
        return right.id - left.id;
      }),
    [markets],
  );

  return (
    <section
      data-testid="live-battle-deck"
      className="overflow-hidden rounded-[1.8rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(13,22,39,0.95),rgba(8,14,26,0.96))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:p-5"
    >
      <div className="px-1 text-[10px] font-black uppercase tracking-[0.34em] text-cyan-200/75">
        Live Battle Deck
      </div>

      {deckMarkets.length ? (
        <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-color:rgba(148,163,184,0.28)_transparent]">
          {deckMarkets.map((market, index) => {
            const focused = market.id === focusedMarketId;
            const hasSelection = market.id === selectionMarketId;
            const battleLabel = market.battleNumber
              ? `Battle #${market.battleNumber.toLocaleString()}`
              : "Battle number pending";

            return (
              <button
                key={market.id}
                type="button"
                aria-pressed={focused}
                onClick={() => onFocus(market.id)}
                className={`group min-w-[17rem] snap-start rounded-[1.35rem] border p-4 text-left transition sm:min-w-[20rem] ${
                  focused
                    ? "border-cyan-200/35 bg-cyan-300/[0.09] shadow-[0_16px_45px_rgba(8,145,178,0.14)]"
                    : "border-white/[0.07] bg-black/20 hover:border-white/[0.14] hover:bg-white/[0.045]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${market.status === "live" ? "animate-pulse bg-emerald-300" : "bg-amber-300"}`}
                    />
                    <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">
                      {battleLabel}
                    </span>
                  </div>
                  {index === 0 && deckMarkets.length > 1 ? (
                    <span className="rounded-full border border-amber-200/15 bg-amber-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">
                      Newest
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 line-clamp-2 min-h-12 text-base font-black leading-6 text-white">
                  {market.left.name}
                  <span className="mx-2 text-slate-600">vs</span>
                  {market.right.name}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span className="truncate">{market.eventLabel}</span>
                  <span className="shrink-0 font-semibold text-amber-100">
                    {formatCompact(market.totalPotWolo)} W
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[10px] font-black uppercase tracking-[0.18em]">
                  <span
                    className={
                      market.status === "live"
                        ? "text-emerald-200"
                        : "text-amber-200"
                    }
                  >
                    {market.status === "live" ? "Live now" : "Book open"}
                  </span>
                  <span
                    className={
                      hasSelection
                        ? "text-cyan-100"
                        : focused
                          ? "text-white"
                          : "text-slate-500"
                    }
                  >
                    {hasSelection
                      ? "Ticket open"
                      : focused
                        ? "In focus"
                        : "Open battle"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-[1.3rem] border border-dashed border-white/[0.08] bg-black/15 px-5 py-7 text-sm text-slate-400">
          The deck is standing by. The next watcher-confirmed game will appear
          here automatically.
        </div>
      )}
    </section>
  );
}

function OpenBooksSection({
  eyebrow,
  title,
  detailMode = "advanced",
  markets,
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAdmin,
  maxStakeWolo,
  onSelect,
  onDesyncSelect,
  onDesyncStakeChange,
  onStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
  loadingBoard,
  limit,
  emptyLabel,
  footerNote,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  detailMode?: "basic" | "advanced" | "extreme";
  markets: BetBoardMarket[];
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAdmin: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onDesyncSelect: (
    winnerMarket: BetBoardMarket,
    desyncMarket: BetBoardMarket,
    side: BetSide | null,
  ) => void;
  onDesyncStakeChange: (winnerMarketId: number, stake: number) => void;
  onStakeChange: (marketId: number, stake: number) => void;
  onLock: (market: BetBoardMarket) => void;
  onClear: (marketId: number) => void;
  onOpenFounderBonus: (
    market: BetBoardMarket,
    bonusType: FounderBonusType,
  ) => void;
  loadingBoard: boolean;
  limit: number | null;
  emptyLabel: string;
  footerNote?: string | null;
  wide?: boolean;
}) {
  const visibleMarkets = limit ? markets.slice(0, limit) : markets;

  const extremeSurface = detailMode === "extreme";

  return (
    <section
      className={
        extremeSurface
          ? "min-w-0 w-full max-w-full rounded-[2.1rem] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(11,18,32,0.92),rgba(7,12,22,0.94))] px-4 py-7 shadow-[0_28px_80px_rgba(2,6,23,0.30)] sm:px-7 sm:py-8 lg:px-9"
          : `${shellClass()} p-5 sm:p-6`
      }
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            {eyebrow}
          </div>
          {title ? (
            <h2
              className={`mt-2 text-white ${extremeSurface ? "font-serif text-3xl text-[#fff6dc] sm:text-4xl" : "text-2xl font-semibold"}`}
            >
              {title}
            </h2>
          ) : null}
        </div>
        <div className="rounded-full bg-white/[0.035] px-3 py-1 text-xs text-slate-300 ring-1 ring-white/[0.05]">
          {markets.length}
        </div>
      </div>

      <div
        className={`grid ${extremeSurface ? "mt-7 gap-6" : "mt-5 gap-4"} ${wide ? "grid-cols-1" : "md:grid-cols-2"}`}
      >
        {loadingBoard ? (
          <>
            <LoadingCard />
            <LoadingCard />
          </>
        ) : visibleMarkets.length > 0 ? (
          visibleMarkets.map((market, index) => (
            <MarketCard
              key={market.id}
              market={market}
              detailMode={detailMode}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={onSelect}
              desyncMarket={market.desyncMarket}
              onDesyncSideChange={
                market.desyncMarket
                  ? (side) => onDesyncSelect(market, market.desyncMarket!, side)
                  : undefined
              }
              onDesyncStakeChange={
                market.desyncMarket
                  ? (stake) => onDesyncStakeChange(market.id, stake)
                  : undefined
              }
              onStakeChange={(stake) => onStakeChange(market.id, stake)}
              onLock={() => onLock(market)}
              onClear={onClear}
              onOpenFounderBonus={onOpenFounderBonus}
              accent={index % 2 === 0 ? "warm" : "cool"}
            />
          ))
        ) : (
          <EmptyShell label={emptyLabel} />
        )}
      </div>

      {footerNote ? (
        <div className="mt-4 text-sm text-slate-400">{footerNote}</div>
      ) : null}
    </section>
  );
}

function RecentBetsSection({ results }: { results: BetSettledResult[] }) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Recent Bets
          </div>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {results.length}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {results.length ? (
          results
            .slice(0, 6)
            .map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                compact
                basicLook
                founderChipVariant="micro"
              />
            ))
        ) : (
          <EmptyShell label="No books have settled yet. The first closed result will show up here instead of leaving Basic empty." />
        )}
      </div>
    </section>
  );
}

function SettledSection({ results }: { results: BetSettledResult[] }) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
            Settlement Proof
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Settled / paid / refunded
          </h2>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {results.length}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {results.length ? (
          results.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))
        ) : (
          <EmptyShell label="No settled proof landed yet." />
        )}
      </div>
    </section>
  );
}

function PayoutQueueSection({ results }: { results: BetSettledResult[] }) {
  if (results.length === 0) return null;

  const failedCount = results.filter(
    (result) =>
      result.payoutState === "failed" || result.payoutState === "partial",
  ).length;

  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-sky-300/70">
            Settlement Queue
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Outcome resolved · payout pending
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            The game result is known, but a bettor payout or refund still needs
            proof. Optional Founders rewards are tracked separately and never
            make a settled bet look pending.
          </p>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-xs ${
            failedCount > 0
              ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
              : "border-sky-300/15 bg-sky-400/10 text-sky-100"
          }`}
        >
          {failedCount > 0
            ? `${failedCount} need attention`
            : `${results.length} pending`}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>
    </section>
  );
}

function ResolutionQueueSection({ results }: { results: BetSettledResult[] }) {
  if (results.length === 0) return null;

  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300/70">
            Resolution Queue
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Under review
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            These books are not settled proof. Trusted replay evidence can close
            them; inconclusive proof expires to an exact stake refund.
          </p>
        </div>
        <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
          {results.length}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>
    </section>
  );
}

function AwaitingProofSection({ markets }: { markets: BetBoardMarket[] }) {
  if (markets.length === 0) return null;
  const lockedWolo = markets.reduce(
    (sum, market) =>
      sum + market.totalPotWolo + (market.desyncMarket?.totalPotWolo ?? 0),
    0,
  );

  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300/70">
            Awaiting Final Proof
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Betting is locked. Replay proof is still being checked; existing
            wagers remain unchanged.
          </p>
        </div>
        <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
          {formatExactWolo(lockedWolo)} WOLO locked
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {markets.map((market) => (
          <Link
            key={market.id}
            href={buildBetMarketHistoryHref(market.id) || `/bets/${market.id}`}
            className="rounded-2xl border border-amber-200/10 bg-amber-300/[0.04] p-4 transition hover:bg-amber-300/[0.07]"
          >
            <div className="text-sm font-semibold text-white">
              {market.title}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {market.eventLabel}
            </div>
            <div className="mt-3 text-xs font-semibold text-amber-100">
              Game out of sync · checking final replay
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function BoardPulseSection({
  openCount,
  liveCount,
  biggestPotLabel,
  biggestPotWolo,
  bestReturnMultiplier,
  latestResult,
}: {
  openCount: number;
  liveCount: number;
  biggestPotLabel: string;
  biggestPotWolo: number | null;
  bestReturnMultiplier: number | null;
  latestResult: BetSettledResult | null;
}) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
        Board Pulse
      </div>
      <div className="mt-5 space-y-3">
        <HeatRow
          label="Open books"
          value={
            openCount > 0
              ? `${openCount} book${openCount === 1 ? "" : "s"} armed`
              : "Quiet for now"
          }
          detail={
            liveCount > 0
              ? `${liveCount} currently live`
              : "No live book at this second"
          }
        />
        <HeatRow
          label="Biggest pot"
          value={biggestPotLabel}
          detail={
            biggestPotWolo
              ? `${formatExactWolo(biggestPotWolo)} WOLO`
              : "Waiting for the next crowd surge"
          }
        />
        <HeatRow
          label="Best return"
          value={
            bestReturnMultiplier
              ? `${bestReturnMultiplier.toFixed(2)}x right now`
              : "Reading the board"
          }
          detail={
            latestResult
              ? `${latestResult.winner} closed the latest book · ${formatSettledTime(latestResult.settledAt)}`
              : "No closed proof yet"
          }
        />
      </div>
    </section>
  );
}

function HeatSection({ board }: { board: BetBoardSnapshot | null }) {
  const latestProof =
    board?.settledResults.find(
      (result) =>
        result.resolutionStatus !== "under_review" &&
        isSettlementProofState(result.payoutState),
    ) ?? null;

  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
        Heat
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-white">What’s moving.</h2>

      <div className="mt-5 space-y-3">
        <HeatRow
          label="Biggest pot"
          value={board?.heat.biggestPot?.label || "Market arming"}
          detail={
            board?.heat.biggestPot
              ? `${formatExactWolo(board.heat.biggestPot.potWolo)} WOLO`
              : "Quiet"
          }
        />
        <HeatRow
          label="Best return"
          value={board?.heat.bestReturn?.label || "Reading the board"}
          detail={
            board?.heat.bestReturn
              ? `${board.heat.bestReturn.returnMultiplier.toFixed(2)}x`
              : "Waiting"
          }
        />
        <HeatRow
          label="Latest proof"
          value={latestProof?.title || "No result yet"}
          detail={
            latestProof
              ? `${latestProof.winner} · ${formatSettledTime(latestProof.settledAt)}`
              : "Pending"
          }
        />
      </div>
    </section>
  );
}

function RecentResultFeature({ result }: { result: BetSettledResult }) {
  const underReview = result.resolutionStatus === "under_review";
  const payoutConfirmed = isSettlementProofState(result.payoutState);

  return (
    <div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
          {underReview
            ? "Resolution Queue"
            : payoutConfirmed
              ? "Latest Payout Proof"
              : "Latest Resolved Outcome"}
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          {result.title}
        </h2>
        <div className="mt-2 text-sm text-slate-400">
          {underReview
            ? `${result.winner} · not yet settled`
            : result.resolutionStatus === "settled"
              ? `${result.winner} took ${result.mapName}`
              : `${result.winner} · ${result.mapName}`}
          {!underReview && !payoutConfirmed ? " · payout not confirmed" : ""} ·{" "}
          {formatSettledTime(result.settledAt)}
        </div>
      </div>

      <div className="mt-5">
        <ResultCard result={result} basicLook founderChipVariant="micro" />
      </div>
    </div>
  );
}

function providerLabel(feed: BroadcastFeed | null | undefined) {
  if (!feed) return "Placeholder";
  if (feed.provider === "aoe2war") return "AoE2WAR";
  if (feed.provider === "twitch") return "Twitch";
  if (feed.provider === "youtube") return "YouTube";
  if (feed.provider === "steam") return "Steam";
  if (feed.provider === "discord") return "Discord";
  return "External";
}

function buildBroadcastEmbedSrc(
  feed: BroadcastFeed | null | undefined,
  browserHost: string,
  options: { compact?: boolean; autoplay?: boolean } = {},
) {
  if (!feed?.embedId || !feed.canEmbed) {
    return null;
  }

  const compact = Boolean(options.compact);
  const autoplay = Boolean(options.autoplay);

  if (feed.provider === "twitch") {
    const parent = encodeURIComponent(browserHost || "aoe2war.com");
    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      feed.embedId,
    )}&parent=${parent}&autoplay=${autoplay ? "true" : "false"}&muted=${
      compact || autoplay ? "true" : "false"
    }`;
  }

  if (feed.provider === "youtube") {
    return `https://www.youtube.com/embed/${encodeURIComponent(
      feed.embedId,
    )}?rel=0&modestbranding=1&playsinline=1&mute=${autoplay ? "1" : "0"}&autoplay=${
      autoplay ? "1" : "0"
    }`;
  }

  return null;
}

function broadcastViewHasNativePlayback(view: {
  feed: BroadcastFeed | null;
  previewUrl: string | null;
}) {
  const feed = view.feed;
  return Boolean(
    feed &&
    (feed.provider === "aoe2war" ||
      feed.sourceType === "browser" ||
      feed.sourceType === "watcher_native") &&
    feed.playbackUrl,
  );
}

function BroadcastHeroTile({
  sessionKey,
  leftName,
  rightName,
  marketTitle,
  eventLabel,
  feeds,
  previews,
  open,
  onToggle,
}: {
  sessionKey: string | null;
  leftName: string;
  rightName: string;
  marketTitle: string;
  eventLabel: string;
  feeds: BroadcastFeeds;
  previews: BroadcastPreviewUrls;
  open: boolean;
  onToggle: () => void;
}) {
  const [selectedView, setSelectedView] = useState<BroadcastViewKey>("god");
  const [playingView, setPlayingView] = useState<BroadcastViewKey | null>(null);
  const [browserHost, setBrowserHost] = useState("aoe2war.com");
  const attachedFeeds = useMemo<BroadcastFeeds>(
    () => ({
      left: isExplicitlyAttachedBroadcastFeed(feeds.left, sessionKey)
        ? feeds.left
        : null,
      god: isExplicitlyAttachedBroadcastFeed(feeds.god, sessionKey)
        ? feeds.god
        : null,
      right: isExplicitlyAttachedBroadcastFeed(feeds.right, sessionKey)
        ? feeds.right
        : null,
    }),
    [feeds, sessionKey],
  );
  const leftPreviewUrl =
    previews.left ||
    (sameBroadcastSource(attachedFeeds.left, attachedFeeds.god)
      ? previews.god
      : null);
  const rightPreviewUrl =
    previews.right ||
    (sameBroadcastSource(attachedFeeds.right, attachedFeeds.god)
      ? previews.god
      : null);
  const views = useMemo(
    () => [
      {
        key: "left" as const,
        label: safePlayerName(leftName, "Player 1"),
        eyebrow: "Player cam",
        tone: "warm" as const,
        feed: attachedFeeds.left,
        previewUrl: leftPreviewUrl,
      },
      {
        key: "god" as const,
        label: "Battle Cam",
        eyebrow: "Observer",
        tone: "gold" as const,
        feed: attachedFeeds.god,
        previewUrl: previews.god,
      },
      {
        key: "right" as const,
        label: safePlayerName(rightName, "Player 2"),
        eyebrow: "Player cam",
        tone: "cool" as const,
        feed: attachedFeeds.right,
        previewUrl: rightPreviewUrl,
      },
    ],
    [
      attachedFeeds,
      leftName,
      leftPreviewUrl,
      previews.god,
      rightName,
      rightPreviewUrl,
    ],
  );
  const availableViews = useMemo(
    () => views.filter((view) => Boolean(view.feed)),
    [views],
  );
  const defaultView = useMemo(
    () =>
      availableViews.find(broadcastViewHasNativePlayback) ||
      availableViews.find((view) => view.key === "god") ||
      availableViews[0] ||
      views[1] ||
      views[0],
    [availableViews, views],
  );
  const activeView =
    availableViews.find((view) => view.key === selectedView) || defaultView;
  const activeViewShouldAutoplay = broadcastViewHasNativePlayback(activeView);
  const hasAttachedFeed = availableViews.length > 0;
  const feedStatusLabel = hasAttachedFeed
    ? `${providerLabel(defaultView.feed)} feed available`
    : "Standby";

  useEffect(() => {
    setBrowserHost(window.location.hostname || "aoe2war.com");
  }, []);

  useEffect(() => {
    setSelectedView(defaultView.key);
    setPlayingView(null);
  }, [defaultView.key, marketTitle, leftName, rightName]);

  const handleBattleCamTileClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    const element = target instanceof HTMLElement ? target : null;
    const interactive = element?.closest(
      "button,a,input,select,textarea,video,iframe,[role='button']",
    );
    if (interactive && interactive !== event.currentTarget) return;
    onToggle();
  };

  const handleBattleCamTileKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    const element = target instanceof HTMLElement ? target : null;
    const interactive = element?.closest(
      "button,a,input,select,textarea,video,iframe,[role='button']",
    );
    if (interactive && interactive !== event.currentTarget) return;
    event.preventDefault();
    onToggle();
  };

  if (!open) {
    return (
      <section
        role="button"
        tabIndex={0}
        aria-label="Open Battle Cam"
        onClick={handleBattleCamTileClick}
        onKeyDown={handleBattleCamTileKeyDown}
        data-testid="broadcast-hero-tile"
        data-battle-cam-state="closed"
        className={`${shellClass()} cursor-pointer select-none overflow-hidden border-amber-200/[0.07] bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.09),transparent_28%),linear-gradient(180deg,rgba(13,20,36,0.96),rgba(8,13,24,0.96))] px-3 py-3 sm:px-4`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
              <Monitor
                className="h-5 w-5 text-amber-100/70"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  Battle Cam
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] ${
                    hasAttachedFeed
                      ? "border-emerald-200/14 bg-emerald-400/[0.08] text-emerald-100"
                      : "border-white/[0.07] bg-white/[0.035] text-slate-400"
                  }`}
                >
                  {feedStatusLabel}
                </span>
              </div>
            </div>
          </div>

        </div>
      </section>
    );
  }

  return (
    <section
      id="battle-cam-panel"
      role="button"
      tabIndex={0}
      aria-label="Close Battle Cam"
      onClick={handleBattleCamTileClick}
      onKeyDown={handleBattleCamTileKeyDown}
      data-testid="broadcast-hero-tile"
      data-battle-cam-state="open"
      className={`${shellClass()} cursor-pointer select-none overflow-hidden border-amber-200/10 bg-[radial-gradient(circle_at_14%_0%,rgba(251,191,36,0.14),transparent_30%),radial-gradient(circle_at_86%_14%,rgba(56,189,248,0.11),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.48))] p-4 sm:p-5 lg:p-6`}
    >
      <div className="flex flex-wrap items-start justify-end gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="hidden max-w-[14rem] truncate rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300 sm:block sm:max-w-[22rem]">
            {marketTitle}
          </span>
        </div>
      </div>

      {hasAttachedFeed ? (
        <>
          {availableViews.length > 1 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {availableViews.map((view) => (
                <BroadcastPreviewButton
                  key={view.key}
                  label={view.label}
                  eyebrow={view.eyebrow}
                  tone={view.tone}
                  feed={view.feed}
                  previewUrl={view.previewUrl}
                  selected={activeView.key === view.key}
                  onSelect={() => {
                    setSelectedView(view.key);
                    setPlayingView(null);
                  }}
                />
              ))}
            </div>
          ) : null}

          <BroadcastPlaceholderFrame
            label={activeView.label}
            eyebrow={activeView.eyebrow}
            tone={activeView.tone}
            feed={activeView.feed}
            previewUrl={activeView.previewUrl}
            browserHost={browserHost}
            marketTitle={marketTitle}
            isPlaying={
              activeViewShouldAutoplay || playingView === activeView.key
            }
            onPlay={() => setPlayingView(activeView.key)}
          />
        </>
      ) : (
        <BattleCamStandbyFrame
          eventLabel={eventLabel}
          marketTitle={marketTitle}
        />
      )}
    </section>
  );
}

function BattleCamStandbyFrame({
  eventLabel,
  marketTitle,
}: {
  eventLabel: string;
  marketTitle: string;
}) {
  return (
    <div
      data-testid="battle-cam-standby-loop"
      className="mt-4 overflow-hidden rounded-[1.45rem] border border-white/[0.06] bg-slate-950/78 p-2.5 sm:p-3"
    >
      <div className="relative aspect-video max-h-[30rem] min-h-[12rem] overflow-hidden rounded-[1.2rem] bg-black/70 sm:min-h-[16rem]">
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-45 saturate-[0.65]"
          src={battleLoopForSeed(`${eventLabel}:${marketTitle}`)}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.34),rgba(2,6,23,0.82))]" />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_11px)]" />

        <div className="relative z-10 flex h-full min-h-[12rem] flex-col items-center justify-center px-6 py-10 text-center sm:min-h-[16rem]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.09] bg-black/30 backdrop-blur-sm">
            <Monitor className="h-7 w-7 text-amber-100/75" aria-hidden="true" />
          </span>
          <div className="mt-5 text-[10px] uppercase tracking-[0.34em] text-amber-100/65"></div>
          <div className="mt-2 text-xl font-semibold text-white sm:text-2xl"></div>
          <div className="mt-2 max-w-xl text-sm leading-6 text-slate-300"></div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <span>{eventLabel}</span>
        <span className="max-w-full truncate">{marketTitle}</span>
      </div>
    </div>
  );
}

function BroadcastPreviewButton({
  label,
  eyebrow,
  tone,
  feed,
  previewUrl,
  selected,
  onSelect,
}: {
  label: string;
  eyebrow: string;
  tone: "warm" | "gold" | "cool";
  feed: BroadcastFeed | null;
  previewUrl: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group min-w-0 overflow-hidden rounded-[1.05rem] border p-1.5 text-left transition sm:rounded-[1.2rem] sm:p-2 ${
        selected
          ? "border-amber-100/45 bg-amber-300/10 shadow-[0_0_30px_rgba(251,191,36,0.10)]"
          : "border-white/[0.06] bg-white/[0.035] hover:border-white/14 hover:bg-white/[0.055]"
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-[0.85rem] border border-white/[0.06] bg-slate-950/80 sm:rounded-[0.95rem]">
        <BroadcastSignalSurface
          tone={tone}
          feed={feed}
          previewUrl={previewUrl}
          compact
        />
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[9px] uppercase tracking-[0.18em] text-slate-500 sm:text-[10px] sm:tracking-[0.22em]">
          {feed ? providerLabel(feed) : eyebrow}
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-white sm:text-sm">
          {label}
        </div>
      </div>
    </button>
  );
}

function BroadcastPlaceholderFrame({
  label,
  eyebrow,
  tone,
  feed,
  previewUrl,
  browserHost,
  marketTitle,
  isPlaying,
  onPlay,
}: {
  label: string;
  eyebrow: string;
  tone: "warm" | "gold" | "cool";
  feed: BroadcastFeed | null;
  previewUrl: string | null;
  browserHost: string;
  marketTitle: string;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-[1.45rem] border border-white/[0.08] bg-slate-950/78 p-2.5 sm:p-3">
      <div className="relative aspect-video min-h-[12rem] overflow-hidden rounded-[1.2rem] border border-white/[0.06] bg-black/55 sm:min-h-[15rem]">
        <BroadcastSignalSurface
          tone={tone}
          feed={feed}
          previewUrl={previewUrl}
          browserHost={browserHost}
          isPlaying={isPlaying}
          onPlay={onPlay}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            {feed ? providerLabel(feed) : eyebrow}
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
            {label}
          </div>
        </div>
        <div className="flex max-w-full min-w-0 items-center gap-2">
          {feed ? (
            <a
              href={feed.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 max-w-full overflow-hidden flex items-center gap-2 rounded-full border border-emerald-200/12 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/16 sm:max-w-[24rem]"
            >
              <Play
                className="h-3.5 w-3.5 text-emerald-100"
                aria-hidden="true"
              />
              <span className="truncate">
                {providerLabel(feed)} feed · {feed.label}
              </span>
            </a>
          ) : (
            <div className="min-w-0 max-w-full overflow-hidden flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 sm:max-w-[24rem]">
              <Play className="h-3.5 w-3.5 text-amber-100" aria-hidden="true" />
              <span className="truncate">Placeholder feed · {marketTitle}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BroadcastSignalSurface({
  tone,
  feed,
  previewUrl,
  browserHost,
  compact = false,
  isPlaying = false,
  onPlay,
}: {
  tone: "warm" | "gold" | "cool";
  feed?: BroadcastFeed | null;
  previewUrl?: string | null;
  browserHost?: string;
  compact?: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
}) {
  const [loopReady, setLoopReady] = useState(false);
  const [loopFailed, setLoopFailed] = useState(false);
  const embedSrc = isPlaying
    ? buildBroadcastEmbedSrc(feed, browserHost || "aoe2war.com", {
        compact,
        autoplay: true,
      })
    : null;
  const hasPreviewLoop = Boolean(previewUrl) && !loopFailed;
  const hasLoop = hasPreviewLoop && !isPlaying;
  const hasEmbeddableFeed = Boolean(
    feed?.canEmbed && feed.embedId && !hasPreviewLoop,
  );
  const hasExternalFeed = Boolean(
    feed && !hasEmbeddableFeed && !hasPreviewLoop,
  );
  const glowClassName =
    tone === "warm"
      ? "from-amber-300/24 via-orange-500/12 to-transparent"
      : tone === "cool"
        ? "from-sky-300/22 via-cyan-500/12 to-transparent"
        : "from-emerald-300/20 via-amber-300/12 to-transparent";

  useEffect(() => {
    setLoopReady(false);
    setLoopFailed(false);
  }, [previewUrl, isPlaying]);

  if (
    feed?.provider === "aoe2war" ||
    feed?.sourceType === "browser" ||
    feed?.sourceType === "watcher_native"
  ) {
    const nativePlaybackUrl = feed.id
      ? `/api/streams/${feed.id}/rolling-webm`
      : feed.playbackUrl;

    return (
      <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-none border-0 bg-black shadow-none">
        {nativePlaybackUrl ? (
          <video
            key={`${feed.id || feed.playbackUrl || "native"}-${feed.latestChunkSeq ?? "live"}`}
            className="h-full w-full object-contain"
            src={nativePlaybackUrl}
            poster={previewUrl || feed.thumbnailUrl || undefined}
            muted
            autoPlay
            controls={!compact}
            playsInline
            preload="auto"
          />
        ) : (
          <LiveStreamFrame
            stream={feed}
            title={feed.title || feed.label}
            compact={compact}
            fallbackLabel="Live"
            className="h-full w-full min-h-0 rounded-none border-0 shadow-none"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative isolate flex h-full min-h-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.18),transparent_32%),radial-gradient(circle_at_72%_42%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,#020617,#050816_48%,#0f172a)]">
      {hasLoop ? (
        <video
          key={previewUrl}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            loopReady ? "opacity-100" : "opacity-0"
          }`}
          src={previewUrl || undefined}
          muted
          autoPlay
          loop
          playsInline
          preload={compact ? "metadata" : "auto"}
          onLoadedData={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onCanPlay={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onError={() => {
            setLoopReady(false);
            setLoopFailed(true);
          }}
        />
      ) : null}

      {embedSrc ? (
        <BattleLoopPreview
          seed={feed?.id ?? previewUrl ?? embedSrc ?? "bets-broadcast-loop"}
          className={`absolute inset-0 z-20 h-full w-full rounded-none border-0 ${
            compact ? "pointer-events-none" : ""
          }`}
          label="AoE2WAR battle loop"
        />
      ) : null}

      {!embedSrc ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.055),transparent_36%,rgba(255,255,255,0.035))]" />
          <div
            className={`pointer-events-none absolute inset-x-[-15%] top-[-30%] h-[76%] rounded-full bg-gradient-to-b ${glowClassName} blur-3xl`}
          />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_12px)] opacity-50" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-black/24" />
        </>
      ) : null}

      <div
        className={`pointer-events-none absolute left-3 top-3 z-30 items-center gap-2 sm:left-4 sm:top-4 ${
          embedSrc ? "hidden" : "flex"
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-30" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
        {compact ? null : (
          <span className="text-[9px] uppercase tracking-[0.18em] text-white/52 sm:text-[10px] sm:tracking-[0.22em]">
            {feed ? `${providerLabel(feed)} feed` : "No stream wired"}
          </span>
        )}
      </div>

      {!embedSrc && !compact && hasEmbeddableFeed ? (
        <button
          type="button"
          onClick={onPlay}
          className="absolute left-1/2 top-1/2 z-40 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md transition duration-200 hover:scale-105 hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label={`Play ${feed?.label || "Broadcast feed"}`}
        >
          <span className="ml-1 block h-0 w-0 border-y-[16px] border-l-[25px] border-y-transparent border-l-white" />
        </button>
      ) : null}

      {!embedSrc && !compact && hasExternalFeed ? (
        <a
          href={feed?.url}
          target="_blank"
          rel="noreferrer"
          className="absolute left-1/2 top-1/2 z-40 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md transition duration-200 hover:scale-105 hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label={`Open ${feed?.label || "Broadcast feed"}`}
        >
          <span className="ml-1 block h-0 w-0 border-y-[16px] border-l-[25px] border-y-transparent border-l-white" />
        </a>
      ) : null}

      {!embedSrc && (!hasLoop || !loopReady) ? (
        <div className="relative z-10 flex flex-col items-center gap-3 text-white/70">
          <Monitor
            className={`${compact ? "h-7 w-7 sm:h-8 sm:w-8" : "h-14 w-14"} text-white/70`}
            aria-hidden="true"
          />
          {feed && !compact && !hasEmbeddableFeed ? (
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">
              External feed saved
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StakeAmountRail({
  activeSelection,
  canEdit,
  maxStakeWolo,
  onStakeChange,
}: {
  activeSelection: SelectionState | null;
  canEdit: boolean;
  maxStakeWolo: number;
  onStakeChange: (stake: number) => void;
}) {
  const generatedInputId = useId();
  const stakeInputId = `bet-stake-${generatedInputId.replace(/:/g, "")}`;
  const [customDraft, setCustomDraft] = useState("");
  const stakeError = activeSelection
    ? validateStakeAmount(activeSelection.stake, maxStakeWolo)
    : null;

  const hasActiveSelection = Boolean(activeSelection);

  useEffect(() => {
    if (!hasActiveSelection) {
      setCustomDraft("");
      return;
    }

    // New side / new market selection should feel clean.
    // Keep the suggested stake highlighted via the pills,
    // but do not jam it into the custom input automatically.
    setCustomDraft("");
  }, [hasActiveSelection, activeSelection?.marketId, activeSelection?.side]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STAKE_OPTIONS.map((stake) => (
            <button
              key={stake}
              type="button"
              onClick={() => {
                if (!activeSelection) return;
                setCustomDraft(String(stake));
                onStakeChange(stake);
              }}
              disabled={!activeSelection || !canEdit}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm transition ${
                activeSelection?.stake === stake
                  ? edgeButton("gold")
                  : edgeButton("glass")
              } ${!activeSelection || !canEdit ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {stake}
            </button>
          ))}
          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Custom
          </span>
        </div>

        <div className="flex min-w-[11rem] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 transition focus-within:border-amber-200/30 focus-within:bg-white/[0.065]">
          <input
            id={stakeInputId}
            inputMode="numeric"
            pattern="[0-9]*"
            value={activeSelection ? customDraft : ""}
            onChange={(event) => {
              if (!activeSelection) return;
              const digits = event.target.value
                .replace(/[^0-9]/g, "")
                .slice(0, 6);
              setCustomDraft(digits);
              onStakeChange(digits ? Number.parseInt(digits, 10) : 0);
            }}
            disabled={!activeSelection || !canEdit}
            className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
            placeholder="Amount"
          />
          <label
            htmlFor={stakeInputId}
            className="cursor-text select-none text-[11px] uppercase tracking-[0.2em] text-slate-500"
          >
            WOLO
          </label>
        </div>
      </div>

      {activeSelection ? (
        <div
          className={`mt-3 text-xs ${stakeError ? "text-rose-200" : "text-slate-400"}`}
        >
          {stakeError ||
            `Up to ${maxStakeWolo.toLocaleString()} WOLO with the current wallet/app limit.`}
        </div>
      ) : null}
    </>
  );
}

function DesyncTicketLeg({
  market,
  activeSelection,
  canEdit,
  workingKey,
  maxStakeWolo,
  projectedReturn,
  onSideChange,
  onStakeChange,
  onClear,
}: {
  market: BetBoardMarket;
  activeSelection: SelectionState | null;
  canEdit: boolean;
  workingKey: string | null;
  maxStakeWolo: number;
  projectedReturn: number;
  onSideChange: (side: BetSide | null) => void;
  onStakeChange: (stake: number) => void;
  onClear: (marketId: number) => void;
}) {
  const generatedInputId = useId();
  const inputId = `bet-desync-stake-${generatedInputId.replace(/:/g, "")}`;
  const desyncSelection =
    activeSelection?.desync?.marketId === market.id
      ? activeSelection.desync
      : null;
  const [draft, setDraft] = useState("");
  const draftSelectionKey = desyncSelection
    ? `${desyncSelection.marketId}:${desyncSelection.side}`
    : "none";
  const lastDraftSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastDraftSelectionKeyRef.current === draftSelectionKey) return;
    lastDraftSelectionKeyRef.current = draftSelectionKey;
    setDraft(desyncSelection ? String(desyncSelection.stake) : "");
  }, [desyncSelection, draftSelectionKey]);

  const remainingLimit = Math.max(
    0,
    maxStakeWolo - (activeSelection?.stake ?? 0),
  );
  const lockedSide = market.viewerWager?.side ?? null;
  const onchainLocked = isOnchainViewerWager(market.viewerWager);
  const clearing = workingKey === `clear-${market.id}`;

  return (
    <section className="mt-5 rounded-[1.3rem] border border-cyan-200/[0.09] bg-[linear-gradient(135deg,rgba(8,47,73,0.18),rgba(2,6,23,0.22))] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-100/70">
              3 · Optional Desync call
            </span>
            <span className="rounded-full border border-emerald-200/15 bg-emerald-400/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100">
              Same wallet signature
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Add NO or YES inside this match ticket. It keeps its own truth and
            payout, while both legs move in one WOLO transaction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {market.viewerWager ? (
            onchainLocked ? (
              <span className="rounded-full border border-cyan-200/15 bg-cyan-300/[0.07] px-3 py-1.5 text-xs text-cyan-100">
                Desync escrow locked
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onClear(market.id)}
                disabled={clearing || !canEdit}
                className={`rounded-full px-3 py-1.5 text-xs transition ${edgeButton("glass")} ${
                  clearing || !canEdit ? "cursor-not-allowed opacity-60" : ""
                }`}
              >
                {clearing ? "Clearing Desync..." : "Clear Desync slip"}
              </button>
            )
          ) : null}
          <button
            type="button"
            onClick={() => onSideChange(null)}
            disabled={!desyncSelection || !canEdit}
            className={`rounded-full px-3 py-1.5 text-xs transition ${edgeButton("glass")} ${
              !desyncSelection || !canEdit ? "cursor-not-allowed opacity-45" : ""
            }`}
          >
            Remove Desync from ticket
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] lg:items-end">
        <div className="grid grid-cols-2 gap-2">
          {(["left", "right"] as const).map((side) => {
            const sideLabel =
              side === "left" ? market.left.name : market.right.name;
            const isSelected = desyncSelection?.side === side;
            const isBlocked = Boolean(lockedSide && lockedSide !== side);
            return (
              <button
                key={side}
                type="button"
                onClick={() => onSideChange(side)}
                disabled={!activeSelection || !canEdit || isBlocked}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isSelected
                    ? side === "right"
                      ? "border-rose-200/25 bg-rose-400/[0.12] text-white shadow-[0_10px_28px_rgba(244,63,94,0.10)]"
                      : "border-emerald-200/25 bg-emerald-400/[0.10] text-white shadow-[0_10px_28px_rgba(16,185,129,0.09)]"
                    : "border-white/[0.06] bg-slate-950/25 text-slate-300 hover:border-white/[0.12] hover:bg-white/[0.045]"
                } ${!activeSelection || !canEdit || isBlocked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="block text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Desync
                </span>
                <span className="mt-1 block text-lg font-semibold">
                  {sideLabel}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {side === "right"
                    ? "A confirmed desync occurs"
                    : "Human NO or a cleared review window"}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition focus-within:border-cyan-200/30 focus-within:bg-white/[0.065]">
            <input
              id={inputId}
              inputMode="numeric"
              pattern="[0-9]*"
              value={desyncSelection ? draft : ""}
              onChange={(event) => {
                if (!desyncSelection) return;
                const digits = event.target.value
                  .replace(/[^0-9]/g, "")
                  .slice(0, 6);
                setDraft(digits);
                onStakeChange(digits ? Number.parseInt(digits, 10) : 0);
              }}
              disabled={!desyncSelection || !canEdit}
              className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
              placeholder="Amount"
            />
            <label
              htmlFor={inputId}
              className="cursor-text select-none text-[11px] uppercase tracking-[0.2em] text-slate-500"
            >
              WOLO
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>
              Remaining ticket limit {remainingLimit.toLocaleString()}
            </span>
            <span>
              {desyncSelection
                ? `If ${desyncSelection.side === "left" ? market.left.name : market.right.name}: ${formatCompact(projectedReturn)} WOLO`
                : "Optional"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstrumentStakeRail({
  activeSelection,
  canEdit,
  onStakeChange,
}: {
  activeSelection: SelectionState | null;
  canEdit: boolean;
  onStakeChange: (stake: number) => void;
}) {
  const generatedInputId = useId();
  const inputId =
    `bet-instrument-${generatedInputId.replace(/:/g, "")}`;

  const [customDraft, setCustomDraft] =
    useState("");

  const selectionKey =
    activeSelection
      ? `${activeSelection.marketId}:${activeSelection.side}`
      : "none";

  useEffect(() => {
    setCustomDraft("");
  }, [selectionKey]);

  return (
    <div
      className="
        flex min-w-0 flex-1
        flex-wrap items-center gap-1.5
      "
      aria-label="Stake amount"
    >
      {STAKE_OPTIONS.map((stake) => (
        <button
          key={stake}
          type="button"
          onClick={() => {
            if (!activeSelection) return;

            setCustomDraft(
              String(stake),
            );

            onStakeChange(stake);
          }}
          disabled={
            !activeSelection ||
            !canEdit
          }
          aria-pressed={
            activeSelection?.stake ===
            stake
          }
          className={`
            inline-flex h-9 min-w-10
            items-center justify-center
            rounded-full px-3
            text-xs font-semibold
            transition
            ${
              activeSelection?.stake ===
              stake
                ? edgeButton("gold")
                : edgeButton("glass")
            }
            ${
              !activeSelection ||
              !canEdit
                ? "cursor-not-allowed opacity-40"
                : ""
            }
          `}
        >
          {stake}
        </button>
      ))}

      <div
        className="
          flex h-9 min-w-[8.75rem]
          items-center
          rounded-full
          border border-white/[0.07]
          bg-white/[0.025]
          px-3
          transition
          focus-within:border-amber-200/25
          focus-within:bg-white/[0.045]
        "
      >
        <input
          id={inputId}
          inputMode="numeric"
          pattern="[0-9]*"
          value={
            activeSelection
              ? customDraft
              : ""
          }
          onChange={(event) => {
            if (!activeSelection) {
              return;
            }

            const digits =
              event.target.value
                .replace(/[^0-9]/g, "")
                .slice(0, 6);

            setCustomDraft(digits);

            onStakeChange(
              digits
                ? Number.parseInt(
                    digits,
                    10,
                  )
                : 0,
            );
          }}
          disabled={
            !activeSelection ||
            !canEdit
          }
          placeholder="Custom"
          aria-label="Custom WOLO stake"
          className="
            min-w-0 flex-1
            bg-transparent
            text-right text-xs
            text-white outline-none
            placeholder:text-slate-600
            disabled:cursor-not-allowed
          "
        />

        <label
          htmlFor={inputId}
          className="
            ml-2 cursor-text
            text-[9px]
            font-black uppercase
            tracking-[0.18em]
            text-slate-600
          "
        >
          W
        </label>
      </div>
    </div>
  );
}


function InstrumentDesyncControl({
  market,
  activeSelection,
  canEdit,
  workingKey,
  maxStakeWolo,
  projectedReturn,
  onSideChange,
  onStakeChange,
  onClear,
}: {
  market: BetBoardMarket;
  activeSelection: SelectionState | null;
  canEdit: boolean;
  workingKey: string | null;
  maxStakeWolo: number;
  projectedReturn: number;
  onSideChange: (
    side: BetSide | null,
  ) => void;
  onStakeChange: (
    stake: number,
  ) => void;
  onClear: (
    marketId: number,
  ) => void;
}) {
  const generatedInputId = useId();
  const inputId =
    `bet-instrument-desync-${generatedInputId.replace(/:/g, "")}`;

  const selection =
    activeSelection?.desync
      ?.marketId === market.id
      ? activeSelection.desync
      : null;

  const [draft, setDraft] =
    useState("");

  const selectionKey =
    selection
      ? `${selection.marketId}:${selection.side}`
      : "none";

  const selectionStake =
    selection?.stake ?? null;

  useEffect(() => {
    setDraft(
      selectionStake === null
        ? ""
        : String(selectionStake),
    );
  }, [selectionKey, selectionStake]);

  const lockedSide =
    market.viewerWager?.side ??
    null;

  const onchainLocked =
    isOnchainViewerWager(
      market.viewerWager,
    );

  const clearing =
    workingKey ===
    `clear-${market.id}`;

  const remainingLimit =
    Math.max(
      0,
      maxStakeWolo -
        (activeSelection?.stake ?? 0),
    );

  return (
    <div
      className="
        flex min-w-0
        items-center gap-1.5
      "
      aria-label="Desync market"
    >
      <span
        className="
          grid h-9 w-9
          shrink-0 place-items-center
          rounded-full
          border border-cyan-200/[0.08]
          bg-cyan-300/[0.025]
          text-sm text-cyan-100/55
        "
        title="Optional Desync market"
        aria-hidden="true"
      >
        ↻
      </span>

      {(["left", "right"] as const)
        .map((side) => {
          const selected =
            selection?.side === side;

          const blocked =
            Boolean(
              lockedSide &&
                lockedSide !== side,
            );

          return (
            <button
              key={side}
              type="button"
              onClick={() =>
                onSideChange(side)
              }
              disabled={
                !activeSelection ||
                !canEdit ||
                blocked
              }
              aria-pressed={selected}
              title={
                side === "left"
                  ? "No Desync"
                  : "Desync"
              }
              className={`
                h-9 rounded-full
                px-3 text-[10px]
                font-black
                tracking-[0.12em]
                transition
                ${
                  selected
                    ? side === "right"
                      ? "border border-rose-200/25 bg-rose-400/[0.12] text-rose-100"
                      : "border border-emerald-200/25 bg-emerald-400/[0.10] text-emerald-100"
                    : "border border-white/[0.07] bg-white/[0.025] text-slate-500 hover:bg-white/[0.05] hover:text-white"
                }
                ${
                  !activeSelection ||
                  !canEdit ||
                  blocked
                    ? "cursor-not-allowed opacity-40"
                    : ""
                }
              `}
            >
              {side === "left"
                ? "NO"
                : "YES"}
            </button>
          );
        })}

      {selection ? (
        <>
          <div
            className="
              flex h-9 min-w-[6.5rem]
              items-center
              rounded-full
              border border-white/[0.07]
              bg-white/[0.025]
              px-3
            "
          >
            <input
              id={inputId}
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft}
              onChange={(event) => {
                const digits =
                  event.target.value
                    .replace(
                      /[^0-9]/g,
                      "",
                    )
                    .slice(0, 6);

                setDraft(digits);

                onStakeChange(
                  digits
                    ? Number.parseInt(
                        digits,
                        10,
                      )
                    : 0,
                );
              }}
              disabled={!canEdit}
              placeholder="0"
              aria-label="Desync WOLO stake"
              className="
                min-w-0 flex-1
                bg-transparent
                text-right text-xs
                text-white outline-none
              "
            />

            <label
              htmlFor={inputId}
              className="
                ml-1 text-[9px]
                uppercase
                tracking-[0.15em]
                text-slate-600
              "
            >
              W
            </label>
          </div>

          <span
            className="
              hidden text-[10px]
              text-slate-600
              xl:inline
            "
            title={`Remaining ticket limit ${remainingLimit.toLocaleString()} WOLO`}
          >
            ↗
            {formatCompact(
              projectedReturn,
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              if (
                market.viewerWager &&
                !onchainLocked
              ) {
                onClear(market.id);
                return;
              }

              onSideChange(null);
            }}
            disabled={
              clearing ||
              !canEdit ||
              onchainLocked
            }
            aria-label="Remove Desync"
            title="Remove Desync"
            className="
              grid h-9 w-9
              place-items-center
              rounded-full
              border border-white/[0.06]
              bg-white/[0.02]
              text-sm text-slate-600
              transition
              hover:bg-white/[0.05]
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-30
            "
          >
            ×
          </button>
        </>
      ) : null}
    </div>
  );
}


function BetSlipComposer({
  market,
  desyncMarket,
  activeSelection,
  canEdit,
  maxStakeWolo,
  projectedReturn,
  statusCopy,
  stakeError,
  lockLabel,
  workingKey,
  onchainLocked,
  onStakeChange,
  onDesyncSideChange,
  onDesyncStakeChange,
  desyncProjectedReturn,
  onLock,
  onClear,
  density,
}: {
  market: BetBoardMarket;
  desyncMarket?: BetBoardMarket | null;
  activeSelection: SelectionState | null;
  canEdit: boolean;
  maxStakeWolo: number;
  projectedReturn: number;
  statusCopy: string;
  stakeError: string | null;
  lockLabel: string;
  workingKey: string | null;
  onchainLocked: boolean;
  onStakeChange: (stake: number) => void;
  onDesyncSideChange?: (side: BetSide | null) => void;
  onDesyncStakeChange?: (stake: number) => void;
  desyncProjectedReturn?: number;
  onLock: () => void;
  onClear: (marketId: number) => void;
  density:
    | "compact"
    | "spacious"
    | "instrument";
}) {
  const selectedSide =
    activeSelection?.side ?? market.viewerWager?.side ?? null;

  const selectedName =
    selectedSide === "left"
      ? market.left.name
      : selectedSide === "right"
        ? market.right.name
        : null;

  if (density === "instrument") {
    return (
      <section
        data-testid="bets-e4-instrument"
        aria-label="Betting controls"
        className="
          mt-6
          border-y border-white/[0.055]
          bg-black/[0.12]
          px-2 py-3
          sm:px-3
        "
      >
        <div
          className="
            flex min-w-0
            flex-col gap-2.5
            xl:flex-row
            xl:items-center
          "
        >
          <InstrumentStakeRail
            activeSelection={
              activeSelection
            }
            canEdit={canEdit}
            onStakeChange={
              onStakeChange
            }
          />

          {desyncMarket &&
          onDesyncSideChange &&
          onDesyncStakeChange ? (
            <>
              <span
                className="
                  hidden h-6 w-px
                  shrink-0
                  bg-white/[0.065]
                  xl:block
                "
              />

              <InstrumentDesyncControl
                market={
                  desyncMarket
                }
                activeSelection={
                  activeSelection
                }
                canEdit={canEdit}
                workingKey={
                  workingKey
                }
                maxStakeWolo={
                  maxStakeWolo
                }
                projectedReturn={
                  desyncProjectedReturn ??
                  0
                }
                onSideChange={
                  onDesyncSideChange
                }
                onStakeChange={
                  onDesyncStakeChange
                }
                onClear={onClear}
              />
            </>
          ) : null}

          <span
            className="
              hidden h-6 w-px
              shrink-0
              bg-white/[0.065]
              xl:block
            "
          />

          <div
            className="
              flex shrink-0
              items-center gap-2
            "
          >
            <div
              className="
                flex h-9 min-w-[6.5rem]
                items-center justify-center
                rounded-full
                border border-white/[0.06]
                bg-white/[0.02]
                px-3
                text-xs
                text-slate-400
              "
              title="Projected return"
            >
              {activeSelection ? (
                <>
                  <span
                    className="
                      mr-1 text-emerald-300/70
                    "
                  >
                    ↗
                  </span>

                  <span
                    className="
                      font-semibold
                      text-white
                    "
                  >
                    {formatCompact(
                      projectedReturn,
                    )}
                  </span>

                  <span
                    className="
                      ml-1 text-[9px]
                      text-slate-600
                    "
                  >
                    W
                  </span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>

            {market.viewerWager &&
            !onchainLocked ? (
              <button
                type="button"
                onClick={() =>
                  onClear(market.id)
                }
                disabled={
                  workingKey ===
                  `clear-${market.id}`
                }
                aria-label="Clear wager"
                title="Clear wager"
                className="
                  grid h-9 w-9
                  place-items-center
                  rounded-full
                  border border-white/[0.06]
                  bg-white/[0.02]
                  text-sm text-slate-600
                  transition
                  hover:bg-white/[0.05]
                  hover:text-white
                "
              >
                ×
              </button>
            ) : null}

            <button
              type="button"
              onClick={onLock}
              title={
                stakeError ||
                statusCopy
              }
              disabled={
                !activeSelection ||
                Boolean(stakeError) ||
                !canEdit ||
                workingKey ===
                  `lock-${market.id}`
              }
              className={`
                inline-flex h-10
                min-w-[8.5rem]
                items-center
                justify-center
                rounded-full
                px-5
                text-xs
                font-bold
                transition
                ${edgeButton("gold")}
                ${
                  !activeSelection ||
                  Boolean(stakeError) ||
                  !canEdit ||
                  workingKey ===
                    `lock-${market.id}`
                    ? "opacity-45"
                    : ""
                }
              `}
            >
              {workingKey ===
              `lock-${market.id}`
                ? "…"
                : lockLabel}
            </button>
          </div>
        </div>

        {stakeError ? (
          <div
            className="
              mt-2 text-[11px]
              text-rose-200
            "
          >
            {stakeError}
          </div>
        ) : null}
      </section>
    );
  }

  const shellClassName =
    density === "spacious"
      ? "mt-7 rounded-[1.7rem] bg-black/[0.18] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ring-1 ring-white/[0.055] sm:px-6"
      : `${insetClass()} mt-5 px-5 py-5`;

  return (
    <section className={shellClassName}>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                2 · Choose amount
              </div>

              <div className="mt-1 text-sm leading-5 text-slate-300">
                {selectedName
                  ? `Backing ${selectedName}`
                  : "Choose a side above to activate the WOLO slip."}
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Max {maxStakeWolo.toLocaleString()} WOLO
            </div>
          </div>

          <div className="mt-4">
            <StakeAmountRail
              activeSelection={activeSelection}
              canEdit={canEdit}
              maxStakeWolo={maxStakeWolo}
              onStakeChange={onStakeChange}
            />
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-white/[0.055] bg-slate-950/35 px-4 py-4 lg:text-right">
          <div
            className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500"
            title="Projected book return if the selected side wins."
          >
            Projected return
          </div>

          <div className="mt-2 break-words text-xl font-semibold text-white [overflow-wrap:anywhere]">
            {activeSelection
              ? `${formatCompact(projectedReturn)} WOLO`
              : "Choose a side"}
          </div>
        </div>
      </div>

      {desyncMarket && onDesyncSideChange && onDesyncStakeChange ? (
        <DesyncTicketLeg
          market={desyncMarket}
          activeSelection={activeSelection}
          canEdit={canEdit}
          workingKey={workingKey}
          maxStakeWolo={maxStakeWolo}
          projectedReturn={desyncProjectedReturn ?? 0}
          onSideChange={onDesyncSideChange}
          onStakeChange={onDesyncStakeChange}
          onClear={onClear}
        />
      ) : null}

      <div className="mt-5 flex flex-col gap-4 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={`min-w-0 break-words text-sm leading-5 [overflow-wrap:anywhere] ${
            stakeError ? "text-rose-200" : "text-slate-400"
          }`}
        >
          {stakeError || statusCopy}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {market.viewerWager && !onchainLocked ? (
            <button
              type="button"
              onClick={() => onClear(market.id)}
              disabled={workingKey === `clear-${market.id}`}
              className={`inline-flex min-w-[6rem] cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm transition ${edgeButton(
                "glass",
              )} ${workingKey === `clear-${market.id}` ? "opacity-60" : ""}`}
            >
              {workingKey === `clear-${market.id}` ? "Clearing..." : "Clear"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onLock}
            disabled={
              !activeSelection ||
              Boolean(stakeError) ||
              !canEdit ||
              workingKey === `lock-${market.id}`
            }
            className={`inline-flex min-w-[11rem] cursor-pointer items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${edgeButton(
              "gold",
            )} ${
              !activeSelection ||
              Boolean(stakeError) ||
              !canEdit ||
              workingKey === `lock-${market.id}`
                ? "opacity-60"
                : ""
            }`}
          >
            {lockLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function FounderControlRail({
  market,
  isAdmin,
  onOpenFounderBonus,
}: {
  market: BetBoardMarket;
  isAdmin: boolean;
  onOpenFounderBonus: (
    market: BetBoardMarket,
    bonusType: FounderBonusType,
  ) => void;
}) {
  if (!isAdmin || market.marketType === DESYNC_SIDE_MARKET_TYPE) {
    return null;
  }

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-[1.25rem] border border-white/[0.055] bg-black/[0.13] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
          Founder controls
        </div>

        <div className="mt-1 text-xs leading-5 text-slate-400">
          Promotional funding is separate from the bettor&apos;s WOLO slip.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenFounderBonus(market, "participants")}
          className="cursor-pointer rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/18"
        >
          Founders Bonus · 2 each
        </button>

        <button
          type="button"
          onClick={() => onOpenFounderBonus(market, "winner")}
          className="cursor-pointer rounded-xl border border-sky-300/20 bg-sky-400/10 px-4 py-2.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/18"
        >
          Founders Win · 1,000
        </button>
      </div>
    </section>
  );
}

type ExtremeRosterSide = {
  key: BetSide;
  label: string;
  players: string[];
  side: BetBoardSide;
};

type ExtremeMarketRoster = {
  isBalancedTeamGame: boolean;
  teamSize: number;
  formatLabel: string;
  left: ExtremeRosterSide;
  right: ExtremeRosterSide;
  players: Array<{ name: string; side: BetSide }>;
};

function cleanRosterName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function splitRosterSideLabel(label: string | null | undefined) {
  return cleanRosterName(label)
    .split(/\s*\/\s*|\s+\+\s+/)
    .map(cleanRosterName)
    .filter(Boolean)
    .filter((value) => !/^\d+\s+more$/i.test(value));
}

function uniqueRosterNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const clean = cleanRosterName(name);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
}

function buildExtremeMarketRoster(market: BetBoardMarket): ExtremeMarketRoster {
  let leftPlayers = splitRosterSideLabel(market.left.name);
  let rightPlayers = splitRosterSideLabel(market.right.name);

  leftPlayers = uniqueRosterNames(
    leftPlayers.length ? leftPlayers : [market.left.name],
  );
  rightPlayers = uniqueRosterNames(
    rightPlayers.length ? rightPlayers : [market.right.name],
  );

  const teamSize = Math.max(leftPlayers.length, rightPlayers.length);
  const isBalancedTeamGame =
    teamSize >= 1 &&
    teamSize <= 4 &&
    leftPlayers.length === rightPlayers.length &&
    leftPlayers.length + rightPlayers.length >= 2;

  return {
    isBalancedTeamGame,
    teamSize,
    formatLabel: isBalancedTeamGame ? `${teamSize}v${teamSize}` : "1v1",
    left: {
      key: "left",
      label: "Team A",
      players: leftPlayers,
      side: market.left,
    },
    right: {
      key: "right",
      label: "Team B",
      players: rightPlayers,
      side: market.right,
    },
    players: [
      ...leftPlayers.map((name) => ({ name, side: "left" as BetSide })),
      ...rightPlayers.map((name) => ({ name, side: "right" as BetSide })),
    ],
  };
}

function ExtremeTeamPanel({
  roster,
  selected,
  disabled,
  tone,
  onSelect,
}: {
  roster: ExtremeRosterSide;
  selected: boolean;
  disabled: boolean;
  tone: "gold" | "blue";
  onSelect: () => void;
}) {
  const selectedClass =
    tone === "gold"
      ? "border-amber-200/[0.14] bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] shadow-[0_22px_60px_rgba(120,72,8,0.13)]"
      : "border-cyan-200/[0.12] bg-[radial-gradient(circle_at_100%_0%,rgba(56,189,248,0.10),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] shadow-[0_22px_60px_rgba(8,75,120,0.12)]";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-w-0 rounded-[1.75rem] border p-5 text-left transition sm:p-6 ${
        selected
          ? selectedClass
          : "border-white/[0.055] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] hover:border-white/[0.09] hover:bg-white/[0.04]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.32em] text-slate-500">
            Team pick
          </div>
          <div className="mt-2 break-words font-serif text-2xl leading-tight tracking-[-0.02em] text-[#fff6dc] [overflow-wrap:anywhere] sm:text-3xl">
            {roster.label}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-black/20 px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/[0.055]">
          {roster.side.crowdPercent}%
        </div>
      </div>

      <div className="mt-5 divide-y divide-white/[0.055] border-y border-white/[0.055]">
        {roster.players.map((player, index) => (
          <div
            key={`${roster.key}-${player}-${index}`}
            className="flex min-h-14 min-w-0 items-center gap-3 py-3.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.035] text-[10px] uppercase tracking-[0.08em] text-slate-500 ring-1 ring-white/[0.05]">
              {index + 1}
            </span>
            <span className="min-w-0 break-words text-base font-semibold leading-snug text-slate-100 [overflow-wrap:anywhere] sm:text-lg">
              {player}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {roster.side.slips} slip{roster.side.slips === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <CoinMark small />
          {formatExactWolo(roster.side.poolWolo)}
        </div>
      </div>
    </button>
  );
}

function ExtremePlayerChips({
  roster,
  disabled,
  selectedSide,
  onSelect,
}: {
  roster: ExtremeMarketRoster;
  disabled: boolean;
  selectedSide: BetSide | null;
  onSelect: (side: BetSide) => void;
}) {
  return (
    <div className="mt-8 border-t border-white/[0.055] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Player pick
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Player pick backs that player&apos;s team.
          </div>
        </div>
        <div className="rounded-full bg-white/[0.035] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400 ring-1 ring-white/[0.05]">
          Team-settled
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {roster.players.map((player) => (
          <button
            key={`${player.side}-${player.name}`}
            type="button"
            onClick={() => onSelect(player.side)}
            disabled={disabled}
            className={`flex min-h-12 min-w-0 items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
              selectedSide === player.side
                ? "border-amber-200/[0.14] bg-amber-400/[0.065] text-white shadow-[0_12px_28px_rgba(120,72,8,0.10)]"
                : "border-white/[0.05] bg-slate-950/20 text-slate-300 hover:border-white/[0.09] hover:bg-white/[0.035] hover:text-white"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <span className="min-w-0 break-words text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
              {player.name}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              {player.side === "left" ? "A" : "B"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketFeature({
  market,
  desyncMarket = null,
  eyebrowLabel = "Featured Market",
  detailMode = "advanced",
  exchangePresentation = "panel",
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAuthenticated,
  isAdmin,
  loadingAuth,
  maxStakeWolo,
  onSelect,
  onStakeChange,
  onDesyncSideChange,
  onDesyncStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
}: {
  market: BetBoardMarket;
  desyncMarket?: BetBoardMarket | null;
  eyebrowLabel?: string;
  detailMode?:
    | "basic"
    | "advanced"
    | "extreme"
    | "exchange";
  exchangePresentation?:
    | "panel"
    | "cinematic"
    | "instrument";
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loadingAuth: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (stake: number) => void;
  onDesyncSideChange?: (side: BetSide | null) => void;
  onDesyncStakeChange?: (stake: number) => void;
  onLock: () => void;
  onClear: (marketId: number) => void;
  onOpenFounderBonus: (
    market: BetBoardMarket,
    bonusType: FounderBonusType,
  ) => void;
}) {
  const activeSelection =
    selection && selection.marketId === market.id ? selection : null;
  const marketWorkflow =
    lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager)
    ? market.viewerWager
    : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip =
    market.bettingOpen &&
    !marketWorkflow;
  const lockedSide = market.viewerWager?.side ?? null;
  const displaySide = activeSelection?.side ?? lockedSide;
  const displaySelectedPool = displaySide
    ? displaySide === "left"
      ? market.left.poolWolo
      : market.right.poolWolo
    : 0;
  const displayOppositePool = displaySide
    ? displaySide === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(
        activeSelection.stake,
        displaySelectedPool,
        displayOppositePool,
      )
    : market.viewerWager && displaySide
      ? projectReturn(
          market.viewerWager.amountWolo,
          Math.max(0, displaySelectedPool - market.viewerWager.amountWolo),
          displayOppositePool,
        )
      : 0;
  const activeDesyncSelection =
    activeSelection?.desync &&
    desyncMarket?.id === activeSelection.desync.marketId
      ? activeSelection.desync
      : null;
  const desyncSelectedPool = activeDesyncSelection
    ? activeDesyncSelection.side === "left"
      ? (desyncMarket?.left.poolWolo ?? 0)
      : (desyncMarket?.right.poolWolo ?? 0)
    : 0;
  const desyncOppositePool = activeDesyncSelection
    ? activeDesyncSelection.side === "left"
      ? (desyncMarket?.right.poolWolo ?? 0)
      : (desyncMarket?.left.poolWolo ?? 0)
    : 0;
  const desyncProjectedReturn = activeDesyncSelection
    ? projectReturn(
        activeDesyncSelection.stake,
        desyncSelectedPool,
        desyncOppositePool,
      )
    : 0;
  const statusCopy = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Keplr — no WOLO moves until you approve the stake."
      : marketWorkflow.phase === "confirming_chain"
        ? "Stake submitted. Waiting for chain confirmation."
        : `Escrow confirmed${marketWorkflow.stakeTxHash ? ` · ${shortTxHash(marketWorkflow.stakeTxHash)}` : ""}. Recording slip...`
    : !market.bettingOpen
      ? market.viewerWager
        ? "Pre-game betting is closed. Your existing slip remains active."
        : "Pre-game betting is closed."
      : activeSelection
      ? activeDesyncSelection && desyncMarket
        ? `One ticket: ${activeSelection.stake} WOLO on ${activeSelection.side === "left" ? market.left.name : market.right.name} + ${activeDesyncSelection.stake} WOLO on Desync ${activeDesyncSelection.side === "left" ? desyncMarket.left.name : desyncMarket.right.name}`
        : `Adding ${activeSelection.stake} WOLO to ${activeSelection.side === "left" ? market.left.name : market.right.name}`
      : market.viewerWager
        ? `On ${market.viewerWager.side === "left" ? market.left.name : market.right.name} for ${market.viewerWager.amountWolo} WOLO across ${market.viewerWager.slipCount} slips${onchainViewerWager?.stakeTxHash ? ` · ${shortTxHash(onchainViewerWager.stakeTxHash)}` : ""}`
        : isAuthenticated
          ? "Pick a side"
          : loadingAuth
            ? "Loading"
            : "Steam sign-in required";
  const stakeError = activeSelection
    ? validateStakeAmount(activeSelection.stake, maxStakeWolo) ||
      (activeDesyncSelection
        ? validateStakeAmount(activeDesyncSelection.stake, maxStakeWolo) ||
          validateStakeAmount(
            activeSelection.stake + activeDesyncSelection.stake,
            maxStakeWolo,
          )
        : null)
    : null;
  const ticketTotalWolo = activeSelection
    ? activeSelection.stake + (activeDesyncSelection?.stake ?? 0)
    : 0;
  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Confirming Chain..."
        : "Recording Slip..."
    : !market.bettingOpen
      ? "Pre-game closed"
      : activeSelection
      ? activeDesyncSelection
        ? `Lock ${ticketTotalWolo} WOLO · 1 signature`
        : `Lock ${activeSelection.stake} WOLO`
      : market.viewerWager
        ? "Add WOLO"
        : "Lock WOLO";
  const extremeRoster = buildExtremeMarketRoster(market);
  const marketHistoryHref = buildBetMarketHistoryHref(market.id);
  const gameStatsHref = buildBetGameStatsHref(market);
  const gameStatsLabel = market.status === "live" ? "Live Stats" : "Game Stats";

  if (
    detailMode === "exchange" &&
    market.marketType !== DESYNC_SIDE_MARKET_TYPE
  ) {
    const isTeamGame =
      extremeRoster.isBalancedTeamGame &&
      extremeRoster.teamSize > 1;

    const cinematicExchange =
      exchangePresentation !==
      "panel";

    const instrumentExchange =
      exchangePresentation ===
      "instrument";

    return (
      <div
        data-testid="bets-e2-market"
        className={`relative ${
          cinematicExchange
            ? "isolate overflow-hidden"
            : ""
        }`}
      >
        {cinematicExchange ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/2 bg-[radial-gradient(ellipse_at_8%_36%,rgba(14,165,233,0.12),transparent_62%)]" />
            <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(ellipse_at_92%_36%,rgba(245,158,11,0.11),transparent_62%)]" />
            <div className="pointer-events-none absolute left-1/2 top-24 -z-10 h-72 w-px bg-gradient-to-b from-transparent via-amber-100/15 to-transparent" />
          </>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.26em] text-slate-500">
              {market.battleNumber ? (
                <span className="text-cyan-100/70">
                  Battle #
                  {market.battleNumber.toLocaleString()}
                </span>
              ) : null}

              <span>
                {market.status === "live"
                  ? "Watcher live"
                  : "Book open"}
              </span>

              {isTeamGame ? (
                <span>
                  {extremeRoster.formatLabel}
                </span>
              ) : null}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {market.eventLabel}
            </div>
          </div>

          <MarketStatusPill
            market={market}
          />
        </div>

        <div
          className={`mt-6 grid min-w-0 gap-4 ${
            isTeamGame
              ? "lg:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]"
          } lg:items-stretch xl:gap-6`}
        >
          {isTeamGame ? (
            <ExtremeTeamPanel
              roster={extremeRoster.left}
              selected={
                displaySide === "left"
              }
              disabled={
                !canEditSlip ||
                Boolean(
                  lockedSide &&
                    lockedSide !== "left",
                )
              }
              tone="blue"
              onSelect={() =>
                onSelect(market, "left")
              }
            />
          ) : (
            <SideChoice
              side={market.left}
              selected={
                displaySide === "left"
              }
              emphasis="cool"
              variant={
                cinematicExchange
                  ? "exchange"
                  : "card"
              }
              disabled={
                !canEditSlip ||
                Boolean(
                  lockedSide &&
                    lockedSide !== "left",
                )
              }
              onSelect={() =>
                onSelect(market, "left")
              }
            />
          )}

          <div className={
              cinematicExchange
                ? "order-first relative flex min-h-[13rem] min-w-0 flex-col items-center justify-center overflow-visible px-2 py-7 text-center lg:order-none sm:min-h-[15rem]"
                : "order-first flex min-h-44 min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.8rem] bg-[radial-gradient(circle_at_50%_28%,rgba(251,191,36,0.10),transparent_44%),rgba(2,6,23,0.20)] px-5 py-7 text-center ring-1 ring-white/[0.045] lg:order-none"
            }>
            <div className={
                cinematicExchange
                  ? "font-serif text-7xl leading-none tracking-[-0.08em] text-[#fff4d0] drop-shadow-[0_0_34px_rgba(251,191,36,0.22)] sm:text-8xl"
                  : "font-serif text-5xl leading-none text-[#fff4d0] drop-shadow-[0_0_28px_rgba(251,191,36,0.16)]"
              }>
              VS
            </div>

            <div className="mt-5 text-[8px] font-black uppercase tracking-[0.28em] text-slate-600">
              Total pot
            </div>

            <div className="mt-2 flex items-center gap-2 text-xl font-semibold text-white">
              <CoinMark />
              {formatExactWolo(
                market.totalPotWolo,
              )}
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.055]">
              <div className="flex h-full w-full">
                <span
                  className="bg-gradient-to-r from-sky-500 to-cyan-300"
                  style={{
                    width:
                      `${market.left.crowdPercent}%`,
                  }}
                />
                <span
                  className="bg-gradient-to-r from-amber-300 to-amber-500"
                  style={{
                    width:
                      `${market.right.crowdPercent}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-2 text-[10px] text-slate-500">
              {market.left.crowdPercent}%
              {" · "}
              {market.right.crowdPercent}%
            </div>
          </div>

          {isTeamGame ? (
            <ExtremeTeamPanel
              roster={extremeRoster.right}
              selected={
                displaySide === "right"
              }
              disabled={
                !canEditSlip ||
                Boolean(
                  lockedSide &&
                    lockedSide !== "right",
                )
              }
              tone="gold"
              onSelect={() =>
                onSelect(market, "right")
              }
            />
          ) : (
            <SideChoice
              side={market.right}
              selected={
                displaySide === "right"
              }
              emphasis="warm"
              variant={
                cinematicExchange
                  ? "exchange"
                  : "card"
              }
              disabled={
                !canEditSlip ||
                Boolean(
                  lockedSide &&
                    lockedSide !== "right",
                )
              }
              onSelect={() =>
                onSelect(market, "right")
              }
            />
          )}
        </div>

        {isTeamGame ? (
          <ExtremePlayerChips
            roster={extremeRoster}
            disabled={
              !canEditSlip ||
              Boolean(lockedSide)
            }
            selectedSide={displaySide}
            onSelect={(side) =>
              onSelect(market, side)
            }
          />
        ) : null}

        <div className="mt-7 border-t border-white/[0.055] pt-6">
          <BetSlipComposer
            market={market}
            desyncMarket={desyncMarket}
            activeSelection={
              activeSelection
            }
            canEdit={canEditSlip}
            maxStakeWolo={
              maxStakeWolo
            }
            projectedReturn={
              projectedReturn
            }
            statusCopy={statusCopy}
            stakeError={stakeError}
            lockLabel={lockLabel}
            workingKey={workingKey}
            onchainLocked={
              onchainLocked
            }
            onStakeChange={
              onStakeChange
            }
            onDesyncSideChange={
              onDesyncSideChange
            }
            onDesyncStakeChange={
              onDesyncStakeChange
            }
            desyncProjectedReturn={
              desyncProjectedReturn
            }
            onLock={onLock}
            onClear={onClear}
            density={
              instrumentExchange
                ? "instrument"
                : "compact"
            }
          />
        </div>

        <div className="mt-7 border-t border-white/[0.045] pt-5">
          <WarTape
            rows={market.warTape}
            emptyLabel="No battle tape yet."
          />
        </div>
      </div>
    );
  }

  if (
    detailMode === "extreme" &&
    market.marketType !== DESYNC_SIDE_MARKET_TYPE &&
    extremeRoster.isBalancedTeamGame
  ) {
    return (
      <div className="relative">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 xl:max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              {market.battleNumber ? (
                <span className="rounded-full border border-cyan-200/[0.14] bg-cyan-300/[0.08] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100">
                  Battle #{market.battleNumber.toLocaleString()}
                </span>
              ) : null}
              <span className="rounded-full border border-amber-200/[0.11] bg-amber-400/[0.075] px-2.5 py-1 text-[10px] uppercase tracking-[0.28em] text-amber-100">
                {extremeRoster.formatLabel}
              </span>
              <span className="rounded-full border border-emerald-200/[0.10] bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-emerald-100">
                Live team book
              </span>
            </div>

            <div className="mt-5 text-[11px] uppercase tracking-[0.35em] text-slate-500">
              {eyebrowLabel}
            </div>
            {marketHistoryHref ? (
              <Link
                href={marketHistoryHref}
                className="mt-2 inline-flex font-serif text-3xl leading-[1.05] tracking-[-0.025em] text-[#fff6dc] transition hover:text-amber-100 sm:text-4xl"
              >
                Choose the winning side.
              </Link>
            ) : (
              <h2 className="mt-2 font-serif text-3xl leading-[1.05] tracking-[-0.025em] text-[#fff6dc] sm:text-4xl">
                Choose the winning side.
              </h2>
            )}
            <div className="mt-3 max-w-3xl break-words text-sm leading-6 text-slate-400 [overflow-wrap:anywhere] sm:text-base">
              {market.eventLabel}
            </div>
            <FounderBonusChips bonuses={market.founderBonuses} variant="full" />
            <MarketTimingRail market={market} nowMs={nowMs} />
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {marketHistoryHref ? (
              <Link
                href={marketHistoryHref}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${edgeButton("glass")}`}
              >
                Market History
              </Link>
            ) : null}
            {gameStatsHref ? (
              <Link
                href={gameStatsHref}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${edgeButton("glass")}`}
              >
                {gameStatsLabel}
              </Link>
            ) : null}
            <MarketStatusPill market={market} />
          </div>
        </div>

        <div className="mt-8 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
          1 · Choose side
        </div>

        <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)] lg:items-stretch xl:gap-6">
          <ExtremeTeamPanel
            roster={extremeRoster.left}
            selected={displaySide === "left"}
            disabled={
              !canEditSlip || Boolean(lockedSide && lockedSide !== "left")
            }
            tone="gold"
            onSelect={() => onSelect(market, "left")}
          />

          <div className="order-none flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_50%_24%,rgba(251,191,36,0.07),transparent_42%),rgba(2,6,23,0.22)] px-5 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ring-1 ring-white/[0.045]">
            <div
              className="text-[11px] uppercase tracking-[0.3em] text-slate-500"
              title="Total WOLO already sitting in the book."
            >
              Pot
            </div>
            <div className="mt-3 flex min-w-0 max-w-full items-center justify-center gap-2 text-3xl font-semibold text-white">
              <CoinMark />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {formatExactWolo(market.totalPotWolo)}
              </span>
            </div>
            <div className="mt-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="flex h-1.5 w-full">
                <span
                  className="h-full bg-gradient-to-r from-amber-300 to-amber-500"
                  style={{ width: `${market.left.crowdPercent}%` }}
                />
                <span
                  className="h-full bg-gradient-to-r from-sky-500 to-cyan-300"
                  style={{ width: `${market.right.crowdPercent}%` }}
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {market.left.crowdPercent}% · {market.right.crowdPercent}%
            </div>
            <div className="mt-5 font-serif text-4xl text-[#fff6dc]">VS</div>
            <div className="mt-4 max-w-full text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Your pick
            </div>
            <div className="mt-1 max-w-full break-words text-sm font-semibold text-white [overflow-wrap:anywhere]">
              {displaySide
                ? displaySide === "left"
                  ? extremeRoster.left.label
                  : extremeRoster.right.label
                : "Choose a team"}
            </div>
          </div>

          <ExtremeTeamPanel
            roster={extremeRoster.right}
            selected={displaySide === "right"}
            disabled={
              !canEditSlip || Boolean(lockedSide && lockedSide !== "right")
            }
            tone="blue"
            onSelect={() => onSelect(market, "right")}
          />
        </div>

        <ExtremePlayerChips
          roster={extremeRoster}
          disabled={!canEditSlip || Boolean(lockedSide)}
          selectedSide={displaySide}
          onSelect={(side) => onSelect(market, side)}
        />

        <BetSlipComposer
          market={market}
          desyncMarket={desyncMarket}
          activeSelection={activeSelection}
          canEdit={canEditSlip}
          maxStakeWolo={maxStakeWolo}
          projectedReturn={projectedReturn}
          statusCopy={statusCopy}
          stakeError={stakeError}
          lockLabel={lockLabel}
          workingKey={workingKey}
          onchainLocked={onchainLocked}
          onStakeChange={onStakeChange}
          onDesyncSideChange={onDesyncSideChange}
          onDesyncStakeChange={onDesyncStakeChange}
          desyncProjectedReturn={desyncProjectedReturn}
          onLock={onLock}
          onClear={onClear}
          density="spacious"
        />

        <FounderControlRail
          market={market}
          isAdmin={isAdmin}
          onOpenFounderBonus={onOpenFounderBonus}
        />

        <WarTape rows={market.warTape} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-slate-500">
            <span>{eyebrowLabel}</span>
            {market.battleNumber ? (
              <span className="rounded-full border border-cyan-200/[0.12] bg-cyan-300/[0.07] px-2 py-0.5 text-[9px] font-black tracking-[0.2em] text-cyan-100">
                Battle #{market.battleNumber.toLocaleString()}
              </span>
            ) : null}
          </div>
          {marketHistoryHref ? (
            <Link
              href={marketHistoryHref}
              className="mt-2 inline-flex text-3xl font-semibold tracking-[-0.04em] text-white transition hover:text-amber-100 sm:text-4xl"
            >
              {market.title}
            </Link>
          ) : (
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              {market.title}
            </h2>
          )}
          <div className="mt-2 text-sm text-slate-400">{market.eventLabel}</div>
          {market.marketType !== DESYNC_SIDE_MARKET_TYPE ? (
            <FounderBonusChips
              bonuses={market.founderBonuses}
              variant={detailMode === "basic" ? "micro" : "full"}
            />
          ) : (
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/55">
                Nested Desync proposition · human-confirmed incident truth
              </div>
              <div className="mt-1.5 text-xs leading-5 text-slate-400">
                YES settles on confirmed desync · NO on a human correction or
                after the final-result review window
              </div>
            </div>
          )}
          <MarketTimingRail market={market} nowMs={nowMs} />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:pt-0.5">
          {marketHistoryHref ? (
            <Link
              href={marketHistoryHref}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${edgeButton("glass")}`}
            >
              Market History
            </Link>
          ) : null}
          {gameStatsHref ? (
            <Link
              href={gameStatsHref}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${edgeButton("glass")}`}
            >
              {gameStatsLabel}
            </Link>
          ) : null}
          <MarketStatusPill market={market} />
        </div>
      </div>

      <div className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
        1 · Choose side
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <SideChoice
          side={market.left}
          selected={displaySide === "left"}
          emphasis="warm"
          disabled={
            !canEditSlip || Boolean(lockedSide && lockedSide !== "left")
          }
          onSelect={() => onSelect(market, "left")}
        />

        <div className={`${insetClass()} px-5 py-5 text-center`}>
          <div
            className="text-[11px] uppercase tracking-[0.3em] text-slate-500"
            title="Total WOLO already sitting in the book."
          >
            Pot
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-3xl font-semibold text-white">
            <CoinMark />
            <span>{formatExactWolo(market.totalPotWolo)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {market.left.crowdPercent}% / {market.right.crowdPercent}%
          </div>
        </div>

        <SideChoice
          side={market.right}
          selected={displaySide === "right"}
          emphasis="cool"
          disabled={
            !canEditSlip || Boolean(lockedSide && lockedSide !== "right")
          }
          onSelect={() => onSelect(market, "right")}
        />
      </div>

      <BetSlipComposer
        market={market}
        desyncMarket={desyncMarket}
        activeSelection={activeSelection}
        canEdit={canEditSlip}
        maxStakeWolo={maxStakeWolo}
        projectedReturn={projectedReturn}
        statusCopy={statusCopy}
        stakeError={stakeError}
        lockLabel={lockLabel}
        workingKey={workingKey}
        onchainLocked={onchainLocked}
        onStakeChange={onStakeChange}
        onDesyncSideChange={onDesyncSideChange}
        onDesyncStakeChange={onDesyncStakeChange}
        desyncProjectedReturn={desyncProjectedReturn}
        onLock={onLock}
        onClear={onClear}
        density="compact"
      />

      <FounderControlRail
        market={market}
        isAdmin={isAdmin}
        onOpenFounderBonus={onOpenFounderBonus}
      />

      {detailMode === "advanced" ? <WarTape rows={market.warTape} /> : null}
    </div>
  );
}

function MarketCard({
  market,
  desyncMarket = null,
  detailMode = "advanced",
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAdmin,
  maxStakeWolo,
  onSelect,
  onDesyncSideChange,
  onDesyncStakeChange,
  onStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
  accent,
}: {
  market: BetBoardMarket;
  desyncMarket?: BetBoardMarket | null;
  detailMode?: "basic" | "advanced" | "extreme";
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAdmin: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onDesyncSideChange?: (side: BetSide | null) => void;
  onDesyncStakeChange?: (stake: number) => void;
  onStakeChange: (stake: number) => void;
  onLock: () => void;
  onClear: (marketId: number) => void;
  onOpenFounderBonus: (
    market: BetBoardMarket,
    bonusType: FounderBonusType,
  ) => void;
  accent: "warm" | "cool";
}) {
  const activeSelection =
    selection && selection.marketId === market.id ? selection : null;
  const marketWorkflow =
    lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager)
    ? market.viewerWager
    : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip =
    market.bettingOpen &&
    !marketWorkflow;
  const lockedSide = market.viewerWager?.side ?? null;
  const displaySide = activeSelection?.side ?? lockedSide;
  const displaySelectedPool = displaySide
    ? displaySide === "left"
      ? market.left.poolWolo
      : market.right.poolWolo
    : 0;
  const displayOppositePool = displaySide
    ? displaySide === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(
        activeSelection.stake,
        displaySelectedPool,
        displayOppositePool,
      )
    : market.viewerWager && displaySide
      ? projectReturn(
          market.viewerWager.amountWolo,
          Math.max(0, displaySelectedPool - market.viewerWager.amountWolo),
          displayOppositePool,
        )
      : 0;
  const activeDesyncSelection =
    activeSelection?.desync &&
    desyncMarket?.id === activeSelection.desync.marketId
      ? activeSelection.desync
      : null;
  const desyncSelectedPool = activeDesyncSelection
    ? activeDesyncSelection.side === "left"
      ? (desyncMarket?.left.poolWolo ?? 0)
      : (desyncMarket?.right.poolWolo ?? 0)
    : 0;
  const desyncOppositePool = activeDesyncSelection
    ? activeDesyncSelection.side === "left"
      ? (desyncMarket?.right.poolWolo ?? 0)
      : (desyncMarket?.left.poolWolo ?? 0)
    : 0;
  const desyncProjectedReturn = activeDesyncSelection
    ? projectReturn(
        activeDesyncSelection.stake,
        desyncSelectedPool,
        desyncOppositePool,
      )
    : 0;
  const stakeError = activeSelection
    ? validateStakeAmount(activeSelection.stake, maxStakeWolo) ||
      (activeDesyncSelection
        ? validateStakeAmount(activeDesyncSelection.stake, maxStakeWolo) ||
          validateStakeAmount(
            activeSelection.stake + activeDesyncSelection.stake,
            maxStakeWolo,
          )
        : null)
    : null;

  const statusCopy = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Keplr — no WOLO moves until you approve."
      : marketWorkflow.phase === "confirming_chain"
        ? "Stake submitted. Waiting for chain confirmation."
        : "Escrow confirmed. Recording the slip."
    : !market.bettingOpen
      ? market.viewerWager
        ? "Pre-game betting is closed. Your existing slip remains active."
        : "Pre-game betting is closed."
      : activeSelection
      ? activeDesyncSelection && desyncMarket
        ? `One ticket: ${activeSelection.stake} WOLO on ${activeSelection.side === "left" ? market.left.name : market.right.name} + ${activeDesyncSelection.stake} WOLO on Desync ${activeDesyncSelection.side === "left" ? desyncMarket.left.name : desyncMarket.right.name}`
        : `Backing ${
            activeSelection.side === "left" ? market.left.name : market.right.name
          } for ${activeSelection.stake} WOLO`
      : market.viewerWager
        ? `Already backing ${
            market.viewerWager.side === "left"
              ? market.left.name
              : market.right.name
          } for ${market.viewerWager.amountWolo} WOLO`
        : "Choose a side to activate the WOLO slip.";

  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Chain..."
        : "Saving..."
    : !market.bettingOpen
      ? "Pre-game closed"
      : activeSelection
      ? activeDesyncSelection
        ? `Lock ${activeSelection.stake + activeDesyncSelection.stake} WOLO · 1 signature`
        : `Lock ${activeSelection.stake} WOLO`
      : market.viewerWager
        ? "Add WOLO"
        : "Lock WOLO";
  const extremeRoster = buildExtremeMarketRoster(market);
  const isExtremeTeamMarket =
    detailMode === "extreme" && extremeRoster.isBalancedTeamGame;
  const marketHistoryHref = buildBetMarketHistoryHref(market.id);
  const gameStatsHref = buildBetGameStatsHref(market);
  const gameStatsLabel = market.status === "live" ? "Live Stats" : "Game Stats";

  return (
    <article
      className={
        isExtremeTeamMarket
          ? "min-w-0 max-w-full overflow-hidden rounded-[1.9rem] border border-white/[0.05] bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.055),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(56,189,248,0.05),transparent_30%),rgba(2,6,23,0.18)] p-5 shadow-[0_22px_60px_rgba(2,6,23,0.24)] sm:p-7"
          : `${cardClass()} overflow-hidden p-5 sm:p-6`
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 sm:pr-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500 break-words">
            {market.eventLabel}
          </div>
          {market.battleNumber ? (
            <div className="mt-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
              Battle #{market.battleNumber.toLocaleString()}
            </div>
          ) : null}
          {isExtremeTeamMarket ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {marketHistoryHref ? (
                <Link
                  href={marketHistoryHref}
                  className="font-serif text-2xl text-[#fff6dc] transition hover:text-amber-100 sm:text-3xl"
                >
                  Team A <span className="mx-1 text-slate-600">vs</span> Team B
                </Link>
              ) : (
                <div className="font-serif text-2xl text-[#fff6dc] sm:text-3xl">
                  Team A <span className="mx-1 text-slate-600">vs</span> Team B
                </div>
              )}
              <span className="rounded-full border border-amber-200/[0.10] bg-amber-400/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-amber-100">
                {extremeRoster.formatLabel}
              </span>
            </div>
          ) : marketHistoryHref ? (
            <Link
              href={marketHistoryHref}
              className="mt-2 inline-flex text-[1.65rem] font-semibold leading-[1.05] text-white transition hover:text-amber-100"
            >
              {market.title}
            </Link>
          ) : (
            <div className="mt-2 text-[1.65rem] font-semibold leading-[1.05] text-white break-words">
              {market.title}
            </div>
          )}
          <FounderBonusChips
            bonuses={market.founderBonuses}
            compact
            variant={detailMode === "basic" ? "micro" : "full"}
          />
          <MarketTimingRail market={market} nowMs={nowMs} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <MarketStatusPill market={market} />
          {marketHistoryHref ? (
            <Link
              href={marketHistoryHref}
              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] transition ${edgeButton("glass")}`}
            >
              Market History
            </Link>
          ) : null}
          {gameStatsHref ? (
            <Link
              href={gameStatsHref}
              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] transition ${edgeButton("glass")}`}
            >
              {gameStatsLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <div
        className={
          isExtremeTeamMarket
            ? "mt-5 border-y border-white/[0.05] py-4"
            : `${insetClass()} mt-4 px-4 py-3`
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
              Pot
            </div>
            <div className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
              <CoinMark small />
              <span>{formatExactWolo(market.totalPotWolo)} WOLO</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{market.left.crowdPercent}% left</div>
            <div>{market.right.crowdPercent}% right</div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
        1 · Choose side
      </div>

      {isExtremeTeamMarket ? (
        <>
          <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
            <ExtremeTeamPanel
              roster={extremeRoster.left}
              selected={displaySide === "left"}
              disabled={
                !canEditSlip || Boolean(lockedSide && lockedSide !== "left")
              }
              tone="gold"
              onSelect={() => onSelect(market, "left")}
            />
            <ExtremeTeamPanel
              roster={extremeRoster.right}
              selected={displaySide === "right"}
              disabled={
                !canEditSlip || Boolean(lockedSide && lockedSide !== "right")
              }
              tone="blue"
              onSelect={() => onSelect(market, "right")}
            />
          </div>
          <ExtremePlayerChips
            roster={extremeRoster}
            disabled={!canEditSlip || Boolean(lockedSide)}
            selectedSide={displaySide}
            onSelect={(side) => onSelect(market, side)}
          />
        </>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SideMiniChoice
            side={market.left}
            selected={displaySide === "left"}
            emphasis={accent === "warm" ? "warm" : "cool"}
            disabled={
              !canEditSlip || Boolean(lockedSide && lockedSide !== "left")
            }
            onSelect={() => onSelect(market, "left")}
          />
          <SideMiniChoice
            side={market.right}
            selected={displaySide === "right"}
            emphasis={accent === "warm" ? "cool" : "warm"}
            disabled={
              !canEditSlip || Boolean(lockedSide && lockedSide !== "right")
            }
            onSelect={() => onSelect(market, "right")}
          />
        </div>
      )}

      <BetSlipComposer
        market={market}
        desyncMarket={desyncMarket}
        activeSelection={activeSelection}
        canEdit={canEditSlip}
        maxStakeWolo={maxStakeWolo}
        projectedReturn={projectedReturn}
        statusCopy={statusCopy}
        stakeError={stakeError}
        lockLabel={lockLabel}
        workingKey={workingKey}
        onchainLocked={onchainLocked}
        onStakeChange={onStakeChange}
        onDesyncSideChange={onDesyncSideChange}
        onDesyncStakeChange={onDesyncStakeChange}
        desyncProjectedReturn={desyncProjectedReturn}
        onLock={onLock}
        onClear={onClear}
        density={isExtremeTeamMarket ? "spacious" : "compact"}
      />

      <FounderControlRail
        market={market}
        isAdmin={isAdmin}
        onOpenFounderBonus={onOpenFounderBonus}
      />

      {detailMode === "advanced" ? (
        <WarTape rows={market.warTape} emptyLabel="No tape rows yet." />
      ) : null}
    </article>
  );
}

function SideChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  variant = "card",
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  variant?: "card" | "exchange";
  onSelect: () => void;
}) {
  if (variant === "exchange") {
    const cool =
      emphasis === "cool";

    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className={`
          group relative
          min-h-[13rem]
          min-w-0
          overflow-hidden
          border-y
          px-6 py-7
          transition duration-300
          sm:min-h-[15rem]
          sm:px-8 sm:py-9
          ${
            cool
              ? "border-cyan-200/[0.10]"
              : "border-amber-200/[0.10]"
          }
          ${
            selected
              ? cool
                ? "bg-cyan-300/[0.055]"
                : "bg-amber-300/[0.055]"
              : "bg-white/[0.008] hover:bg-white/[0.022]"
          }
          ${
            disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer"
          }
        `}
      >
        <div
          className={`
            pointer-events-none
            absolute inset-0
            opacity-80
            transition duration-500
            group-hover:opacity-100
            ${
              cool
                ? "bg-[radial-gradient(circle_at_12%_48%,rgba(14,165,233,0.18),transparent_42%),linear-gradient(90deg,rgba(14,165,233,0.055),transparent_65%)]"
                : "bg-[radial-gradient(circle_at_88%_48%,rgba(245,158,11,0.17),transparent_42%),linear-gradient(270deg,rgba(245,158,11,0.05),transparent_65%)]"
            }
          `}
        />

        <div
          className={`
            pointer-events-none
            absolute top-0 h-px w-[72%]
            ${
              cool
                ? "left-0 bg-gradient-to-r from-cyan-200/45 to-transparent"
                : "right-0 bg-gradient-to-l from-amber-200/45 to-transparent"
            }
          `}
        />

        <div
          className={`
            relative z-10
            flex h-full min-w-0 flex-col
            justify-center
            ${
              cool
                ? "items-start text-left"
                : "items-end text-right"
            }
          `}
        >
          <div
            className={`
              text-[9px]
              font-black uppercase
              tracking-[0.34em]
              ${
                cool
                  ? "text-cyan-100/45"
                  : "text-amber-100/45"
              }
            `}
          >
            Pick
          </div>

          <div
            className="
              mt-3
              max-w-full
              break-words
              font-serif
              text-3xl
              leading-[0.96]
              tracking-[-0.035em]
              text-[#fff8e8]
              [overflow-wrap:anywhere]
              sm:text-4xl
              xl:text-5xl
            "
          >
            {side.name}
          </div>

          <div
            className={`
              mt-5
              text-5xl
              font-semibold
              tracking-[-0.06em]
              sm:text-6xl
              ${
                cool
                  ? "text-cyan-200"
                  : "text-amber-200"
              }
            `}
          >
            {side.crowdPercent}
            <span className="ml-1 text-xl opacity-50">
              %
            </span>
          </div>

          <div
            className={`
              mt-5
              flex flex-wrap
              items-center gap-4
              text-xs text-slate-400
              ${
                cool
                  ? "justify-start"
                  : "justify-end"
              }
            `}
          >
            <span className="flex items-center gap-2">
              <CoinMark small />
              {formatCompact(
                side.poolWolo,
              )}{" "}
              WOLO
            </span>

            <span className="text-slate-600">
              ·
            </span>

            <span>
              {side.slips} slips
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.45rem] border px-4 py-4 text-left transition ${sideSurface(
        selected,
        emphasis,
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Pick
          </div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-white">
            {side.name}
          </div>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-black/10 px-3 py-1 text-xs text-slate-200">
          {side.crowdPercent}%
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-200">
        <div className="flex items-center gap-2">
          <CoinMark small />
          <span>
            {formatCompact(
              side.poolWolo,
            )}
          </span>
        </div>
        <span>
          {side.slips} slips
        </span>
      </div>
    </button>
  );
}

function SideMiniChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.15rem] border px-3 py-3 text-left transition ${sideSurface(
        selected,
        emphasis,
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="min-h-[2.5rem] text-sm font-semibold leading-snug text-white break-words">
        {side.name}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>{side.crowdPercent}%</span>
        <span>{formatCompact(side.poolWolo)}</span>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardClass()} px-3 py-3 sm:px-4 sm:py-4`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:text-[11px] sm:tracking-[0.28em]">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold leading-tight tracking-tight text-white break-words sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function ExtremeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-white/[0.045] px-4 py-4 last:border-r-0 sm:border-b-0 sm:px-5 sm:py-5">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 min-w-0 break-words text-lg font-semibold leading-tight tracking-tight text-white [overflow-wrap:anywhere] sm:text-xl">
        {value}
      </div>
    </div>
  );
}

function HeatRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={`${cardClass()} px-4 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function LoadingMarket() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-32 rounded-full bg-white/10" />
      <div className="h-12 w-72 rounded-2xl bg-white/10" />
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
      </div>
      <div className="h-24 rounded-[1.4rem] bg-white/10" />
    </div>
  );
}

function LoadingCard() {
  return (
    <div className={`${cardClass()} h-[18rem] animate-pulse bg-white/[0.03]`} />
  );
}

function EmptyShell({ label }: { label: string }) {
  return (
    <div className={`${insetClass()} px-4 py-5 text-sm text-slate-300`}>
      {label}
    </div>
  );
}
