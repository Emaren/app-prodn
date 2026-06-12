import type { NextRequest } from "next/server";

import type { PrismaClient } from "@/lib/generated/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import {
  readWatcherTelemetryApiKey,
  resolveWatcherTelemetryIdentity,
} from "@/lib/watcherTelemetry";

export const AOE2WAR_STREAM_SOURCE_TYPES = ["browser", "watcher_native"] as const;

export type AoE2WarStreamSourceType = (typeof AOE2WAR_STREAM_SOURCE_TYPES)[number];

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

export function normalizeAoE2WarStreamSourceType(
  value: unknown,
  fallback: AoE2WarStreamSourceType
): AoE2WarStreamSourceType {
  const normalized = String(value ?? "").trim();
  return AOE2WAR_STREAM_SOURCE_TYPES.includes(normalized as AoE2WarStreamSourceType)
    ? (normalized as AoE2WarStreamSourceType)
    : fallback;
}

export function isAoE2WarManagedStream(stream: {
  provider?: string | null;
  sourceType?: string | null;
  userId?: number | null;
}, userId: number) {
  return (
    stream?.userId === userId &&
    stream.provider === "aoe2war" &&
    AOE2WAR_STREAM_SOURCE_TYPES.includes(stream.sourceType as AoE2WarStreamSourceType)
  );
}

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
