// /var/www/AoE2HDBets/app-prodn/app/api/user/me/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { toUserApi } from "@/lib/userDto";
import { resolveRequestUid, resolveRequestEmail } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeInGameName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

function nameLooksValid(name: string) {
  // keep it permissive; you can tighten later
  if (name.length < 2) return false;
  if (name.length > 64) return false;
  return true;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isPrismaUnique(err: unknown, field?: string) {
  const e = err as any;
  if (!e || typeof e !== "object") return false;
  // PrismaClientKnownRequestError: code P2002 = unique constraint
  if (e.code !== "P2002") return false;
  if (!field) return true;

  const targets = e?.meta?.target;
  if (Array.isArray(targets)) return targets.includes(field);
  if (typeof targets === "string") return targets.includes(field);
  return false;
}

const USER_SELECT = {
  id: true,
  uid: true,
  email: true,
  token: true,

  inGameName: true,
  verified: true,
  lockName: true,
  walletAddress: true,
  createdAt: true,
  lastSeen: true,
  isAdmin: true,

  steamId: true,
  steamPersonaName: true,
  verificationLevel: true,
  verificationMethod: true,
  verifiedAt: true,
} as const;

export async function GET(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: USER_SELECT,
  });

  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });
  return NextResponse.json(toUserApi(user));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const emailRaw = resolveRequestEmail(request, body);
  const emailNorm = typeof emailRaw === "string" && emailRaw.trim() ? normalizeEmail(emailRaw) : null;

  const incomingName = typeof body?.inGameName === "string" ? body.inGameName : null;

  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({
    where: { uid },
    select: USER_SELECT,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Create / attach-by-email branch (fixes "Unique constraint failed on (email)")
  // ────────────────────────────────────────────────────────────────────────────
  if (!existing) {
    // If we have an email and that email already exists, attach this uid to that record.
    if (emailNorm) {
      const byEmail = await prisma.user.findUnique({
        where: { email: emailNorm },
        select: USER_SELECT,
      });

      if (byEmail) {
        // If same uid already, just return it.
        if (byEmail.uid === uid) {
          return NextResponse.json(toUserApi(byEmail));
        }

        // Only update name if provided and not locked, and it actually changes.
        let nextName: string | null = byEmail.inGameName ?? null;
        if (incomingName && !byEmail.lockName) {
          const n = normalizeInGameName(incomingName);
          if (nameLooksValid(n) && n !== (byEmail.inGameName ?? "")) {
            nextName = n;
          }
        }

        const updated = await prisma.user.update({
          where: { email: emailNorm },
          data: {
            uid,
            // keep email as-is (already emailNorm)
            inGameName: nextName,
          },
          select: USER_SELECT,
        });

        return NextResponse.json(toUserApi(updated));
      }
    }

    // Otherwise create new. If a race causes P2002(email), fall back to attach-by-email.
    try {
      const userCount = await prisma.user.count();

      const created = await prisma.user.create({
        data: {
          uid,
          email: emailNorm,
          inGameName: incomingName ? normalizeInGameName(incomingName) : null,
          isAdmin: userCount === 0,
        },
        select: USER_SELECT,
      });

      return NextResponse.json(toUserApi(created));
    } catch (err) {
      // If email was unique and collided, attach to existing-by-email.
      if (emailNorm && isPrismaUnique(err, "email")) {
        const byEmail = await prisma.user.findUnique({
          where: { email: emailNorm },
          select: USER_SELECT,
        });

        if (byEmail) {
          const updated = await prisma.user.update({
            where: { email: emailNorm },
            data: { uid },
            select: USER_SELECT,
          });

          return NextResponse.json(toUserApi(updated));
        }
      }
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Update branch
  // ────────────────────────────────────────────────────────────────────────────

  // update email if provided
  const wantsEmailUpdate =
    typeof emailNorm === "string" && emailNorm.trim() && emailNorm !== (existing.email ?? null);

  // update name if provided
  const wantsNameUpdate =
    typeof incomingName === "string" &&
    normalizeInGameName(incomingName) !== (existing.inGameName ?? "");

  if (!wantsEmailUpdate && !wantsNameUpdate) {
    return NextResponse.json(toUserApi(existing));
  }

  if (wantsNameUpdate) {
    if (existing.lockName) {
      return NextResponse.json(
        { detail: "Name is locked (verified). Use admin tools to change." },
        { status: 403 }
      );
    }

    const nextName = normalizeInGameName(incomingName!);
    if (!nameLooksValid(nextName)) {
      return NextResponse.json({ detail: "Invalid in-game name" }, { status: 400 });
    }

    const steamLinked = !!existing.steamId;

    try {
      const updated = await prisma.user.update({
        where: { uid },
        data: {
          email: wantsEmailUpdate ? (emailNorm as string) : existing.email,

          // name change kills name-verification
          inGameName: nextName,
          verified: false,
          lockName: false,
          verificationLevel: steamLinked ? 1 : 0,
          verificationMethod: steamLinked ? "steam" : "none",
          verifiedAt: null,
        },
        select: USER_SELECT,
      });

      return NextResponse.json(toUserApi(updated));
    } catch (err) {
      if (wantsEmailUpdate && isPrismaUnique(err, "email")) {
        return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
      }
      throw err;
    }
  }

  // only email update
  try {
    const updated = await prisma.user.update({
      where: { uid },
      data: { email: emailNorm as string },
      select: USER_SELECT,
    });

    return NextResponse.json(toUserApi(updated));
  } catch (err) {
    if (isPrismaUnique(err, "email")) {
      return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
