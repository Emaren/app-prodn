export function radioWoloOperatorUids() {
  return new Set(
    (
      process.env.RADIO_WOLO_OPERATOR_UIDS ||
      ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isRadioWoloOperatorUid(
  uid: string | null | undefined,
) {
  if (!uid) return false;

  return radioWoloOperatorUids().has(uid);
}
