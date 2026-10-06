const ZIP_EOCD_SIGNATURE =
  0x06054b50;
const ZIP_CENTRAL_SIGNATURE =
  0x02014b50;
const ZIP_LOCAL_SIGNATURE =
  0x04034b50;

const ZIP_MAX_BYTES =
  512 * 1024 * 1024;
const ZIP_MAX_ENTRIES =
  5_000;
const ZIP_MAX_EXPANDED_BYTES =
  2 * 1024 * 1024 * 1024;
const AUDIO_MAX_BYTES =
  250 * 1024 * 1024;

const AUDIO_MEDIA_TYPES:
  Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
  };

export type RadioWoloIntakeFile = {
  file: File;
  sourceLabel: string;
};

function littleUint16(
  view: DataView,
  offset: number,
) {
  return view.getUint16(
    offset,
    true,
  );
}

function littleUint32(
  view: DataView,
  offset: number,
) {
  return view.getUint32(
    offset,
    true,
  );
}

function extensionOf(
  value: string,
) {
  const normalized =
    value
      .trim()
      .toLowerCase();

  const index =
    normalized.lastIndexOf(
      ".",
    );

  return index >= 0
    ? normalized.slice(index)
    : "";
}

function basename(
  value: string,
) {
  const normalized =
    value.replace(/\\/g, "/");

  return (
    normalized
      .split("/")
      .filter(Boolean)
      .at(-1) ||
    "radio-wolo-audio"
  );
}

function decodeFilename(
  bytes: Uint8Array,
) {
  return new TextDecoder(
    "utf-8",
    {
      fatal: false,
    },
  ).decode(bytes);
}

function findEndOfCentralDirectory(
  bytes: Uint8Array,
) {
  const view =
    new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

  const minimumOffset =
    Math.max(
      0,
      bytes.byteLength -
        (65_535 + 22),
    );

  for (
    let offset =
      bytes.byteLength - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      littleUint32(
        view,
        offset,
      ) ===
      ZIP_EOCD_SIGNATURE
    ) {
      return offset;
    }
  }

  return -1;
}

async function inflateRaw(
  compressed:
    Uint8Array,
) {
  if (
    typeof DecompressionStream ===
    "undefined"
  ) {
    throw new Error(
      "This browser cannot unpack ZIP audio. Update Chrome or unzip the archive before importing.",
    );
  }

  const stream =
    new Blob([
      compressed,
    ])
      .stream()
      .pipeThrough(
        new DecompressionStream(
          "deflate-raw",
        ),
      );

  return new Uint8Array(
    await new Response(
      stream,
    ).arrayBuffer(),
  );
}

async function extractZipAudio(
  archive: File,
): Promise<RadioWoloIntakeFile[]> {
  if (
    archive.size <= 0 ||
    archive.size >
      ZIP_MAX_BYTES
  ) {
    throw new Error(
      `${archive.name}: ZIP must be between 1 byte and 512 MB.`,
    );
  }

  const bytes =
    new Uint8Array(
      await archive.arrayBuffer(),
    );

  const view =
    new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

  const eocd =
    findEndOfCentralDirectory(
      bytes,
    );

  if (eocd < 0) {
    throw new Error(
      `${archive.name}: could not find a valid ZIP directory.`,
    );
  }

  const entryCount =
    littleUint16(
      view,
      eocd + 10,
    );

  const centralSize =
    littleUint32(
      view,
      eocd + 12,
    );

  const centralOffset =
    littleUint32(
      view,
      eocd + 16,
    );

  if (
    entryCount === 0xffff ||
    centralSize ===
      0xffffffff ||
    centralOffset ===
      0xffffffff
  ) {
    throw new Error(
      `${archive.name}: ZIP64 archives are not supported by the browser importer.`,
    );
  }

  if (
    entryCount >
      ZIP_MAX_ENTRIES ||
    centralOffset +
      centralSize >
      bytes.byteLength
  ) {
    throw new Error(
      `${archive.name}: ZIP directory is outside the safe import bounds.`,
    );
  }

  const entries:
    Array<{
      name: string;
      flags: number;
      method: number;
      compressedSize:
        number;
      uncompressedSize:
        number;
      localOffset:
        number;
    }> = [];

  let cursor =
    centralOffset;

  let totalExpanded =
    0;

  for (
    let index = 0;
    index < entryCount;
    index += 1
  ) {
    if (
      cursor + 46 >
        bytes.byteLength ||
      littleUint32(
        view,
        cursor,
      ) !==
        ZIP_CENTRAL_SIGNATURE
    ) {
      throw new Error(
        `${archive.name}: malformed ZIP central directory.`,
      );
    }

    const flags =
      littleUint16(
        view,
        cursor + 8,
      );

    const method =
      littleUint16(
        view,
        cursor + 10,
      );

    const compressedSize =
      littleUint32(
        view,
        cursor + 20,
      );

    const uncompressedSize =
      littleUint32(
        view,
        cursor + 24,
      );

    const filenameLength =
      littleUint16(
        view,
        cursor + 28,
      );

    const extraLength =
      littleUint16(
        view,
        cursor + 30,
      );

    const commentLength =
      littleUint16(
        view,
        cursor + 32,
      );

    const localOffset =
      littleUint32(
        view,
        cursor + 42,
      );

    const nextCursor =
      cursor +
      46 +
      filenameLength +
      extraLength +
      commentLength;

    if (
      nextCursor >
      bytes.byteLength
    ) {
      throw new Error(
        `${archive.name}: malformed ZIP entry metadata.`,
      );
    }

    const name =
      decodeFilename(
        bytes.subarray(
          cursor + 46,
          cursor +
            46 +
            filenameLength,
        ),
      );

    const extension =
      extensionOf(
        name,
      );

    if (
      AUDIO_MEDIA_TYPES[
        extension
      ] &&
      !name.endsWith("/")
    ) {
      if (
        flags & 0x1
      ) {
        throw new Error(
          `${archive.name}: encrypted ZIP entries are not supported (${name}).`,
        );
      }

      if (
        method !== 0 &&
        method !== 8
      ) {
        throw new Error(
          `${archive.name}: unsupported ZIP compression method ${method} (${name}).`,
        );
      }

      if (
        uncompressedSize <=
          0 ||
        uncompressedSize >
          AUDIO_MAX_BYTES
      ) {
        throw new Error(
          `${archive.name}: ${name} exceeds the 250 MB Radio WOLO track limit.`,
        );
      }

      totalExpanded +=
        uncompressedSize;

      if (
        totalExpanded >
        ZIP_MAX_EXPANDED_BYTES
      ) {
        throw new Error(
          `${archive.name}: expanded audio exceeds the 2 GB safe batch limit.`,
        );
      }

      entries.push({
        name,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
      });
    }

    cursor =
      nextCursor;
  }

  if (!entries.length) {
    throw new Error(
      `${archive.name}: no MP3, WAV, OGG, or M4A tracks were found.`,
    );
  }

  const extracted:
    RadioWoloIntakeFile[] =
    [];

  for (const entry of entries) {
    if (
      entry.localOffset +
        30 >
        bytes.byteLength ||
      littleUint32(
        view,
        entry.localOffset,
      ) !==
        ZIP_LOCAL_SIGNATURE
    ) {
      throw new Error(
        `${archive.name}: malformed local ZIP entry for ${entry.name}.`,
      );
    }

    const localFilenameLength =
      littleUint16(
        view,
        entry.localOffset +
          26,
      );

    const localExtraLength =
      littleUint16(
        view,
        entry.localOffset +
          28,
      );

    const dataStart =
      entry.localOffset +
      30 +
      localFilenameLength +
      localExtraLength;

    const dataEnd =
      dataStart +
      entry.compressedSize;

    if (
      dataStart < 0 ||
      dataEnd >
        bytes.byteLength
    ) {
      throw new Error(
        `${archive.name}: compressed track bytes are outside the archive.`,
      );
    }

    const compressed =
      bytes.subarray(
        dataStart,
        dataEnd,
      );

    const payload =
      entry.method === 0
        ? new Uint8Array(
            compressed,
          )
        : await inflateRaw(
            compressed,
          );

    if (
      payload.byteLength !==
      entry.uncompressedSize
    ) {
      throw new Error(
        `${archive.name}: ${entry.name} expanded to an unexpected size.`,
      );
    }

    const cleanName =
      basename(
        entry.name,
      );

    const mediaType =
      AUDIO_MEDIA_TYPES[
        extensionOf(
          cleanName,
        )
      ];

    extracted.push({
      file:
        new File(
          [payload],
          cleanName,
          {
            type:
              mediaType,
            lastModified:
              archive.lastModified,
          },
        ),
      sourceLabel:
        archive.name,
    });
  }

  return extracted;
}

export function isRadioWoloZipFile(
  file: File,
) {
  return (
    extensionOf(
      file.name,
    ) === ".zip" ||
    file.type ===
      "application/zip" ||
    file.type ===
      "application/x-zip-compressed"
  );
}

export async function expandRadioWoloIntakeFiles(
  files:
    | FileList
    | File[],
) {
  const result:
    RadioWoloIntakeFile[] =
    [];

  for (
    const file of
    Array.from(files)
  ) {
    if (
      file.size <= 0
    ) {
      continue;
    }

    if (
      isRadioWoloZipFile(
        file,
      )
    ) {
      result.push(
        ...(
          await extractZipAudio(
            file,
          )
        ),
      );

      continue;
    }

    result.push({
      file,
      sourceLabel:
        file.name,
    });
  }

  return result;
}
