export const RADIO_PROGRAM_MIN_TARGET_MS =
  10_000;

export const RADIO_PROGRAM_MAX_TARGET_MS =
  24 * 60 * 60 * 1000;

export const RADIO_PROGRAM_MAX_ITEMS =
  500;

export type RadioProgramStatus =
  | "draft"
  | "ready"
  | "archived";

export type RadioProgramTransition =
  | "cut"
  | "crossfade"
  | "bumper";

export type NormalizedRadioProgramItem = {
  assetId: number;
  transition: RadioProgramTransition;
  crossfadeMs: number;
};

export function normalizeRadioProgramName(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const clean =
    value
      .replace(/\0/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 200);

  return clean || null;
}

export function normalizeRadioProgramTargetDurationMs(
  value: unknown,
) {
  const duration =
    Number(value);

  if (
    !Number.isSafeInteger(duration) ||
    duration < RADIO_PROGRAM_MIN_TARGET_MS ||
    duration > RADIO_PROGRAM_MAX_TARGET_MS
  ) {
    return null;
  }

  return duration;
}

export function normalizeRadioProgramStatus(
  value: unknown,
): RadioProgramStatus | null {
  if (
    value === "draft" ||
    value === "ready" ||
    value === "archived"
  ) {
    return value;
  }

  return null;
}

export function normalizeRadioProgramItems(
  value: unknown,
): NormalizedRadioProgramItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length > RADIO_PROGRAM_MAX_ITEMS
  ) {
    return null;
  }

  const result:
    NormalizedRadioProgramItem[] = [];

  for (const raw of value) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      return null;
    }

    const input =
      raw as Record<
        string,
        unknown
      >;

    const assetId =
      Number(
        input.assetId,
      );

    if (
      !Number.isSafeInteger(assetId) ||
      assetId <= 0
    ) {
      return null;
    }

    const transition =
      typeof input.transition ===
      "string"
        ? input.transition
            .trim()
            .toLowerCase()
        : "cut";

    if (
      transition !== "cut" &&
      transition !== "crossfade" &&
      transition !== "bumper"
    ) {
      return null;
    }

    let crossfadeMs =
      transition === "crossfade"
        ? Number(
            input.crossfadeMs ??
              0,
          )
        : 0;

    if (
      !Number.isSafeInteger(
        crossfadeMs,
      ) ||
      crossfadeMs < 0 ||
      crossfadeMs > 30_000
    ) {
      return null;
    }

    if (
      transition !== "crossfade"
    ) {
      crossfadeMs = 0;
    }

    result.push({
      assetId,
      transition,
      crossfadeMs,
    });
  }

  return result;
}

export function calculateRadioProgramDurationMs(
  items: Array<{
    durationMs: number;
    transition: string;
    crossfadeMs: number;
  }>,
) {
  let total = 0;

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const item =
      items[index];

    const duration =
      Math.max(
        0,
        item.durationMs,
      );

    total += duration;

    if (
      index === 0 ||
      item.transition !==
        "crossfade" ||
      item.crossfadeMs <= 0
    ) {
      continue;
    }

    const previous =
      items[
        index - 1
      ];

    const overlap =
      Math.min(
        item.crossfadeMs,
        Math.max(
          0,
          previous.durationMs,
        ),
        duration,
      );

    total -= overlap;
  }

  return total;
}
