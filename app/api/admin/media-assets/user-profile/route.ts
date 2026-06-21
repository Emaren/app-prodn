import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanCountry(value: unknown) {
  return cleanText(value, 48) || null;
}

function cleanGenderDivision(value: unknown) {
  const raw = cleanText(value, 24).toLowerCase();

  if (raw === "woman" || raw === "women" || raw === "female") {
    return "Woman";
  }

  return "Man";
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = cleanText(body.uid, 100);
  const displayName = cleanText(body.displayName, 120);
  const representedCountry = cleanCountry(body.representedCountry);
  const genderDivision = cleanGenderDivision(body.genderDivision);

  if (!uid) {
    return NextResponse.json(
      { detail: "Choose a warrior first." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const existing = await gate.prisma.user.findUnique({
    where: { uid },
    select: { uid: true },
  });

  if (!existing) {
    return NextResponse.json(
      { detail: "Warrior not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const user = await gate.prisma.user.update({
      where: { uid },
      data: {
        ...(displayName ? { inGameName: displayName } : {}),
        representedCountry,
        genderDivision,
      },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        email: true,
        representedCountry: true,
        genderDivision: true,
      },
    });

    return NextResponse.json({ user }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    return NextResponse.json(
      {
        detail: message.includes("Unique constraint")
          ? "That display name is already used by another warrior."
          : "Could not save warrior identity.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
