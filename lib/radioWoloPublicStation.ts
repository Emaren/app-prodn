export const RADIO_WOLO_TAGLINE =
  "Radio WOLO — The Kingdom Never Goes Silent.";

export type PublicRadioAssetInput = {
  publicId: string;
  title: string;
  credit: string | null;
  kind: string;
  durationMs: number;
};

export function publicRadioAssetProjection(
  asset: PublicRadioAssetInput,
  authenticated: boolean,
) {
  const base = {
    mediaUrl:
      `/api/radio/station/audio/${encodeURIComponent(
        asset.publicId,
      )}`,
    durationMs:
      asset.durationMs,
  };

  if (!authenticated) {
    return base;
  }

  return {
    ...base,
    title:
      asset.title,
    credit:
      asset.credit,
    kind:
      asset.kind,
  };
}
