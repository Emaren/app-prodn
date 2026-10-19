/**
 * One connected, isolated PostgreSQL accounting rehearsal using the EXISTING
 * held funded-ledger migrations, journal constraints and immutable receipts.
 * Synthetic transaction hashes are NOT Comet proofs or permission to run funds.
 * This uses SQL fixture transitions, not the production Prisma writers.
 *
 * Scenario A: 100 deposit -> 12 reserve -> verified no-send full refund -> 100 withdrawal.
 * Scenario B: 100 deposit -> 12 reserve -> attempted/committed wager ->
 *             single-ticket full 12 escrow claim return -> 100 withdrawal.
 * Both are source-authority HOLD exercises only.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";

const bin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const migrations = [
  "20261014_103500_war_satchel_noncrediting_foundation",
  "20261014_133000_war_satchel_wallet_owner_challenges",
  "20261014_150000_war_satchel_simulated_double_entry",
  "20261014_164500_war_satchel_simulation_concurrency_guard",
  "20261014_191500_war_satchel_simulation_single_owner",
  "20261017_012000_war_satchel_funded_ledger_foundation",
  "20261018_020000_war_satchel_physical_receipt_consumption",
  "20261018_040000_war_satchel_financial_authorizations",
  "20261018_041000_war_satchel_withdrawal_physical_consumption",
  "20261018_042000_war_satchel_auto_spend_mandate",
  "20261019_010000_war_satchel_wager_authority",
];
const U = BigInt(1000000);
const TOTAL = BigInt(100) * U;
const STAKE = BigInt(12) * U;
const vault = "wolo1" + "p".repeat(38);
const wallet = "wolo1" + "q".repeat(38);
const h = (letter: string) => letter.repeat(64);
const reserveId = (owner: number) => "satchel:reserve:" + owner;
const operation = (owner: number) => "satchel:ticket:" + owner;
const withdrawId = (owner: number) =>
  "00000000-0000-4000-8000-" + String(owner).padStart(12, "0");
const challengeId = (owner: number) =>
  "11111111-0000-4000-8000-" + String(owner).padStart(12, "0");
const intentId = (owner: number) =>
  "22222222-0000-4000-8000-" + String(owner).padStart(12, "0");

test("100/12/return/withdraw owner liability roundtrip in actual isolated PostgreSQL", {
  skip: process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS !== "1",
}, async t => {
  assert.ok(existsSync(path.join(bin, "initdb")), "Postgres 16 test binary needed");
  const root = mkdtempSync("/tmp/aoe2-satchel-roundtrip-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  mkdirSync(socket, {mode: 0o700});
  const clients: pg.Client[] = [];
  let started = false;
  const connect = async () => {
    const c = new pg.Client({host: socket, user: "satchel_roundtrip", database: "postgres"});
    await c.connect();
    clients.push(c);
    await c.query("SET statement_timeout='5s'");
    return c;
  };
  const transact = async (c: pg.Client, action: () => Promise<void>) => {
    await c.query("BEGIN");
    try {
      await c.query("SELECT pg_advisory_xact_lock(724176,47)");
      await action();
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    }
  };
  const journal = (c: pg.Client, owner: number, key: string, kind: string,
    amount: bigint, available: bigint, reserved: bigint, committed: bigint,
    pending: bigint, receipt: string | null = null, claim: string | null = null,
    execution: number | null = null) => c.query(
      "INSERT INTO war_satchel_funded_journal(owner_user_id,source_key,event_kind,amount_uwolo,delta_available_uwolo,delta_reserved_uwolo,delta_committed_uwolo,delta_withdrawal_pending_uwolo,receipt_id,claim_return_id,execution_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [owner, key, kind, amount.toString(), available.toString(), reserved.toString(),
        committed.toString(), pending.toString(), receipt, claim, execution],
    );
  const changeBalance = (c: pg.Client, owner: number, available: bigint,
    reserved: bigint, committed: bigint, pending: bigint) => c.query(
      "UPDATE war_satchel_funded_balances SET available_uwolo=available_uwolo+$2,reserved_uwolo=reserved_uwolo+$3,committed_uwolo=committed_uwolo+$4,withdrawal_pending_uwolo=withdrawal_pending_uwolo+$5,version=version+1 WHERE owner_user_id=$1",
      [owner, available.toString(), reserved.toString(), committed.toString(), pending.toString()],
    );
  const account = async (c: pg.Client, owner: number) => {
    const {rows} = await c.query("SELECT available_uwolo,reserved_uwolo,committed_uwolo,withdrawal_pending_uwolo FROM war_satchel_funded_balances WHERE owner_user_id=$1", [owner]);
    assert.equal(rows.length, 1);
    return [rows[0].available_uwolo, rows[0].reserved_uwolo,
      rows[0].committed_uwolo, rows[0].withdrawal_pending_uwolo].map((x: string) => BigInt(x));
  };
  const assertOwner = async (c: pg.Client, owner: number,
    a: bigint, r: bigint, committed: bigint, w: bigint) =>
    assert.deepEqual(await account(c, owner), [a, r, committed, w]);
  try {
    execFileSync(path.join(bin, "initdb"),
      ["-D", data, "-U", "satchel_roundtrip", "--auth-local=trust", "--auth-host=reject"], {stdio: "pipe"});
    execFileSync(path.join(bin, "pg_ctl"),
      ["-D", data, "-l", path.join(root, "server.log"), "-o", "-h '' -k " + socket, "-w", "start"],
      {stdio: "pipe"});
    started = true;
    const c = await connect();
    await c.query("CREATE TABLE users(id integer PRIMARY KEY); CREATE TABLE bet_auto_presets(id integer PRIMARY KEY); CREATE TABLE bet_auto_executions(id integer PRIMARY KEY); CREATE TABLE pending_wolo_claims(id integer PRIMARY KEY)");
    for (const name of migrations) {
      await c.query(readFileSync(new URL("../prisma/migrations/" + name + "/migration.sql", import.meta.url), "utf8"));
    }
    await c.query("INSERT INTO users VALUES(1),(2); INSERT INTO bet_auto_executions VALUES(1),(2); INSERT INTO pending_wolo_claims VALUES(201)");
    await c.query("INSERT INTO war_satchel_funded_balances(owner_user_id) VALUES(1),(2)");
    await t.test("real SQL receipt + immutable deposit journal credit 100 per owner", async () => {
      for (const owner of [1, 2]) {
        await transact(c, async () => {
          const id = intentId(owner);
          const tx = h(owner === 1 ? "A" : "B");
          const memo = "aoe2war/satchel/v1/player/" + "a".repeat(20) + owner;
          const nonce = "b".repeat(20) + owner;
          await c.query("INSERT INTO war_satchel_deposit_intents(id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')",
            [id, owner, wallet, vault, TOTAL.toString(), memo, nonce]);
          const proof = await c.query("INSERT INTO war_satchel_proof_candidates(intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,status,verified_at) VALUES($1,$2,'wolo-1',$3,0,$4,$5,$6,100,'uncredited',now()) RETURNING id",
            [id, owner, tx, wallet, vault, TOTAL.toString()]);
          const receipt = await c.query("INSERT INTO war_satchel_funded_receipts(owner_user_id,proof_candidate_id,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES($1,$2,'wolo-1',$3,0,$4,$5,100) RETURNING id",
            [owner, proof.rows[0].id, tx, TOTAL.toString(), vault]);
          await journal(c, owner, "satchel:deposit:" + id, "deposit_credit",
            TOTAL, TOTAL, BigInt(0), BigInt(0), BigInt(0), receipt.rows[0].id);
          await changeBalance(c, owner, TOTAL, BigInt(0), BigInt(0), BigInt(0));
        });
        await assertOwner(c, owner, TOTAL, BigInt(0), BigInt(0), BigInt(0));
      }
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions")).rows[0].count, "2");
    });

    const reserve = async (owner: number) => transact(c, async () => {
      await c.query("INSERT INTO war_satchel_funded_reservations(id,owner_user_id,execution_id,amount_uwolo,ticket_request_id) VALUES($1,$2,$3,$4,$5)",
        [reserveId(owner), owner, owner, STAKE.toString(), operation(owner)]);
      await journal(c, owner, reserveId(owner), "wager_reserve",
        STAKE, -STAKE, STAKE, BigInt(0), BigInt(0), null, null, owner);
      await changeBalance(c, owner, -STAKE, STAKE, BigInt(0), BigInt(0));
    });
    await t.test("reserve exact 12; crash before COMMIT cannot change the original balance", async () => {
      await reserve(1);
      await reserve(2);
      await assertOwner(c, 1, TOTAL - STAKE, STAKE, BigInt(0), BigInt(0));
      await assertOwner(c, 2, TOTAL - STAKE, STAKE, BigInt(0), BigInt(0));
      const crashed = await connect();
      await crashed.query("BEGIN");
      await crashed.query("UPDATE war_satchel_funded_reservations SET status='released' WHERE id=$1", [reserveId(1)]);
      await crashed.end();
      assert.equal((await c.query("SELECT status FROM war_satchel_funded_reservations WHERE id=$1", [reserveId(1)])).rows[0].status, "reserved");
      await assertOwner(c, 1, TOTAL - STAKE, STAKE, BigInt(0), BigInt(0));
    });

    await t.test("unbroadcast refund restores all 12, no 2% haircut or duplicate credit", async () => {
      await transact(c, async () => {
        await journal(c, 1, "satchel:refund:" + reserveId(1), "wager_refund",
          STAKE, STAKE, -STAKE, BigInt(0), BigInt(0), null, null, 1);
        await changeBalance(c, 1, STAKE, -STAKE, BigInt(0), BigInt(0));
        await c.query("UPDATE war_satchel_funded_reservations SET status='released' WHERE id=$1", [reserveId(1)]);
      });
      await assertOwner(c, 1, TOTAL, BigInt(0), BigInt(0), BigInt(0));
      await assert.rejects(journal(c, 1, "satchel:refund:" + reserveId(1), "wager_refund",
        STAKE, STAKE, -STAKE, BigInt(0), BigInt(0), null, null, 1), {code: "23505"});
      await assert.rejects(c.query("UPDATE war_satchel_funded_reservations SET status='unknown_hold' WHERE id=$1", [reserveId(1)]),
        /illegal funded War Satchel reservation state transition/);
    });

    await t.test("owner 2 receives only one reviewed 12-WOLO attempt and immutable broadcast", async () => {
      const rid = reserveId(2), op = operation(2);
      await transact(c, async () => {
        await c.query("INSERT INTO war_satchel_wager_authorizations(operation_id,reservation_id,owner_user_id,snapshot_json,reservation_digest,ledger_revision,consent_digest) VALUES($1,$2,2,$3,$4,$5,$6)",
          [op, rid, JSON.stringify({ownerUserId:2,executionId:2,reservationId:rid,operationId:op,amountUwolo:STAKE.toString()}),
            h("1").toLowerCase(), h("2").toLowerCase(), h("3").toLowerCase()]);
        await c.query("INSERT INTO war_satchel_wager_approvals(operation_id,approval_json) VALUES($1,$2)",
          [op, JSON.stringify({fixture_only:true})]);
        await c.query("UPDATE war_satchel_funded_reservations SET status='unknown_hold' WHERE id=$1", [rid]);
        await c.query("INSERT INTO war_satchel_wager_broadcasts(operation_id,tx_hash) VALUES($1,$2)", [op, h("C")]);
        await journal(c, 2, "satchel:commit:" + rid, "wager_commit",
          STAKE, BigInt(0), -STAKE, STAKE, BigInt(0), null, null, 2);
        await changeBalance(c, 2, BigInt(0), -STAKE, STAKE, BigInt(0));
        await c.query("UPDATE war_satchel_funded_reservations SET status='committed',ticket_id=202,tx_hash=$2 WHERE id=$1",
          [rid, h("C")]);
      });
      await assertOwner(c, 2, TOTAL - STAKE, BigInt(0), STAKE, BigInt(0));
      await assert.rejects(c.query("UPDATE war_satchel_funded_reservations SET status='released' WHERE id=$1", [rid]),
        /illegal funded War Satchel reservation state transition/);
      await assert.rejects(c.query("DELETE FROM war_satchel_wager_broadcasts WHERE operation_id=$1", [op]), /immutable/);
    });

    await t.test("physical escrow refund returns exact committed principal to original owner", async () => {
      await transact(c, async () => {
        const receipt = await c.query("INSERT INTO war_satchel_funded_claim_returns(claim_id,owner_user_id,source_market_id,claim_kind,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES(201,2,55,'bet_refund','wolo-1',$1,0,$2,$3,105) RETURNING id",
          [h("D"), STAKE.toString(), vault]);
        await journal(c, 2, "satchel:return:claim:201", "claim_return_credit",
          STAKE, STAKE, BigInt(0), BigInt(0), BigInt(0), null, receipt.rows[0].id);
        await changeBalance(c, 2, STAKE, BigInt(0), BigInt(0), BigInt(0));
      });
      await assertOwner(c, 2, TOTAL, BigInt(0), STAKE, BigInt(0));
      await assert.rejects(c.query("INSERT INTO war_satchel_funded_claim_returns(claim_id,owner_user_id,source_market_id,claim_kind,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES(201,1,55,'bet_refund','wolo-1',$1,0,$2,$3,105)",
        [h("D"), STAKE.toString(), vault]), {code:"23505"});
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions")).rows[0].count, "3");
    });

    await t.test("both owners reserve, fence and finalize exact 100-WOLO withdrawal", async () => {
      for (const owner of [1,2]) {
        const wid = withdrawId(owner), chid = challengeId(owner);
        await transact(c, async () => {
          await c.query("INSERT INTO war_satchel_funded_withdrawal_challenges(id,owner_user_id,owner_uid,wallet_address,amount_uwolo,issued_at,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,now()-interval '1 minute',now()+interval '2 minutes',now())",
            [chid, owner, "owner-" + owner, wallet, TOTAL.toString()]);
          await c.query("INSERT INTO war_satchel_funded_withdrawals(id,owner_user_id,owner_wallet_address,amount_uwolo,authorizing_challenge_id) VALUES($1,$2,$3,$4,$5)",
            [wid, owner, wallet, TOTAL.toString(), chid]);
          await journal(c, owner, "satchel:withdraw:reserve:" + wid, "withdraw_reserve",
            TOTAL, -TOTAL, BigInt(0), BigInt(0), TOTAL);
          await changeBalance(c, owner, -TOTAL, BigInt(0), BigInt(0), TOTAL);
        });
        await assertOwner(c, owner, BigInt(0), BigInt(0),
          owner === 2 ? STAKE : BigInt(0), TOTAL);
        await transact(c, async () => {
          await c.query("UPDATE war_satchel_funded_withdrawals SET status='unknown_hold' WHERE id=$1", [wid]);
          await c.query("INSERT INTO war_satchel_withdrawal_authorizations(withdrawal_id,owner_user_id,owner_uid,wallet_address,vault_address,amount_uwolo,challenge_id,owner_mandate_json,owner_mandate_digest,reservation_digest,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [wid, owner, "owner-" + owner, wallet, vault, TOTAL.toString(), chid,
              JSON.stringify({fixture_only:true}), h(owner === 1 ? "1" : "4").toLowerCase(),
              h(owner === 1 ? "2" : "5").toLowerCase(),
              "aoe2war/satchel/withdraw/v1/" + wid]);
          await c.query("INSERT INTO war_satchel_withdrawal_approvals(withdrawal_id,approval_json,approval_digest) VALUES($1,$2,$3)",
            [wid, JSON.stringify({fixture_only:true}), h("3").toLowerCase()]);
          await c.query("INSERT INTO war_satchel_withdrawal_attempts(operation_id,withdrawal_id,request_json,request_digest) VALUES($1,$2,$3,$4)",
            ["satchel:withdrawal:" + wid, wid, JSON.stringify({fixture_only:true}), h("6").toLowerCase()]);
        });
        const tx = h(owner === 1 ? "E" : "F");
        await transact(c, async () => {
          await c.query("INSERT INTO war_satchel_withdrawal_physical_consumptions(chain_id,tx_hash,withdrawal_id,owner_user_id,amount_uwolo,vault_address) VALUES('wolo-1',$1,$2,$3,$4,$5)",
            [tx, wid, owner, TOTAL.toString(), vault]);
          await c.query("UPDATE war_satchel_funded_withdrawals SET status='sent',tx_hash=$2,confirmed_height=120 WHERE id=$1", [wid, tx]);
          await journal(c, owner, "satchel:withdraw:sent:" + wid, "withdraw_sent",
            TOTAL, BigInt(0), BigInt(0), BigInt(0), -TOTAL);
          await changeBalance(c, owner, BigInt(0), BigInt(0), BigInt(0), -TOTAL);
        });
        await assertOwner(c, owner, BigInt(0), BigInt(0),
          owner === 2 ? STAKE : BigInt(0), BigInt(0));
        await assert.rejects(c.query("UPDATE war_satchel_funded_withdrawals SET status='cancelled' WHERE id=$1", [wid]),
          /illegal funded Satchel withdrawal transition/);
      }
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_withdrawal_physical_consumptions")).rows[0].count, "2");
      const sums = (await c.query("SELECT sum(available_uwolo+reserved_uwolo+withdrawal_pending_uwolo) AS outstanding,sum(committed_uwolo) AS historical FROM war_satchel_funded_balances")).rows[0];
      assert.equal(BigInt(sums.outstanding), BigInt(0), "all vault liabilities paid out");
      assert.equal(BigInt(sums.historical), STAKE, "settled escrow remains historical, not bank debt");
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_funded_journal")).rows[0].count, "11");
    });
  } finally {
    for (const c of clients) try { await c.end(); } catch {}
    if (started) execFileSync(path.join(bin, "pg_ctl"),
      ["-D", data, "-m", "immediate", "-w", "stop"], {stdio: "pipe"});
    rmSync(root, {recursive: true, force: true});
  }
});
