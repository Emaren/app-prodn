import {
  Prisma,
} from "@/lib/generated/prisma";

export async function recordChallengeActivity(
  tx: {
    scheduledMatchActivity: {
      create: (
        args: {
          data:
            Prisma
              .ScheduledMatchActivityUncheckedCreateInput;
        },
      ) => Promise<unknown>;
    };
  },
  input: {
    scheduledMatchId:
      number;

    actorUserId?:
      | number
      | null;

    eventType:
      string;

    detail?:
      | string
      | null;

    metadata?:
      | Record<string, unknown>
      | null;

    createdAt?:
      Date;
  },
) {
  await tx
    .scheduledMatchActivity
    .create({
      data: {
        scheduledMatchId:
          input.scheduledMatchId,

        actorUserId:
          input.actorUserId ??
          undefined,

        eventType:
          input.eventType.slice(
            0,
            32,
          ),

        detail:
          input.detail
            ?.slice(
              0,
              255,
            ) ||
          undefined,

        metadata:
          (
            input.metadata ??
            undefined
          ) as
            | Prisma.InputJsonValue
            | undefined,

        createdAt:
          input.createdAt,
      },
    });
}
