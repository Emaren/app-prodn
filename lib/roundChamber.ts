import type { PrismaClient } from "@/lib/generated/prisma";

export const ROUND_CHAMBER_GOVERNANCE_MODE =
  "app_civic_one_account_one_ballot" as const;

export const ROUND_CHAMBER_GOVERNANCE_NOTICE =
  "Round Chamber ballots are AoE2WAR civic signals: one signed Steam account, one ballot. They are not WoloChain x/gov votes, are not stake-weighted, and do not execute chain changes.";

export const ROUND_CHAMBER_CATEGORIES = [
  "kingdom",
  "chamber",
  "forge",
  "oracle",
  "battle",
  "economy",
  "community",
] as const;

export type RoundChamberCategory = (typeof ROUND_CHAMBER_CATEGORIES)[number];
export type RoundChamberChoice = "support" | "oppose";
export type RoundChamberStatus =
  | "open"
  | "adopted"
  | "declined"
  | "withdrawn"
  | "archived";

export type RoundChamberActor = {
  displayName: string;
  isAdmin: boolean;
};

export type RoundChamberComment = {
  id: number;
  body: string;
  createdAt: string;
  author: RoundChamberActor;
};

export type RoundChamberBallot = {
  choice: RoundChamberChoice;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  voter: RoundChamberActor;
};

export type RoundChamberEvent = {
  id: number;
  eventType: string;
  detail: string;
  createdAt: string;
  actor: RoundChamberActor | null;
};

export type RoundChamberProposal = {
  publicId: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  status: RoundChamberStatus;
  createdByLabel: string;
  createdAt: string;
  updatedAt: string;
  votingClosesAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  supportCount: number;
  opposeCount: number;
  ballotCount: number;
  supportPercent: number;
  viewerChoice: RoundChamberChoice | null;
  votingOpen: boolean;
  ballots: RoundChamberBallot[];
  commentCount: number;
  comments: RoundChamberComment[];
  events: RoundChamberEvent[];
};

export type RoundChamberSnapshot = {
  governanceMode: typeof ROUND_CHAMBER_GOVERNANCE_MODE;
  governanceNotice: string;
  generatedAt: string;
  viewer: {
    displayName: string;
    isAdmin: boolean;
    isSignedIn: boolean;
    steamLinked: boolean;
    canParticipate: boolean;
  } | null;
  totals: {
    proposals: number;
    openProposals: number;
    adoptedProposals: number;
    ballots: number;
    civicVoters: number;
    comments: number;
  };
  proposals: RoundChamberProposal[];
};

const USER_SELECT = {
  id: true,
  uid: true,
  isAdmin: true,
  steamId: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

type ChamberUser = {
  id: number;
  uid: string;
  isAdmin: boolean;
  steamId: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
};

export function roundChamberDisplayName(
  user: Pick<ChamberUser, "uid" | "inGameName" | "steamPersonaName">
) {
  return (
    user.inGameName?.trim() ||
    user.steamPersonaName?.trim() ||
    `Citizen ${user.uid.slice(-6)}`
  );
}

function toActor(
  user: Pick<ChamberUser, "uid" | "isAdmin" | "inGameName" | "steamPersonaName">
): RoundChamberActor {
  return {
    displayName: roundChamberDisplayName(user),
    isAdmin: user.isAdmin,
  };
}

function normalizeStatus(value: string): RoundChamberStatus {
  if (
    value === "adopted" ||
    value === "declined" ||
    value === "withdrawn" ||
    value === "archived"
  ) {
    return value;
  }
  return "open";
}

export function normalizeRoundChamberCategory(
  value: unknown
): RoundChamberCategory | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ROUND_CHAMBER_CATEGORIES.includes(
    normalized as RoundChamberCategory
  )
    ? (normalized as RoundChamberCategory)
    : null;
}

export function normalizeRoundChamberTitle(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

export function normalizeRoundChamberSummary(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

export function normalizeRoundChamberBody(value: unknown, limit = 6_000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, limit);
}

export function normalizeRoundChamberDecisionNote(value: unknown) {
  return normalizeRoundChamberBody(value, 1_500);
}

export function normalizeRoundChamberChoice(
  value: unknown
): RoundChamberChoice | null {
  return value === "support" || value === "oppose" ? value : null;
}

export function normalizeRoundChamberPublicId(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized
  )
    ? normalized
    : null;
}

export function parseRoundChamberFutureDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    return null;
  }
  return parsed;
}

export async function getRoundChamberViewer(
  prisma: PrismaClient,
  viewerUid: string | null | undefined
) {
  if (!viewerUid) return null;
  return prisma.user.findUnique({
    where: { uid: viewerUid },
    select: USER_SELECT,
  });
}

export async function getRoundChamberSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<RoundChamberSnapshot> {
  const [viewer, proposalRows] = await Promise.all([
    getRoundChamberViewer(prisma, viewerUid),
    prisma.roundProposal.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        votes: {
          orderBy: { updatedAt: "desc" },
          select: {
            userId: true,
            choice: true,
            reason: true,
            createdAt: true,
            updatedAt: true,
            user: { select: USER_SELECT },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: USER_SELECT },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 18,
          include: {
            actor: { select: USER_SELECT },
          },
        },
      },
    }),
  ]);

  const now = Date.now();
  const civicVoterIds = new Set<number>();

  const proposals = proposalRows
    .map((proposal): RoundChamberProposal => {
      const supportCount = proposal.votes.filter(
        (vote) => vote.choice === "support"
      ).length;
      const opposeCount = proposal.votes.filter(
        (vote) => vote.choice === "oppose"
      ).length;
      const ballotCount = supportCount + opposeCount;

      for (const vote of proposal.votes) {
        if (vote.choice === "support" || vote.choice === "oppose") {
          civicVoterIds.add(vote.userId);
        }
      }

      const status = normalizeStatus(proposal.status);
      const votingOpen =
        status === "open" &&
        (!proposal.votingClosesAt || proposal.votingClosesAt.getTime() > now);
      const viewerVote = viewer
        ? proposal.votes.find((vote) => vote.userId === viewer.id)?.choice
        : null;

      return {
        publicId: proposal.publicId,
        category: proposal.category,
        title: proposal.title,
        summary: proposal.summary,
        body: proposal.body,
        status,
        createdByLabel: proposal.createdByLabel,
        createdAt: proposal.createdAt.toISOString(),
        updatedAt: proposal.updatedAt.toISOString(),
        votingClosesAt: proposal.votingClosesAt?.toISOString() ?? null,
        decidedAt: proposal.decidedAt?.toISOString() ?? null,
        decisionNote: proposal.decisionNote,
        supportCount,
        opposeCount,
        ballotCount,
        supportPercent:
          ballotCount > 0 ? Math.round((supportCount / ballotCount) * 100) : 50,
        viewerChoice:
          viewerVote === "support" || viewerVote === "oppose"
            ? viewerVote
            : null,
        votingOpen,
        ballots: proposal.votes
          .filter(
            (vote) => vote.choice === "support" || vote.choice === "oppose"
          )
          .map((vote) => ({
            choice: vote.choice as RoundChamberChoice,
            reason: vote.reason,
            createdAt: vote.createdAt.toISOString(),
            updatedAt: vote.updatedAt.toISOString(),
            voter: toActor(vote.user),
          })),
        commentCount: proposal.comments.length,
        comments: proposal.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          author: toActor(comment.user),
        })),
        events: proposal.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          detail: event.detail,
          createdAt: event.createdAt.toISOString(),
          actor: event.actor ? toActor(event.actor) : null,
        })),
      };
    })
    .sort((left, right) => {
      const leftRank = left.status === "open" ? 0 : 1;
      const rightRank = right.status === "open" ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
      );
    });

  const canParticipate = Boolean(viewer?.steamId);

  return {
    governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
    governanceNotice: ROUND_CHAMBER_GOVERNANCE_NOTICE,
    generatedAt: new Date().toISOString(),
    viewer: viewer
      ? {
          displayName: roundChamberDisplayName(viewer),
          isAdmin: viewer.isAdmin,
          isSignedIn: true,
          steamLinked: Boolean(viewer.steamId),
          canParticipate,
        }
      : null,
    totals: {
      proposals: proposals.length,
      openProposals: proposals.filter((proposal) => proposal.status === "open")
        .length,
      adoptedProposals: proposals.filter(
        (proposal) => proposal.status === "adopted"
      ).length,
      ballots: proposals.reduce(
        (total, proposal) => total + proposal.ballotCount,
        0
      ),
      civicVoters: civicVoterIds.size,
      comments: proposals.reduce(
        (total, proposal) => total + proposal.commentCount,
        0
      ),
    },
    proposals,
  };
}
