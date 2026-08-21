export const MARKETPLACE_INQUIRY_HEADLINE = "🏪 MARKETPLACE PURCHASE REQUEST";
export const MARKETPLACE_INVOICE_HEADLINE = "🧾 MARKETPLACE INVOICE";
export const MARKETPLACE_INVOICE_PAID_HEADLINE = "✅ MARKETPLACE INVOICE PAID";
export const MARKETPLACE_DEVELOPMENT_HEADLINE = "🛠️ MARKETPLACE DEVELOPMENT REQUEST";
export const MARKETPLACE_APPROVAL_HEADLINE = "🏛️ MARKETPLACE CHARTER APPROVED";

export type MarketplaceInboxMessage = {
  kind: "inquiry" | "invoice" | "invoice_paid" | "development" | "approval";
  shop: string;
  shopSlug?: string | null;
  proposalEventId?: number | null;
  actor: string;
  amountWolo: number;
  recordId: string;
  payment: string;
  requestText: string;
  profileHref?: string | null;
};

function headlineForKind(kind: MarketplaceInboxMessage["kind"]) {
  switch (kind) {
    case "inquiry":
      return MARKETPLACE_INQUIRY_HEADLINE;
    case "invoice":
      return MARKETPLACE_INVOICE_HEADLINE;
    case "invoice_paid":
      return MARKETPLACE_INVOICE_PAID_HEADLINE;
    case "development":
      return MARKETPLACE_DEVELOPMENT_HEADLINE;
    case "approval":
      return MARKETPLACE_APPROVAL_HEADLINE;
  }
}

function recordLabelForKind(kind: MarketplaceInboxMessage["kind"]) {
  if (kind === "invoice" || kind === "invoice_paid") return "Invoice ID:";
  if (kind === "approval") return "Charter ID:";
  return "Request ID:";
}

export function buildMarketplaceInboxMessage(input: MarketplaceInboxMessage) {
  return [
    headlineForKind(input.kind),
    `Shop: ${input.shop}`,
    ...(input.shopSlug ? [`Shop Slug: ${input.shopSlug}`] : []),
    ...(input.proposalEventId
      ? [`Proposal Event: ${input.proposalEventId}`]
      : []),
    `From: ${input.actor}`,
    `Amount: ${input.amountWolo} WOLO`,
    `${recordLabelForKind(input.kind)} ${input.recordId}`,
    `Payment: ${input.payment}`,
    ...(input.profileHref ? [`Profile: ${input.profileHref}`] : []),
    "---",
    input.requestText.trim(),
  ].join("\n");
}

function readField(lines: string[], prefix: string) {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

export function parseMarketplaceInboxMessage(
  body: string | null | undefined
): MarketplaceInboxMessage | null {
  const text = body?.trim();
  if (!text) return null;

  const candidates: Array<{
    prefix: string;
    kind: MarketplaceInboxMessage["kind"];
  }> = [
    { prefix: `${MARKETPLACE_INQUIRY_HEADLINE}\n`, kind: "inquiry" },
    { prefix: `${MARKETPLACE_INVOICE_HEADLINE}\n`, kind: "invoice" },
    { prefix: `${MARKETPLACE_INVOICE_PAID_HEADLINE}\n`, kind: "invoice_paid" },
    { prefix: `${MARKETPLACE_DEVELOPMENT_HEADLINE}\n`, kind: "development" },
    { prefix: `${MARKETPLACE_APPROVAL_HEADLINE}\n`, kind: "approval" },
  ];

  const matched = candidates.find((candidate) => text.startsWith(candidate.prefix));
  if (!matched) return null;

  const separator = "\n---\n";
  const separatorIndex = text.indexOf(separator);
  if (separatorIndex < 0) return null;

  const metadata = text
    .slice(0, separatorIndex)
    .split(/\r?\n/)
    .map((line) => line.trim());
  const requestText = text.slice(separatorIndex + separator.length).trim();

  const shop = readField(metadata, "Shop:");
  const shopSlug = readField(metadata, "Shop Slug:") || null;
  const proposalEventRaw =
    readField(metadata, "Proposal Event:");
  const proposalEventId =
    proposalEventRaw &&
    Number.isInteger(Number(proposalEventRaw))
      ? Number(proposalEventRaw)
      : null;
  const actor = readField(metadata, "From:");
  const amountText = readField(metadata, "Amount:")
    .replace(/\s*WOLO$/i, "")
    .trim();
  const recordId = readField(
    metadata,
    matched.kind === "invoice" || matched.kind === "invoice_paid"
      ? "Invoice ID:"
      : matched.kind === "approval"
        ? "Charter ID:"
        : "Request ID:"
  );
  const payment = readField(metadata, "Payment:");
  const profileHref = readField(metadata, "Profile:") || null;
  const amountWolo = Number.parseInt(amountText, 10);

  if (
    !shop ||
    !actor ||
    !recordId ||
    !payment ||
    !requestText ||
    !Number.isFinite(amountWolo) ||
    (matched.kind === "approval" ? amountWolo < 0 : amountWolo <= 0)
  ) {
    return null;
  }

  return {
    kind: matched.kind,
    shop,
    shopSlug,
    proposalEventId,
    actor,
    amountWolo,
    recordId,
    payment,
    requestText,
    profileHref,
  };
}
