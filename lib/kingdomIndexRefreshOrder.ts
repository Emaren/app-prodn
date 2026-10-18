/** An old response or failure cannot supersede a newer KingIndex refresh. */
export function isLatestKingdomIndexRefresh(requestId: number, latestStarted: number): boolean {
  return Number.isSafeInteger(requestId) &&
    Number.isSafeInteger(latestStarted) &&
    requestId > 0 &&
    requestId === latestStarted;
}
