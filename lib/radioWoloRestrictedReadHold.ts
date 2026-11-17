/**
 * Explicit nonfinancial Radio WOLO admission holds.
 *
 * A metadata reader is not authority to read private program assets or
 * identifiable listener traffic. Never invent empty analytics, open a legacy
 * datasource, or return a fake successful audio stream to mask that boundary.
 */
export const ADMIN_RADIO_LISTENER_HOLD_SCHEMA =
  "aoe2war.radio.admin-listener-read-hold.v1" as const;
export const RADIO_ON_AIR_MEDIA_HOLD_SCHEMA =
  "aoe2war.radio.on-air-media-read-hold.v1" as const;

export const ADMIN_RADIO_LISTENER_HOLD_STATUS =
  "HOLD_C03_NONFINANCIAL_LISTENER_PROJECTION_REQUIRED" as const;
export const RADIO_ON_AIR_MEDIA_HOLD_STATUS =
  "HOLD_NONFINANCIAL_ON_AIR_MEDIA_PROJECTION_REQUIRED" as const;

export function adminRadioListenerReadHoldPayload() {
  return {
    schema: ADMIN_RADIO_LISTENER_HOLD_SCHEMA,
    status: ADMIN_RADIO_LISTENER_HOLD_STATUS,
    detail:
      "Radio WOLO listener statistics require a separately reviewed nonfinancial admin reader.",
    analyticsAvailable: false,
    countsVerified: false,
  } as const;
}

export function radioOnAirMediaReadHoldPayload() {
  return {
    schema: RADIO_ON_AIR_MEDIA_HOLD_SCHEMA,
    status: RADIO_ON_AIR_MEDIA_HOLD_STATUS,
    detail:
      "Radio WOLO station audio requires a separately admitted, on-air-only nonfinancial media reader.",
    playbackAvailable: false,
  } as const;
}

export function isAdminRadioListenerReadHold(
  value: unknown,
): value is ReturnType<typeof adminRadioListenerReadHoldPayload> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const data = value as Record<string, unknown>;
  return data.schema === ADMIN_RADIO_LISTENER_HOLD_SCHEMA &&
    data.status === ADMIN_RADIO_LISTENER_HOLD_STATUS &&
    data.analyticsAvailable === false &&
    data.countsVerified === false;
}
