import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  type AoE2WarStreamSourceType,
} from "@/lib/streamRequestAuth";
import { streamMediaResponseHeaders } from "@/lib/streamMedia";
import {
  listStreamChunkSequences,
  readStreamChunksBounded,
  StreamStorageLimitError,
} from "@/lib/streamStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_RANGE_CHUNKS = 5;
const MAX_RANGE_BYTES = 12 * 1024 * 1024;

// A SourceBuffer needs contiguous WebM clusters, not overlapping rolling
// segments with repeated initialization headers. One DB lookup + one bounded
// response covers up to five consecutive media chunks.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await context.params;
  const id = Number(streamId);
  const from = Number(request.nextUrl.searchParams.get("from"));
  const through = Number(request.nextUrl.searchParams.get("through"));
  if (
    !Number.isSafeInteger(id) || id <= 0 ||
    !Number.isSafeInteger(from) || from <= 0 ||
    !Number.isSafeInteger(through) || through < from ||
    through - from + 1 > MAX_RANGE_CHUNKS
  ) {
    return NextResponse.json(
      { detail: "Invalid bounded stream range." },
      { status: 400, headers: NO_STORE },
    );
  }

  const stream = await getPrisma().gameWatchStream.findUnique({
    where: { id },
  });
  if (!stream || stream.provider !== "aoe2war" ||
      !AOE2WAR_STREAM_SOURCE_TYPES.includes(stream.sourceType as AoE2WarStreamSourceType) ||
      stream.status === "removed") {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE },
    );
  }

  // Do not concatenate a partial or gap-filled cluster run. Sequence zero
  // (the WebM header) is retrieved separately once by the viewer.
  const present = new Set(await listStreamChunkSequences(id, 512));
  const range = Array.from({ length: through - from + 1 }, (_, index) => from + index);
  if (!range.every((sequence) => present.has(sequence))) {
    return NextResponse.json(
      { detail: "Stream media range is incomplete." },
      { status: 409, headers: NO_STORE },
    );
  }
  try {
    const { chunks, totalBytes } = await readStreamChunksBounded(
      id, range, MAX_RANGE_BYTES,
    );
    return new Response(Buffer.concat(chunks, totalBytes), {
      headers: {
        ...streamMediaResponseHeaders(totalBytes),
        "X-AOE2WAR-Stream-Mode": "continuous-webm-clusters",
        "X-AOE2WAR-Start-Seq": String(from),
        "X-AOE2WAR-End-Seq": String(through),
        "X-AOE2WAR-Chunk-Count": String(range.length),
      },
    });
  } catch (error) {
    if (error instanceof StreamStorageLimitError) {
      return NextResponse.json(
        { detail: "Stream range exceeds the 12 MiB response limit." },
        { status: 413, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { detail: "Stream range unavailable." },
      { status: 404, headers: NO_STORE },
    );
  }
}
