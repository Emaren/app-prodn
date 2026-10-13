import assert from "node:assert/strict";
import test from "node:test";
import {
  auditWarSatchelJournalReadOnly,
  type SatchelJournalAccountSnapshot,
  type SatchelJournalEventSnapshot
} from "../lib/warSatchelJournalAudit.ts";

function cleanFixture() {
  type Move = [string, bigint, bigint, bigint, bigint, bigint | null];
  const moves: Move[] = [
    ["verified_deposit", 1000n, 0n, 0n, 0n, 101n],
    ["reserve", -100n, 100n, 0n, 0n, null],
    ["commit", 0n, -100n, 100n, 0n, null],
    ["verified_refund", 100n, 0n, -100n, 0n, 102n],
    ["withdraw_hold", -50n, 0n, 0n, 50n, null],
    ["withdraw_cancelled", 50n, 0n, 0n, -50n, null],
    ["withdraw_hold", -80n, 0n, 0n, 80n, null],
    ["withdraw_confirmed", 0n, 0n, 0n, -80n, 103n],
  ];
  let a = 0n, r = 0n, c = 0n, h = 0n;
  const rows: SatchelJournalEventSnapshot[] = moves.map(([kind,da,dr,dc,dh,claim],i) => {
    a += da; r += dr; c += dc; h += dh;
    return {
      id: BigInt(i+1), accountId: 1, eventKey: `event-${i+1}`, kind,
      transferClaimId: claim,
      deltaAvailableUwolo: da, deltaReservedUwolo: dr,
      deltaCommittedUwolo: dc, deltaWithdrawalUwolo: dh,
      afterAvailableUwolo: a, afterReservedUwolo: r,
      afterCommittedUwolo: c, afterWithdrawalUwolo: h
    };
  });
  const account: SatchelJournalAccountSnapshot = {
    id: 1, userId: 25, revision: BigInt(rows.length), status: "inactive",
    availableUwolo: a, reservedUwolo: r,
    committedUwolo: c, withdrawalHeldUwolo: h
  };
  return { account, rows };
}

test("the 8-event synthetic money lifecycle reconciles without authorizing funds", () => {
  const {account,rows} = cleanFixture();
  const result=auditWarSatchelJournalReadOnly(account,rows);
  assert.equal(result.consistent,true);
  assert.equal(result.accountedLiabilityUwolo,"920");
  assert.equal(result.entries,"8");
  assert.equal(result.executionReady,false);
  assert.equal(result.creditAuthorized,false);
  assert.equal(result.custodyApproved,false);
});

test("empty zeroed account is internally consistent but not funded or active",()=>{
  const account: SatchelJournalAccountSnapshot = {
    id:1,userId:1,revision:0n,status:"inactive",
    availableUwolo:0n,reservedUwolo:0n,committedUwolo:0n,
    withdrawalHeldUwolo:0n
  };
  const proof = auditWarSatchelJournalReadOnly(account,[]);
  assert.equal(proof.accountedLiabilityUwolo,"0");
  assert.equal(proof.executionReady,false);
});

for(const name of ["account tamper","revision mismatch","cross owner row","replayed event key",
 "non-monotonic id","stale after balance","unbalanced reserve",
 "outgoing withdrawal without prior hold","absent external receipt","duplicate transfer claim",
 "unrecognized money event","missing journal row"]) {
  test("fail closed on "+name,()=>{
    const {account,rows}=cleanFixture();
    switch(name){
      case "account tamper": account.availableUwolo+=1n;break;
      case "revision mismatch": account.revision+=1n;break;
      case "cross owner row": rows[0].accountId=999;break;
      case "replayed event key": rows[1].eventKey=rows[0].eventKey;break;
      case "non-monotonic id": rows[1].id=rows[0].id;break;
      case "stale after balance": rows[3].afterAvailableUwolo+=1n;break;
      case "unbalanced reserve": rows[1].deltaReservedUwolo-=1n;break;
      case "outgoing withdrawal without prior hold": rows[7].deltaWithdrawalUwolo=-200n;break;
      case "absent external receipt": rows[0].transferClaimId=null;break;
      case "duplicate transfer claim": rows[3].transferClaimId=rows[0].transferClaimId;break;
      case "unrecognized money event": rows[1].kind="operator_bonus";break;
      case "missing journal row": rows.pop();break;
    }
    assert.throws(()=>auditWarSatchelJournalReadOnly(account,rows),/Satchel journal inconsistent/);
  });
}
