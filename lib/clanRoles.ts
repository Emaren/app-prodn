export function formatClanRole(role: string | null | undefined) {
  switch ((role || "").trim().toLowerCase()) {
    case "owner":
      return "The King";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "hall_scribe":
      return "Hall Scribe";
    case "site_admin":
      return "AoE2WAR Operator";
    default:
      return role?.trim() || "Member";
  }
}
