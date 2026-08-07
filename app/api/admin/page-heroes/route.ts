import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  assignPageHeroAssets,
  loadPageHeroAdminSnapshot,
  normalizePageHeroSurface,
  removePageHeroItem,
  reorderPageHeroItems,
  updatePageHeroItem,
  updatePageHeroSettings,
} from "@/lib/pageHeroes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function ids(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .map((candidate) => Number(candidate))
        .filter((candidate) => Number.isInteger(candidate) && candidate > 0)
    )
  );
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const surface = normalizePageHeroSurface(
    request.nextUrl.searchParams.get("surface")
  );

  return NextResponse.json(
    await loadPageHeroAdminSnapshot(gate.prisma, surface.key),
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const surface = normalizePageHeroSurface(body.surface);
    let snapshot;

    if (action === "assign") {
      snapshot = await assignPageHeroAssets(gate.prisma, surface.key, ids(body.assetIds));
    } else if (action === "settings") {
      snapshot = await updatePageHeroSettings(gate.prisma, surface.key, body);
    } else if (action === "update_item") {
      const itemId = Number(body.itemId);
      if (!Number.isInteger(itemId) || itemId < 1) {
        throw new Error("Choose a valid Hero chain item.");
      }
      snapshot = await updatePageHeroItem(gate.prisma, surface.key, itemId, body);
    } else if (action === "reorder") {
      snapshot = await reorderPageHeroItems(gate.prisma, surface.key, ids(body.itemIds));
    } else if (action === "remove") {
      const itemId = Number(body.itemId);
      if (!Number.isInteger(itemId) || itemId < 1) {
        throw new Error("Choose a valid Hero chain item.");
      }
      snapshot = await removePageHeroItem(gate.prisma, surface.key, itemId);
    } else {
      return NextResponse.json(
        { detail: "That Page Hero action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not update the Page Hero chain.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
