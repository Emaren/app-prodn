import type { LobbyMessage, LobbySnapshot } from "@/lib/lobby";

export type ChatRenderItem =
  | { type: "divider"; key: string; label: string }
  | { type: "message"; key: string; message: LobbyMessage };

export function buildChatItems(messages: LobbyMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  let previousDayKey: string | null = null;

  for (const message of messages) {
    const dayKey = getDayKey(message.createdAt);

    if (dayKey !== previousDayKey) {
      items.push({
        type: "divider",
        key: `divider-${dayKey}-${message.id}`,
        label: formatChatDividerLabel(message.createdAt),
      });
      previousDayKey = dayKey;
    }

    items.push({
      type: "message",
      key: `message-${message.id}`,
      message,
    });
  }

  return items;
}

export function displayName(
  inGameName: string | null | undefined,
  steamPersonaName: string | null | undefined
) {
  return inGameName || steamPersonaName || "Steam user";
}

export function displayMatchPlayer(
  entrant:
    | LobbySnapshot["tournament"]["matches"][number]["playerOne"]
    | LobbySnapshot["tournament"]["matches"][number]["playerTwo"]
) {
  if (!entrant) return "Open Slot";
  return displayName(entrant.inGameName, entrant.steamPersonaName);
}

export function formatTournamentWindow(startsAt: string | null) {
  if (!startsAt) return "Scheduling now";

  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "Scheduling now";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatChatDividerLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  const sameYear = date.getFullYear() === today.getFullYear();

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
