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

export function comparePublicWoloHolderIdentity(
  left: {
    classification: PublicWoloHolderClassification;
    alias: string;
    address: string;
  },
  right: {
    classification: PublicWoloHolderClassification;
    alias: string;
    address: string;
  },
) {
  const order: Record<PublicWoloHolderClassification, number> = {
    protocol: 0,
    player: 1,
    unclassified: 2,
  };
  const classificationOrder = order[left.classification] - order[right.classification];

  if (classificationOrder !== 0) return classificationOrder;

  const aliasOrder = left.alias.localeCompare(right.alias, "en", {
    sensitivity: "base",
  });

  return aliasOrder || left.address.localeCompare(right.address);
}
