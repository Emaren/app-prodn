import { NextResponse } from "next/server";

import {
  publicHeroStageTakeoverState,
  readHeroStageTakeoverState,
} from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const state = await readHeroStageTakeoverState();
  return NextResponse.json(publicHeroStageTakeoverState(state), {
    headers: NO_STORE_HEADERS,
  });
}
