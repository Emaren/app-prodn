import {
  isRadioWoloAudioFile,
  isRadioWoloZipFile,
} from "@/lib/radioWoloZipImport";

export type RadioWoloImportProfile = {
  credit: string;
  kind: string;
  tags: string;
};

export type RadioWoloIntakeSource = {
  file: File;
  path: string;
};

export const RADIO_WOLO_IMPORT_PROFILE_STORAGE_KEY =
  "aoe2war:radio-wolo-import-profile:v1";

export const RADIO_WOLO_DEFAULT_IMPORT_PROFILE:
  RadioWoloImportProfile = {
    credit: "Lord Molyneaux",
    kind: "song",
    tags: "lord_molyneaux, suno",
  };

const MAX_FOLDER_FILES =
  5_000;

type WebkitEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    success: (
      file: File,
    ) => void,
    failure?: (
      error: DOMException,
    ) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (
        entries:
          WebkitEntry[],
      ) => void,
      failure?: (
        error:
          DOMException,
      ) => void,
    ) => void;
  };
};

type WebkitDataTransferItem =
  DataTransferItem & {
    webkitGetAsEntry?: () =>
      | WebkitEntry
      | null;
  };

function cleanTitleCase(
  value: string,
) {
  return value
    .replace(
      /[_-]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(
      (word) =>
        word.length <= 3 &&
        word ===
          word.toUpperCase()
          ? word
          : word
              .charAt(0)
              .toUpperCase() +
            word
              .slice(1)
              .toLowerCase(),
    )
    .join(" ");
}

function tagSlug(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "_",
    )
    .replace(
      /^_+|_+$/g,
      "",
    );
}

function uniqueTags(
  raw: string[],
) {
  const seen =
    new Set<string>();

  return raw
    .map((value) =>
      value
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function inferredArtist(
  paths: string[],
) {
  for (const path of paths) {
    const segments =
      path
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean);

    for (const segment of segments) {
      const withoutExtension =
        segment.replace(
          /\.(?:zip|mp3|wav|ogg|m4a)$/i,
          "",
        );

      const sunoMatch =
        withoutExtension.match(
          /^(.+?)\s*\[usesuno\.com\](?:\s+part[-_ ]*\d+(?:[-_ ]*of[-_ ]*\d+)?)?$/i,
        );

      if (
        sunoMatch?.[1]
      ) {
        return cleanTitleCase(
          sunoMatch[1],
        );
      }
    }
  }

  return null;
}

export function inferRadioWoloImportProfile(
  sources:
    RadioWoloIntakeSource[],
  current:
    RadioWoloImportProfile =
      RADIO_WOLO_DEFAULT_IMPORT_PROFILE,
) {
  const paths =
    sources.map(
      (source) =>
        source.path ||
        source.file.name,
    );

  const artist =
    inferredArtist(
      paths,
    );

  const fromSuno =
    paths.some(
      (path) =>
        /usesuno\.com|(?:^|[^a-z])suno(?:[^a-z]|$)/i.test(
          path,
        ),
    );

  const credit =
    artist ||
    current.credit.trim() ||
    RADIO_WOLO_DEFAULT_IMPORT_PROFILE.credit;

  const tags =
    uniqueTags(
      artist
        ? [
            tagSlug(
              artist,
            ),
            fromSuno
              ? "suno"
              : "",
          ]
        : [
            ...current.tags.split(","),
            fromSuno
              ? "suno"
              : "",
          ],
    ).join(", ");

  return {
    credit,
    kind:
      current.kind.trim() ||
      "song",
    tags:
      tags ||
      RADIO_WOLO_DEFAULT_IMPORT_PROFILE.tags,
  };
}

export function radioWoloSourcesFromFiles(
  files:
    | FileList
    | File[],
) {
  return Array.from(
    files,
  ).map(
    (file) => ({
      file,
      path:
        file.webkitRelativePath ||
        file.name,
    }),
  );
}

export function isRadioWoloSupportedSource(
  source:
    RadioWoloIntakeSource,
) {
  return (
    isRadioWoloAudioFile(
      source.file,
    ) ||
    isRadioWoloZipFile(
      source.file,
    )
  );
}

async function readDirectory(
  entry: WebkitEntry,
) {
  const reader =
    entry.createReader?.();

  if (!reader) {
    return [];
  }

  const all:
    WebkitEntry[] = [];

  for (;;) {
    const batch =
      await new Promise<
        WebkitEntry[]
      >(
        (
          resolve,
          reject,
        ) =>
          reader.readEntries(
            resolve,
            reject,
          ),
      );

    if (
      batch.length === 0
    ) {
      break;
    }

    all.push(
      ...batch,
    );
  }

  return all;
}

async function readFileEntry(
  entry: WebkitEntry,
) {
  if (!entry.file) {
    return null;
  }

  return new Promise<File>(
    (
      resolve,
      reject,
    ) =>
      entry.file?.(
        resolve,
        reject,
      ),
  );
}

async function walkEntry(
  entry: WebkitEntry,
  parentPath: string,
  result:
    RadioWoloIntakeSource[],
) {
  if (
    result.length >=
    MAX_FOLDER_FILES
  ) {
    throw new Error(
      `Radio WOLO folder intake is limited to ${MAX_FOLDER_FILES.toLocaleString()} files per drop.`,
    );
  }

  const path =
    parentPath
      ? `${parentPath}/${entry.name}`
      : entry.name;

  if (entry.isFile) {
    const file =
      await readFileEntry(
        entry,
      );

    if (file) {
      result.push({
        file,
        path,
      });
    }

    return;
  }

  if (
    !entry.isDirectory
  ) {
    return;
  }

  const children =
    await readDirectory(
      entry,
    );

  for (const child of children) {
    await walkEntry(
      child,
      path,
      result,
    );
  }
}

export async function collectRadioWoloDropSources(
  dataTransfer:
    DataTransfer,
) {
  const items =
    Array.from(
      dataTransfer.items ||
        [],
    );

  const entries =
    items
      .map(
        (item) =>
          (
            item as
              WebkitDataTransferItem
          ).webkitGetAsEntry?.() ||
          null,
      )
      .filter(
        (
          entry,
        ): entry is WebkitEntry =>
          Boolean(entry),
      );

  if (
    entries.length === 0
  ) {
    return radioWoloSourcesFromFiles(
      dataTransfer.files,
    );
  }

  const result:
    RadioWoloIntakeSource[] =
    [];

  for (const entry of entries) {
    await walkEntry(
      entry,
      "",
      result,
    );
  }

  return result;
}

export function readRememberedRadioWoloImportProfile() {
  if (
    typeof window ===
    "undefined"
  ) {
    return RADIO_WOLO_DEFAULT_IMPORT_PROFILE;
  }

  try {
    const raw =
      window.localStorage.getItem(
        RADIO_WOLO_IMPORT_PROFILE_STORAGE_KEY,
      );

    if (!raw) {
      return RADIO_WOLO_DEFAULT_IMPORT_PROFILE;
    }

    const parsed =
      JSON.parse(raw) as
        Partial<RadioWoloImportProfile>;

    return {
      credit:
        typeof parsed.credit ===
          "string" &&
        parsed.credit.trim()
          ? parsed.credit
          : RADIO_WOLO_DEFAULT_IMPORT_PROFILE.credit,
      kind:
        typeof parsed.kind ===
          "string" &&
        parsed.kind.trim()
          ? parsed.kind
          : RADIO_WOLO_DEFAULT_IMPORT_PROFILE.kind,
      tags:
        typeof parsed.tags ===
          "string" &&
        parsed.tags.trim()
          ? parsed.tags
          : RADIO_WOLO_DEFAULT_IMPORT_PROFILE.tags,
    };
  } catch {
    return RADIO_WOLO_DEFAULT_IMPORT_PROFILE;
  }
}

export function rememberRadioWoloImportProfile(
  profile:
    RadioWoloImportProfile,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      RADIO_WOLO_IMPORT_PROFILE_STORAGE_KEY,
      JSON.stringify(
        profile,
      ),
    );
  } catch {
    // Remembering operator convenience state is optional.
  }
}
