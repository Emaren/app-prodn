import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcademyHeroVariant = "a" | "b" | "e";

const isVariant = (value: unknown): value is AcademyHeroVariant =>
  value === "a" || value === "b" || value === "e";

const preferenceLogPath =
  process.env.AOE2WAR_ACADEMY_HERO_PREF_LOG ??
  "/mnt/HC_Volume_105319120/aoe2-telemetry/academy-hero-preferences.jsonl";

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isVariant(body.variant)) {
    return NextResponse.json(
      { ok: false, error: "invalid_variant" },
      { status: 400 },
    );
  }

  const entry = {
    at: new Date().toISOString(),
    variant: body.variant,
    previousVariant: isVariant(body.previousVariant)
      ? body.previousVariant
      : null,
    source:
      body.source === "hero-click" || body.source === "toggle"
        ? body.source
        : "unknown",
    anonymousId:
      typeof body.anonymousId === "string"
        ? body.anonymousId.slice(0, 120)
        : null,
    path:
      typeof body.path === "string"
        ? body.path.slice(0, 240)
        : null,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
    userAgent: request.headers.get("user-agent")?.slice(0, 320) ?? null,
    referer: request.headers.get("referer")?.slice(0, 320) ?? null,
  };

  try {
    await mkdir(path.dirname(preferenceLogPath), { recursive: true });
    await appendFile(preferenceLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("academy hero preference log failed", error);
    return NextResponse.json(
      { ok: false, error: "log_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
