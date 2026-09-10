import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION,
  LEGACY_SYNTHETIC_COMPOUND_EXPECTED,
  inspectLegacySyntheticCompoundSnapshot,
} from "./lib/legacy-synthetic-staking-compounds.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(key.slice(2), next && !next.startsWith("--") ? next : "true");
  if (next && !next.startsWith("--")) index += 1;
}

const apply = args.get("apply") === "true";
const verify = args.get("verify") === "true";
if (apply && verify) throw new Error("Choose one of --apply or --verify.");
if (apply && args.get("confirm") !== LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION) {
  throw new Error(
    `Apply requires --confirm ${LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION}`,
  );
}

const databaseUrl = String(process.env.DATABASE_URL || "").replace(
  "postgresql+asyncpg://",
  "postgresql://",
);
if (!databaseUrl.startsWith("postgresql://")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandText(command, commandArgs) {
  return execFileSync(command, commandArgs, { encoding: "utf8" }).trim();
}

function assertApplyEnvironment() {
  const branch = commandText("git", ["branch", "--show-current"]);
  const head = commandText("git", ["rev-parse", "HEAD"]);
  const upstream = commandText("git", ["rev-parse", "origin/main"]);
  const dirty = commandText("git", [
    "--no-optional-locks", "status", "--porcelain", "--untracked-files=all",
  ]);
  if (branch !== "main" || head !== upstream || dirty) {
    throw new Error(
      `Apply requires clean main exactly matching origin/main; branch=${branch} head=${head} origin=${upstream} dirty=${Boolean(dirty)}`,
    );
  }

  const safetySource = fs.readFileSync(
    path.join(process.cwd(), "lib", "stakingExecution.ts"), "utf8",
  );
  for (const constant of [
    "STAKING_STAKE_SAFETY_PAUSED",
    "STAKING_UNSTAKE_SAFETY_PAUSED",
    "STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED",
  ]) {
    const pattern = new RegExp(`export const ${constant}\\s*=\\s*true;`);
    if (!pattern.test(safetySource)) {
      throw new Error(`Apply requires ${constant}=true in the running source contract.`);
    }
  }

  const timer = "aoe2hdbets-staking-rewards.timer";
  const enabled = spawnSync("systemctl", ["is-enabled", timer], { encoding: "utf8" });
  const active = spawnSync("systemctl", ["is-active", timer], { encoding: "utf8" });
  if ((enabled.stdout || "").trim() !== "disabled") {
    throw new Error(`Apply requires ${timer} to be disabled.`);
  }
  if ((active.stdout || "").trim() === "active") {
    throw new Error(`Apply requires ${timer} to be inactive.`);
  }
  return { branch, head, upstream, timer, timerEnabled: "disabled", timerActive: false };
}

const applyEnvironment = apply ? assertApplyEnvironment() : null;

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();

async function loadSnapshot(client) {
  const events = await client.query(`
    select id,user_id,type,amount_wolo,tx_hash,status,metadata,confirmed_at
    from staking_events
    where type='COMPOUND'
      and status='CONFIRMED'
      and tx_hash ~* '^COMPOUND-[0-9]+-[0-9]+$'
      and coalesce(metadata->>'internalCompound','false')='true'
      and coalesce(metadata->>'chainBackedCompound','false')<>'true'
    order by id
  `);
  const allocationIds = events.rows.map(
    (row) => Number(row.metadata?.stakingRewardAllocationId || 0),
  );
  const allocations = allocationIds.length
    ? await client.query(
        `select id,user_id,distribution_id,reward_wolo,status,credited_at,claimed_at
           from staking_reward_allocations
          where id = any($1::int[])
          order by id`,
        [allocationIds],
      )
    : { rows: [] };
  const positions = await client.query(`
    select user_id,current_staked_wolo,compounded_rewards_wolo,
           pending_rewards_wolo,lifetime_rewards_wolo,claimed_rewards_wolo,status
      from staking_positions
     where user_id = any($1::int[])
     order by user_id
  `, [Object.keys(LEGACY_SYNTHETIC_COMPOUND_EXPECTED.byUser).map(Number)]);
  const chainBackedEvents = await client.query(`
    select id,user_id,type,amount_wolo,tx_hash,status,metadata,confirmed_at
      from staking_events
     where type='COMPOUND'
       and status='CONFIRMED'
       and coalesce(metadata->>'chainBackedCompound','false')='true'
     order by id
  `);
  const unexpectedCompoundEvents = await client.query(`
    select id,user_id,type,amount_wolo,tx_hash,status,metadata,confirmed_at
      from staking_events
     where type='COMPOUND'
       and status='CONFIRMED'
       and not (
         (coalesce(metadata->>'chainBackedCompound','false')='true'
          and tx_hash ~* '^[A-F0-9]{64}$')
         or
         (coalesce(metadata->>'internalCompound','false')='true'
          and coalesce(metadata->>'chainBackedCompound','false')<>'true'
          and tx_hash ~* '^COMPOUND-[0-9]+-[0-9]+$')
       )
     order by id
  `);
  const unmappedCompoundedAllocations = await client.query(`
    select a.id,a.user_id,a.distribution_id,a.reward_wolo,a.status
      from staking_reward_allocations a
     where a.status='COMPOUNDED'
       and not exists (
         select 1
           from staking_events e
          where e.type='COMPOUND'
            and e.status='CONFIRMED'
            and (e.metadata->>'stakingRewardAllocationId') ~ '^[0-9]+$'
            and (e.metadata->>'stakingRewardAllocationId')::int=a.id
            and (
              (coalesce(e.metadata->>'chainBackedCompound','false')='true'
               and e.tx_hash ~* '^[A-F0-9]{64}$')
              or
              (coalesce(e.metadata->>'internalCompound','false')='true'
               and coalesce(e.metadata->>'chainBackedCompound','false')<>'true'
               and e.tx_hash ~* '^COMPOUND-[0-9]+-[0-9]+$')
            )
       )
     order by a.id
  `);
  return {
    events: events.rows,
    allocations: allocations.rows,
    positions: positions.rows,
    chainBackedEvents: chainBackedEvents.rows,
    unexpectedCompoundEvents: unexpectedCompoundEvents.rows,
    unmappedCompoundedAllocations: unmappedCompoundedAllocations.rows,
  };
}

function safeSnapshotForReport(snapshot) {
  return {
    events: snapshot.events.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      amountWolo: Number(row.amount_wolo),
      txHash: row.tx_hash,
      allocationId: Number(row.metadata?.stakingRewardAllocationId || 0),
      distributionId: Number(row.metadata?.stakingRewardDistributionId || 0),
    })),
    allocations: snapshot.allocations.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      distributionId: Number(row.distribution_id),
      rewardWolo: Number(row.reward_wolo),
      status: row.status,
    })),
    positions: snapshot.positions.map((row) => ({
      userId: Number(row.user_id),
      currentStakedWolo: Number(row.current_staked_wolo),
      compoundedRewardsWolo: Number(row.compounded_rewards_wolo),
      pendingRewardsWolo: Number(row.pending_rewards_wolo),
      lifetimeRewardsWolo: Number(row.lifetime_rewards_wolo),
      claimedRewardsWolo: Number(row.claimed_rewards_wolo),
      status: row.status,
    })),
    chainBackedEvents: snapshot.chainBackedEvents.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      amountWolo: Number(row.amount_wolo),
      txHash: row.tx_hash,
    })),
    unexpectedCompoundEvents: snapshot.unexpectedCompoundEvents.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      amountWolo: Number(row.amount_wolo),
      txHash: row.tx_hash,
    })),
    unmappedCompoundedAllocations: snapshot.unmappedCompoundedAllocations.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      distributionId: Number(row.distribution_id),
      rewardWolo: Number(row.reward_wolo),
      status: row.status,
    })),
  };
}

function report(mode, snapshot, inspection) {
  return {
    schema: 1,
    kind: "aoe2war-staking-legacy-synthetic-compound-reconciliation",
    mode,
    checkedAt: new Date().toISOString(),
    confirmation: LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION,
    expected: LEGACY_SYNTHETIC_COMPOUND_EXPECTED,
    inspection,
    snapshot: safeSnapshotForReport(snapshot),
    applyEnvironment,
    invariants: {
      userRewardEntitlementDeletedWolo: 0,
      lifetimeRewardsRewritten: false,
      historicalSyntheticEventsDeleted: false,
      historicalSyntheticEventsRewritten: false,
      woloTransferPerformed: false,
      chainMutationPerformed: false,
      targetAllocationState: "COMPOUND_PENDING",
      targetMeaning: "earned reward awaiting independently proven staking custody",
    },
  };
}

try {
  if (verify) {
    const snapshot = await loadSnapshot(db);
    const inspection = inspectLegacySyntheticCompoundSnapshot(snapshot, "after");
    console.log(JSON.stringify(report("verify", snapshot, inspection), null, 2));
    if (!inspection.ok) throw new Error("Legacy compound reconciliation verification failed.");
    console.log("PASS: legacy synthetic compound liability is pending custody, not principal.");
  } else if (!apply) {
    const snapshot = await loadSnapshot(db);
    const inspection = inspectLegacySyntheticCompoundSnapshot(snapshot, "before");
    console.log(JSON.stringify(report("dry-run", snapshot, inspection), null, 2));
    if (!inspection.ok) throw new Error("Exact reconciliation preconditions failed; no changes were made.");
    console.log(
      `DRY RUN ONLY. Apply requires --apply --confirm ${LEGACY_SYNTHETIC_COMPOUND_CONFIRMATION}`,
    );
  } else {
    let transactionCommitted = false;
    await db.query("begin");
    try {
      await db.query("select pg_advisory_xact_lock($1)", [209260910]);
      const before = await loadSnapshot(db);
      const inspection = inspectLegacySyntheticCompoundSnapshot(before, "before");
      const alreadyApplied = inspectLegacySyntheticCompoundSnapshot(before, "after");
      if (!inspection.ok && alreadyApplied.ok) {
        await db.query("rollback");
        console.log(
          "PASS: exact legacy synthetic compound reconciliation is already applied. Run --verify for the full receipt view.",
        );
      } else {
        if (!inspection.ok) {
          throw new Error("Exact reconciliation preconditions changed; rolling back.");
        }
        const preReport = report("apply-precondition", before, inspection);
      const backupDir = path.join(
        process.cwd(),
        "runtime",
        "staking-reconciliation-backups",
      );
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      const backupBody = `${JSON.stringify(preReport, null, 2)}\n`;
      const backupPath = path.join(
        backupDir,
        `legacy-synthetic-compounds-${Date.now()}.json`,
      );
      fs.writeFileSync(backupPath, backupBody, { mode: 0o600 });

      const allocationIds = before.allocations.map((row) => Number(row.id));
      const allocationUpdate = await db.query(
        `update staking_reward_allocations
            set status='COMPOUND_PENDING'
          where id = any($1::int[]) and status='COMPOUNDED'`,
        [allocationIds],
      );
      if (allocationUpdate.rowCount !== LEGACY_SYNTHETIC_COMPOUND_EXPECTED.rows) {
        throw new Error(
          `Allocation update count drifted: ${allocationUpdate.rowCount}`,
        );
      }

      for (const [userIdText, expected] of Object.entries(
        LEGACY_SYNTHETIC_COMPOUND_EXPECTED.byUser,
      )) {
        const update = await db.query(
          `update staking_positions
              set compounded_rewards_wolo=compounded_rewards_wolo-$1,
                  updated_at=now()
            where user_id=$2
              and compounded_rewards_wolo >= $1`,
          [expected.wolo, Number(userIdText)],
        );
        if (update.rowCount !== 1) {
          throw new Error(`Position update failed for user ${userIdText}`);
        }
      }

      const after = await loadSnapshot(db);
      const afterInspection = inspectLegacySyntheticCompoundSnapshot(after, "after");
      if (!afterInspection.ok) {
        throw new Error("Post-update reconciliation verification failed; rolling back.");
      }

      const receiptPath = backupPath.replace(/\.json$/, ".receipt.json");
      const pendingReceiptPath = `${receiptPath}.pending`;
      const pendingReceipt = report("apply-pending-commit", after, afterInspection);
      pendingReceipt.preconditionBackup = {
        path: backupPath,
        sha256: sha256(backupBody),
      };
      pendingReceipt.databaseCommitStatus = "pending";
      const pendingBody = `${JSON.stringify(pendingReceipt, null, 2)}\n`;
      fs.writeFileSync(pendingReceiptPath, pendingBody, { mode: 0o600 });

      await db.query("commit");
      transactionCommitted = true;

      const receipt = report("apply", after, afterInspection);
      receipt.preconditionBackup = pendingReceipt.preconditionBackup;
      receipt.databaseCommitStatus = "committed";
      receipt.precommitReceiptSha256 = sha256(pendingBody);
      const receiptBody = `${JSON.stringify(receipt, null, 2)}\n`;
      fs.writeFileSync(receiptPath, receiptBody, { mode: 0o600 });
      fs.rmSync(pendingReceiptPath, { force: true });
      console.log(`Applied legacy synthetic compound reconciliation: ${receiptPath}`);
      console.log(`Receipt SHA256: ${sha256(receiptBody)}`);
      }
    } catch (error) {
      if (!transactionCommitted) await db.query("rollback");
      throw error;
    }
  }
} finally {
  await db.end();
}
