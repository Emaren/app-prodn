import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { NextResponse } from "next/server";

// The site must NEVER execute journalctl or read protected HEL1 operator logs.
// A separately source-pinned, root-only collector writes an allowlisted, public
// projection of actual CometBFT events. No arbitrary paths or network fetches.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DIR = "/var/lib/aoe2war-wolo-public-daemon-v1";
const FEED = DIR + "/feed.json";
const SCHEMA = "aoe2war.wolo-public-daemon-feed.v1";
const UNIT = "wolochaind-mainnet.service";
const HEADERS = { "Cache-Control": "no-store, max-age=0" };
const CONTROL = /[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/;
const ANSI = /\x1b\[[0-9;]{0,12}m/g;

function hold() {
  return NextResponse.json({
    ok: false,
    label: "Protected daemon journal",
    lines: [
      "[access] HEL1 daemon journal is restricted to authorized operators",
      "[chain] public-safe daemon projection unavailable; /rpc/status remains read-only chain truth",
      "[safety] financial settlement, custody and betting remain quarantined",
    ],
  }, { headers: HEADERS });
}

function validLine(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 420 || value.length < 15) return false;
  const plain = value.replace(ANSI, "");
  ANSI.lastIndex = 0;
  return !CONTROL.test(value.replace(ANSI, "")) &&
    /^[ -~]+$/.test(plain) &&
    /^(?:\d{1,2}:\d{2}(?:AM|PM)) INF (?:received complete proposal block|finalizing commit of block|finalized block|executed block|committed state|indexed block events) [a-z]/.test(plain);
}

export async function GET() {
  try {
    const dir = await lstat(DIR);
    if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== 0 || (dir.mode & 0o777) !== 0o755) {
      return hold();
    }
    const before = await lstat(FEED);
    if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0 ||
        (before.mode & 0o777) !== 0o644 || before.nlink !== 1 ||
        before.size < 100 || before.size > 20000) {
      return hold();
    }
    const handle = await open(FEED, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: string;
    try {
      const actual = await handle.stat();
      if (!actual.isFile() || actual.uid !== 0 || actual.nlink !== 1 ||
          actual.dev !== before.dev || actual.ino !== before.ino ||
          actual.size !== before.size) return hold();
      raw = await handle.readFile({ encoding: "utf8" });
    } finally {
      await handle.close();
    }
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return hold();
    const obj = payload as Record<string, unknown>;
    const time = typeof obj.sampledAtUtc === "string" ? Date.parse(obj.sampledAtUtc) : NaN;
    if (obj.schema !== SCHEMA || obj.source !== UNIT || obj.ok !== true ||
        obj.label !== "wolochaind-mainnet.journal" || !Number.isFinite(time) ||
        Math.abs(Date.now() - time) > 15000 || !Array.isArray(obj.lines) ||
        obj.lines.length < 1 || obj.lines.length > 40 || !obj.lines.every(validLine)) {
      return hold();
    }
    return NextResponse.json({
      ok: true,
      label: obj.label,
      lines: obj.lines,
      sampledAtUtc: obj.sampledAtUtc,
    }, { headers: HEADERS });
  } catch {
    return hold();
  }
}
