import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export async function requireAdmin(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return { error: NextResponse.json({ detail: "Unauthorized" }, { status: 401 }) };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true, isAdmin: true },
  });

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403 }) };
  }

  return { prisma, user };
}
