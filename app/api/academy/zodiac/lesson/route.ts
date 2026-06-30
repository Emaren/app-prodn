import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { verifyWoloTransfer } from "@/lib/woloBetSettlement";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";
import { ZODIAC_TRAINING_CONFIG } from "@/lib/zodiacTraining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function normalizeTxHash(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(normalized) ? normalized : null;
}

function normalizeWoloAddress(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(normalized) ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

async function verifyAcademyMemo(txHash: string) {
  const lookupUrl = buildWoloRestTxLookupUrl(txHash);
  if (!lookupUrl) return false;

  const response = await fetch(lookupUrl, {
    cache: "no-store",
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return false;

  const payload = asRecord(await response.json().catch(() => null));
  const tx = asRecord(payload?.tx);
  const body = asRecord(tx?.body);
  return body?.memo === ZODIAC_TRAINING_CONFIG.firstLessonMemo;
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "Sign in before reserving an Academy lesson." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const txHash = normalizeTxHash(body.txHash);
    const fromAddress = normalizeWoloAddress(body.fromAddress);
    if (!txHash || !fromAddress) {
      return NextResponse.json(
        { detail: "A valid WoloChain payment proof is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const prisma = getPrisma();
    const [student, advisor] = await Promise.all([
      prisma.user.findUnique({
        where: { uid: sessionUid },
        select: { id: true, uid: true },
      }),
      prisma.user.findUnique({
        where: { uid: ZODIAC_TRAINING_CONFIG.userUid },
        select: { id: true, uid: true, walletAddress: true },
      }),
    ]);
    if (!student) {
      return NextResponse.json(
        { detail: "AoE2WAR user not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const advisorWallet = normalizeWoloAddress(advisor?.walletAddress);
    if (!advisor || !advisorWallet) {
      return NextResponse.json(
        { detail: "Zodiac has not linked an Academy payout wallet yet." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const existing = await prisma.userActivityEvent.findFirst({
      where: {
        type: "academy_lesson_payment",
        label: txHash,
      },
      select: {
        id: true,
        userId: true,
        metadata: true,
      },
    });
    if (existing && existing.userId !== student.id) {
      return NextResponse.json(
        { detail: "That WOLO payment proof is already attached to another user." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const amountWolo = ZODIAC_TRAINING_CONFIG.coachingPriceWolo || 100;
    const verification = await verifyWoloTransfer({
      txHash,
      fromAddress,
      toAddress: advisorWallet,
      expectedAmountWolo: amountWolo,
    });
    if (!verification.verified) {
      return NextResponse.json(
        {
          detail:
            verification.detail ||
            "The lesson payment has not appeared on WoloChain yet.",
          txHash,
          proofUrl: verification.proofUrl || null,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }
    if (!(await verifyAcademyMemo(txHash))) {
      return NextResponse.json(
        {
          detail:
            "The WOLO transfer is real, but it does not carry the Academy first-lesson memo.",
          txHash,
          proofUrl: verification.proofUrl || null,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    const event =
      existing ||
      (await prisma.userActivityEvent.create({
        data: {
          userId: student.id,
          type: "academy_lesson_payment",
          path: "/zodiac",
          label: txHash,
          metadata: {
            advisorUid: advisor.uid,
            amountWolo,
            fromAddress,
            toAddress: advisorWallet,
            txHash,
            proofUrl: verification.proofUrl || null,
            state: "paid",
          },
        },
        select: {
          id: true,
          userId: true,
          metadata: true,
        },
      }));

    return NextResponse.json(
      {
        ok: true,
        reservationId: event.id,
        amountWolo,
        txHash: verification.txHash || txHash,
        proofUrl: verification.proofUrl || null,
        contactHref: `/contact-emaren?user=${encodeURIComponent(
          advisor.uid
        )}&academyTx=${encodeURIComponent(verification.txHash || txHash)}`,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to verify Zodiac lesson payment:", error);
    return NextResponse.json(
      { detail: "The Academy could not verify this payment." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
