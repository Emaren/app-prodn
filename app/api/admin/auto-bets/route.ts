import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readBetAutomationRuntime } from "@/lib/betAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Read-only admin inspection surface. No custody authorization, wager placement,
 * credential material, session token or sourceEvidence is returned.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  try {
    const db = gate.prisma;
    const [presetCount, activePresetCount, executionCount, presets, executions, statusCounts] =
      await Promise.all([
        db.betAutoPreset.count(),
        db.betAutoPreset.count({ where: { enabled: true } }),
        db.betAutoExecution.count(),
        db.betAutoPreset.findMany({
          take: 100,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true, enabled: true, version: true,
            winnerStakeWolo: true, desyncSide: true, desyncStakeWolo: true,
            untilOut: true, gamesRemaining: true, updatedAt: true,
            pausedReason: true,
            user: { select: { uid: true, inGameName: true, steamPersonaName: true } },
          },
        }),
        db.betAutoExecution.findMany({
          take: 75,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true, presetVersion: true, status: true, reason: true,
            winnerStakeWolo: true, desyncSide: true, desyncStakeWolo: true,
            createdAt: true, attemptCount: true, acceptedAt: true,
            winnerMarket: { select: { id: true, title: true } },
            preset: { select: { user: { select: { uid: true, inGameName: true } } } },
          },
        }),
        db.betAutoExecution.groupBy({ by: ["status"], _count: { id: true } }),
      ]);

    return NextResponse.json({
      schema: 1,
      mode: readBetAutomationRuntime().mode,
      fundingEnabled: readBetAutomationRuntime().executionReady,
      totals: {
        presets: presetCount, enabledPresets: activePresetCount,
        executions: executionCount,
      },
      executionStatuses: statusCounts.map((item) => ({
        status: item.status, count: item._count.id,
      })),
      presets: presets.map((p) => ({
        id: p.id, uid: p.user.uid,
        player: p.user.inGameName || p.user.steamPersonaName || "Warrior",
        enabled: p.enabled, version: p.version, winnerStakeWolo: p.winnerStakeWolo,
        desyncSide: p.desyncSide, desyncStakeWolo: p.desyncStakeWolo,
        untilOut: p.untilOut, gamesRemaining: p.gamesRemaining,
        pausedReason: p.pausedReason, updatedAt: p.updatedAt.toISOString(),
      })),
      executions: executions.map((e) => ({
        id: e.id, uid: e.preset.user.uid,
        player: e.preset.user.inGameName || "Warrior",
        status: e.status, reason: e.reason,
        presetVersion: e.presetVersion,
        winnerMarketId: e.winnerMarket.id, market: e.winnerMarket.title,
        winnerStakeWolo: e.winnerStakeWolo, desyncSide: e.desyncSide,
        desyncStakeWolo: e.desyncStakeWolo, attemptCount: e.attemptCount,
        acceptedAt: e.acceptedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      bounded: { presets: 100, executions: 75 },
    }, { headers: PRIVATE });
  } catch (error) {
    console.warn("Mecha auto command telemetry unavailable:", error);
    return NextResponse.json({ detail: "Mecha telemetry unavailable" }, { status: 500, headers: PRIVATE });
  }
}
