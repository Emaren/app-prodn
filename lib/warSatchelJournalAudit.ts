/**
 * WAR SATCHEL — READ-ONLY JOURNAL RECONCILIATION (NOT FUNDING AUTHORITY).
 *
 * This verifies the internal arithmetic and ordering of a server-read
 * account/journal snapshot. It CANNOT prove the bank balance, that the
 * journal is complete relative to external claims, chain finality, UID/Keplr
 * authorization, or permission to send any WOLO. Never elevate a PASS into
 * custodyApproved, creditAuthorized, or executionReady.
 *
 * Callers must acquire an independently consistent DB snapshot and fetch
 * every journal row for one account ordered by monotonically increasing id.
 */
export type SatchelBalanceBuckets = {
  availableUwolo: bigint;
  reservedUwolo: bigint;
  committedUwolo: bigint;
  withdrawalHeldUwolo: bigint;
};

export type SatchelJournalAccountSnapshot = SatchelBalanceBuckets & {
  id: number;
  userId: number;
  revision: bigint;
  status: string;
};

export type SatchelJournalEventSnapshot = {
  id: bigint;
  accountId: number;
  eventKey: string;
  kind: string;
  transferClaimId: bigint | null;
  deltaAvailableUwolo: bigint;
  deltaReservedUwolo: bigint;
  deltaCommittedUwolo: bigint;
  deltaWithdrawalUwolo: bigint;
  afterAvailableUwolo: bigint;
  afterReservedUwolo: bigint;
  afterCommittedUwolo: bigint;
  afterWithdrawalUwolo: bigint;
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
type Movement = readonly [bigint, bigint, bigint, bigint];

function validBigInt(value: unknown, field: string): bigint {
  if (typeof value !== "bigint") throw new Error(`Invalid bigint ${field}`);
  return value;
}
function requireCondition(test: unknown, detail: string): asserts test {
  if (!test) throw new Error(`Satchel journal inconsistent: ${detail}`);
}
function positive(n: bigint) { return n > ZERO; }
function negative(n: bigint) { return n < ZERO; }
function allZero(...values: bigint[]) { return values.every(v => v === ZERO); }

function validateMovement(row: SatchelJournalEventSnapshot, d: Movement) {
  const [available, reserved, committed, held] = d;
  const hasTransferClaim = typeof row.transferClaimId === "bigint" &&
    row.transferClaimId > ZERO;
  switch (row.kind) {
    case "verified_deposit":
    case "verified_payout":
      requireCondition(hasTransferClaim && positive(available) &&
        allZero(reserved, committed, held),
        "external inbound credit must have one verified transfer claim");
      break;
    case "reserve":
      requireCondition(row.transferClaimId == null &&
        negative(available) && reserved === -available &&
        allZero(committed, held), "reservation must conserve custody funds");
      break;
    case "release":
      requireCondition(row.transferClaimId == null &&
        positive(available) && reserved === -available &&
        allZero(committed, held), "unmatched/void release must return the full reservation");
      break;
    case "commit":
      requireCondition(row.transferClaimId == null &&
        negative(reserved) && committed === -reserved &&
        allZero(available, held), "accepted commitment must move only reserved funds");
      break;
    case "verified_refund":
      requireCondition(hasTransferClaim && positive(available) &&
        committed === -available && allZero(reserved, held),
        "refund must have a verified receipt and cannot exceed the committed bucket");
      break;
    case "withdraw_hold":
      requireCondition(row.transferClaimId == null &&
        negative(available) && held === -available &&
        allZero(reserved, committed), "withdrawal hold must conserve funds");
      break;
    case "withdraw_cancelled":
      requireCondition(row.transferClaimId == null &&
        positive(available) && held === -available &&
        allZero(reserved, committed), "cancelled withdrawal must return the full hold");
      break;
    case "withdraw_confirmed":
      requireCondition(hasTransferClaim && negative(held) &&
        allZero(available, reserved, committed),
        "on-chain withdrawal must consume an authenticated hold");
      break;
    default:
      throw new Error(`Satchel journal inconsistent: unsupported movement ${row.kind}`);
  }
}

/**
 * A PASS is strictly an internal account-vs-journal arithmetic check.
 * It never constitutes asset/liability coverage or spending authority.
 */
export function auditWarSatchelJournalReadOnly(
  account: SatchelJournalAccountSnapshot,
  journal: readonly SatchelJournalEventSnapshot[]
) {
  requireCondition(Number.isSafeInteger(account?.id) && account.id > 0 &&
    Number.isSafeInteger(account.userId) && account.userId > 0,
    "invalid owner account identity");
  requireCondition(Array.isArray(journal), "journal rows are missing");

  const keys = new Set<string>();
  const claimIds = new Set<string>();
  let id = ZERO, processed = ZERO;
  let available = ZERO, reserved = ZERO, committed = ZERO, held = ZERO;

  for (const row of journal) {
    const eventId = validBigInt(row.id, "event id");
    requireCondition(eventId > id, "journal event IDs are missing order or duplicate");
    requireCondition(row.accountId === account.id, "cross-account journal row");
    requireCondition(typeof row.eventKey === "string" &&
      row.eventKey.length > 0 && row.eventKey.length <= 160 &&
      !keys.has(row.eventKey), "missing/replayed event key");
    keys.add(row.eventKey);
    id = eventId;
    processed += ONE;

    if (row.transferClaimId != null) {
      const claimId = validBigInt(row.transferClaimId, "claim id");
      requireCondition(claimId > ZERO && !claimIds.has(claimId.toString()),
        "duplicate or invalid transfer claim");
      claimIds.add(claimId.toString());
    }

    const d: Movement = [
      validBigInt(row.deltaAvailableUwolo, "available delta"),
      validBigInt(row.deltaReservedUwolo, "reserved delta"),
      validBigInt(row.deltaCommittedUwolo, "committed delta"),
      validBigInt(row.deltaWithdrawalUwolo, "withdrawal delta"),
    ];
    validateMovement(row, d);
    available += d[0]; reserved += d[1];
    committed += d[2]; held += d[3];
    requireCondition([available, reserved, committed, held].every(v => v >= ZERO),
      "journal would create an overdraft");
    requireCondition(
      available === validBigInt(row.afterAvailableUwolo, "after available") &&
      reserved === validBigInt(row.afterReservedUwolo, "after reserved") &&
      committed === validBigInt(row.afterCommittedUwolo, "after committed") &&
      held === validBigInt(row.afterWithdrawalUwolo, "after withdrawal"),
      "post-event balance does not agree with signed deltas"
    );
  }

  requireCondition(processed === validBigInt(account.revision, "account revision"),
    "account revision must equal journal event count");
  requireCondition(available === validBigInt(account.availableUwolo, "account available") &&
    reserved === validBigInt(account.reservedUwolo, "account reserved") &&
    committed === validBigInt(account.committedUwolo, "account committed") &&
    held === validBigInt(account.withdrawalHeldUwolo, "account withdrawal"),
    "account balances differ from immutable journal projection");

  return Object.freeze({
    consistent: true as const,
    accountId: account.id,
    userId: account.userId,
    entries: processed.toString(),
    accountedLiabilityUwolo: (available + reserved + committed + held).toString(),
    // Internal consistency proves neither external reserves nor signing authority.
    custodyApproved: false as const,
    creditAuthorized: false as const,
    executionReady: false as const,
  });
}
