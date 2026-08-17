export type HallScribeAudience = "public" | "users" | "clan";

export function hallScribeMentioned(value: string) {
  return /(^|\s)@?hall[\s_-]+scribe\b/i.test(value);
}

export function hallScribeVisibleAudiences(
  audience: HallScribeAudience,
): HallScribeAudience[] {
  if (audience === "public") return ["public"];
  if (audience === "users") return ["public", "users"];
  return ["public", "users", "clan"];
}
