import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid, SESSION_COOKIE_NAME, verifySession } from "@/lib/session";
import { readProductionUser, usesNonfinancialProductionAuth, usesC03ExistingOnlyAuth } from "@/lib/productionAuth";
import { readC03ExistingUser } from "@/lib/c03ProductionAuthServer";
import { c03ExistingAdminIdentity, c03DeniedLegacyAdminData } from "@/lib/c03AdminIdentityGate";

async function loadAdminUserByUid(uid: string | null) {
  if (!uid) {
    return null;
  }

  // The restricted C03 profile MUST NOT create a legacy Prisma datasource.
  // Admin eligibility survives through A's 21-field reader, but accessing
  // protected admin data requires a separate independently admitted surface.
  if (usesC03ExistingOnlyAuth()) {
    const user = await c03ExistingAdminIdentity(uid, readC03ExistingUser);
    if (!user) return null;
    return { prisma: c03DeniedLegacyAdminData<ReturnType<typeof getPrisma>>(), user };
  }

  const prisma = getPrisma();
  const user = usesNonfinancialProductionAuth() ? await readProductionUser(prisma, uid) : await prisma.user.findUnique({
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
