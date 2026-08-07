export const FEATURE_REQUEST_INBOX_HEADLINE =
  "🔨 FEATURE REQUEST";
export const CLAN_ALERT_INBOX_HEADLINE =
  "🏰 CLAN ALERT";

export type FeatureRequestInboxMessage = {
  kind: "feature" | "clan_hall";
  requester: string;
  amountWolo: number;
  requestId: string;
  payment: string;
  requestText: string;
};

export function buildFeatureRequestInboxMessage({
  kind = "feature",
  requester,
  amountWolo,
  requestId,
  payment,
  requestText,
}: Omit<FeatureRequestInboxMessage, "kind"> & {
  kind?: FeatureRequestInboxMessage["kind"];
}) {
  const headline =
    kind === "clan_hall"
      ? CLAN_ALERT_INBOX_HEADLINE
      : FEATURE_REQUEST_INBOX_HEADLINE;

  return [
    headline,
    `From: ${requester}`,
    `Sponsorship: ${amountWolo} WOLO`,
    `Request ID: ${requestId}`,
    `Payment: ${payment}`,
    "---",
    requestText.trim(),
  ].join("\n");
}

function readField(lines: string[], prefix: string) {
  const line = lines.find((candidate) =>
    candidate.startsWith(prefix),
  );

  return line ? line.slice(prefix.length).trim() : "";
}

export function parseFeatureRequestInboxMessage(
  body: string | null | undefined,
): FeatureRequestInboxMessage | null {
  const text = body?.trim();

  if (!text) {
    return null;
  }

  const featurePrefix =
    `${FEATURE_REQUEST_INBOX_HEADLINE}\n`;
  const clanPrefix =
    `${CLAN_ALERT_INBOX_HEADLINE}\n`;
  const kind = text.startsWith(clanPrefix)
    ? "clan_hall"
    : text.startsWith(featurePrefix)
      ? "feature"
      : null;

  if (!kind) {
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
  const requestText = text
    .slice(separatorIndex + separator.length)
    .trim();
  const requester = readField(metadata, "From:");
  const amountText = readField(metadata, "Sponsorship:")
    .replace(/\s*WOLO$/i, "")
    .trim();
  const requestId = readField(metadata, "Request ID:");
  const payment = readField(metadata, "Payment:");
  const amountWolo = Number.parseInt(amountText, 10);

  if (
    !requester ||
    !requestId ||
    !payment ||
    !requestText ||
    !Number.isFinite(amountWolo) ||
    amountWolo <= 0
  ) {
    return null;
  }

  return {
    kind,
    requester,
    amountWolo,
    requestId,
    payment,
    requestText,
  };
}
