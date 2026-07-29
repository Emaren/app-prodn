import type { LobbyMessage, LobbySnapshot } from "@/lib/lobby";

export type ChatRenderItem =
  | { type: "divider"; key: string; label: string }
  | { type: "message"; key: string; message: LobbyMessage };

export function buildChatItems(messages: LobbyMessage[], timeZone = "UTC"): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  let previousDayKey: string | null = null;

  for (const message of messages) {
    const dayKey = getDayKey(message.createdAt, timeZone);

    if (dayKey !== previousDayKey) {
      items.push({
        type: "divider",
        key: `divider-${dayKey}-${message.id}`,
        label: formatChatDividerLabel(message.createdAt, timeZone),
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

function zonedDateParts(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return year && month && day ? { year, month, day } : null;
}

function getDayKey(value: string, timeZone: string) {
  const parts = zonedDateParts(value, timeZone);
  return parts
    ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
    : "unknown";
}

function formatChatDividerLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  const todayParts = zonedDateParts(today, timeZone);
  const dateParts = zonedDateParts(date, timeZone);
  if (!todayParts || !dateParts) return "Recent";
  const diffDays = Math.round(
    (
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) -
      Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
    ) /
      (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  const sameYear = dateParts.year === todayParts.year;

  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
