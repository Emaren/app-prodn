export const LEGACY_SYNTHETIC_COMPOUND_EXPECTED = Object.freeze({
  rows: 109,
  wolo: 92_285,
  byUser: Object.freeze({
    63: Object.freeze({ rows: 3, wolo: 4 }),
    65: Object.freeze({ rows: 45, wolo: 23_619 }),
    18168: Object.freeze({ rows: 61, wolo: 68_662 }),
  }),
});

export const LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION =
  `RECONCILE-LEGACY-SYNTHETIC-COMPOUNDS-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows}-${LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo}`;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function groupLegacy(events) {
  const grouped = new Map();
  for (const event of events) {
    const userId = number(event.user_id);
    const current = grouped.get(userId) || { rows: 0, wolo: 0 };
    current.rows += 1;
    current.wolo += number(event.amount_wolo);
    grouped.set(userId, current);
  }
  return grouped;
}

export function inspectLegacySyntheticCompoundSnapshot(snapshot, mode = "before") {
  if (!["before", "after"].includes(mode)) {
    throw new Error(`Unsupported reconciliation inspection mode: ${mode}`);
  }
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const allocations = Array.isArray(snapshot.allocations) ? snapshot.allocations : [];
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  const chainBacked = Array.isArray(snapshot.chainBackedEvents)
    ? snapshot.chainBackedEvents
    : [];
  const unexpectedCompoundEvents = Array.isArray(snapshot.unexpectedCompoundEvents)
    ? snapshot.unexpectedCompoundEvents
    : [];
  const unmappedCompoundedAllocations = Array.isArray(snapshot.unmappedCompoundedAllocations)
    ? snapshot.unmappedCompoundedAllocations
    : [];

  const allocationById = new Map(
    allocations.map((row) => [number(row.id), row]),
  );
  const legacyByUser = groupLegacy(events);
  const chainBackedByUser = groupLegacy(chainBacked);
  const eventWolo = events.reduce((sum, row) => sum + number(row.amount_wolo), 0);
  const allocationWolo = allocations.reduce(
    (sum, row) => sum + number(row.reward_wolo),
    0,
  );
  const linkedAllocationIds = [];
  const pairMismatches = [];

  for (const event of events) {
    const metadata = metadataObject(event.metadata);
    const allocationId = number(metadata.stakingRewardAllocationId);
    const distributionId = number(metadata.stakingRewardDistributionId);
    const allocation = allocationById.get(allocationId);
    linkedAllocationIds.push(allocationId);
    if (
      !allocation ||
      number(allocation.user_id) !== number(event.user_id) ||
      number(allocation.reward_wolo) !== number(event.amount_wolo) ||
      number(allocation.distribution_id) !== distributionId
    ) {
      pairMismatches.push({ eventId: number(event.id), allocationId });
    }
  }

  const expectedUsers = Object.entries(LEGACY_SYNTHETIC_COMPOUND_EXPECTED.byUser);
  const userCohortExact =
    legacyByUser.size === expectedUsers.length &&
    expectedUsers.every(([userIdText, expected]) => {
      const actual = legacyByUser.get(Number(userIdText));
      return actual?.rows === expected.rows && actual?.wolo === expected.wolo;
    });

  const expectedAllocationStatus =
    mode === "before" ? "COMPOUNDED" : "COMPOUND_PENDING";
  const positionByUser = new Map(
    positions.map((row) => [number(row.user_id), row]),
  );
  const positionAccountingExact = expectedUsers.every(([userIdText, expected]) => {
    const userId = Number(userIdText);
    const position = positionByUser.get(userId);
    if (!position) return false;
    const chainBackedWolo = chainBackedByUser.get(userId)?.wolo || 0;
    const expectedCompounded =
      mode === "before" ? chainBackedWolo + expected.wolo : chainBackedWolo;
    return number(position.compounded_rewards_wolo) === expectedCompounded;
  });

  const checks = {
    exactLegacyEventCount:
      events.length === LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows,
    exactLegacyEventWolo:
      eventWolo === LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo,
    exactLinkedAllocationCount:
      allocations.length === LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows,
    exactLinkedAllocationWolo:
      allocationWolo === LEGACY_SYNTHETIC_COMPOUND_EXPECTED.wolo,
    uniqueAllocationLinks:
      linkedAllocationIds.length === new Set(linkedAllocationIds).size &&
      linkedAllocationIds.every((id) => id > 0),
    pairIdentityExact: pairMismatches.length === 0,
    legacyEventProvenanceExact: events.every((event) => {
      const metadata = metadataObject(event.metadata);
      return (
        event.type === "COMPOUND" &&
        event.status === "CONFIRMED" &&
        /^COMPOUND-\d+-\d+$/i.test(String(event.tx_hash || "")) &&
        metadata.internalCompound === true &&
        metadata.chainBackedCompound !== true
      );
    }),
    allocationStateExact: allocations.every(
      (allocation) => allocation.status === expectedAllocationStatus,
    ),
    userCohortExact,
    positionAccountingExact,
    chainBackedEventIdentityExact: chainBacked.every(
      (event) =>
        event.type === "COMPOUND" &&
        event.status === "CONFIRMED" &&
        metadataObject(event.metadata).chainBackedCompound === true &&
        /^[A-F0-9]{64}$/i.test(String(event.tx_hash || "")),
    ),
    noUnexpectedConfirmedCompoundEvents: unexpectedCompoundEvents.length === 0,
    noUnmappedCompoundedAllocations: unmappedCompoundedAllocations.length === 0,
  };

  return {
    mode,
    expected: LEGACY_SYNTHETIC_COMPOUND_EXPECTED,
    checks,
    ok: Object.values(checks).every(Boolean),
    totals: {
      legacyEvents: events.length,
      legacyWolo: eventWolo,
      linkedAllocations: allocations.length,
      linkedAllocationWolo: allocationWolo,
      chainBackedEvents: chainBacked.length,
      chainBackedWolo: chainBacked.reduce(
        (sum, row) => sum + number(row.amount_wolo),
        0,
      ),
      unexpectedCompoundEvents: unexpectedCompoundEvents.length,
      unmappedCompoundedAllocations: unmappedCompoundedAllocations.length,
    },
    pairMismatches,
  };
}
