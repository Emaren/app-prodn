import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  ROUND_CHAMBER_GOVERNANCE_MODE,
  getRoundChamberSnapshot,
  getRoundChamberViewer,
  normalizeRoundChamberBody,
  normalizeRoundChamberCategory,
  normalizeRoundChamberChoice,
  normalizeRoundChamberDecisionNote,
  normalizeRoundChamberPublicId,
  normalizeRoundChamberSummary,
  normalizeRoundChamberTitle,
  parseRoundChamberFutureDate,
  roundChamberDisplayName,
} from "@/lib/roundChamber";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const DEFAULT_VOTING_DAYS = 14;

type MutationBody = {
  action?: unknown;
  publicId?: unknown;
  category?: unknown;
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  choice?: unknown;
  reason?: unknown;
  note?: unknown;
  votingClosesAt?: unknown;
};

class ChamberHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChamberHttpError";
    this.status = status;
  }
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function fail(status: number, message: string): never {
  throw new ChamberHttpError(status, message);
}

function defaultVotingClose() {
  return new Date(Date.now() + DEFAULT_VOTING_DAYS * 24 * 60 * 60 * 1_000);
}

async function requireViewer(request: NextRequest, requireSteam: boolean) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    fail(401, "Sign in with Steam to enter the Round Chamber.");
  }

  const prisma = getPrisma();
  const viewer = await getRoundChamberViewer(prisma, sessionUid);
  if (!viewer) {
    fail(404, "Your AoE2WAR citizen profile could not be found.");
  }
  if (requireSteam && !viewer.steamId) {
    fail(403, "A linked Steam identity is required to cast a civic ballot.");
  }

  return { prisma, viewer };
}

async function refreshedSnapshot(
  prisma: ReturnType<typeof getPrisma>,
  viewerUid: string
) {
  return getRoundChamberSnapshot(prisma, viewerUid);
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof ChamberHttpError) {
    return json({ detail: error.message }, error.status);
  }

  console.error(`[round-chamber] ${fallback}`, error);
  return json({ detail: fallback }, 500);
}

export async function GET(request: NextRequest) {
  try {
    const viewerUid = await getSessionUid(request);
    const snapshot = await getRoundChamberSnapshot(getPrisma(), viewerUid);
    return json(snapshot);
  } catch (error) {
    return errorResponse(
      error,
      "The Round Chamber record is unavailable. Try the doors again shortly."
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { prisma, viewer } = await requireViewer(request, true);
    const payload = (await request.json().catch(() => ({}))) as MutationBody;
    const action = String(payload.action ?? "").trim();
    const actorLabel = roundChamberDisplayName(viewer);

    if (action === "create_proposal") {
      const category = normalizeRoundChamberCategory(payload.category);
      const title = normalizeRoundChamberTitle(payload.title);
      const summary = normalizeRoundChamberSummary(payload.summary);
      const body = normalizeRoundChamberBody(payload.body);
      const rawClose =
        typeof payload.votingClosesAt === "string"
          ? payload.votingClosesAt.trim()
          : "";
      const votingClosesAt = rawClose
        ? parseRoundChamberFutureDate(rawClose)
        : defaultVotingClose();

      if (!category) {
        fail(400, "Choose a recognized chamber category.");
      }
      if (title.length < 3) {
        fail(400, "Give the proposal a clear title of at least 3 characters.");
      }
      if (summary.length < 3) {
        fail(400, "Add a short summary for citizens scanning the chamber floor.");
      }
      if (body.length < 10) {
        fail(400, "Set out the proposal in at least 10 characters.");
      }
      if (!votingClosesAt) {
        fail(400, "Voting must close at a valid time in the future.");
      }

      await prisma.$transaction(async (tx) => {
        const proposal = await tx.roundProposal.create({
          data: {
            category,
            title,
            summary,
            body,
            createdByUserId: viewer.id,
            createdByLabel: actorLabel,
            votingClosesAt,
          },
          select: { id: true },
        });

        await tx.roundEvent.create({
          data: {
            proposalId: proposal.id,
            actorUserId: viewer.id,
            eventType: "proposal_opened",
            detail: `${actorLabel} placed “${title}” before the Round.`,
            metadata: {
              governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
              category,
              votingClosesAt: votingClosesAt.toISOString(),
            },
          },
        });
      });

      return json(await refreshedSnapshot(prisma, viewer.uid), 201);
    }

    const publicId = normalizeRoundChamberPublicId(payload.publicId);
    if (!publicId) {
      fail(400, "A valid proposal seal is required.");
    }

    if (action === "cast_vote") {
      const choice = normalizeRoundChamberChoice(payload.choice);
      const reason = normalizeRoundChamberSummary(payload.reason) || null;
      if (!choice) {
        fail(400, "Choose support or oppose.");
      }

      await prisma.$transaction(async (tx) => {
        const proposal = await tx.roundProposal.findUnique({
          where: { publicId },
          select: {
            id: true,
            title: true,
            status: true,
            votingClosesAt: true,
          },
        });
        if (!proposal) {
          fail(404, "That proposal is not recorded in the Round.");
        }
        if (proposal.status !== "open") {
          fail(409, "Balloting has ended for this proposal.");
        }
        if (
          proposal.votingClosesAt &&
          proposal.votingClosesAt.getTime() <= Date.now()
        ) {
          fail(409, "The voting bell has already sounded for this proposal.");
        }

        const previous = await tx.roundVote.findUnique({
          where: {
            proposalId_userId: {
              proposalId: proposal.id,
              userId: viewer.id,
            },
          },
          select: { choice: true, reason: true },
        });

        if (previous?.choice === choice && previous.reason === reason) {
          return;
        }

        await tx.roundVote.upsert({
          where: {
            proposalId_userId: {
              proposalId: proposal.id,
              userId: viewer.id,
            },
          },
          create: {
            proposalId: proposal.id,
            userId: viewer.id,
            choice,
            reason,
          },
          update: {
            choice,
            reason,
          },
        });

        await tx.roundEvent.create({
          data: {
            proposalId: proposal.id,
            actorUserId: viewer.id,
            eventType: previous ? "ballot_changed" : "ballot_cast",
            detail: `${actorLabel} cast a ${choice} ballot.`,
            metadata: {
              governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
              choice,
              previousChoice: previous?.choice ?? null,
              hasReason: Boolean(reason),
            },
          },
        });
      });

      return json(await refreshedSnapshot(prisma, viewer.uid));
    }

    if (action === "add_comment") {
      const body = normalizeRoundChamberBody(payload.body, 2_000);
      if (body.length < 2) {
        fail(400, "Write at least two characters before addressing the Round.");
      }

      await prisma.$transaction(async (tx) => {
        const proposal = await tx.roundProposal.findUnique({
          where: { publicId },
          select: { id: true, title: true },
        });
        if (!proposal) {
          fail(404, "That proposal is not recorded in the Round.");
        }

        const comment = await tx.roundComment.create({
          data: {
            proposalId: proposal.id,
            userId: viewer.id,
            body,
          },
          select: { id: true },
        });

        await tx.roundEvent.create({
          data: {
            proposalId: proposal.id,
            actorUserId: viewer.id,
            eventType: "comment_added",
            detail: `${actorLabel} entered the deliberation.`,
            metadata: {
              governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
              commentId: comment.id,
            },
          },
        });
      });

      return json(await refreshedSnapshot(prisma, viewer.uid), 201);
    }

    fail(400, "That chamber action is not recognized.");
  } catch (error) {
    return errorResponse(error, "The Chamber could not record that action.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { prisma, viewer } = await requireViewer(request, false);
    if (!viewer.isAdmin) {
      fail(403, "Only a steward may decide or reopen a proposal.");
    }

    const payload = (await request.json().catch(() => ({}))) as MutationBody;
    const action = String(payload.action ?? "").trim();
    const publicId = normalizeRoundChamberPublicId(payload.publicId);
    const note = normalizeRoundChamberDecisionNote(payload.note);
    const actorLabel = roundChamberDisplayName(viewer);

    if (!publicId) {
      fail(400, "A valid proposal seal is required.");
    }
    if (action !== "adopt" && action !== "decline" && action !== "reopen") {
      fail(400, "Choose adopt, decline, or reopen.");
    }
    if (note.length < 4) {
      fail(400, "Leave a short stewardship note for the permanent record.");
    }

    await prisma.$transaction(async (tx) => {
      const proposal = await tx.roundProposal.findUnique({
        where: { publicId },
        select: {
          id: true,
          title: true,
          status: true,
          votingClosesAt: true,
        },
      });
      if (!proposal) {
        fail(404, "That proposal is not recorded in the Round.");
      }

      if (action === "reopen") {
        if (proposal.status === "open") {
          fail(409, "That proposal is already open.");
        }

        const rawClose =
          typeof payload.votingClosesAt === "string"
            ? payload.votingClosesAt.trim()
            : "";
        const requestedClose = rawClose
          ? parseRoundChamberFutureDate(rawClose)
          : null;
        if (rawClose && !requestedClose) {
          fail(400, "The reopened voting close must be in the future.");
        }
        const votingClosesAt =
          requestedClose ||
          (proposal.votingClosesAt &&
          proposal.votingClosesAt.getTime() > Date.now()
            ? proposal.votingClosesAt
            : defaultVotingClose());

        await tx.roundProposal.update({
          where: { id: proposal.id },
          data: {
            status: "open",
            decidedAt: null,
            decisionNote: note,
            votingClosesAt,
          },
        });
        await tx.roundEvent.create({
          data: {
            proposalId: proposal.id,
            actorUserId: viewer.id,
            eventType: "proposal_reopened",
            detail: `${actorLabel} reopened “${proposal.title}” for civic deliberation.`,
            metadata: {
              governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
              previousStatus: proposal.status,
              note,
              votingClosesAt: votingClosesAt.toISOString(),
            },
          },
        });
        return;
      }

      if (proposal.status !== "open") {
        fail(409, "Reopen this proposal before issuing a different decision.");
      }

      const nextStatus = action === "adopt" ? "adopted" : "declined";
      await tx.roundProposal.update({
        where: { id: proposal.id },
        data: {
          status: nextStatus,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      await tx.roundEvent.create({
        data: {
          proposalId: proposal.id,
          actorUserId: viewer.id,
          eventType:
            nextStatus === "adopted"
              ? "proposal_adopted"
              : "proposal_declined",
          detail: `${actorLabel} ${nextStatus} “${proposal.title}”.`,
          metadata: {
            governanceMode: ROUND_CHAMBER_GOVERNANCE_MODE,
            previousStatus: proposal.status,
            status: nextStatus,
            note,
          },
        },
      });
    });

    return json(await refreshedSnapshot(prisma, viewer.uid));
  } catch (error) {
    return errorResponse(error, "The Chamber could not seal that decision.");
  }
}
