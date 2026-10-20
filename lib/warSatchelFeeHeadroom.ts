/**
 * Conservative War Satchel pending-gas arithmetic. Pure and NON-AUTHORIZING.
 * The caller must independently authenticate physical bank assets, the entire
 * owner liability ledger, ALL pending/uncertain operations and fee schedule.
 * No boolean or amount supplied to this function proves any of those facts.
 * A sufficient result NEVER grants signer, transfer or review authority.
 */
const I64 = BigInt("9223372036854775807");
const MAX_OPERATIONS = 10000;
const MAX_FEE = BigInt("1000000");
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export type SatchelFeeReservation = Readonly<{
  operationId: string;
  feeUwolo: bigint;
  status: "prepared" | "uncertain";
}>;
export type SatchelFeeHeadroomSnapshot = Readonly<{
  bankBalanceUwolo: bigint;
  totalOwnerLiabilitiesUwolo: bigint;
  pendingOperations: readonly SatchelFeeReservation[];
  newOperationFeeUwolo: bigint;
  minimumUnencumberedGasUwolo: bigint;
  pendingOperationsComplete: boolean;
}>;
export type SatchelFeeHeadroomResult = Readonly<{
  status: "BUDGET_SUFFICIENT_NONAUTHORIZING" | "INSUFFICIENT_HEADROOM" | "CENSUS_INCOMPLETE";
  spendingAuthorized: false;
  independentBankAuthenticated: false;
  independentLedgerAuthenticated: false;
  remainingAfterReservationUwolo: bigint | null;
  requiredUwolo: bigint | null;
  pendingFeeUwolo: bigint | null;
}>;
function invalid(reason: string): never {
  throw new Error("SATCHEL_FEE_HEADROOM_INVALID:" + reason);
}
function amount(value: unknown, name: string, max = I64): bigint {
  if (typeof value !== "bigint" || value < BigInt("0") || value > max) invalid(name);
  return value;
}
function add(a: bigint, b: bigint): bigint {
  if (a > I64 - b) invalid("aggregate_overflow");
  return a + b;
}
function result(
  status: SatchelFeeHeadroomResult["status"],
  requiredUwolo: bigint | null, pendingFeeUwolo: bigint | null,
  remainingAfterReservationUwolo: bigint | null,
): SatchelFeeHeadroomResult {
  return Object.freeze({
    status, requiredUwolo, pendingFeeUwolo, remainingAfterReservationUwolo,
    spendingAuthorized: false as const,
    independentBankAuthenticated: false as const,
    independentLedgerAuthenticated: false as const,
  });
}
/** Uncertain transfers retain gas liability; a timeout never frees its fee. */
export function assessSatchelFeeHeadroom(input: SatchelFeeHeadroomSnapshot): SatchelFeeHeadroomResult {
  if (!input || typeof input !== "object") invalid("missing_snapshot");
  const bank = amount(input.bankBalanceUwolo, "bank_balance");
  const liabilities = amount(input.totalOwnerLiabilitiesUwolo, "owner_liabilities");
  const nextFee = amount(input.newOperationFeeUwolo, "next_fee", MAX_FEE);
  if (nextFee === BigInt("0")) invalid("next_fee_zero");
  const cushion = amount(input.minimumUnencumberedGasUwolo, "gas_cushion");
  if (!Array.isArray(input.pendingOperations) || input.pendingOperations.length > MAX_OPERATIONS)
    invalid("pending_operations_not_bounded");
  const ids = new Set<string>();
  let pendingFees = BigInt("0");
  for (const op of input.pendingOperations) {
    if (!op || typeof op !== "object" || typeof op.operationId !== "string" ||
        !ID.test(op.operationId) || ids.has(op.operationId) ||
        (op.status !== "prepared" && op.status !== "uncertain"))
      invalid("noncanonical_or_duplicate_pending_operation");
    ids.add(op.operationId);
    const fee = amount(op.feeUwolo, "pending_fee", MAX_FEE);
    if (fee === BigInt("0")) invalid("pending_fee_zero");
    pendingFees = add(pendingFees, fee);
  }
  if (input.pendingOperationsComplete !== true)
    return result("CENSUS_INCOMPLETE", null, pendingFees, null);
  const required = add(add(add(liabilities, pendingFees), nextFee), cushion);
  return bank < required
    ? result("INSUFFICIENT_HEADROOM", required, pendingFees, null)
    : result("BUDGET_SUFFICIENT_NONAUTHORIZING", required, pendingFees, bank - required);
}
