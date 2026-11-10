/**
 * Public theme availability is not the same as the absence of a campaign.
 * Restricted production role 42501 on this one optional, nonfinancial reader
 * must remain a visible unavailable response rather than fabricated null.
 * Never use this fence to swallow denied users, finance, or other relations.
 */
export function isDeniedPublicSiteThemeCampaign(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  if (!["P2010", "P2039"].includes(String(candidate.code ?? ""))) return false;
  const state = String(candidate.meta?.code ?? "");
  const message = [candidate.message, candidate.meta?.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return (state === "42501" || /Code:\s*`42501`/.test(message)) &&
    /\bpermission denied for (?:table|relation) site_theme_campaign\b/i.test(message);
}
