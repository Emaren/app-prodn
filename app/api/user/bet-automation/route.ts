import { NextRequest, NextResponse } from "next/server";

import {
  BET_AUTOMATION_MAX_GAMES,
  BET_AUTOMATION_MAX_RESERVE_WOLO,
  BetAutomationInputError,
  DEFAULT_BET_AUTO_PRESET,
  estimateBetAutomationReserveWolo,
  parseBetAutoPresetDraft,
  readBetAutomationRuntime,
  type BetAutoPresetDraft,
} from "@/lib/betAutomation";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function isPrismaUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
  );
}

type StoredPreset = {
  id: number;
  enabled: boolean;
  winnerStakeWolo: number;
  desyncSide: string;
  desyncStakeWolo: number;
  untilOut: boolean;
  gamesRemaining: number | null;
  selfOnly: boolean;
  version: number;
  pausedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function storedDesyncSide(value: string): BetAutoPresetDraft["desyncSide"] {
  return value === "no" || value === "yes" ? value : "none";
}

function serializePreset(preset: StoredPreset | null) {
  const value = preset ?? {
    ...DEFAULT_BET_AUTO_PRESET,
    id: 0,
    version: 0,
    pausedReason: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  return {
    id: preset ? value.id : null,
    enabled: value.enabled,
    winnerStakeWolo: value.winnerStakeWolo,
    desyncSide: storedDesyncSide(value.desyncSide),
    desyncStakeWolo: value.desyncStakeWolo,
    untilOut: value.untilOut,
    gamesRemaining: value.gamesRemaining,
    selfOnly: true as const,
    estimatedReserveWolo: estimateBetAutomationReserveWolo(value),
    version: value.version,
    pausedReason: value.pausedReason,
    createdAt: preset ? value.createdAt.toISOString() : null,
    updatedAt: preset ? value.updatedAt.toISOString() : null,
  };
}

function responsePayload(input: {
  preset: StoredPreset | null;
  steamId: string | null;
  watcherKeyReady: boolean;
}) {
  const automationRuntime = readBetAutomationRuntime();
  return {
    runtime: automationRuntime,
    limits: {
      maxEstimatedReserveWolo: BET_AUTOMATION_MAX_RESERVE_WOLO,
      maxGames: BET_AUTOMATION_MAX_GAMES,
      selfOnly: true,
    },
    readiness: {
      presetStored: Boolean(input.preset),
      identityReady: Boolean(input.steamId),
      watcherKeyReady: input.watcherKeyReady,
      durableMarketEvaluatorReady: false,
      executionReady: automationRuntime.executionReady,
      detail:
        "The app currently stores and validates this plan only. Durable watcher-market evaluation and Wolo custody execution are not connected.",
    },
    preset: serializePreset(input.preset),
    effectiveEnabled:
      Boolean(input.preset?.enabled) && automationRuntime.executionReady,
  };
}

async function resolveViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: {
      id: true,
      steamId: true,
      betAutoPreset: {
        select: {
          id: true,
          enabled: true,
          winnerStakeWolo: true,
          desyncSide: true,
          desyncStakeWolo: true,
          untilOut: true,
          gamesRemaining: true,
          selfOnly: true,
          version: true,
          pausedReason: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return user ? { prisma, user } : null;
}

async function watcherKeyReadyForUser(
  prisma: ReturnType<typeof getPrisma>,
  userId: number
) {
  const activeWatcherKeys = await prisma.apiKey.count({
    where: {
      userId,
      kind: "watcher",
      revokedAt: null,
    },
  });
  return activeWatcherKeys > 0;
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "No active session" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const watcherKeyReady = await watcherKeyReadyForUser(
      resolved.prisma,
      resolved.user.id
    );
    return NextResponse.json(
      responsePayload({
        preset: resolved.user.betAutoPreset,
        steamId: resolved.user.steamId,
        watcherKeyReady,
      }),
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to load bet automation settings:", error);
    return NextResponse.json(
      { detail: "Auto-bet preview settings are unavailable." },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "No active session" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | (Record<string, unknown> & { expectedVersion?: unknown })
      | null;
    const draft = parseBetAutoPresetDraft(body);
    const expectedVersion = body?.expectedVersion;

    if (
      expectedVersion !== undefined &&
      (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0)
    ) {
      throw new BetAutomationInputError(
        "expectedVersion must be a non-negative whole number."
      );
    }

    const saved = await resolved.prisma.$transaction(async (tx) => {
      const current = await tx.betAutoPreset.findUnique({
        where: { userId: resolved.user.id },
        select: { id: true, version: true },
      });

      if (
        typeof expectedVersion === "number" &&
        expectedVersion !== (current?.version ?? 0)
      ) {
        throw new BetAutomationInputError(
          "This auto-bet plan changed in another tab. Refresh it before saving again."
        );
      }

      const data = {
        enabled: draft.enabled,
        winnerStakeWolo: draft.winnerStakeWolo,
        desyncSide: draft.desyncSide,
        desyncStakeWolo: draft.desyncStakeWolo,
        untilOut: draft.untilOut,
        gamesRemaining: draft.gamesRemaining,
        selfOnly: true,
        pausedReason: draft.enabled ? null : "user_paused",
      };

      if (!current) {
        return tx.betAutoPreset.create({
          data: {
            userId: resolved.user.id,
            ...data,
          },
        });
      }

      const updated = await tx.betAutoPreset.updateMany({
        where: {
          id: current.id,
          version: current.version,
        },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new BetAutomationInputError(
          "This auto-bet plan changed in another tab. Refresh it before saving again."
        );
      }

      return tx.betAutoPreset.findUniqueOrThrow({
        where: { id: current.id },
      });
    });

    const watcherKeyReady = await watcherKeyReadyForUser(
      resolved.prisma,
      resolved.user.id
    );
    return NextResponse.json(
      responsePayload({
        preset: saved,
        steamId: resolved.user.steamId,
        watcherKeyReady,
      }),
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof BetAutomationInputError) {
      const status = error.message.includes("another tab") ? 409 : 400;
      return NextResponse.json(
        { detail: error.message },
        { status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (isPrismaUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          detail:
            "This auto-bet plan was created in another tab. Refresh it before saving again.",
        },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    console.error("Failed to save bet automation settings:", error);
    return NextResponse.json(
      { detail: "Auto-bet preview settings could not be saved." },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
