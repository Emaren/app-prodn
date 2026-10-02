import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    const groups = await gate.prisma.championshipTransferGroup.findMany({
      orderBy: { createdAt: "desc" }, take: 50,
      include: { seats: { orderBy: { seat: "asc" } } },
    });
    const titleIds = [...new Set(groups.map(group => group.trophyId))];
    const titles = await gate.prisma.trophy.findMany({
      where: { id: { in: titleIds } }, select: { id: true, trophyId: true, displayName: true },
    });
    return NextResponse.json({ groups: groups.map(group => ({
      ...group, titleName: titles.find(title => title.id === group.trophyId)?.displayName ?? `Title #${group.trophyId}`,
      trophyKey: titles.find(title => title.id === group.trophyId)?.trophyId ?? null,
    })), executorAvailable: false, reasonCode: "NFT_EXECUTOR_UNAVAILABLE" });
  } catch (error) {
    console.error("Championship transfer inspection unavailable:", error);
    return NextResponse.json({ detail: "Belt transfer evidence is unavailable." }, { status: 503 });
  }
}
