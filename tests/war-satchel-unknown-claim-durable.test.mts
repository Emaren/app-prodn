import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path:string) => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("unrecognized outcome cannot silently leave a reserved WOLO claim looking retryable",()=>{
  const executor=read("lib/warSatchelAutoBetExecutor.ts");
  const ledger=read("lib/warSatchelFundedLedger.ts");
  const adapter=read("lib/betAutomationFundedTransition.ts");

  assert.match(executor,/async holdUnknown\(claim, reason\)/);
  assert.match(executor,/await quarantineUnknownSatchelWager\(prisma/);
  assert.match(ledger,/export async function quarantineUnknownSatchelWager\(/);
  assert.match(ledger,/where: \{ id: reservation\.id, status: "reserved" \}/);
  assert.match(ledger,/data: \{ status: "unknown_hold", updatedAt: new Date\(\) \}/);
  assert.match(ledger,/data: \{ status: "funded_unknown_hold", reason: input\.reason \}/);
  assert.match(adapter,/await ports\.holdUnknown\(claim, "transport_or_execution_unknown"\)/);
  assert.doesNotMatch(executor,/async holdUnknown\(\)\s*\{/);
  assert.doesNotMatch(ledger,/data: \{ status: "funded_unknown_hold", reason: input\.reason, nextAttemptAt:/);
});

test("terminal accepted or released executions are NEVER changed to unknown or re-signed",()=>{
  const ledger=read("lib/warSatchelFundedLedger.ts");
  const executor=read("lib/warSatchelAutoBetExecutor.ts");
  assert.match(ledger,/reservation\.status === "committed" \|\| reservation\.status === "released"/);
  assert.match(ledger,/return "already_terminal" as const/);
  assert.match(executor,/execution\.status !== "shadow_ready"/);
  assert.match(executor,/return \{ kind: "already_handled" as const \}/);
});
