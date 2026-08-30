export const RADIO_WOLO_ACTIVE_POLL_MS = 5_000;
export const RADIO_WOLO_OFF_AIR_POLL_MS = 15_000;
export const RADIO_WOLO_DRIFT_SEEK_THRESHOLD_MS = 1_500;
export const RADIO_WOLO_MAX_NETWORK_ADVANCE_MS = 1_000;
export const RADIO_WOLO_BOUNDARY_SYNC_GRACE_MS = 80;
export const RADIO_WOLO_MIN_SYNC_DELAY_MS = 100;

export type RadioWoloListenerAsset = {
  mediaUrl: string;
  durationMs: number;
  title?: string;
  credit?: string | null;
  kind?: string;
};

export type RadioWoloListenerClockItem = {
  position: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  transition: string;
  crossfadeMs: number;
  overlapMs: number;
  offsetMs?: number;
  remainingMs?: number;
  asset: RadioWoloListenerAsset;
};

export type RadioWoloListenerClock = {
  now: string;
  elapsedMs: number;
  durationMs: number;
  remainingMs: number;
  current: RadioWoloListenerClockItem | null;
  next: RadioWoloListenerClockItem | null;
};

export type RadioWoloListenerStation = {
  identity: string;
  state: "off_air" | "on_air";
  authenticated: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  endedNaturally: boolean;
  program: {
    name: string;
  } | null;
  clock: RadioWoloListenerClock | null;
};

export type RadioWoloListenerEnvelope = {
  station: RadioWoloListenerStation;
};

export type RadioWoloListenerAnchor = {
  stationStartedAt: string;
  position: number;
  mediaUrl: string;
  mediaKey: string;

  receivedAtMonotonicMs: number;

  offsetAtReceiptMs: number;
  elapsedAtReceiptMs: number;

  assetDurationMs: number;
  programDurationMs: number;
};

function finiteNonNegative(
  value: number,
  fallback = 0,
) {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return fallback;
  }

  return value;
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

export function radioListenerNetworkAdvanceMs(
  roundTripMs: number,
) {
  return clamp(
    finiteNonNegative(roundTripMs) / 2,
    0,
    RADIO_WOLO_MAX_NETWORK_ADVANCE_MS,
  );
}

export function radioListenerMediaKey(input: {
  stationStartedAt: string;
  position: number;
  mediaUrl: string;
}) {
  return [
    input.stationStartedAt,
    input.position,
    input.mediaUrl,
  ].join(":");
}

export function createRadioListenerAnchor(
  station: RadioWoloListenerStation,
  receivedAtMonotonicMs: number,
  roundTripMs: number,
): RadioWoloListenerAnchor | null {
  const clock =
    station.clock;

  const current =
    clock?.current;

  if (
    station.state !== "on_air" ||
    !station.startedAt ||
    !clock ||
    !current ||
    typeof current.offsetMs !== "number" ||
    !current.asset.mediaUrl
  ) {
    return null;
  }

  const networkAdvanceMs =
    radioListenerNetworkAdvanceMs(
      roundTripMs,
    );

  const assetDurationMs =
    finiteNonNegative(
      current.asset.durationMs,
    );

  const programDurationMs =
    finiteNonNegative(
      clock.durationMs,
    );

  const offsetAtReceiptMs =
    clamp(
      finiteNonNegative(
        current.offsetMs,
      ) +
        networkAdvanceMs,
      0,
      assetDurationMs,
    );

  const elapsedAtReceiptMs =
    clamp(
      finiteNonNegative(
        clock.elapsedMs,
      ) +
        networkAdvanceMs,
      0,
      programDurationMs,
    );

  return {
    stationStartedAt:
      station.startedAt,

    position:
      current.position,

    mediaUrl:
      current.asset.mediaUrl,

    mediaKey:
      radioListenerMediaKey({
        stationStartedAt:
          station.startedAt,
        position:
          current.position,
        mediaUrl:
          current.asset.mediaUrl,
      }),

    receivedAtMonotonicMs:
      finiteNonNegative(
        receivedAtMonotonicMs,
      ),

    offsetAtReceiptMs,
    elapsedAtReceiptMs,

    assetDurationMs,
    programDurationMs,
  };
}

function interpolationDeltaMs(
  anchor: RadioWoloListenerAnchor,
  nowMonotonicMs: number,
) {
  return Math.max(
    0,
    finiteNonNegative(
      nowMonotonicMs,
    ) -
      anchor.receivedAtMonotonicMs,
  );
}

export function radioListenerExpectedOffsetMs(
  anchor: RadioWoloListenerAnchor,
  nowMonotonicMs: number,
) {
  return clamp(
    anchor.offsetAtReceiptMs +
      interpolationDeltaMs(
        anchor,
        nowMonotonicMs,
      ),
    0,
    anchor.assetDurationMs,
  );
}

export function radioListenerExpectedElapsedMs(
  anchor: RadioWoloListenerAnchor,
  nowMonotonicMs: number,
) {
  return clamp(
    anchor.elapsedAtReceiptMs +
      interpolationDeltaMs(
        anchor,
        nowMonotonicMs,
      ),
    0,
    anchor.programDurationMs,
  );
}

export function radioListenerDriftMs(
  actualTimeSeconds: number,
  expectedOffsetMs: number,
) {
  const actualMs =
    finiteNonNegative(
      actualTimeSeconds,
    ) * 1_000;

  return (
    actualMs -
    finiteNonNegative(
      expectedOffsetMs,
    )
  );
}

export function radioListenerShouldSeek(
  actualTimeSeconds: number,
  expectedOffsetMs: number,
  thresholdMs =
    RADIO_WOLO_DRIFT_SEEK_THRESHOLD_MS,
) {
  return (
    Math.abs(
      radioListenerDriftMs(
        actualTimeSeconds,
        expectedOffsetMs,
      ),
    ) >
    finiteNonNegative(
      thresholdMs,
    )
  );
}

export function radioListenerPollDelayMs(
  station:
    | RadioWoloListenerStation
    | null,
) {
  return station?.state ===
    "on_air"
    ? RADIO_WOLO_ACTIVE_POLL_MS
    : RADIO_WOLO_OFF_AIR_POLL_MS;
}

export function radioListenerNextSyncDelayMs(
  station:
    | RadioWoloListenerStation
    | null,
  anchor:
    | RadioWoloListenerAnchor
    | null,
  nowMonotonicMs: number,
) {
  const baseDelayMs =
    radioListenerPollDelayMs(
      station,
    );

  if (
    station?.state !== "on_air" ||
    !station.clock?.current
  ) {
    return baseDelayMs;
  }

  const expectedElapsedMs =
    anchor
      ? radioListenerExpectedElapsedMs(
          anchor,
          nowMonotonicMs,
        )
      : station.clock.elapsedMs;

  const nextBoundaryMs =
    station.clock.next?.startMs ??
    station.clock.current.endMs;

  if (
    !Number.isFinite(
      nextBoundaryMs,
    ) ||
    nextBoundaryMs <=
      expectedElapsedMs
  ) {
    return baseDelayMs;
  }

  const boundaryDelayMs =
    nextBoundaryMs -
    expectedElapsedMs +
    RADIO_WOLO_BOUNDARY_SYNC_GRACE_MS;

  return clamp(
    boundaryDelayMs,
    RADIO_WOLO_MIN_SYNC_DELAY_MS,
    baseDelayMs,
  );
}
