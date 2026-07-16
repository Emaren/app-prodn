import type { PrismaClient } from "@/lib/generated/prisma";

const BOUNTY_CLAIM_KINDS = [
  "winner_bounty",
  "founders_bonus",
  "founders_win",
] as const;

export async function loadBountyBoard(prisma: PrismaClient) {
  const [opportunities, events, claims, trophyPayouts, indexedTransfers] = await Promise.all([
    prisma.bountyOpportunity.findMany({
      orderBy: [{ featured: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
      include: {
        events: {
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 5,
        },
      },
    }),
    prisma.bountyEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 120,
      include: { opportunity: { select: { slug: true, title: true } } },
    }),
    prisma.pendingWoloClaim.findMany({
      where: { claimKind: { in: [...BOUNTY_CLAIM_KINDS] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 160,
      select: {
        id: true,
        displayPlayerName: true,
        amountWolo: true,
        claimKind: true,
        status: true,
        payoutTxHash: true,
        errorState: true,
        note: true,
        createdAt: true,
        claimedAt: true,
        rescindedAt: true,
      },
    }),
    prisma.trophyPayout.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 120,
      select: {
        id: true,
        recipientDisplayName: true,
        amountWolo: true,
        payoutKind: true,
        status: true,
        paidAt: true,
        txHash: true,
        errorState: true,
        createdAt: true,
        trophy: { select: { trophyId: true, displayName: true } },
      },
    }),
    prisma.woloIndexedTransfer.findMany({
      where: {
        memo: { not: null },
        OR: [
          { memo: { contains: "bounty", mode: "insensitive" } },
          { memo: { contains: "reward", mode: "insensitive" } },
          { memo: { contains: "trophy", mode: "insensitive" } },
          { memo: { contains: "belt", mode: "insensitive" } },
          { memo: { contains: "artifact", mode: "insensitive" } },
        ],
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 250,
      select: {
        id: true,
        txHash: true,
        transferIndex: true,
        timestamp: true,
        amountWoloDisplay: true,
        memo: true,
        eventType: true,
        source: true,
      },
    }),
  ]);

  const serializedOpportunities = opportunities.map((opportunity) => ({
    ...opportunity,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString(),
    events: opportunity.events.map((event) => ({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    })),
  }));
  const ledger = [
    ...events.map((event) => ({
      key: `event:${event.id}`,
      source: "AoE2WAR bounty ledger",
      status: event.eventType,
      actor: event.actorDisplayName,
      amountWolo: event.amountWolo,
      memo: event.memo,
      txHash: event.txHash,
      occurredAt: event.occurredAt.toISOString(),
      opportunity: event.opportunity,
      errorState: null as string | null,
    })),
    ...claims.map((claim) => ({
      key: `claim:${claim.id}`,
      source: "WOLO claim rail",
      status: claim.rescindedAt
        ? "rescinded"
        : claim.payoutTxHash
          ? "paid"
          : claim.status === "pending"
            ? "locked"
            : claim.status,
      actor: claim.displayPlayerName,
      amountWolo: claim.amountWolo,
      memo: claim.note || `${claim.claimKind.replace(/_/g, " ")} · ${claim.displayPlayerName}`,
      txHash: claim.payoutTxHash,
      occurredAt: (claim.claimedAt || claim.createdAt).toISOString(),
      opportunity: null,
      errorState: claim.errorState,
    })),
    ...trophyPayouts.map((payout) => ({
      key: `trophy:${payout.id}`,
      source: "Championship payout rail",
      status: payout.txHash || payout.paidAt ? "paid" : payout.status === "pending" ? "locked" : payout.status,
      actor: payout.recipientDisplayName,
      amountWolo: payout.amountWolo,
      memo: `${payout.payoutKind.replace(/_/g, " ")} · ${payout.trophy.displayName}`,
      txHash: payout.txHash,
      occurredAt: (payout.paidAt || payout.createdAt).toISOString(),
      opportunity: { slug: payout.trophy.trophyId, title: payout.trophy.displayName },
      errorState: payout.errorState,
    })),
    ...indexedTransfers.map((transfer) => ({
      key: `chain:${transfer.id}:${transfer.transferIndex}`,
      source: transfer.source,
      status: "paid",
      actor: null,
      amountWolo: Number(transfer.amountWoloDisplay),
      memo: transfer.memo || "WOLO transfer",
      txHash: transfer.txHash,
      occurredAt: transfer.timestamp.toISOString(),
      opportunity: null,
      errorState: null as string | null,
    })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const uniqueLedger = Array.from(
    new Map(
      ledger.map((entry) => [
        entry.txHash ? `tx:${entry.txHash}:${entry.amountWolo}:${entry.memo}` : entry.key,
        entry,
      ])
    ).values()
  ).slice(0, 300);

  return {
    generatedAt: new Date().toISOString(),
    opportunities: serializedOpportunities,
    ledger: uniqueLedger,
    totals: {
      available: serializedOpportunities.filter((item) => item.status === "available").length,
      inProgress: serializedOpportunities.filter((item) => item.status === "in_progress").length,
      locked: uniqueLedger.filter((item) => item.status === "locked").length,
      paid: uniqueLedger.filter((item) => item.status === "paid").length,
      paidWolo: uniqueLedger
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + (item.amountWolo || 0), 0),
    },
  };
}

export type BountyBoardSnapshot = Awaited<ReturnType<typeof loadBountyBoard>>;

export function bountyAdvisorGrounding(snapshot: BountyBoardSnapshot) {
  const opportunities = snapshot.opportunities.slice(0, 40).map((item) =>
    [
      `${item.title} [${item.status}]`,
      item.rewardWolo === null ? "reward amount not published" : `${item.rewardWolo} WOLO`,
      `eligibility: ${item.eligibility || "operator-defined"}`,
      `verification: ${item.verification || "operator verification required"}`,
      `action: ${item.actionHref}`,
    ].join(" · ")
  );
  const ledger = snapshot.ledger.slice(0, 35).map((entry) =>
    `${entry.occurredAt} · ${entry.status} · ${entry.actor || "recipient not labeled"} · ${entry.amountWolo ?? "amount not recorded"} WOLO · memo: ${entry.memo} · tx: ${entry.txHash || "none"}`
  );
  return [
    "Bounty Board snapshot. This is the only bounty status grounding for this reply.",
    "Never turn an available opportunity into a promised payment. Only a payout tx hash/indexed transfer proves chain payment.",
    "Opportunities:",
    ...opportunities,
    "Recent authoritative ledger rows:",
    ...ledger,
  ].join("\n");
}
