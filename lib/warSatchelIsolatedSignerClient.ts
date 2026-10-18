/**
 * Retired unmerged sidecar prototype. Repository consumers use
 * connectCertifiedSatchelSigner in warSatchelDedicatedSignerClient.ts.
 *
 * Keep the exported factory as a deterministic refusal for stale imports.
 * This module never reads credentials, contacts a service or constructs a
 * financial submission. Environment flags cannot restore this prototype.
 */
export type SatchelCustodySidecarConfiguration = Readonly<{
  available: false;
  signingPort: null;
  replacement: "connectCertifiedSatchelSigner";
  signerRole: "exclusive-war-satchel-v1";
  loopbackOnly: true;
  noBrowserCredentials: true;
  noAutomaticBroadcastRetry: true;
}>;
export const SATCHEL_SIDECAR_CONTRACT: SatchelCustodySidecarConfiguration = Object.freeze({
  available: false, signingPort: null,
  replacement: "connectCertifiedSatchelSigner",
  signerRole: "exclusive-war-satchel-v1", loopbackOnly: true,
  noBrowserCredentials: true, noAutomaticBroadcastRetry: true,
});

/** @deprecated Use connectCertifiedSatchelSigner; this factory always refuses. */
export async function makeSatchelLoopbackSigner(_reader?: typeof fetch): Promise<never> {
  void _reader;
  throw Error("SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner");
}
