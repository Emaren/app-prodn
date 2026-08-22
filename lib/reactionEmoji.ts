export const REACTION_EMOJI_MAX_CODEPOINTS = 24;

const REACTION_EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3)/u;

export function normalizeReactionEmoji(value: unknown): string | null {
  const normalized = String(value ?? "").trim().normalize("NFC");
  if (!normalized) return null;

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(normalized), (entry) => entry.segment);
  if (segments.length !== 1) return null;

  const emoji = segments[0];
  if (Array.from(emoji).length > REACTION_EMOJI_MAX_CODEPOINTS) return null;
  if (!REACTION_EMOJI_PATTERN.test(emoji)) return null;
  return emoji;
}

export function isReactionEmoji(value: unknown): value is string {
  return normalizeReactionEmoji(value) !== null;
}
