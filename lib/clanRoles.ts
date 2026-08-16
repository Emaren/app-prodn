export function formatClanRole(role: string | null | undefined) {
  switch ((role || "").trim().toLowerCase()) {
    case "owner":
      return "The King";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "site_admin":
      return "AoE2WAR Operator";
    default:
      return role?.trim() || "Member";
  }
}
