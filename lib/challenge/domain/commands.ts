import type {
  PrismaClient,
} from "@/lib/generated/prisma";

import {
  TERMINAL_TITLE_CHALLENGE_STATUSES,
} from "@/lib/challengeTitlePolicy";

import {
  postChallengeInboxNotice,
} from "@/lib/contactInbox";

import {
  recordUserActivity,
} from "@/lib/userExperience";

import {
  recordChallengeActivity,
} from "@/lib/challenge/domain/activity";

import type {
  ChallengeActorRole,
} from "@/lib/challenge/domain/contracts";

import {
  ChallengeConflictError,
} from "@/lib/challenge/domain/errors";

import {
  assertChallengeDeclineAllowed,
  planChallengeAcceptance,
  planChallengeCancellation,
} from "@/lib/challenge/domain/transitionPolicy";

import {
  buildCancellationMessage,
  buildDeclineMessage,
  buildTermsAcceptedMessage,
  formatChallengeWolo,
} from "@/lib/challenge/domain/transitionMessages";


export type ChallengeTransitionMatch = {
  scheduledAt:
    Date;

  timingMode:
    string;

  acceptBy:
    Date | null;

  matchTime:
    Date | null;

  matchTimeConfirmedAt:
    Date | null;

  resultAt:
    Date | null;

  settlementReadyAt:
    Date | null;

  challengerFundedAt:
    Date | null;

  challengedFundedAt:
    Date | null;

  challengerCheckedInAt:
    Date | null;

  challengedCheckedInAt:
    Date | null;

  challengerUserId:
    number;

  challengedUserId:
    number;
};


export type ChallengeTransitionContext = {
  prisma:
    PrismaClient;

  challengeId:
    number;

  actor: {
    id:
      number;

    uid:
      string;

    name:
      string;

    role:
      ChallengeActorRole;
  };

  match:
    ChallengeTransitionMatch;

  displayState:
    string;

  fundingTotal:
    number;

  challengerName:
    string;

  challengedName:
    string;

  challengeLabel:
    string;
};


export async function acceptChallenge(
  input:
    ChallengeTransitionContext,
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    displayState,
    fundingTotal,
    challengerName,
    challengedName,
    challengeLabel,
  } = input;

  const plan =
    planChallengeAcceptance({
      actorRole:
        actor.role,

      displayState,

      acceptBy:
        match.acceptBy,

      now:
        new Date(),

      fundingTotal,

      matchTime:
        match.matchTime,

      timingMode:
        match.timingMode,

      matchTimeConfirmedAt:
        match.matchTimeConfirmedAt,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundedAt:
        match.challengedFundedAt,
    });

  await prisma.$transaction(
    async (tx) => {
      const accepted =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              acceptedAt:
                null,

              status: {
                in: [
                  "proposed",
                  "pending",
                  "creator_funded",
                ],
              },

              OR: [
                {
                  acceptBy:
                    null,
                },

                {
                  acceptBy: {
                    gt:
                      plan.acceptedAt,
                  },
                },
              ],
            },

            data: {
              status:
                plan.nextStatus,

              acceptedAt:
                plan.acceptedAt,

              fundBy:
                plan.fundBy,

              playBy:
                plan.playBy,

              matchTimeConfirmedAt:
                plan.matchTimeConfirmedAt,

              declinedAt:
                null,

              cancelledAt:
                null,
            },
          });

      if (
        accepted.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "This challenge changed or expired before acceptance completed.",
        );
      }

      await tx
        .trophyChallenge
        .updateMany({
          where: {
            scheduledMatchId:
              challengeId,

            status: {
              notIn: [
                ...TERMINAL_TITLE_CHALLENGE_STATUSES,
              ],
            },
          },

          data: {
            status:
              "accepted",
          },
        });

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            fundingTotal > 0
              ? "terms_accepted"
              : "accepted",

          detail:
            fundingTotal > 0 &&
            match.challengerFundedAt
              ? `Terms accepted. Opponent funding is next for ${
                  formatChallengeWolo(
                    fundingTotal,
                  )
                } WOLO.`
              : fundingTotal > 0
              ? `Terms accepted. Creator funding is next for ${
                  formatChallengeWolo(
                    fundingTotal,
                  )
                } WOLO.`
              : "Accepted and ready to lock.",

          metadata: {
            acceptBy:
              match.acceptBy
                ?.toISOString() ??
              null,

            fundBy:
              plan.fundBy
                ?.toISOString() ??
              null,

            matchTime:
              match.matchTime
                ?.toISOString() ??
              null,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),

            totalFundingWolo:
              fundingTotal,
          },

          createdAt:
            plan.acceptedAt,
        },
      );

      await postChallengeInboxNotice(
        tx,
        {
          senderUserId:
            actor.id,

          targetUserId:
            match.challengerUserId,

          challengeId,

          body:
            buildTermsAcceptedMessage({
              challengerName,

              challengedName,

              matchTime:
                match.matchTime,

              fundBy:
                plan.fundBy,

              totalFundingWolo:
                fundingTotal,

              nextStatus:
                match.challengerFundedAt
                  ? "Opponent funding next"
                  : "Creator funding next",
            }),

          now:
            plan.acceptedAt,
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_terms_accepted",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            role:
              "challenger",

            acceptedByUid:
              actor.uid,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),

            totalFundingWolo:
              fundingTotal,
          },
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengedUserId,

          type:
            "challenge_terms_accepted",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            role:
              "challenged",

            acceptedByUid:
              actor.uid,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),

            totalFundingWolo:
              fundingTotal,
          },
        },
      );
    },
  );
}


export async function declineChallenge(
  input:
    ChallengeTransitionContext,
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    displayState,
    challengerName,
    challengedName,
    challengeLabel,
  } = input;

  assertChallengeDeclineAllowed({
    actorRole:
      actor.role,

    displayState,
  });

  const declinedAt =
    new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx
        .scheduledMatch
        .update({
          where: {
            id:
              challengeId,
          },

          data: {
            status:
              "declined",

            declinedAt,
          },
        });

      await tx
        .trophyChallenge
        .updateMany({
          where: {
            scheduledMatchId:
              challengeId,

            status: {
              notIn: [
                ...TERMINAL_TITLE_CHALLENGE_STATUSES,
              ],
            },
          },

          data: {
            status:
              "cancelled",

            settlementStatus:
              "cancelled",
          },
        });

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            "declined",

          detail:
            "Challenge declined.",

          createdAt:
            declinedAt,
        },
      );

      await postChallengeInboxNotice(
        tx,
        {
          senderUserId:
            actor.id,

          targetUserId:
            match.challengerUserId,

          challengeId,

          body:
            buildDeclineMessage({
              challengerName,

              challengedName,

              matchTime:
                match.matchTime,
            }),

          now:
            declinedAt,
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_declined",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            role:
              "challenger",

            declinedByUid:
              actor.uid,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),
          },
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengedUserId,

          type:
            "challenge_declined",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            role:
              "challenged",

            declinedByUid:
              actor.uid,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),
          },
        },
      );
    },
  );
}


export async function cancelChallenge(
  input:
    ChallengeTransitionContext,
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    displayState,
    fundingTotal,
    challengerName,
    challengedName,
    challengeLabel,
  } = input;

  const plan =
    planChallengeCancellation({
      displayState,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundedAt:
        match.challengedFundedAt,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      resultAt:
        match.resultAt,

      settlementReadyAt:
        match.settlementReadyAt,

      now:
        new Date(),
    });

  const targetUserId =
    actor.role ===
      "challenger"
      ? match.challengedUserId
      : match.challengerUserId;

  const cancelDetail =
    plan.hasAnyFunding
      ? `${challengeLabel} · cancelled · refund pending operator review`
      : `${challengeLabel} · cancelled`;

  await prisma.$transaction(
    async (tx) => {
      await tx
        .scheduledMatch
        .update({
          where: {
            id:
              challengeId,
          },

          data: {
            status:
              "canceled",

            cancelledAt:
              plan.cancelledAt,

            resultAt:
              plan.resultAt,

            settlementReadyAt:
              plan.settlementReadyAt,
          },
        });

      await tx
        .trophyChallenge
        .updateMany({
          where: {
            scheduledMatchId:
              challengeId,

            status: {
              notIn: [
                ...TERMINAL_TITLE_CHALLENGE_STATUSES,
              ],
            },
          },

          data: {
            status:
              "cancelled",

            settlementStatus:
              "cancelled",
          },
        });

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            "canceled",

          detail:
            cancelDetail,

          metadata:
            plan.hasAnyFunding
              ? {
                  refundPending:
                    true,

                  challengerFunded:
                    Boolean(
                      match.challengerFundedAt,
                    ),

                  challengedFunded:
                    Boolean(
                      match.challengedFundedAt,
                    ),

                  totalFundingWolo:
                    fundingTotal,
                }
              : undefined,

          createdAt:
            plan.cancelledAt,
        },
      );

      if (
        actor.role ===
          "challenger" ||
        actor.role ===
          "challenged"
      ) {
        await postChallengeInboxNotice(
          tx,
          {
            senderUserId:
              actor.id,

            targetUserId,

            challengeId,

            body:
              buildCancellationMessage({
                challengerName,

                challengedName,

                matchTime:
                  match.matchTime,

                cancelledByName:
                  actor.name,

                refundPending:
                  plan.hasAnyFunding,
              }),

            now:
              plan.cancelledAt,
          },
        );
      }

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_cancelled",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            cancelledByUid:
              actor.uid,

            role:
              actor.role,

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),

            refundPending:
              plan.hasAnyFunding,
          },
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengedUserId,

          type:
            "challenge_cancelled",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            cancelledByUid:
              actor.uid,

            role:
              actor.role ===
                "challenger"
                ? "challenged"
                : actor.role ===
                    "challenged"
                ? "challenger"
                : "admin",

            scheduledAt:
              match
                .scheduledAt
                .toISOString(),

            refundPending:
              plan.hasAnyFunding,
          },
        },
      );
    },
  );
}
