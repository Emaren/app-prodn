import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const DEFAULT_UNIT = process.env.WOLO_DAEMON_SYSTEMD_UNIT?.trim() || "wolochaind-testnet";
const DEFAULT_LINES =
  Number.parseInt(process.env.WOLO_DAEMON_TAIL_LINES?.trim() || "40", 10) || 40;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeLines(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-DEFAULT_LINES);
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync(
      "journalctl",
      [
        "-u",
        DEFAULT_UNIT,
        "-n",
        String(DEFAULT_LINES),
        "--no-pager",
        "-o",
        "cat",
      ],
      {
        env: {
          ...process.env,
          SYSTEMD_COLORS: "1",
        },
      }
    );

    const lines = sanitizeLines(stdout);

    return NextResponse.json({
      ok: true,
      label: `${DEFAULT_UNIT}.journal`,
      lines:
        lines.length > 0
          ? lines
          : ["[daemon] journal is reachable but no lines were returned yet"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown journalctl error";

    return NextResponse.json({
      ok: false,
      label: `${DEFAULT_UNIT}.journal`,
      lines: ["[daemon] failed to read live systemd journal", `[daemon] ${detail}`],
    });
  }
}
