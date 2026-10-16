/**
 * Guard the observed payout signer before any new mainnet broadcast.
 * The observed address is from the server-owned settlement service health
 * or the locally derived signer, NOT an end-user supplied wallet.
 *
 * This alone is not independent proof of service authority: the canonical
 * MsgSend must also independently match this origin after commitment.
 */
export function requireObservedWoloPayoutSender(
  observed: string | null | undefined,
  mainnet: boolean,
): string | null {
  const normalized = typeof observed === "string" ? observed.trim().toLowerCase() : "";
  const address = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/.test(normalized)
    ? normalized : null;
  if (mainnet && !address) {
    throw new Error("WOLO_MAINNET_PAYOUT_SENDER_UNVERIFIED");
  }
  return address;
}
