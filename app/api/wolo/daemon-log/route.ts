import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function tailLines(text: string, limit = 40) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-limit);
}

export async function GET() {
  const logPath = process.env.WOLO_DAEMON_LOG_PATH?.trim();

  if (!logPath) {
    return NextResponse.json(
      {
        ok: false,
        label: "daemon.log",
        lines: [
          "[daemon] WOLO_DAEMON_LOG_PATH is not set",
          "[daemon] point this route at a real local daemon log file",
        ],
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  try {
    const text = await readFile(logPath, "utf8");
    const lines = tailLines(text, 40);

    return NextResponse.json(
      {
        ok: true,
        label: path.basename(logPath),
        lines:
          lines.length > 0
            ? lines
            : ["[daemon] log file is empty", "[daemon] waiting for chain output"],
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Could not read daemon log.";

    return NextResponse.json(
      {
        ok: false,
        label: path.basename(logPath),
        lines: [`[daemon] ${detail}`],
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}