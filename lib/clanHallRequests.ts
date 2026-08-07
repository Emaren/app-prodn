export const CLAN_HALL_REQUEST_MARKER =
  "🏰 CLAN HALL PURCHASE";

export type ClanHallRequestDetails = {
  clanName: string;
  desiredSlug: string;
  foundingMessage: string;
};

function cleanLine(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function slugifyClanHallName(value: unknown) {
  return cleanLine(value, 120)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeClanHallName(value: unknown) {
  const name = cleanLine(value, 120);
  return name.length >= 2 ? name : null;
}

export function normalizeClanFoundingMessage(value: unknown) {
  const message = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, 2_000);

  return message || "We are ready to raise our banner.";
}

export function buildClanHallRequestText({
  clanName,
  desiredSlug,
  foundingMessage,
}: ClanHallRequestDetails) {
  return [
    CLAN_HALL_REQUEST_MARKER,
    `Clan: ${clanName}`,
    `Requested slug: ${desiredSlug}`,
    "---",
    foundingMessage.trim(),
  ].join("\n");
}

function readField(lines: string[], prefix: string) {
  const line = lines.find((candidate) =>
    candidate.startsWith(prefix),
  );
  return line ? line.slice(prefix.length).trim() : "";
}

export function parseClanHallRequestText(
  value: string | null | undefined,
): ClanHallRequestDetails | null {
  const text = value?.trim();

  if (
    !text ||
    !text.startsWith(`${CLAN_HALL_REQUEST_MARKER}\n`)
  ) {
    return null;
  }

  const separator = "\n---\n";
  const separatorIndex = text.indexOf(separator);

  if (separatorIndex < 0) {
    return null;
  }

  const metadata = text
    .slice(0, separatorIndex)
    .split(/\r?\n/)
    .map((line) => line.trim());
  const clanName = readField(metadata, "Clan:");
  const desiredSlug = slugifyClanHallName(
    readField(metadata, "Requested slug:"),
  );
  const foundingMessage = text
    .slice(separatorIndex + separator.length)
    .trim();

  if (!clanName || !desiredSlug || !foundingMessage) {
    return null;
  }

  return {
    clanName,
    desiredSlug,
    foundingMessage,
  };
}

export function buildClanAlertBody(
  details: ClanHallRequestDetails,
) {
  return [
    `Clan: ${details.clanName}`,
    `Requested hall: /clans/${details.desiredSlug}`,
    "",
    details.foundingMessage,
  ].join("\n");
}
