/**
 * Retired unmerged camel-case transport prototype. All application consumers
 * use connectCertifiedSatchelSigner in warSatchelDedicatedSignerClient.ts.
 * Exported names remain to fail explicitly for stale imports; neither health
 * nor construction reads configuration or makes any network request.
 */
/** Historical configuration shape; it cannot authorize any operation. */
export type LocalSatchelSignerConfig = Readonly<{
  vaultAddress: string;
  escrowAddress: string;
  keyFingerprint: string;
  serviceAccessToken: string;
  approvedByOperator: boolean;
}>;
/** Historical response shape; this retired module never returns a health proof. */
export type LocalSatchelSignerHealth = Readonly<{
  protocol: 1;
  chainId: "wolo-1";
  custodyRole: "exclusive-war-satchel-v1";
  vaultAddress: string;
  keyFingerprint: string;
  exclusiveSignOnly: true;
  accepting: true;
}>;

function retired(): never {
  throw Error("SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner");
}
/** @deprecated Use connectCertifiedSatchelSigner; legacy health always refuses. */
export async function assertLocalSatchelSignerHealth(
  _config: LocalSatchelSignerConfig, _reader?: typeof fetch,
): Promise<never> {
  void _config; void _reader;
  return retired();
}
/** @deprecated Use connectCertifiedSatchelSigner; this factory always refuses. */
export function createLocalIsolatedSatchelSigner(
  _config: LocalSatchelSignerConfig, _reader?: typeof fetch,
): never {
  void _config; void _reader;
  return retired();
}
