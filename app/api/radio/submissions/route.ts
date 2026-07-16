import { createHash, randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  RADIO_RIGHTS_STATEMENT_VERSION,
  detectArtworkType,
  detectAudioType,
  getRadioStorageRoot,
  safeOriginalFilename,
} from "@/lib/radioWolo";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;

function text(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

function emailValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function persistFile(root: string, folder: string, bytes: Uint8Array, extension: string) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = path.posix.join(folder, `${randomUUID()}-${sha256.slice(0, 16)}${extension}`);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe storage path.");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
  await writeFile(target, bytes, { mode: 0o640, flag: "wx" });
  return { key, target };
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ detail: "Invalid submission form." }, { status: 400 });
  const artistName = text(form.get("artistName"), 160);
  const trackTitle = text(form.get("trackTitle"), 200);
  const genre = text(form.get("genre"), 100) || null;
  const contactEmail = text(form.get("contactEmail"), 254).toLowerCase();
  const contactDiscord = text(form.get("contactDiscord"), 120) || null;
  const notes = text(form.get("notes"), 6_000) || null;
  const rightsAccepted = form.get("rightsAccepted") === "true" || form.get("rightsAccepted") === "on";
  const audio = form.get("audio");
  const artwork = form.get("artwork");

  if (!artistName || !trackTitle || !emailValid(contactEmail)) {
    return NextResponse.json({ detail: "Artist name, track title, and a valid contact email are required." }, { status: 400 });
  }
  if (!rightsAccepted) {
    return NextResponse.json({ detail: "You must confirm the limited Radio WOLO permission statement." }, { status: 400 });
  }
  if (!(audio instanceof File) || audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ detail: "Choose an MP3, WAV, OGG, or M4A file no larger than 60 MB." }, { status: 400 });
  }
  if (artwork instanceof File && artwork.size > MAX_ARTWORK_BYTES) {
    return NextResponse.json({ detail: "Artwork must be no larger than 8 MB." }, { status: 400 });
  }

  const prisma = getPrisma();
  const submitterUid = await getSessionUid(request);
  const recentSubmissionCount = await prisma.radioSubmission.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      OR: [
        { contactEmail },
        ...(submitterUid ? [{ submitterUid }] : []),
      ],
    },
  });
  if (recentSubmissionCount >= 3) {
    return NextResponse.json({ detail: "That creator lane has reached its daily submission limit. Try again tomorrow." }, { status: 429 });
  }

  const audioBytes = new Uint8Array(await audio.arrayBuffer());
  const audioType = detectAudioType(audioBytes);
  if (!audioType) return NextResponse.json({ detail: "The audio bytes do not match a supported MP3, WAV, OGG, or M4A file." }, { status: 415 });
  const artworkBytes = artwork instanceof File && artwork.size > 0 ? new Uint8Array(await artwork.arrayBuffer()) : null;
  const artworkType = artworkBytes ? detectArtworkType(artworkBytes) : null;
  if (artworkBytes && !artworkType) return NextResponse.json({ detail: "Artwork bytes must be PNG, JPEG, or WebP." }, { status: 415 });

  const root = getRadioStorageRoot();
  await mkdir(root, { recursive: true, mode: 0o750 });
  const written: string[] = [];
  try {
    const storedAudio = await persistFile(root, "submissions/audio", audioBytes, audioType.extension);
    written.push(storedAudio.target);
    const storedArtwork = artworkBytes && artworkType
      ? await persistFile(root, "submissions/artwork", artworkBytes, artworkType.extension)
      : null;
    if (storedArtwork) written.push(storedArtwork.target);

    const submission = await prisma.radioSubmission.create({
      data: {
        submitterUid,
        artistName,
        trackTitle,
        genre,
        contactEmail,
        contactDiscord,
        notes,
        rightsAccepted: true,
        rightsStatementVersion: RADIO_RIGHTS_STATEMENT_VERSION,
        audioOriginalFilename: safeOriginalFilename(audio.name),
        audioStorageKey: storedAudio.key,
        audioMediaType: audioType.mediaType,
        audioByteSize: BigInt(audioBytes.byteLength),
        artworkOriginalFilename: artwork instanceof File && storedArtwork ? safeOriginalFilename(artwork.name) : null,
        artworkStorageKey: storedArtwork?.key ?? null,
        artworkMediaType: artworkType?.mediaType ?? null,
        artworkByteSize: artworkBytes ? BigInt(artworkBytes.byteLength) : null,
      },
      select: { publicId: true, status: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, submission: { ...submission, createdAt: submission.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    await Promise.all(written.map((target) => rm(target, { force: true }).catch(() => undefined)));
    console.warn("Radio WOLO submission failed:", error);
    return NextResponse.json({ detail: "Could not preserve the submission. No partial upload was retained." }, { status: 500 });
  }
}
