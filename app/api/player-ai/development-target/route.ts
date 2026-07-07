import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MEMO = "Hasten development please — AoE2WAR Player AI";

function validWoloAddress(value?: string | null) {
  return /^wolo1[0-9a-z]{20,90}$/i.test((value || "").trim());
}

export async function GET() {
  const configured =
    process.env.EMAREN_WOLO_ADDRESS?.trim() ||
    process.env.WOLO_EMAREN_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_EMAREN_WOLO_ADDRESS?.trim() ||
    "";

  if (validWoloAddress(configured)) {
    return NextResponse.json({
      ok: true,
      walletAddress: configured,
      amountWolo: 100,
      memo: DEFAULT_MEMO,
      source: "env",
    });
  }

  try {
    const prisma = getPrisma();

    const emaren = await prisma.user.findFirst({
      where: {
        OR: [
          { inGameName: { equals: "Emaren", mode: "insensitive" } },
          { steamPersonaName: { equals: "Emaren", mode: "insensitive" } },
          { uid: { equals: "Emaren", mode: "insensitive" } },
        ],
      },
      select: {
        walletAddress: true,
      },
      orderBy: [{ isAdmin: "desc" }, { id: "asc" }],
    });

    if (validWoloAddress(emaren?.walletAddress)) {
      return NextResponse.json({
        ok: true,
        walletAddress: emaren!.walletAddress,
        amountWolo: 100,
        memo: DEFAULT_MEMO,
        source: "emaren-user-wallet",
      });
    }
  } catch (error) {
    console.error("player AI development target lookup failed", error);
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Emaren development wallet is not configured. Add EMAREN_WOLO_ADDRESS or link Emaren's WOLO wallet.",
    },
    { status: 503 }
  );
}
