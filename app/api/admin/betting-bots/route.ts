import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import type { PrismaClient } from "@/lib/generated/prisma";
import {
  BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO,
  BETTING_BOT_MAX_BALANCE_FLOOR_WOLO,
  BETTING_BOT_MAX_DAILY_EXPOSURE_WOLO,
  BETTING_BOT_MAX_MARKET_EXPOSURE_WOLO,
  BettingBotInputError,
  buildBettingBotCommentaryPrompt,
  parseBettingBotConfigDraft,
  readBettingBotRuntime,
  type BettingBotMode,
  type BettingBotPolicyConfig,
} from "@/lib/bettingBots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

const BOT_SELECT = {
  id: true,
  slug: true,
  reservedUid: true,
  displayName: true,
  avatarUrl: true,
  mode: true,
  commentaryEnabled: true,
  commentaryPrompt: true,
  oppositeOnly: true,
  defaultCounterstakeWolo: true,
  maxCounterstakeWolo: true,
  perMarketExposureWolo: true,
  dailyExposureWolo: true,
  balanceFloorWolo: true,
  policyId: true,
  policyVersion: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

type StoredBot = {
  id: number;
  slug: string;
  reservedUid: string;
  displayName: string;
  avatarUrl: string | null;
  mode: string;
  commentaryEnabled: boolean;
  commentaryPrompt: string;
  oppositeOnly: boolean;
  defaultCounterstakeWolo: number;
  maxCounterstakeWolo: number;
  perMarketExposureWolo: number;
  dailyExposureWolo: number;
  balanceFloorWolo: number;
  policyId: string;
  policyVersion: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

class BettingBotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BettingBotConflictError";
  }
}

function isBettingBotMode(value: string): value is BettingBotMode {
  return value === "disabled" || value === "shadow" || value === "live";
}

function policyConfig(bot: StoredBot): BettingBotPolicyConfig {
  return {
    ...bot,
    mode: isBettingBotMode(bot.mode) ? bot.mode : "disabled",
    oppositeOnly: true,
  };
}

function serializeBot(bot: StoredBot) {
  const config = policyConfig(bot);
  return {
    ...config,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
    runtime: readBettingBotRuntime(config),
    commentaryPromptPreview: buildBettingBotCommentaryPrompt(config),
  };
}

function requestId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(value.trim())
  ) {
    throw new BettingBotInputError(
      "requestId must be an 8-100 character idempotency token."
    );
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new BettingBotInputError(`${field} must be a positive whole number.`);
  }
  return value as number;
}

function isUniqueConstraintError(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      (value as { code?: unknown }).code === "P2002"
  );
}

function changedFields(current: StoredBot, next: ReturnType<typeof parseBettingBotConfigDraft>) {
  const keys = [
    "displayName",
    "avatarUrl",
    "mode",
    "commentaryEnabled",
    "commentaryPrompt",
    "oppositeOnly",
    "defaultCounterstakeWolo",
    "maxCounterstakeWolo",
    "perMarketExposureWolo",
    "dailyExposureWolo",
    "balanceFloorWolo",
  ] as const;
  return keys.filter((key) => current[key] !== next[key]);
}

async function loadSnapshot(prisma: PrismaClient) {
  const [bots, recentActions] = await Promise.all([
    prisma.bettingBotConfig.findMany({
      orderBy: [{ id: "asc" }],
      select: BOT_SELECT,
    }),
    prisma.betCounterAction.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        botConfigId: true,
        botSlugSnapshot: true,
        eventType: true,
        configuredModeSnapshot: true,
        effectiveModeSnapshot: true,
        proposedCounterstakeWolo: true,
        committedCounterstakeWolo: true,
        reasonCode: true,
        reasonDetail: true,
        custodyVerified: true,
        stakeTxHash: true,
        actorUid: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      oppositeOnly: true,
      perActionHardCapWolo: BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO,
      llmAuthority: "flavour_only" as const,
      executionInstalled: false,
    },
    limits: {
      perActionHardCapWolo: BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO,
      maxPerMarketExposureWolo: BETTING_BOT_MAX_MARKET_EXPOSURE_WOLO,
      maxDailyExposureWolo: BETTING_BOT_MAX_DAILY_EXPOSURE_WOLO,
      maxBalanceFloorWolo: BETTING_BOT_MAX_BALANCE_FLOOR_WOLO,
    },
    bots: bots.map((bot) => serializeBot(bot as StoredBot)),
    recentActions: recentActions.map((action) => ({
      ...action,
      createdAt: action.createdAt.toISOString(),
    })),
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  try {
    return NextResponse.json(await loadSnapshot(gate.prisma), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.warn("Betting bot config load failed:", error);
    return NextResponse.json(
      { detail: "Could not load counter-bettor configuration." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  let recovery: { id: number; idempotencyKey: string } | null = null;
  try {
    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const id = positiveInteger(body?.id, "id");
    const expectedVersion = positiveInteger(
      body?.expectedVersion,
      "expectedVersion"
    );
    const updateRequestId = requestId(body?.requestId);
    const draft = parseBettingBotConfigDraft(body);
    const idempotencyKey = `admin-config:${id}:${updateRequestId}`;
    recovery = { id, idempotencyKey };

    const result = await gate.prisma.$transaction(async (tx) => {
      const duplicate = await tx.betCounterAction.findUnique({
        where: { idempotencyKey },
        select: { id: true, botConfigId: true },
      });
      if (duplicate) {
        if (duplicate.botConfigId !== id) {
          throw new BettingBotConflictError(
            "That request id belongs to another counter-bettor."
          );
        }
        const bot = await tx.bettingBotConfig.findUnique({
          where: { id },
          select: BOT_SELECT,
        });
        if (!bot) throw new BettingBotInputError("Counter-bettor not found.");
        return { bot: bot as StoredBot, duplicate: true };
      }

      const current = await tx.bettingBotConfig.findUnique({
        where: { id },
        select: BOT_SELECT,
      });
      if (!current) throw new BettingBotInputError("Counter-bettor not found.");
      const storedCurrent = current as StoredBot;
      if (storedCurrent.version !== expectedVersion) {
        throw new BettingBotConflictError(
          "This counter-bettor changed in another tab. Reload before saving."
        );
      }

      const update = await tx.bettingBotConfig.updateMany({
        where: { id, version: expectedVersion },
        data: {
          ...draft,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) {
        throw new BettingBotConflictError(
          "This counter-bettor changed while it was being saved. Reload and retry."
        );
      }

      const updated = await tx.bettingBotConfig.findUnique({
        where: { id },
        select: BOT_SELECT,
      });
      if (!updated) {
        throw new BettingBotConflictError(
          "Counter-bettor configuration disappeared during the update."
        );
      }
      const storedUpdated = updated as StoredBot;
      const runtimeState = readBettingBotRuntime(policyConfig(storedUpdated));
      const fields = changedFields(storedCurrent, draft);

      await tx.betCounterAction.create({
        data: {
          botConfigId: storedUpdated.id,
          botSlugSnapshot: storedUpdated.slug,
          reservedUidSnapshot: storedUpdated.reservedUid,
          eventType: "config_updated",
          idempotencyKey,
          policyIdSnapshot: storedUpdated.policyId,
          policyVersionSnapshot: storedUpdated.policyVersion,
          configuredModeSnapshot: storedUpdated.mode,
          effectiveModeSnapshot: runtimeState.effectiveMode,
          custodyVerified: false,
          reasonCode: "ADMIN_CONFIG_UPDATED",
          reasonDetail: fields.length
            ? `Updated ${fields.join(", ")}.`
            : "Idempotent save recorded with no policy-field changes.",
          actorUid: gate.user.uid,
          metadata: {
            requestId: updateRequestId,
            changedFields: fields,
            llmAuthority: "flavour_only",
            executionInstalled: false,
          },
        },
      });

      return { bot: storedUpdated, duplicate: false };
    });

    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        bot: serializeBot(result.bot),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (recovery && isUniqueConstraintError(error)) {
      const duplicate = await gate.prisma.betCounterAction.findUnique({
        where: { idempotencyKey: recovery.idempotencyKey },
        select: { botConfigId: true },
      });
      if (duplicate?.botConfigId === recovery.id) {
        const bot = await gate.prisma.bettingBotConfig.findUnique({
          where: { id: recovery.id },
          select: BOT_SELECT,
        });
        if (bot) {
          return NextResponse.json(
            { ok: true, duplicate: true, bot: serializeBot(bot as StoredBot) },
            { headers: NO_STORE_HEADERS }
          );
        }
      }
    }
    if (error instanceof BettingBotConflictError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof BettingBotInputError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    console.warn("Betting bot config update failed:", error);
    return NextResponse.json(
      { detail: "Could not update that counter-bettor." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
