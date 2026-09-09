import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function functionSlice(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("confirmed staking receipts serialize tx reuse and user balance mutation inside one transaction", async () => {
  const source = await readFile("lib/staking.ts", "utf8");
  const fn = functionSlice(
    source,
    "export async function createConfirmedStakingEvent(",
    "\nfunction startOfUtcDay(input: Date) {",
  );

  const transaction = fn.indexOf("return prisma.$transaction(async (tx) => {");
  const txLock = fn.indexOf("staking-tx:${normalizedTxHash}", transaction);
  const userLock = fn.indexOf("staking-user:${input.userId}", txLock);
  const existing = fn.indexOf("const existing = await tx.stakingEvent.findFirst({", userLock);
  const insert = fn.indexOf("const event = await tx.stakingEvent.create({", existing);
  const positionUpdate = fn.indexOf("await tx.stakingPosition.update({", insert);

  assert.ok(transaction >= 0, "staking confirmation must begin a DB transaction");
  assert.ok(txLock > transaction, "tx receipt lock must be held inside the transaction");
  assert.ok(userLock > txLock, "user balance lock must follow the receipt lock deterministically");
  assert.ok(existing > userLock, "receipt reuse lookup must occur after both locks are held");
  assert.ok(insert > existing, "event insert must occur only after locked receipt reuse check");
  assert.ok(positionUpdate > insert, "position mutation must stay in the same locked transaction");

  assert.match(
    fn,
    /await tx\.\$executeRaw`[\s\S]*pg_advisory_xact_lock\(hashtextextended\(\$\{`staking-tx:\$\{normalizedTxHash\}`\}, 0\)\)/,
  );
  assert.match(
    fn,
    /await tx\.\$executeRaw`[\s\S]*pg_advisory_xact_lock\(hashtextextended\(\$\{`staking-user:\$\{input\.userId\}`\}, 0\)\)/,
  );
  assert.doesNotMatch(
    fn,
    /await tx\.\$queryRaw`[\s\S]*pg_advisory_xact_lock/,
    "void advisory locks must never use queryRaw",
  );

  const beforeTransaction = fn.slice(0, transaction);
  assert.doesNotMatch(
    beforeTransaction,
    /prisma\.stakingEvent\.findFirst/,
    "receipt reuse must not be checked outside the serialization transaction",
  );
});

test("stake mutation remains fail-closed until separately activated", async () => {
  const execution = await readFile("lib/stakingExecution.ts", "utf8");
  const route = await readFile("app/api/staking/stake/route.ts", "utf8");

  assert.match(execution, /STAKING_STAKE_SAFETY_PAUSED\s*=\s*true/);
  assert.match(route, /if \(STAKING_STAKE_SAFETY_PAUSED\)/);
  assert.match(route, /code:\s*"STAKE_SAFETY_PAUSED"/);
});

test("August 18 incident fixture proves repeated receipt rows can materially over-credit principal", () => {
  const receipts = [
    { amountWolo: 1, creditedRows: 7 },
    { amountWolo: 17, creditedRows: 3 },
    { amountWolo: 100, creditedRows: 2 },
    { amountWolo: 400, creditedRows: 10 },
    { amountWolo: 280, creditedRows: 2 },
    { amountWolo: 1000, creditedRows: 5 },
    { amountWolo: 1000, creditedRows: 2 },
    { amountWolo: 300, creditedRows: 3 },
    { amountWolo: 400, creditedRows: 2 },
    { amountWolo: 400, creditedRows: 1 },
    { amountWolo: 400, creditedRows: 1 },
    { amountWolo: 400, creditedRows: 2 },
    { amountWolo: 400, creditedRows: 3 },
  ] as const;

  const uniqueReceiptWolo = receipts.reduce((sum, row) => sum + row.amountWolo, 0);
  const creditedEventWolo = receipts.reduce(
    (sum, row) => sum + row.amountWolo * row.creditedRows,
    0,
  );

  assert.equal(uniqueReceiptWolo, 5_098);
  assert.equal(creditedEventWolo, 16_318);
  assert.equal(creditedEventWolo - uniqueReceiptWolo, 11_220);

  // A separate real 3,400-WOLO chain deposit had no matching stake event.
  // It belongs to forensic reconciliation, not to receipt-reuse credit authority.
  const unboundChainDepositWolo = 3_400;
  assert.equal(
    creditedEventWolo - (uniqueReceiptWolo + unboundChainDepositWolo),
    7_820,
  );
});
