import { statfs } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  getDirectMessageAttachmentRootDir,
  persistDirectMessageAttachment,
  removePersistedDirectMessageAttachment,
} from "@/lib/directMessageAttachments";

export type ClanMessageAttachmentKind = "image" | "audio" | "video";

export const MAX_CLAN_MESSAGE_ATTACHMENTS = 4;
export const MAX_CLAN_MESSAGE_TOTAL_BYTES = 230_000_000;
const CLAN_MEDIA_MIN_FREE_AFTER_WRITE_BYTES =
  4 * 1024 * 1024 * 1024;
const CLAN_MEDIA_MIN_FREE_RATIO = 0.05;
const CLAN_GIF_OPTIMIZE_THRESHOLD_BYTES = 12_000_000;

const MAX_BYTES_BY_KIND: Record<ClanMessageAttachmentKind, number> = {
  image: 96_000_000,
  audio: 96_000_000,
  video: 192_000_000,
};

const KIND_BY_MIME: Readonly<Record<string, ClanMessageAttachmentKind>> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",
  "video/mp4": "video",
  "video/webm": "video",
};

export type PersistedClanMessageAttachment = {
  kind: ClanMessageAttachmentKind;
  name: string | null;
  mimeType: string;
  storageRef: string;
  sizeBytes: number;
};

function attachmentName(file: File) {
  const value = file.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return value ? value.slice(0, 255) : null;
}

export function clanMessageAttachmentKind(mimeType: string) {
  return KIND_BY_MIME[mimeType.toLowerCase()] ?? null;
}

export function validateClanMessageAttachmentFiles(files: File[]) {
  if (files.length > MAX_CLAN_MESSAGE_ATTACHMENTS) {
    throw new Error(`Choose up to ${MAX_CLAN_MESSAGE_ATTACHMENTS} files per message.`);
  }

  let totalBytes = 0;
  return files.map((file) => {
    const mimeType = file.type.toLowerCase();
    const kind = clanMessageAttachmentKind(mimeType);
    if (!kind) {
      throw new Error("Clan Hall supports PNG, JPEG, WebP, GIF, MP4, WebM, MP3, M4A, OGG, and WAV media.");
    }

    if (file.size < 1 || file.size > MAX_BYTES_BY_KIND[kind]) {
      throw new Error(
        "That media file is unusually large for a single Hall post.",
      );
    }

    totalBytes += file.size;
    if (totalBytes > MAX_CLAN_MESSAGE_TOTAL_BYTES) {
      throw new Error(
        "That Hall post carries too much media at once.",
      );
    }

    return {
      file,
      kind,
      mimeType,
      name: attachmentName(file),
    };
  });
}

async function optimizeLargeClanGif(file: File) {
  if (
    file.type.toLowerCase() !== "image/gif" ||
    file.size < CLAN_GIF_OPTIMIZE_THRESHOLD_BYTES
  ) {
    return file;
  }

  try {
    const input =
      Buffer.from(await file.arrayBuffer());

    const output = await sharp(input, {
      animated: true,
      failOn: "warning",
    })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer();

    if (output.length < input.length * 0.9) {
      const baseName =
        file.name
          .replace(/\.gif$/i, "")
          .slice(0, 220) ||
        "hall-animation";

      return new File(
        [output],
        `${baseName}.webp`,
        { type: "image/webp" },
      );
    }
  } catch (error) {
    console.warn(
      "Clan Hall GIF optimization skipped; preserving original animation:",
      error,
    );
  }

  return file;
}

async function statClanMediaFilesystem(root: string) {
  let candidate = path.resolve(root);

  for (;;) {
    try {
      return await statfs(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }

      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }

      candidate = parent;
    }
  }
}

async function assertClanMediaStorageHeadroom(requiredBytes: number) {
  const stats = await statClanMediaFilesystem(
    getDirectMessageAttachmentRootDir(),
  );

  const freeBytes =
    stats.bavail * stats.bsize;
  const totalBytes =
    stats.blocks * stats.bsize;

  const safetyReserveBytes = Math.max(
    CLAN_MEDIA_MIN_FREE_AFTER_WRITE_BYTES,
    Math.floor(totalBytes * CLAN_MEDIA_MIN_FREE_RATIO),
  );

  if (freeBytes - requiredBytes < safetyReserveBytes) {
    throw new Error(
      "Clan Hall media storage is temporarily at its safety reserve.",
    );
  }
}

export async function persistClanMessageAttachmentFiles(files: File[]) {
  validateClanMessageAttachmentFiles(files);

  const optimizedFiles = await Promise.all(
    files.map((file) => optimizeLargeClanGif(file)),
  );

  const validated =
    validateClanMessageAttachmentFiles(optimizedFiles);

  await assertClanMediaStorageHeadroom(
    validated.reduce(
      (total, attachment) =>
        total + attachment.file.size,
      0,
    ),
  );
  const persisted: PersistedClanMessageAttachment[] = [];

  try {
    for (const attachment of validated) {
      const storageRef = await persistDirectMessageAttachment({
        buffer: Buffer.from(await attachment.file.arrayBuffer()),
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        name: attachment.name,
        namespace: "clan-hall",
      });

      persisted.push({
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        storageRef,
        sizeBytes: attachment.file.size,
      });
    }
    return persisted;
  } catch (error) {
    await Promise.all(
      persisted.map((attachment) =>
        removePersistedDirectMessageAttachment(attachment.storageRef),
      ),
    );
    throw error;
  }
}

export async function removeClanMessageAttachmentFiles(
  attachments: Array<{ storageRef: string }>,
) {
  await Promise.all(
    attachments.map((attachment) =>
      removePersistedDirectMessageAttachment(attachment.storageRef),
    ),
  );
}
