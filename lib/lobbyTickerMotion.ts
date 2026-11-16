// Constant physical scrolling velocity, regardless of message count.
// Each copy travels exactly half the two-copy track width.
export function tickerTravelSeconds(pixelsPerCycle: number): number {
  if (!Number.isFinite(pixelsPerCycle) || pixelsPerCycle <= 0) return 26;
  return Math.max(14, Math.min(72, pixelsPerCycle / 86));
}
