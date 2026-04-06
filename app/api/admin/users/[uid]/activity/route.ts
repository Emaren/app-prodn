import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma } = gate;
    const { uid } = await context.params;
    const url = new URL(request.url);

    const offset = parsePositiveInt(url.searchParams.get("offset"), 0, 50_000);
    const take = parsePositiveInt(url.searchParams.get("take"), 50, 50);

    const target = await prisma.user.findUnique({
      where: { uid },
      select: { id: true },
    });

    if (!target) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const [rows, total] = await Promise.all([
      prisma.userActivityEvent.findMany({
        where: { userId: target.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take,
        select: {
          id: true,
          type: true,
          path: true,
          label: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.userActivityEvent.count({
        where: { userId: target.id },
      }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      type: row.type,
      path: row.path,
      label: row.label,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
      createdAt: row.createdAt.toISOString(),
    }));

    const nextOffset = offset + items.length < total ? offset + items.length : null;

    return NextResponse.json({
      items,
      total,
      nextOffset,
    });
  } catch (error) {
    console.error("Failed to load admin activity history:", error);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}
