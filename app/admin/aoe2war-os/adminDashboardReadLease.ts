/**
 * An authenticated dashboard GET owns the visible page only while its exact
 * AbortController is still current. A hidden tab must release the lease before
 * aborting it so a newly visible tab can fetch immediately, even if an old
 * transport ignores AbortSignal and completes after the successor.
 */
export function abandonAdminDashboardRead(
  ref: { current: AbortController | null },
) {
  const abandoned = ref.current;
  ref.current = null;
  abandoned?.abort();
}

export function isCurrentAdminDashboardRead(
  ref: { current: AbortController | null },
  controller: AbortController,
) {
  return ref.current === controller;
}
