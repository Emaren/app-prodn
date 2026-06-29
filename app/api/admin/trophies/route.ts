import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  executeTrophyAdminAction,
  TrophyActionError,
} from "@/lib/trophies/actions";
import {
  ensureTrophySeedData,
  loadTrophyCommandSnapshot,
} from "@/lib/trophies/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    await ensureTrophySeedData(gate.prisma);
    return NextResponse.json(await loadTrophyCommandSnapshot(gate.prisma));
  } catch (error) {
    console.error("Failed to load Trophy Command Center:", error);
    return NextResponse.json(
      { detail: "Trophy Command Center data is unavailable." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await ensureTrophySeedData(gate.prisma);

    if (payload.action === "clear_guardian") {
      const trophyDbId = Number(payload.trophyId);

      if (!Number.isFinite(trophyDbId) || trophyDbId <= 0) {
        return NextResponse.json({ detail: "Missing trophy id." }, { status: 400 });
      }

      const trophy = await gate.prisma.trophy.findUnique({
        where: { id: trophyDbId },
        select: {
          id: true,
          displayName: true,
          guardianHolderUserId: true,
          guardianHolderDisplayName: true,
          guardianHolderWoloAddress: true,
        },
      });

      if (!trophy) {
        return NextResponse.json({ detail: "Trophy not found." }, { status: 404 });
      }

      if (
        trophy.guardianHolderUserId !== null ||
        trophy.guardianHolderDisplayName ||
        trophy.guardianHolderWoloAddress
      ) {
        await gate.prisma.trophy.update({
          where: { id: trophy.id },
          data: {
            guardianHolderUserId: null,
            guardianHolderDisplayName: null,
            guardianHolderWoloAddress: null,
            updatedAt: new Date(),
          },
        });
      }

      return NextResponse.json(await loadTrophyCommandSnapshot(gate.prisma));
    }

    await executeTrophyAdminAction(gate.prisma, gate.user, payload);
    return NextResponse.json(await loadTrophyCommandSnapshot(gate.prisma));
  } catch (error) {
    if (error instanceof TrophyActionError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    console.error("Trophy Command action failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Trophy Command action failed." },
      { status: 500 }
    );
  }
}
