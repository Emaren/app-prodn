import {
  Prisma,
  type PrismaClient,
} from "@/lib/generated/prisma";

import {
  buildChallengeEconomySurface,
} from "@/lib/challengeEconomy";

import {
  TERMINAL_TITLE_CHALLENGE_STATUSES,
} from "@/lib/challengeTitlePolicy";

import {
  postChallengeCommissionerNotice,
  postChallengeInboxNotice,
} from "@/lib/contactInbox";

import {
  recordUserActivity,
} from "@/lib/userExperience";

import {
  verifyChallengeFundingTransfer,
} from "@/lib/woloBetSettlement";

import {
  resolveChallengeDesyncDisposition,
} from "@/lib/desyncChallengeProtocol";

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
  CHALLENGE_FUNDABLE_STATUSES,
  assertChallengeDeclineAllowed,
  planChallengeAcceptance,
  planChallengeCancellation,
  planChallengeCheckIn,
  planChallengeFundingIntent,
  planChallengeFundingState,
  planChallengeManualCompletion,
  planChallengeNoShowResolution,
  planChallengeRoomMessage,
  planChallengeReschedule,
  planChallengeTimeConfirmation,
  validateChallengeScheduledAtWindow,
} from "@/lib/challenge/domain/transitionPolicy";

import {
  buildCancellationMessage,
  buildCheckInMessage,
  buildDeclineMessage,
  buildFundingMessage,
  buildNoShowMessage,
  buildRescheduleMessage,
  buildTermsAcceptedMessage,
  formatChallengeScheduledAtForInbox,
  formatChallengeWolo,
} from "@/lib/challenge/domain/transitionMessages";


export type ChallengeTransitionMatch = {
  status:
    string;

  scheduledAt:
    Date;

  timingMode:
    string;

  acceptBy:
    Date | null;

  fundBy:
    Date | null;

  playBy:
    Date | null;

  matchTime:
    Date | null;

  matchTimeProposedByUserId:
    number | null;

  matchTimeConfirmedAt:
    Date | null;

  challengeNote:
    string | null;

  acceptedAt:
    Date | null;

  resultAt:
    Date | null;

  liveConfirmedAt:
    Date | null;

  settlementReadyAt:
    Date | null;

  wagerAmountWolo:
    number;

  guaranteeAmountWolo:
    number;

  challengerFundingTxHash:
    string | null;

  challengerFundingWalletAddress:
    string | null;

  challengerFundedAt:
    Date | null;

  challengedFundingTxHash:
    string | null;

  challengedFundingWalletAddress:
    string | null;

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

    isAdmin:
      boolean;
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


export type ChallengeRescheduleRequest = {
  matchTime?:
    string;

  scheduledAt?:
    string;

  challengeNote?:
    string;

  wagerAmountWolo?:
    | string
    | number
    | null;

  guaranteeAmountWolo?:
    | string
    | number
    | null;
};


export async function rescheduleChallenge(
  input:
    ChallengeTransitionContext & {
      request:
        ChallengeRescheduleRequest;
    },
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
    request,
  } = input;

  const plan =
    planChallengeReschedule({
      actorRole:
        actor.role,

      actorIsAdmin:
        actor.isAdmin,

      acceptedAt:
        match.acceptedAt,

      displayState,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundedAt:
        match.challengedFundedAt,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      playBy:
        match.playBy,

      acceptBy:
        match.acceptBy,

      fundBy:
        match.fundBy,

      requestedMatchTime:
        request.matchTime,

      requestedScheduledAt:
        request.scheduledAt,

      requestedChallengeNote:
        request.challengeNote,

      requestedWagerAmountWolo:
        request.wagerAmountWolo,

      requestedGuaranteeAmountWolo:
        request.guaranteeAmountWolo,

      currentWagerAmountWolo:
        match.wagerAmountWolo,

      currentGuaranteeAmountWolo:
        match.guaranteeAmountWolo,

      now:
        new Date(),
    });

  const nextSurface =
    plan.preserveLifecycle
      ? buildChallengeEconomySurface(
          {
            status:
              match.status,

            scheduledAt:
              plan.nextScheduledAt,

            timingMode:
              "scheduled",

            matchTime:
              plan.nextScheduledAt,

            acceptedAt:
              match.acceptedAt,

            resultAt:
              match.resultAt,

            liveConfirmedAt:
              match.liveConfirmedAt,

            settlementReadyAt:
              match.settlementReadyAt,

            wagerAmountWolo:
              plan.wagerAmountWolo,

            guaranteeAmountWolo:
              plan.guaranteeAmountWolo,

            challengerFundedAt:
              match.challengerFundedAt,

            challengerFundingTxHash:
              match.challengerFundingTxHash,

            challengerFundingWalletAddress:
              match.challengerFundingWalletAddress,

            challengedFundedAt:
              match.challengedFundedAt,

            challengedFundingTxHash:
              match.challengedFundingTxHash,

            challengedFundingWalletAddress:
              match.challengedFundingWalletAddress,

            challengerCheckedInAt:
              match.challengerCheckedInAt,

            challengedCheckedInAt:
              match.challengedCheckedInAt,
          },
          plan.rescheduledAt,
        )
      : null;

  const targetUserId =
    actor.role ===
      "challenger"
      ? match.challengedUserId
      : match.challengerUserId;

  await prisma.$transaction(
    async (tx) => {
      await tx
        .scheduledMatch
        .update({
          where: {
            id:
              challengeId,
          },

          data:
            plan.preserveLifecycle
              ? {
                  status:
                    nextSurface
                      ?.persistedStatus ??
                    match.status,

                  scheduledAt:
                    plan.nextScheduledAt,

                  timingMode:
                    "scheduled",

                  matchTime:
                    plan.nextScheduledAt,

                  matchTimeProposedByUserId:
                    actor.id,

                  matchTimeConfirmedAt:
                    plan.matchTimeConfirmedAt,

                  acceptBy:
                    plan.acceptByUpdate,

                  fundBy:
                    plan.fundByUpdate,

                  challengeNote:
                    plan.nextChallengeNote,

                  wagerAmountWolo:
                    plan.wagerAmountWolo,

                  guaranteeAmountWolo:
                    plan.guaranteeAmountWolo,

                  declinedAt:
                    null,

                  cancelledAt:
                    null,
                }
              : {
                  status:
                    "proposed",

                  scheduledAt:
                    plan.nextScheduledAt,

                  timingMode:
                    "scheduled",

                  matchTime:
                    plan.nextScheduledAt,

                  matchTimeProposedByUserId:
                    actor.id,

                  matchTimeConfirmedAt:
                    null,

                  acceptBy:
                    plan.acceptByUpdate,

                  challengeNote:
                    plan.nextChallengeNote,

                  wagerAmountWolo:
                    plan.wagerAmountWolo,

                  guaranteeAmountWolo:
                    plan.guaranteeAmountWolo,

                  acceptedAt:
                    null,

                  declinedAt:
                    null,

                  cancelledAt:
                    null,

                  challengerFundingTxHash:
                    null,

                  challengerFundingWalletAddress:
                    null,

                  challengerFundedAt:
                    null,

                  challengedFundingTxHash:
                    null,

                  challengedFundingWalletAddress:
                    null,

                  challengedFundedAt:
                    null,

                  challengerCheckedInAt:
                    null,

                  challengedCheckedInAt:
                    null,

                  liveConfirmedAt:
                    null,

                  resultAt:
                    null,

                  settlementReadyAt:
                    null,

                  linkedSessionKey:
                    null,

                  linkedMapName:
                    null,

                  linkedWinner:
                    null,

                  linkedDurationSeconds:
                    null,
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
            "time_proposed",

          detail:
            `${challengeLabel} · exact time proposed for ${
              formatChallengeScheduledAtForInbox(
                plan.nextScheduledAt,
              )
            }${
              plan.hasAnyFunding
                ? " · funding preserved"
                : ""
            }`,

          metadata: {
            scheduledAt:
              plan.nextScheduledAt
                .toISOString(),

            matchTime:
              plan.nextScheduledAt
                .toISOString(),

            matchTimeProposedByUid:
              actor.uid,

            matchTimeConfirmed:
              actor.isAdmin,

            wagerAmountWolo:
              plan.wagerAmountWolo,

            guaranteeAmountWolo:
              plan.guaranteeAmountWolo,

            totalFundingWolo:
              plan.nextFundingTotal,

            fundingPreserved:
              plan.hasAnyFunding,

            accepted:
              plan.accepted,
          },

          createdAt:
            plan.rescheduledAt,
        },
      );

      await postChallengeInboxNotice(
        tx,
        {
          senderUserId:
            actor.id,

          targetUserId,

          challengeId,

          body:
            buildRescheduleMessage({
              challengerName,

              challengedName,

              scheduledAt:
                plan.nextScheduledAt,

              challengeNote:
                plan.nextChallengeNote,

              wagerAmountWolo:
                plan.wagerAmountWolo,

              guaranteeAmountWolo:
                plan.guaranteeAmountWolo,

              fundingPreserved:
                plan.hasAnyFunding,

              accepted:
                plan.accepted,

              confirmed:
                actor.isAdmin,
            }),

          now:
            plan.rescheduledAt,
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_rescheduled",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            updatedByUid:
              actor.uid,

            role:
              actor.role,

            scheduledAt:
              plan.nextScheduledAt
                .toISOString(),

            challengeNote:
              plan.nextChallengeNote,

            wagerAmountWolo:
              plan.wagerAmountWolo,

            guaranteeAmountWolo:
              plan.guaranteeAmountWolo,

            totalFundingWolo:
              plan.nextFundingTotal,

            fundingPreserved:
              plan.hasAnyFunding,

            accepted:
              plan.accepted,
          },
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengedUserId,

          type:
            "challenge_rescheduled",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            updatedByUid:
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
              plan.nextScheduledAt
                .toISOString(),

            challengeNote:
              plan.nextChallengeNote,

            wagerAmountWolo:
              plan.wagerAmountWolo,

            guaranteeAmountWolo:
              plan.guaranteeAmountWolo,

            totalFundingWolo:
              plan.nextFundingTotal,

            fundingPreserved:
              plan.hasAnyFunding,

            accepted:
              plan.accepted,
          },
        },
      );
    },
  );
}


export async function confirmChallengeTime(
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

  const plan =
    planChallengeTimeConfirmation({
      acceptedAt:
        match.acceptedAt,

      matchTime:
        match.matchTime,

      matchTimeProposedByUserId:
        match.matchTimeProposedByUserId,

      matchTimeConfirmedAt:
        match.matchTimeConfirmedAt,

      actorUserId:
        actor.id,

      actorIsAdmin:
        actor.isAdmin,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      displayState,

      now:
        new Date(),
    });

  const targetUserId =
    actor.role ===
      "challenger"
      ? match.challengedUserId
      : match.challengerUserId;

  await prisma.$transaction(
    async (tx) => {
      const updated =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              matchTime:
                plan.matchTime,

              matchTimeProposedByUserId:
                plan.matchTimeProposedByUserId,

              matchTimeConfirmedAt:
                null,
            },

            data: {
              timingMode:
                "scheduled",

              scheduledAt:
                plan.matchTime,

              matchTimeConfirmedAt:
                plan.confirmedAt,
            },
          });

      if (
        updated.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "The proposed time changed before confirmation completed.",
        );
      }

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            "time_confirmed",

          detail:
            `${challengeLabel} · exact time confirmed for ${
              formatChallengeScheduledAtForInbox(
                plan.matchTime,
              )
            }`,

          metadata: {
            matchTime:
              plan.matchTime
                .toISOString(),

            confirmedByUid:
              actor.uid,
          },

          createdAt:
            plan.confirmedAt,
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
              buildRescheduleMessage({
                challengerName,

                challengedName,

                scheduledAt:
                  plan.matchTime,

                challengeNote:
                  match.challengeNote,

                wagerAmountWolo:
                  match.wagerAmountWolo,

                guaranteeAmountWolo:
                  match.guaranteeAmountWolo,

                fundingPreserved:
                  Boolean(
                    match.challengerFundedAt ||
                    match.challengedFundedAt,
                  ),

                confirmed:
                  true,
              }),

            now:
              plan.confirmedAt,
          },
        );
      }
    },
  );
}


export type ChallengeFundingRequest = {
  fundingTxHash?:
    string | null;

  fundingWalletAddress?:
    string | null;
};


export async function fundChallenge(
  input:
    ChallengeTransitionContext & {
      request:
        ChallengeFundingRequest;
    },
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    fundingTotal,
    challengerName,
    challengedName,
    challengeLabel,
    request,
  } = input;

  const intent =
    planChallengeFundingIntent({
      actorRole:
        actor.role,

      status:
        match.status,

      acceptedAt:
        match.acceptedAt,

      acceptBy:
        match.acceptBy,

      fundBy:
        match.fundBy,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundedAt:
        match.challengedFundedAt,

      fundingTxHash:
        request.fundingTxHash,

      fundingWalletAddress:
        request.fundingWalletAddress,

      now:
        new Date(),
    });


  /*
   * Preserve the existing early human-readable duplicate check.
   *
   * Canonical global identity remains the unique funding-proof
   * registry inside the transaction below.
   */
  const existingFundingProof =
    await prisma
      .scheduledMatch
      .findFirst({
        where: {
          id: {
            not:
              challengeId,
          },

          OR: [
            {
              challengerFundingTxHash:
                intent.fundingTxHash,
            },

            {
              challengedFundingTxHash:
                intent.fundingTxHash,
            },
          ],
        },

        select: {
          id:
            true,
        },
      });

  if (
    existingFundingProof
  ) {
    throw new ChallengeConflictError(
      `That funding tx is already attached to challenge #${existingFundingProof.id}.`,
    );
  }


  /*
   * External proof happens before the DB transaction exactly as
   * before. The subsequent CAS proves the terms/deadline/funding
   * state did not change while WoloChain verification was running.
   */
  const fundingVerification =
    await verifyChallengeFundingTransfer({
      challengeId,

      txHash:
        intent.fundingTxHash,

      fromAddress:
        intent.fundingWalletAddress,

      participantSide:
        intent.participantSide,

      wagerAmountWolo:
        match.wagerAmountWolo,

      guaranteeAmountWolo:
        match.guaranteeAmountWolo,
    });

  if (
    !fundingVerification.verified
  ) {
    throw new ChallengeConflictError(
      fundingVerification.detail ||
      "WoloChain could not verify this challenge escrow deposit.",
    );
  }


  const verifiedFundingTxHash =
    fundingVerification.txHash ||
    intent.fundingTxHash;

  const fundedAt =
    new Date();

  const plan =
    planChallengeFundingState({
      participantSide:
        intent.participantSide,

      verifiedFundingTxHash,

      fundingWalletAddress:
        intent.fundingWalletAddress,

      fundedAt,

      status:
        match.status,

      scheduledAt:
        match.scheduledAt,

      timingMode:
        match.timingMode,

      matchTime:
        match.matchTime,

      acceptedAt:
        match.acceptedAt,

      resultAt:
        match.resultAt,

      liveConfirmedAt:
        match.liveConfirmedAt,

      settlementReadyAt:
        match.settlementReadyAt,

      wagerAmountWolo:
        match.wagerAmountWolo,

      guaranteeAmountWolo:
        match.guaranteeAmountWolo,

      challengerFundingTxHash:
        match.challengerFundingTxHash,

      challengerFundingWalletAddress:
        match.challengerFundingWalletAddress,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundingTxHash:
        match.challengedFundingTxHash,

      challengedFundingWalletAddress:
        match.challengedFundingWalletAddress,

      challengedFundedAt:
        match.challengedFundedAt,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      playBy:
        match.playBy,
    });


  const targetUserId =
    intent.participantSide ===
      "left"
      ? match.challengedUserId
      : match.challengerUserId;


  await prisma.$transaction(
    async (tx) => {
      await tx
        .scheduledMatchFundingProof
        .create({
          data: {
            scheduledMatchId:
              challengeId,

            participantSide:
              intent.participantSide,

            txHash:
              verifiedFundingTxHash,

            walletAddress:
              intent.fundingWalletAddress,

            amountWolo:
              fundingTotal,
          },
        })
        .catch(
          (
            error,
          ) => {
            if (
              error instanceof
                Prisma
                  .PrismaClientKnownRequestError &&
              error.code ===
                "P2002"
            ) {
              throw new ChallengeConflictError(
                "That funding proof is already attached to a challenge side.",
              );
            }

            throw error;
          },
        );


      const funded =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              wagerAmountWolo:
                match.wagerAmountWolo,

              guaranteeAmountWolo:
                match.guaranteeAmountWolo,

              status: {
                in: [
                  ...CHALLENGE_FUNDABLE_STATUSES,
                ],
              },

              ...(
                intent.participantSide ===
                  "left"
                  ? {
                      challengerFundedAt:
                        null,
                    }
                  : {
                      challengedFundedAt:
                        null,

                      acceptedAt: {
                        not:
                          null,
                      },
                    }
              ),

              OR:
                match.acceptedAt
                  ? [
                      {
                        fundBy:
                          null,
                      },

                      {
                        fundBy: {
                          gt:
                            fundedAt,
                        },
                      },
                    ]
                  : [
                      {
                        acceptBy:
                          null,
                      },

                      {
                        acceptBy: {
                          gt:
                            fundedAt,
                        },
                      },
                    ],
            },

            data: {
              status:
                plan
                  .nextSurface
                  .persistedStatus,

              challengerFundedAt:
                intent.participantSide ===
                  "left"
                  ? fundedAt
                  : undefined,

              challengerFundingTxHash:
                intent.participantSide ===
                  "left"
                  ? verifiedFundingTxHash
                  : undefined,

              challengerFundingWalletAddress:
                intent.participantSide ===
                  "left"
                  ? intent
                      .fundingWalletAddress
                  : undefined,

              challengedFundedAt:
                intent.participantSide ===
                  "right"
                  ? fundedAt
                  : undefined,

              challengedFundingTxHash:
                intent.participantSide ===
                  "right"
                  ? verifiedFundingTxHash
                  : undefined,

              challengedFundingWalletAddress:
                intent.participantSide ===
                  "right"
                  ? intent
                      .fundingWalletAddress
                  : undefined,

              playBy:
                plan.bothFunded
                  ? plan.playBy
                  : undefined,
            },
          });


      if (
        funded.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "Challenge terms or funding state changed while the chain proof was being verified.",
        );
      }


      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            intent.participantSide ===
              "left"
              ? "creator_funded"
              : "opponent_funded",

          detail:
            `${actor.name} locked ${
              formatChallengeWolo(
                fundingTotal,
              )
            } WOLO.`,

          metadata: {
            fundingTxHash:
              verifiedFundingTxHash,

            fundingWalletAddress:
              intent
                .fundingWalletAddress,

            totalFundingWolo:
              fundingTotal,

            proofUrl:
              fundingVerification
                .proofUrl ??
              null,

            verifiedBy:
              "wolochain",

            playBy:
              plan.playBy
                ?.toISOString() ??
              null,
          },

          createdAt:
            fundedAt,
        },
      );


      await postChallengeInboxNotice(
        tx,
        {
          senderUserId:
            actor.id,

          targetUserId,

          challengeId,

          body:
            buildFundingMessage({
              challengerName,

              challengedName,

              matchTime:
                match.matchTime,

              actorName:
                actor.name,

              totalFundingWolo:
                fundingTotal,

              statusLabel:
                plan
                  .nextSurface
                  .economy
                  .statusLabel,
            }),

          now:
            fundedAt,
        },
      );


      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_funding_recorded",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            actorUid:
              actor.uid,

            role:
              actor.role,

            totalFundingWolo:
              fundingTotal,

            fundingTxHash:
              verifiedFundingTxHash,
          },
        },
      );


      await recordUserActivity(
        tx,
        {
          userId:
            match.challengedUserId,

          type:
            "challenge_funding_recorded",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            actorUid:
              actor.uid,

            role:
              actor.role ===
                "challenger"
                ? "challenged"
                : actor.role ===
                    "challenged"
                ? "challenger"
                : "admin",

            totalFundingWolo:
              fundingTotal,

            fundingTxHash:
              verifiedFundingTxHash,
          },
        },
      );
    },
  );
}


export type ChallengeManualCompletionRequest = {
  linkedSessionKey?:
    string | null;

  linkedMapName?:
    string | null;

  linkedWinner?:
    string | null;

  linkedDurationSeconds?:
    number | null;
};


export type ChallengeCanonicalReplayLinkage = {
  linkedSessionKey:
    string | null;

  linkedMapName:
    string | null;

  linkedWinner:
    string | null;

  linkedDurationSeconds:
    number | null;
};


export async function completeChallengeManually(
  input:
    ChallengeTransitionContext & {
      currentDisplayState:
        string;

      canonicalReplay:
        ChallengeCanonicalReplayLinkage;

      request:
        ChallengeManualCompletionRequest;
    },
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    currentDisplayState,
    canonicalReplay,
    request,
  } = input;

  const completedAt =
    new Date();

  const plan =
    planChallengeManualCompletion({
      actorIsAdmin:
        actor.isAdmin,

      currentDisplayState,

      currentLinkedSessionKey:
        canonicalReplay
          .linkedSessionKey,

      currentLinkedMapName:
        canonicalReplay
          .linkedMapName,

      currentLinkedWinner:
        canonicalReplay
          .linkedWinner,

      currentLinkedDurationSeconds:
        canonicalReplay
          .linkedDurationSeconds,

      submittedLinkedSessionKey:
        request.linkedSessionKey,

      submittedMapName:
        request.linkedMapName,

      submittedWinner:
        request.linkedWinner,

      submittedDurationSeconds:
        request.linkedDurationSeconds,

      completedAt,
    });

  /*
   * Manual completion establishes commissioner result truth,
   * not replay provenance.
   *
   * Bind the result to the exact lifecycle, attendance,
   * funding and canonical replay snapshot from which the
   * commissioner acted.
   *
   * Automatic replay completion or any other terminal
   * transition winning first makes this command fail closed.
   */
  await prisma.$transaction(
    async (tx) => {
      const completed =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              status:
                match.status,

              timingMode:
                match.timingMode,

              scheduledAt:
                match.scheduledAt,

              matchTime:
                match.matchTime,

              acceptedAt:
                match.acceptedAt,

              wagerAmountWolo:
                match.wagerAmountWolo,

              guaranteeAmountWolo:
                match.guaranteeAmountWolo,

              challengerFundedAt:
                match.challengerFundedAt,

              challengedFundedAt:
                match.challengedFundedAt,

              challengerCheckedInAt:
                match.challengerCheckedInAt,

              challengedCheckedInAt:
                match.challengedCheckedInAt,

              liveConfirmedAt:
                match.liveConfirmedAt,

              resultAt:
                null,

              settlementReadyAt:
                null,

              linkedSessionKey:
                canonicalReplay
                  .linkedSessionKey,

              linkedMapName:
                canonicalReplay
                  .linkedMapName,

              linkedWinner:
                canonicalReplay
                  .linkedWinner,

              linkedDurationSeconds:
                canonicalReplay
                  .linkedDurationSeconds,
            },

            data: {
              status:
                "completed",

              liveConfirmedAt:
                match.liveConfirmedAt ??
                completedAt,

              resultAt:
                completedAt,

              settlementReadyAt:
                completedAt,

              /*
               * Canonical replay linkage is preserved exactly.
               * A manual request cannot establish or replace it.
               */
              linkedSessionKey:
                plan
                  .canonicalReplay
                  .linkedSessionKey,

              linkedMapName:
                plan
                  .canonicalReplay
                  .linkedMapName,

              linkedDurationSeconds:
                plan
                  .canonicalReplay
                  .linkedDurationSeconds,

              /*
               * linkedWinner remains the legacy persistence
               * field consumed by the settlement planner, but
               * its authority is now explicitly commissioner
               * result truth rather than implied replay proof.
               */
              linkedWinner:
                plan.linkedWinner,
            },
          });

      if (
        completed.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "Challenge result state changed before manual completion finished. Refresh before recording the result.",
        );
      }

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            "completed",

          detail:
            plan.linkedWinner
              ? `Completed. Winner: ${plan.linkedWinner}.`
              : "Completed and stored.",

          metadata: {
            resultAuthority:
              "commissioner_manual",

            linkedWinner:
              plan.linkedWinner,

            canonicalLinkedSessionKey:
              plan
                .canonicalReplay
                .linkedSessionKey,

            canonicalLinkedMapName:
              plan
                .canonicalReplay
                .linkedMapName,

            canonicalLinkedDurationSeconds:
              plan
                .canonicalReplay
                .linkedDurationSeconds,

            submittedEvidence:
              plan.submittedEvidence,

            replayProvenanceVerified:
              false,

            titleResultAuthority:
              false,

            settlementExecuted:
              false,
          },

          createdAt:
            completedAt,
        },
      );
    },
  );
}


export async function checkInChallenge(
  input:
    ChallengeTransitionContext & {
      checkInWindowState:
        string;
    },
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    challengerName,
    challengedName,
    challengeLabel,
    checkInWindowState,
  } = input;

  const plan =
    planChallengeCheckIn({
      actorRole:
        actor.role,

      checkInWindowState,

      status:
        match.status,

      scheduledAt:
        match.scheduledAt,

      timingMode:
        match.timingMode,

      matchTime:
        match.matchTime,

      acceptedAt:
        match.acceptedAt,

      resultAt:
        match.resultAt,

      liveConfirmedAt:
        match.liveConfirmedAt,

      settlementReadyAt:
        match.settlementReadyAt,

      wagerAmountWolo:
        match.wagerAmountWolo,

      guaranteeAmountWolo:
        match.guaranteeAmountWolo,

      challengerFundingTxHash:
        match.challengerFundingTxHash,

      challengerFundingWalletAddress:
        match.challengerFundingWalletAddress,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundingTxHash:
        match.challengedFundingTxHash,

      challengedFundingWalletAddress:
        match.challengedFundingWalletAddress,

      challengedFundedAt:
        match.challengedFundedAt,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      now:
        new Date(),
    });

  const targetUserId =
    plan.participantSide ===
      "left"
      ? match.challengedUserId
      : match.challengerUserId;

  /*
   * Attendance becomes economic truth after the lock.
   *
   * Bind this write to the exact attendance/schedule/economic
   * snapshot from which the check-in plan was derived. A
   * concurrent check-in, reschedule, result, or no-show wins
   * first and makes this stale request fail closed.
   */
  await prisma.$transaction(
    async (tx) => {
      const checkedIn =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              status:
                match.status,

              timingMode:
                match.timingMode,

              scheduledAt:
                match.scheduledAt,

              matchTime:
                match.matchTime,

              acceptedAt:
                match.acceptedAt,

              wagerAmountWolo:
                match.wagerAmountWolo,

              guaranteeAmountWolo:
                match.guaranteeAmountWolo,

              challengerFundedAt:
                match.challengerFundedAt,

              challengedFundedAt:
                match.challengedFundedAt,

              challengerCheckedInAt:
                match.challengerCheckedInAt,

              challengedCheckedInAt:
                match.challengedCheckedInAt,

              liveConfirmedAt:
                match.liveConfirmedAt,

              resultAt:
                null,

              settlementReadyAt:
                null,
            },

            data: {
              status:
                plan
                  .nextSurface
                  .persistedStatus,

              challengerCheckedInAt:
                plan.participantSide ===
                  "left"
                  ? plan.checkedInAt
                  : undefined,

              challengedCheckedInAt:
                plan.participantSide ===
                  "right"
                  ? plan.checkedInAt
                  : undefined,
            },
          });

      if (
        checkedIn.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "Attendance state changed before check-in completed. Refresh and try again.",
        );
      }

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            actor.id,

          eventType:
            plan.participantSide ===
              "left"
              ? "left_checked_in"
              : "right_checked_in",

          detail:
            `${actor.name} checked in before the lock.`,

          createdAt:
            plan.checkedInAt,
        },
      );

      await postChallengeInboxNotice(
        tx,
        {
          senderUserId:
            actor.id,

          targetUserId,

          challengeId,

          body:
            buildCheckInMessage({
              challengerName,

              challengedName,

              scheduledAt:
                match.scheduledAt,

              actorName:
                actor.name,

              statusLabel:
                plan
                  .nextSurface
                  .economy
                  .statusLabel,
            }),

          now:
            plan.checkedInAt,
        },
      );

      await recordUserActivity(
        tx,
        {
          userId:
            match.challengerUserId,

          type:
            "challenge_checkin_recorded",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            actorUid:
              actor.uid,

            role:
              actor.role,

            checkedInAt:
              plan.checkedInAt
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
            "challenge_checkin_recorded",

          path:
            "/challenge",

          label:
            challengeLabel,

          metadata: {
            challengeId,

            actorUid:
              actor.uid,

            role:
              actor.role ===
                "challenger"
                ? "challenged"
                : actor.role ===
                    "challenged"
                ? "challenger"
                : "admin",

            checkedInAt:
              plan.checkedInAt
                .toISOString(),
          },
        },
      );
    },
  );
}


export async function resolveChallengeNoShow(
  input:
    ChallengeTransitionContext,
) {
  const {
    prisma,
    challengeId,
    actor,
    match,
    challengerName,
    challengedName,
  } = input;

  const plan =
    planChallengeNoShowResolution({
      actorRole:
        actor.role,

      actorIsAdmin:
        actor.isAdmin,

      status:
        match.status,

      scheduledAt:
        match.scheduledAt,

      timingMode:
        match.timingMode,

      matchTime:
        match.matchTime,

      acceptedAt:
        match.acceptedAt,

      resultAt:
        match.resultAt,

      liveConfirmedAt:
        match.liveConfirmedAt,

      settlementReadyAt:
        match.settlementReadyAt,

      wagerAmountWolo:
        match.wagerAmountWolo,

      guaranteeAmountWolo:
        match.guaranteeAmountWolo,

      challengerFundingTxHash:
        match.challengerFundingTxHash,

      challengerFundingWalletAddress:
        match.challengerFundingWalletAddress,

      challengerFundedAt:
        match.challengerFundedAt,

      challengedFundingTxHash:
        match.challengedFundingTxHash,

      challengedFundingWalletAddress:
        match.challengedFundingWalletAddress,

      challengedFundedAt:
        match.challengedFundedAt,

      challengerCheckedInAt:
        match.challengerCheckedInAt,

      challengedCheckedInAt:
        match.challengedCheckedInAt,

      now:
        new Date(),
    });

  /*
   * This command materializes terminal attendance truth only.
   *
   * It deliberately creates NO settlement rows and executes
   * NO WOLO. settlementReadyAt hands the already-persisted
   * terminal state to the existing settlement engine.
   */
  await prisma.$transaction(
    async (tx) => {
      const resolved =
        await tx
          .scheduledMatch
          .updateMany({
            where: {
              id:
                challengeId,

              status:
                match.status,

              timingMode:
                match.timingMode,

              scheduledAt:
                match.scheduledAt,

              matchTime:
                match.matchTime,

              acceptedAt:
                match.acceptedAt,

              wagerAmountWolo:
                match.wagerAmountWolo,

              guaranteeAmountWolo:
                match.guaranteeAmountWolo,

              challengerFundedAt:
                match.challengerFundedAt,

              challengedFundedAt:
                match.challengedFundedAt,

              challengerCheckedInAt:
                match.challengerCheckedInAt,

              challengedCheckedInAt:
                match.challengedCheckedInAt,

              liveConfirmedAt:
                match.liveConfirmedAt,

              resultAt:
                null,

              settlementReadyAt:
                null,
            },

            data: {
              status:
                plan
                  .resolvedSurface
                  .persistedStatus,

              resultAt:
                plan.resultAt,

              settlementReadyAt:
                plan.settlementReadyAt,
            },
          });

      if (
        resolved.count !==
        1
      ) {
        throw new ChallengeConflictError(
          "Attendance state changed before no-show resolution completed. Refresh before resolving it.",
        );
      }

      await recordChallengeActivity(
        tx,
        {
          scheduledMatchId:
            challengeId,

          actorUserId:
            plan.participant
              ? actor.id
              : undefined,

          eventType:
            plan
              .resolvedSurface
              .persistedStatus,

          detail:
            plan
              .resolvedSurface
              .economy
              .statusDetail,

          createdAt:
            plan.resolvedAt,
        },
      );

      if (
        plan.participant
      ) {
        const targetUserId =
          actor.role ===
            "challenger"
            ? match.challengedUserId
            : match.challengerUserId;

        await postChallengeInboxNotice(
          tx,
          {
            senderUserId:
              actor.id,

            targetUserId,

            challengeId,

            body:
              buildNoShowMessage({
                challengerName,

                challengedName,

                scheduledAt:
                  match.scheduledAt,

                resolutionLabel:
                  plan
                    .resolvedSurface
                    .economy
                    .resolution
                    .label,

                statusDetail:
                  plan
                    .resolvedSurface
                    .economy
                    .statusDetail,
              }),

            now:
              plan.resolvedAt,
          },
        );
      }
    },
  );
}


export type ChallengeDesyncCommandAction =
  | "desync_rematch"
  | "desync_void_refund";


export type ChallengeDesyncRequest = {
  action:
    ChallengeDesyncCommandAction;

  desyncIncidentId:
    unknown;

  idempotencyKey:
    unknown;

  rematchAt?:
    unknown;

  note?:
    unknown;
};


function parseChallengeDesyncRematchAt(
  value:
    unknown,
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  return parsed;
}

export async function resolveChallengeDesync(
  input: {
    prisma:
      PrismaClient;

    challengeId:
      number;

    actor: {
      uid:
        string;

      isAdmin:
        boolean;
    };

    request:
      ChallengeDesyncRequest;

    now?:
      Date;
  },
) {
  if (
    !input.actor.isAdmin
  ) {
    throw new ChallengeConflictError(
      "Only a site admin can resolve a confirmed desync.",
      403,
    );
  }


  const desyncIncidentId =
    Number(
      input
        .request
        .desyncIncidentId,
    );

  if (
    !Number.isSafeInteger(
      desyncIncidentId,
    ) ||
    desyncIncidentId <= 0
  ) {
    throw new ChallengeConflictError(
      "Choose the confirmed desync incident to resolve.",
      400,
    );
  }


  const idempotencyKey =
    typeof input
      .request
      .idempotencyKey ===
      "string"
      ? input
          .request
          .idempotencyKey
          .trim()
      : "";

  if (
    !idempotencyKey ||
    idempotencyKey.length >
      128
  ) {
    throw new ChallengeConflictError(
      "A valid idempotency key is required for commissioner disposition.",
      400,
    );
  }


  const dispositionAction =
    input.request.action ===
    "desync_rematch"
      ? "rematch"
      : "void_refund";


  const now =
    input.now ??
    new Date();


  const rematchAt =
    dispositionAction ===
    "rematch"
      ? parseChallengeDesyncRematchAt(
          input.request.rematchAt,
        )
      : null;


  if (
    dispositionAction ===
    "rematch"
  ) {
    if (
      !rematchAt
    ) {
      throw new ChallengeConflictError(
        "Choose a valid future time for the rematch.",
        400,
      );
    }

    const scheduledAtWindowError =
      validateChallengeScheduledAtWindow(
        rematchAt,
        now,
      );

    if (
      scheduledAtWindowError
    ) {
      throw new ChallengeConflictError(
        scheduledAtWindowError,
        400,
      );
    }
  }


  const note =
    typeof input
      .request
      .note ===
      "string"
      ? input
          .request
          .note
          .trim()
          .slice(
            0,
            1_000,
          ) ||
        null
      : null;


  return resolveChallengeDesyncDisposition(
    {
      prisma:
        input.prisma,

      viewerUid:
        input.actor.uid,

      challengeId:
        input.challengeId,

      incidentId:
        desyncIncidentId,

      action:
        dispositionAction,

      idempotencyKey,

      rematchAt,

      note,
    },
  );
}


export type ChallengeRoomMessageRequest = {
  message:
    unknown;
};


export async function postChallengeRoomMessage(
  input: {
    prisma:
      PrismaClient;

    challengeId:
      number;

    actor: {
      id:
        number;

      isAdmin:
        boolean;
    };

    match: {
      challengerUserId:
        number;

      challengedUserId:
        number;
    };

    request:
      ChallengeRoomMessageRequest;

    now?:
      Date;
  },
) {
  const plan =
    planChallengeRoomMessage(
      {
        actor:
          input.actor,

        match:
          input.match,

        message:
          input.request.message,

        now:
          input.now ??
          new Date(),
      },
    );


  await recordChallengeActivity(
    input.prisma,
    {
      scheduledMatchId:
        input.challengeId,

      actorUserId:
        input.actor.id,

      eventType:
        plan.eventType,

      metadata:
        plan.metadata,

      createdAt:
        plan.createdAt,
    },
  );


  return {
    ok:
      true,
  } as const;
}

export type ChallengeCommissionerNoticeResult =
  | {
      ok:
        true;
    }
  | {
      ok:
        false;

      error:
        unknown;
    };


export async function syncChallengeCommissionerNotice(
  input: {
    prisma:
      PrismaClient;

    challengeId:
      number;
  },
): Promise<ChallengeCommissionerNoticeResult> {
  try {
    await postChallengeCommissionerNotice(
      input.prisma,
      input.challengeId,
    );

    return {
      ok:
        true,
    };
  } catch (
    error
  ) {
    return {
      ok:
        false,

      error,
    };
  }
}
