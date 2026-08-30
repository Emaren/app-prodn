export const RADIO_WOLO_DEFAULT_VOLUME = 0.35;
export const RADIO_WOLO_FADE_IN_MS = 3_000;
export const RADIO_WOLO_FADE_OUT_MS = 550;

export function clampRadioWoloVolume(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return RADIO_WOLO_DEFAULT_VOLUME;
  }

  return Math.min(
    1,
    Math.max(0, value),
  );
}

/**
 * Premium entrance curve.
 *
 * Smoothstep stays especially restrained at the beginning,
 * giving headphone listeners time to react before Radio WOLO
 * reaches its remembered target volume.
 */
export function radioWoloEntranceEase(
  progress: number,
) {
  const safe =
    Math.min(
      1,
      Math.max(0, progress),
    );

  return (
    safe *
    safe *
    (3 - 2 * safe)
  );
}

export function radioWoloInterpolatedVolume(
  from: number,
  to: number,
  progress: number,
) {
  const start =
    clampRadioWoloVolume(from);

  const end =
    clampRadioWoloVolume(to);

  const eased =
    radioWoloEntranceEase(
      progress,
    );

  return clampRadioWoloVolume(
    start +
      (
        end -
        start
      ) *
        eased,
  );
}
