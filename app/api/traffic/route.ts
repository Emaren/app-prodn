import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveAdminToken() {
  const token = process.env.ADMIN_TOKEN;
  if (token) return token;
  if (process.env.NODE_ENV !== "production") return "secretadmin";
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const uid = await getSessionUid(request);
    if (!uid) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    const adminToken = resolveAdminToken();
    if (!adminToken) {
      return NextResponse.json({ detail: "ADMIN_TOKEN is not configured" }, { status: 500 });
    }

    const base = getBackendUpstreamBase();
    const upstreamResponse = await fetch(`${base}/api/traffic`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      cache: "no-store",
    });

    const payload = await upstreamResponse.text();

    return new NextResponse(payload, {
      status: upstreamResponse.status,
      headers: {
        "content-type": upstreamResponse.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("🔥 Failed to fetch traffic stats:", error);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}