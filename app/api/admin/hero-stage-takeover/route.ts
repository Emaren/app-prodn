import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  normalizeHeroStageTakeoverNumber,
  normalizeHeroStageTransitionStyle,
  readHeroStageTakeoverState,
  saveHeroStageTakeoverUpload,
  writeHeroStageTakeoverState,
  type HeroStageTakeoverSlide,
} from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanString(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function boolFromForm(value: FormDataEntryValue | null, fallback = false) {
  if (typeof value !== "string") return fallback;
  const raw = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function normalizeDateInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeSlidesJson(value: FormDataEntryValue | null): HeroStageTakeoverSlide[] | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    const slides: HeroStageTakeoverSlide[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;

      const raw = entry as Record<string, unknown>;
      const imageUrl = cleanString(raw.imageUrl, 1200);
      if (!imageUrl) continue;

      slides.push({
        id: cleanString(raw.id, 120) || imageUrl,
        imageUrl,
        imageAlt: cleanString(raw.imageAlt, 240) || null,
        title: cleanString(raw.title, 180) || null,
        linkUrl: cleanString(raw.linkUrl, 1200) || "/forum",
        filename: cleanString(raw.filename, 180) || null,
        createdAt: cleanString(raw.createdAt, 80) || new Date().toISOString(),
      });
    }

    return slides;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  const state = await readHeroStageTakeoverState();
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const formData = await request.formData();
    const current = await readHeroStageTakeoverState();

    const title = cleanString(formData.get("title"), 180);
    const alt = cleanString(formData.get("alt"), 240);
    const linkUrl = cleanString(formData.get("linkUrl"), 1200) || "/forum";
    const active = boolFromForm(formData.get("active"), true);
    const replace = boolFromForm(formData.get("replace"), false);
    const startsAt = normalizeDateInput(formData.get("startsAt"));
    const expiresAt = normalizeDateInput(formData.get("expiresAt"));
    const intervalMs = normalizeHeroStageTakeoverNumber(
      formData.get("intervalMs"),
      current.intervalMs,
      2500,
      60000
    );
    const transitionMs = normalizeHeroStageTakeoverNumber(
      formData.get("transitionMs"),
      current.transitionMs,
      0,
      5000
    );
    const transitionStyle = normalizeHeroStageTransitionStyle(formData.get("transitionStyle"));

    const jsonSlides = normalizeSlidesJson(formData.get("slidesJson"));
    const baseSlides = jsonSlides ?? current.slides;

    const uploadedFiles = [
      ...formData.getAll("images"),
      ...formData.getAll("file"),
      ...formData.getAll("image"),
    ].filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const uploadedSlides: HeroStageTakeoverSlide[] = [];
    for (const file of uploadedFiles) {
      const saved = await saveHeroStageTakeoverUpload(file);
      uploadedSlides.push({
        id: saved.filename,
        imageUrl: saved.imageUrl,
        imageAlt: alt || title || file.name,
        title: title || file.name.replace(/\.[^.]+$/, ""),
        linkUrl,
        filename: saved.filename,
        createdAt: new Date().toISOString(),
      });
    }

    const nextSlides = replace
      ? uploadedSlides
      : [
          ...baseSlides.map((slide) => ({
            ...slide,
            linkUrl: slide.linkUrl || linkUrl,
          })),
          ...uploadedSlides,
        ];

    const state = await writeHeroStageTakeoverState({
      active,
      title: title || nextSlides[0]?.title || current.title,
      imageAlt: alt || nextSlides[0]?.imageAlt || current.imageAlt,
      linkUrl,
      startsAt,
      expiresAt,
      intervalMs,
      transitionMs,
      transitionStyle,
      slides: nextSlides.map((slide) => ({
        ...slide,
        linkUrl: slide.linkUrl || linkUrl,
      })),
    });

    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not save the hero carousel.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  const state = await writeHeroStageTakeoverState({
    active: false,
    imageUrl: null,
    imageAlt: null,
    title: null,
    linkUrl: "/forum",
    startsAt: null,
    expiresAt: null,
    slides: [],
  });

  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}
