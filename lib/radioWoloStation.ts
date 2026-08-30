import {
  calculateRadioProgramDurationMs,
} from "@/lib/radioWoloPrograms";

export type RadioTimelineItem<T> = {
  value: T;
  durationMs: number;
  transition: string;
  crossfadeMs: number;
};

export type RadioTimelineSegment<T> = {
  value: T;
  position: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  transition: string;
  crossfadeMs: number;
  overlapMs: number;
};

export function buildRadioProgramTimeline<T>(
  items: RadioTimelineItem<T>[],
) {
  const segments:
    RadioTimelineSegment<T>[] = [];

  let previousEndMs = 0;
  let previousDurationMs = 0;

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const item =
      items[index];

    const durationMs =
      Math.max(
        0,
        item.durationMs,
      );

    const overlapMs =
      index > 0 &&
      item.transition ===
        "crossfade"
        ? Math.min(
            Math.max(
              0,
              item.crossfadeMs,
            ),
            previousDurationMs,
            durationMs,
          )
        : 0;

    const startMs =
      index === 0
        ? 0
        : previousEndMs -
          overlapMs;

    const endMs =
      startMs +
      durationMs;

    segments.push({
      value:
        item.value,
      position:
        index,
      startMs,
      endMs,
      durationMs,
      transition:
        item.transition,
      crossfadeMs:
        item.crossfadeMs,
      overlapMs,
    });

    previousEndMs =
      endMs;

    previousDurationMs =
      durationMs;
  }

  const durationMs =
    calculateRadioProgramDurationMs(
      items.map(
        (item) => ({
          durationMs:
            item.durationMs,
          transition:
            item.transition,
          crossfadeMs:
            item.crossfadeMs,
        }),
      ),
    );

  return {
    segments,
    durationMs,
  };
}

export function resolveRadioStationPosition<T>(
  items: RadioTimelineItem<T>[],
  elapsedMs: number,
) {
  const timeline =
    buildRadioProgramTimeline(
      items,
    );

  const elapsed =
    Math.max(
      0,
      Math.floor(
        elapsedMs,
      ),
    );

  if (
    timeline.segments.length ===
    0
  ) {
    return {
      ended: true,
      elapsedMs:
        elapsed,
      durationMs: 0,
      remainingMs: 0,
      current: null,
      next: null,
    };
  }

  if (
    elapsed >=
    timeline.durationMs
  ) {
    return {
      ended: true,
      elapsedMs:
        elapsed,
      durationMs:
        timeline.durationMs,
      remainingMs: 0,
      current: null,
      next: null,
    };
  }

  let currentIndex = 0;

  for (
    let index = 0;
    index <
    timeline.segments.length;
    index += 1
  ) {
    if (
      timeline.segments[
        index
      ].startMs <=
      elapsed
    ) {
      currentIndex =
        index;
    } else {
      break;
    }
  }

  const current =
    timeline.segments[
      currentIndex
    ];

  const next =
    timeline.segments[
      currentIndex + 1
    ] ?? null;

  return {
    ended: false,
    elapsedMs:
      elapsed,
    durationMs:
      timeline.durationMs,
    remainingMs:
      Math.max(
        0,
        timeline.durationMs -
          elapsed,
      ),
    current: {
      ...current,
      offsetMs:
        Math.max(
          0,
          elapsed -
            current.startMs,
        ),
      remainingMs:
        Math.max(
          0,
          current.endMs -
            elapsed,
        ),
    },
    next,
  };
}
