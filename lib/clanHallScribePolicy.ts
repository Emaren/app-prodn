export type HallScribeAudience = "public" | "users" | "clan";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hallScribeMentioned(
  value: string,
  mentions: readonly string[] = [
    "@Scribe",
    "@Hall Scribe",
    "Hall Scribe",
    "@hall_scribe",
  ],
) {
  return mentions.some((mention) => {
    const normalized = mention.trim();
    if (!normalized) return false;
    const pattern = escapeRegExp(normalized).replace(/\s+/g, "\\s+");
    return new RegExp(
      `(^|\\s)${pattern}(?=\\s|[.,!?;:]|$)`,
      "i",
    ).test(value);
  });
}

export function hallScribeVisibleAudiences(
  audience: HallScribeAudience,
): HallScribeAudience[] {
  if (audience === "public") return ["public"];
  if (audience === "users") return ["public", "users"];
  return ["public", "users", "clan"];
}
