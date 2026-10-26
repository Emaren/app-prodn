/** Preserve a review's declared precision; a calendar date is not a UTC hour. */
export function formatKingdomStamp(input: string | null): string {
  if (!input) return "—";
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  if (!calendarDate && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) return "—";
  const parsed = new Date(calendarDate ? `${input}T00:00:00Z` : input);
  if (!Number.isFinite(parsed.getTime())) return "—";
  // JavaScript normalizes impossible dates such as February 30 into March.
  const declaredDay = input.slice(0,10);
  if (new Date(`${declaredDay}T00:00:00Z`).toISOString().slice(0,10) !== declaredDay) return "—";
  return calendarDate ? `${input} · DATE ONLY`
    : parsed.toISOString().slice(0,16).replace("T"," ")+" UTC";
}

export function kingdomStampDay(input: string | null): string {
  const stamp = formatKingdomStamp(input);
  return stamp === "—" ? stamp : stamp.slice(0,10);
}
