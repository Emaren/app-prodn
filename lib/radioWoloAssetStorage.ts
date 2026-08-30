import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  detectAudioType,
  getRadioStorageRoot,
} from "@/lib/radioWolo";

export async function persistRadioVaultAudio(
  bytes: Uint8Array,
) {
  const detected =
    detectAudioType(bytes);

  if (!detected) {
    throw new Error(
      "Unsupported Radio WOLO audio bytes.",
    );
  }

  const sha256 = createHash(
    "sha256",
  )
    .update(bytes)
    .digest("hex");

  const root =
    getRadioStorageRoot();

  const storageKey =
    path.posix.join(
      "assets",
      "audio",
      `${randomUUID()}-${sha256.slice(
        0,
        16,
      )}${detected.extension}`,
    );

  const target =
    path.resolve(
      root,
      storageKey,
    );

  if (
    !target.startsWith(
      `${root}${path.sep}`,
    )
  ) {
    throw new Error(
      "Unsafe Radio WOLO asset path.",
    );
  }

  await mkdir(
    path.dirname(target),
    {
      recursive: true,
      mode: 0o750,
    },
  );

  await writeFile(
    target,
    bytes,
    {
      mode: 0o640,
      flag: "wx",
    },
  );

  return {
    storageKey,
    target,
    sha256,
    mediaType:
      detected.mediaType,
  };
}

export async function removeRadioVaultFile(
  target: string,
) {
  await rm(
    target,
    {
      force: true,
    },
  );
}
