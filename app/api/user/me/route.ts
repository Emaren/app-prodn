// /var/www/AoE2HDBets/app-prodn/app/api/user/me/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hydrateSteamIdentity } from "@/lib/steamIdentity";
import { fetchUserVerification, toUserApi } from "@/lib/userDto";
import { loadPendingWoloClaimSummaryForUser } from "@/lib/pendingWoloClaims";
import { resolveRequestUid, resolveRequestEmail } from "@/lib/requestIdentity";
import { validateWoloAddress } from "@/lib/woloBetSettlement";

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

function normalizeWalletAddress(address: string) {
  return address.trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isPrismaUnique(err: unknown, field?: string) {
  if (!isRecord(err)) return false;

  const code = err["code"];
  if (code !== "P2002") return false;
  if (!field) return true;

  const meta = err["meta"];
  if (!isRecord(meta)) return false;

  const target = meta["target"];
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
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

  let verification = await fetchUserVerification(prisma, uid);
  if (verification.steamId) {
    const hydration = await hydrateSteamIdentity(prisma, uid);
    verification = hydration.verification;
    if (hydration.seededPlayableName) {
      const refreshedUser = await prisma.user.findUnique({
        where: { uid },
        select: USER_SELECT,
      });

      if (refreshedUser) {
        const claimSummary = await loadPendingWoloClaimSummaryForUser(prisma, {
          id: refreshedUser.id,
          inGameName: refreshedUser.inGameName,
          steamPersonaName: verification.steamPersonaName ?? null,
        });
        return NextResponse.json({
          ...toUserApi(refreshedUser, verification),
          pendingClaimAmountWolo: claimSummary.pendingAmountWolo,
          pendingClaimCount: claimSummary.pendingCount,
          pendingClaimLatestCreatedAt: claimSummary.latestCreatedAt,
        });
      }
    }
  }

  const claimSummary = await loadPendingWoloClaimSummaryForUser(prisma, {
    id: user.id,
    inGameName: user.inGameName,
    steamPersonaName: verification.steamPersonaName ?? null,
  });

  return NextResponse.json({
    ...toUserApi(user, verification),
    pendingClaimAmountWolo: claimSummary.pendingAmountWolo,
    pendingClaimCount: claimSummary.pendingCount,
    pendingClaimLatestCreatedAt: claimSummary.latestCreatedAt,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const emailRaw = resolveRequestEmail(request, body);
  const emailNorm =
    typeof emailRaw === "string" && emailRaw.trim() ? normalizeEmail(emailRaw) : null;

  const incomingName =
    typeof body?.inGameName === "string"
      ? body.inGameName
      : typeof body?.in_game_name === "string"
        ? body.in_game_name
        : null;
  const incomingWalletAddress =
    typeof body?.walletAddress === "string"
      ? normalizeWalletAddress(body.walletAddress)
      : typeof body?.wallet_address === "string"
        ? normalizeWalletAddress(body.wallet_address)
        : null;

  if (incomingWalletAddress) {
    const addressError = validateWoloAddress(incomingWalletAddress);
    if (addressError) {
      return NextResponse.json({ detail: addressError }, { status: 400 });
    }
  }

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
            walletAddress: incomingWalletAddress || byEmail.walletAddress,
          },
          select: USER_SELECT,
        });

        return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
      }
    }

    // Otherwise create new. If a race causes P2002(email), fall back to attach-by-email.
    try {
      const created = await prisma.user.create({
        data: {
          uid,
          email: emailNorm,
          inGameName: incomingName ? normalizeInGameName(incomingName) : null,
          walletAddress: incomingWalletAddress,
          isAdmin: false,
        },
        select: USER_SELECT,
      });

      return NextResponse.json(toUserApi(created, await fetchUserVerification(prisma, created.uid)));
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
            data: {
              uid,
              walletAddress: incomingWalletAddress || byEmail.walletAddress,
            },
            select: USER_SELECT,
          });

          return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
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
  const wantsWalletUpdate =
    typeof incomingWalletAddress === "string" &&
    incomingWalletAddress.length > 0 &&
    incomingWalletAddress !== (existing.walletAddress ?? "");

  if (!wantsEmailUpdate && !wantsNameUpdate && !wantsWalletUpdate) {
    return NextResponse.json(toUserApi(existing, await fetchUserVerification(prisma, existing.uid)));
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

    try {
      const updated = await prisma.user.update({
        where: { uid },
        data: {
          email: wantsEmailUpdate ? (emailNorm as string) : existing.email,
          inGameName: nextName,
          walletAddress: wantsWalletUpdate ? incomingWalletAddress : existing.walletAddress,
          verified: false,
          lockName: false,
        },
        select: USER_SELECT,
      });

      const verification = await fetchUserVerification(prisma, uid);
      const steamLinked = Boolean(verification.steamId);

      await prisma.$executeRaw`
        UPDATE public.users
        SET
          verification_level = ${steamLinked ? 1 : 0},
          verification_method = ${steamLinked ? "steam" : "none"},
          verified_at = NULL
        WHERE uid = ${uid}
      `;

      return NextResponse.json(
        toUserApi(updated, {
          ...verification,
          verificationLevel: steamLinked ? 1 : 0,
          verificationMethod: steamLinked ? "steam" : "none",
          verifiedAt: null,
        })
      );
    } catch (err) {
      if (wantsEmailUpdate && isPrismaUnique(err, "email")) {
        return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
      }
      throw err;
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { uid },
      data: {
        email: wantsEmailUpdate ? (emailNorm as string) : existing.email,
        walletAddress: wantsWalletUpdate ? incomingWalletAddress : existing.walletAddress,
      },
      select: USER_SELECT,
    });

    return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
  } catch (err) {
    if (wantsEmailUpdate && isPrismaUnique(err, "email")) {
      return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
