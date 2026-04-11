import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid, SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

async function loadAdminUserByUid(uid: string | null) {
  if (!uid) {
    return null;
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true, isAdmin: true },
  });

  if (!user?.isAdmin) {
    return null;
  }

  return { prisma, user };
}

export async function requireAdmin(request: NextRequest) {
  const uid = await getSessionUid(request);
  const gate = await loadAdminUserByUid(uid);
  if (!gate) {
    if (!uid) {
      return { error: NextResponse.json({ detail: "Unauthorized" }, { status: 401 }) };
    }
    return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403 }) };
  }

  return gate;
}

export async function requireServerAdmin() {
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const gate = await loadAdminUserByUid(claims?.uid ?? null);

  if (!gate) {
    redirect("/");
  }

  return gate;
}
