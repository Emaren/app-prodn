export const LOBBY_MESSAGE_REACTIONS = ["👍", "🔥", "😂", "👀", "🐐", "💀", "⚔️"] as const;

export type LobbyMessageReactionOption = (typeof LOBBY_MESSAGE_REACTIONS)[number];
