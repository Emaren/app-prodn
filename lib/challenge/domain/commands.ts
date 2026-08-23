import type {
  PrismaClient,
} from "@/lib/generated/prisma";

import {
  buildChallengeEconomySurface,
} from "@/lib/challengeEconomy";

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
  planChallengeReschedule,
  planChallengeTimeConfirmation,
} from "@/lib/challenge/domain/transitionPolicy";

import {
  buildCancellationMessage,
  buildDeclineMessage,
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
