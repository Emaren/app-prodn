import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  clearHeroStageTakeover,
  readHeroStageTakeoverState,
  saveHeroStageTakeoverUpload,
} from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const state = await readHeroStageTakeoverState();
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Choose Jim's celebration image first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const state = await saveHeroStageTakeoverUpload({
      file,
      title: formData.get("title"),
      imageAlt: formData.get("imageAlt"),
      linkUrl: formData.get("linkUrl"),
      startsAt: formData.get("startsAt"),
      expiresAt: formData.get("expiresAt"),
      uploadedByUid: gate.user.uid,
    });

    return NextResponse.json(state, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not publish the hero image takeover.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const state = await clearHeroStageTakeover();
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}
