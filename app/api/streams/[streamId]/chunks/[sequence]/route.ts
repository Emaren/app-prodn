import { NextResponse, type NextRequest } from "next/server";

import { readStreamChunk } from "@/lib/streamStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "video/webm",
};

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

  try {
    const chunk = await readStreamChunk(id, seq);
    return new Response(chunk, { headers: CHUNK_HEADERS });
  } catch {
    return NextResponse.json(
      { detail: "Stream chunk not found." },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
