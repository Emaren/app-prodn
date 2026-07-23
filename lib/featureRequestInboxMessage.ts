export const FEATURE_REQUEST_INBOX_HEADLINE = "🔨 FEATURE REQUEST";

export type FeatureRequestInboxMessage = {
  requester: string;
  amountWolo: number;
  requestId: string;
  payment: string;
  requestText: string;
};

export function buildFeatureRequestInboxMessage({
  requester,
  amountWolo,
  requestId,
  payment,
  requestText,
}: FeatureRequestInboxMessage) {
  return [
    FEATURE_REQUEST_INBOX_HEADLINE,
    `From: ${requester}`,
    `Sponsorship: ${amountWolo} WOLO`,
    `Request ID: ${requestId}`,
    `Payment: ${payment}`,
    "---",
    requestText.trim(),
  ].join("\n");
}

function readField(lines: string[], prefix: string) {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

export function parseFeatureRequestInboxMessage(
  body: string | null | undefined,
): FeatureRequestInboxMessage | null {
  const text = body?.trim();

  if (!text || !text.startsWith(`${FEATURE_REQUEST_INBOX_HEADLINE}\n`)) {
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
    requester,
    amountWolo,
    requestId,
    payment,
    requestText,
  };
}
