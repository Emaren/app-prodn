export type PublicWoloHolderClassification =
  | "protocol"
  | "player"
  | "unclassified";

export function classifyPublicWoloHolder(input: {
  isKnownUser: boolean;
  isInfrastructure: boolean;
}): PublicWoloHolderClassification {
  if (input.isKnownUser) return "player";
  if (input.isInfrastructure) return "protocol";
  return "unclassified";
}

export function projectPublicWoloHolderBalance(input: {
  classification: PublicWoloHolderClassification;
  balanceWolo: string;
  balanceWoloFormatted: string;
}) {
  if (input.classification !== "protocol") {
    return {
      balanceWolo: null,
      balanceWoloFormatted: null,
      exactBalanceWolo: null,
      balanceHidden: true,
    } as const;
  }

  return {
    balanceWolo: input.balanceWolo,
    balanceWoloFormatted: input.balanceWoloFormatted,
    exactBalanceWolo: input.balanceWoloFormatted,
    balanceHidden: false,
  } as const;
}

export function comparePublicWoloHolderBalance(
  left: { amountUwolo: string; address: string },
  right: { amountUwolo: string; address: string },
) {
  const normalize = (value: string) => value.replace(/^0+(?=\d)/, "");
  const leftAmount = normalize(left.amountUwolo);
  const rightAmount = normalize(right.amountUwolo);
  const magnitudeOrder = rightAmount.length - leftAmount.length;

  if (magnitudeOrder !== 0) return magnitudeOrder;

  const amountOrder = rightAmount.localeCompare(leftAmount);
  return amountOrder || left.address.localeCompare(right.address);
}
