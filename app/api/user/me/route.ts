import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { toUserApi } from "@/lib/userDto";
import { resolveRequestUid, resolveRequestEmail } from "@/lib/requestIdentity";

export const runtime = "nodejs";

function normalizeInGameName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

function nameLooksValid(name: string) {
  // keep it permissive; you can tighten later
  if (name.length < 2) return false;
  if (name.length > 64) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      uid: true,
      email: true,
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
    },
  });

  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });
  return NextResponse.json(toUserApi(user));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const email = resolveRequestEmail(request, body);
  const incomingName = typeof body?.inGameName === "string" ? body.inGameName : null;

  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      email: true,
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
    },
  });

  if (!existing) {
    const userCount = await prisma.user.count();
    const created = await prisma.user.create({
      data: {
        uid,
        email: email ?? null,
        inGameName: incomingName ? normalizeInGameName(incomingName) : null,
        isAdmin: userCount === 0,
      },
      select: {
        uid: true,
        email: true,
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
      },
    });

    return NextResponse.json(toUserApi(created));
  }

  // update email if provided
  const wantsEmailUpdate = typeof email === "string" && email.trim() && email !== existing.email;

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
    const updated = await prisma.user.update({
      where: { uid },
      data: {
        email: wantsEmailUpdate ? (email as string) : existing.email,

        // name change kills name-verification
        inGameName: nextName,
        verified: false,
        lockName: false,
        verificationLevel: steamLinked ? 1 : 0,
        verificationMethod: steamLinked ? "steam" : "none",
        verifiedAt: null,
      },
      select: {
        uid: true,
        email: true,
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
      },
    });

    return NextResponse.json(toUserApi(updated));
  }

  // only email update
  const updated = await prisma.user.update({
    where: { uid },
    data: { email: email as string },
    select: {
      uid: true,
      email: true,
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
    },
  });

  return NextResponse.json(toUserApi(updated));
}