export function normalizeAiKnowledgeQuery(
  source: string,
  message: string,
) {
  const original = String(message ?? "").trim();

  if (source !== "clan_hall" || !original) {
    return original;
  }

  // The invocation token is UI/control syntax, not a Kingdom knowledge entity.
  // Strip only a leading direct Hall Scribe invocation for KKR routing. The
  // original message remains untouched for transcript display and provider input.
  const stripped = original
    .replace(
      /^\s*@?hall\s+scribe\b\s*[:,\-–—]?\s*/i,
      "",
    )
    .trim();

  return stripped || original;
}
