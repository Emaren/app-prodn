import { NextResponse } from "next/server";

import {
  isHeroStageTakeoverLive,
  readHeroStageTakeoverState,
} from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const state = await readHeroStageTakeoverState();
  const active = isHeroStageTakeoverLive(state);

  return NextResponse.json(
    {
      ...state,
      active,
      imageUrl: state.slides[0]?.imageUrl || state.imageUrl,
      imageAlt: state.slides[0]?.imageAlt || state.imageAlt,
      title: state.slides[0]?.title || state.title,
      linkUrl: state.slides[0]?.linkUrl || state.linkUrl || "/forum",
    },
    { headers: NO_STORE_HEADERS }
  );
}
