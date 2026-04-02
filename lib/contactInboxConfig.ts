export const DIRECT_MESSAGE_REACTIONS = ["🔥", "👀", "💸", "🎯", "GG"] as const;
export const DIRECT_MESSAGE_MAX_CHARS = 1000;
export const DIRECT_MESSAGE_TYPING_WINDOW_MS = 8_000;
export const MAX_DIRECT_IMAGE_BYTES = 2_500_000;
export const MAX_DIRECT_AUDIO_BYTES = 6_000_000;

export type DirectMessageReactionOption = (typeof DIRECT_MESSAGE_REACTIONS)[number];
