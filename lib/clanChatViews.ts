export const CLAN_CHAT_VIEW_MODES = ["v1", "v2", "v3", "v4", "v5"] as const;

export type ClanChatViewMode = (typeof CLAN_CHAT_VIEW_MODES)[number];

export function isClanChatViewMode(value: unknown): value is ClanChatViewMode {
  return (
    typeof value === "string" &&
    (CLAN_CHAT_VIEW_MODES as readonly string[]).includes(value)
  );
}

export function normalizeClanChatViewMode(
  value: unknown,
  fallback: ClanChatViewMode = "v1",
): ClanChatViewMode {
  return isClanChatViewMode(value) ? value : fallback;
}
