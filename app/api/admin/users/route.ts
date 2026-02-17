import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

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

    const base = getBackendUpstreamBase();
    const adminToken = resolveAdminToken();
    if (!adminToken) {
      return NextResponse.json({ detail: "ADMIN_TOKEN is not configured" }, { status: 500 });
    }
    const res = await fetch(`${base}/api/admin/users`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("🔥 Backend fetch failed:", err);
    return new Response("Internal error", { status: 500 });
  }
}
