export type RadioWoloNavigatorLike = {
  userAgent?: string | null;
  platform?: string | null;
  maxTouchPoints?: number | null;
};

/**
 * iPhone/iPad WebKit keeps the aggressive foreground teardown that protects
 * against a wedged media session. Desktop browsers are allowed to keep the
 * Kingdom broadcast alive while their tab is hidden.
 */
export function radioWoloRequiresForegroundTeardown(
  suppliedNavigator?: RadioWoloNavigatorLike | null,
) {
  const runtimeNavigator =
    suppliedNavigator ??
    (
      typeof navigator !== "undefined"
        ? navigator
        : null
    );

  if (!runtimeNavigator) {
    return false;
  }

  const userAgent =
    runtimeNavigator.userAgent ?? "";

  const platform =
    runtimeNavigator.platform ?? "";

  const maxTouchPoints =
    Number(
      runtimeNavigator.maxTouchPoints ?? 0,
    );

  if (
    /iPhone|iPad|iPod/i.test(
      userAgent,
    )
  ) {
    return true;
  }

  // iPadOS may identify itself as MacIntel while using touch/WebKit.
  return (
    platform === "MacIntel" &&
    maxTouchPoints > 1
  );
}
