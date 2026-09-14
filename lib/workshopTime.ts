export const WORKSHOP_TIME_ZONE = "America/Edmonton";

export function formatWorkshopDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-US", {
    timeZone: WORKSHOP_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
