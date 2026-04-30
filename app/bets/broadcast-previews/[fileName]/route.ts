import { NextRequest, NextResponse } from "next/server";

import { readBetBroadcastPreviewFile } from "@/lib/betBroadcastPreviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=31536000, immutable",
  "Content-Type": "video/mp4",
};

function parseRangeHeader(rangeHeader: string | null, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null;
  }

  const [startValue, endValue] = rangeHeader.replace("bytes=", "").split("-");
  const start = startValue ? Number(startValue) : 0;
  const end = endValue ? Number(endValue) : size - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

async function buildPreviewResponse(
  request: NextRequest,
  fileName: string,
  includeBody: boolean
) {
  const file = await readBetBroadcastPreviewFile(fileName);
  if (!file) {
    return new NextResponse(null, { status: 404 });
  }

  const range = parseRangeHeader(request.headers.get("range"), file.size);
  if (range) {
    const body = includeBody ? file.buffer.subarray(range.start, range.end + 1) : null;
    return new NextResponse(body, {
      status: 206,
      headers: {
        ...VIDEO_HEADERS,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      },
    });
  }

  return new NextResponse(includeBody ? file.buffer : null, {
    status: 200,
    headers: {
      ...VIDEO_HEADERS,
      "Content-Length": String(file.size),
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileName: string }> }
) {
  const { fileName } = await context.params;
  return buildPreviewResponse(request, fileName, true);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ fileName: string }> }
) {
  const { fileName } = await context.params;
  return buildPreviewResponse(request, fileName, false);
}
