import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  type AoE2WarStreamSourceType,
} from "@/lib/streamRequestAuth";
import { streamMediaResponseHeaders } from "@/lib/streamMedia";
import { readStreamChunk } from "@/lib/streamStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ streamId: string; sequence: string }> }
) {
  const { streamId, sequence } = await context.params;
  const id = Number(streamId);
  const seq = Number(sequence);

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(seq) || seq < 0) {
    return NextResponse.json(
      { detail: "Invalid stream chunk." },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const stream = await getPrisma().gameWatchStream.findUnique({ where: { id } });
  if (
    !stream ||
    stream.provider !== "aoe2war" ||
    !AOE2WAR_STREAM_SOURCE_TYPES.includes(stream.sourceType as AoE2WarStreamSourceType) ||
    stream.status === "removed"
  ) {
    return NextResponse.json(
      { detail: "Stream chunk not found." },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const chunk = await readStreamChunk(id, seq);
    return new Response(chunk, { headers: streamMediaResponseHeaders(chunk.byteLength) });
  } catch {
    return NextResponse.json(
      { detail: "Stream chunk not found." },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
