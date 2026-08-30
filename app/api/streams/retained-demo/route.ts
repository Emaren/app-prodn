import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  RETAINED_STREAM_DEMO_SLOT,
  retainedDemoPublicPayload,
} from "@/lib/retainedStreamDemo";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const record = await getPrisma().gameWatchRetainedDemo.findUnique({
    where: { slot: RETAINED_STREAM_DEMO_SLOT },
    include: { stream: true },
  });

  return NextResponse.json(
    {
      retainedDemo: record
        ? {
            ...retainedDemoPublicPayload(record),
            stream: toWatchStreamPayload(record.stream),
          }
        : null,
    },
    { headers: NO_STORE_HEADERS },
  );
}
