export type ClanInviteStatus = "pending" | "accepted" | "declined";

export const CLAN_INVITE_STATUS_LABELS: Record<
  ClanInviteStatus,
  string
> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
};

const MANAGER_ROLES = new Set(["owner", "admin"]);

export function canSendClanInvite(input: {
  siteAdmin: boolean;
  membershipRole: string | null;
  membershipStatus: string | null;
}) {
  return Boolean(
    input.siteAdmin ||
      (input.membershipStatus === "active" &&
        input.membershipRole &&
        MANAGER_ROLES.has(input.membershipRole)),
  );
}

export function buildClanInviteBody(input: {
  clanName: string;
  clanSlug: string;
  inviterName: string;
  messageId: number;
  origin: string;
  status: ClanInviteStatus;
}) {
  const hallUrl =
    `${input.origin.replace(/\/$/, "")}/clans/` +
    `${encodeURIComponent(input.clanSlug)}?invite=${input.messageId}`;

  return [
    `🏰 ${input.clanName} invitation`,
    `${input.inviterName} invited you to join ${input.clanName}.`,
    "",
    "Enter Hall:",
    hallUrl,
    "",
    `Invitation status: ${CLAN_INVITE_STATUS_LABELS[input.status]}`,
  ].join("\n");
}

export function parseClanInviteStatus(
  body: string | null,
): ClanInviteStatus | null {
  if (!body) return null;
  if (/Invitation status: Pending\s*$/m.test(body)) return "pending";
  if (/Invitation status: Accepted\s*$/m.test(body)) return "accepted";
  if (/Invitation status: Declined\s*$/m.test(body)) return "declined";
  return null;
}

export function replaceClanInviteStatus(
  body: string,
  status: ClanInviteStatus,
) {
  const label = CLAN_INVITE_STATUS_LABELS[status];
  if (!/Invitation status: (Pending|Accepted|Declined)\s*$/m.test(body)) {
    return null;
  }
  return body.replace(
    /Invitation status: (Pending|Accepted|Declined)\s*$/m,
    `Invitation status: ${label}`,
  );
}

export function looksLikeClanInvite(input: {
  body: string | null;
  clanName: string;
  clanSlug: string;
  messageId: number;
}) {
  const body = input.body || "";
  return Boolean(
    body.startsWith(`🏰 ${input.clanName} invitation\n`) &&
      body.includes(
        `/clans/${encodeURIComponent(input.clanSlug)}?invite=${input.messageId}`,
      ) &&
      parseClanInviteStatus(body),
  );
}
