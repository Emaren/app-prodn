import path from "node:path";

export const RADIO_ASSET_MAX_AUDIO_BYTES =
  60 * 1024 * 1024;

export const RADIO_ASSET_MAX_DURATION_MS =
  12 * 60 * 60 * 1000;

export function normalizeRadioAssetKind(
  value: unknown,
) {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64)
      : "";

  return normalized || "uncategorized";
}

export function normalizeRadioAssetTags(
  value: unknown,
) {
  const source =
    Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") continue;

    const tag = item
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .slice(0, 64);

    if (
      !tag ||
      seen.has(tag) ||
      tags.length >= 32
    ) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

export function normalizeRadioAssetTitle(
  value: unknown,
  fallbackFilename = "",
) {
  const explicit =
    typeof value === "string"
      ? value.replace(/\0/g, "").trim()
      : "";

  if (explicit) {
    return explicit.slice(0, 200);
  }

  const basename = path.basename(
    fallbackFilename || "Untitled",
  );

  const withoutExtension =
    basename.replace(/\.[^.]+$/, "");

  return (
    withoutExtension
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) ||
    "Untitled"
  );
}

export function normalizeRadioAssetCredit(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const clean = value
    .replace(/\0/g, "")
    .trim()
    .slice(0, 200);

  return clean || null;
}

export function normalizeRadioDurationMs(
  value: unknown,
) {
  const duration = Number(value);

  if (
    !Number.isFinite(duration) ||
    duration < 100 ||
    duration >
      RADIO_ASSET_MAX_DURATION_MS
  ) {
    return null;
  }

  return Math.round(duration);
}

export type RadioByteRange = {
  start: number;
  end: number;
  length: number;
};

export function parseRadioByteRange(
  header: string | null,
  size: number,
): RadioByteRange | null | "invalid" {
  if (!header) return null;

  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    !header.startsWith("bytes=")
  ) {
    return "invalid";
  }

  const specification =
    header.slice(6).trim();

  if (
    !specification ||
    specification.includes(",")
  ) {
    return "invalid";
  }

  const match =
    specification.match(
      /^(\d*)-(\d*)$/,
    );

  if (!match) return "invalid";

  const startText = match[1];
  const endText = match[2];

  if (!startText && !endText) {
    return "invalid";
  }

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength =
      Number(endText);

    if (
      !Number.isSafeInteger(
        suffixLength,
      ) ||
      suffixLength <= 0
    ) {
      return "invalid";
    }

    start = Math.max(
      0,
      size - suffixLength,
    );
    end = size - 1;
  } else {
    start = Number(startText);

    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start >= size
    ) {
      return "invalid";
    }

    if (endText) {
      end = Number(endText);

      if (
        !Number.isSafeInteger(end) ||
        end < start
      ) {
        return "invalid";
      }

      end = Math.min(
        end,
        size - 1,
      );
    } else {
      end = size - 1;
    }
  }

  return {
    start,
    end,
    length: end - start + 1,
  };
}
