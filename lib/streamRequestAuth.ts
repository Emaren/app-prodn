import type { NextRequest } from "next/server";

import type { PrismaClient } from "@/lib/generated/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import {
  readWatcherTelemetryApiKey,
  resolveWatcherTelemetryIdentity,
} from "@/lib/watcherTelemetry";
export {
  AOE2WAR_STREAM_SOURCE_TYPES,
  isAoE2WarManagedStream,
  normalizeAoE2WarStreamSourceType,
  type AoE2WarStreamSourceType,
} from "@/lib/streamIdentity";

export type StreamRequestActor = {
  authMode: "session" | "watcher_key";
  user: {
    id: number;
    uid: string;
    inGameName?: string | null;
    steamPersonaName?: string | null;
  };
  identity: {
    userId: number | null;
    userUid: string | null;
    resolved: boolean;
  };
};

type ResolveStreamActorOptions = {
  touchWatcherKey?: boolean;
};

export async function resolveStreamRequestActor(
  prisma: PrismaClient,
  request: NextRequest,
  options: ResolveStreamActorOptions = {}
): Promise<StreamRequestActor | null> {
  const sessionUid = await resolveRequestUid(request);
  if (sessionUid) {
    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    if (user) {
      return {
        authMode: "session",
        user,
        identity: {
          userId: user.id,
          userUid: user.uid,
          resolved: true,
        },
      };
    }
  }

  const identity = await resolveWatcherTelemetryIdentity(
    prisma,
    readWatcherTelemetryApiKey(request),
    { touchLastUsedAt: options.touchWatcherKey }
  );
  if (!identity.resolved || !identity.userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    authMode: "watcher_key",
    user,
    identity,
  };
}
