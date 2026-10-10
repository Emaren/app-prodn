import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const locks = read("lib/streamAdvisoryLocks.ts");
const start = read("app/api/streams/start/route.ts");
const heartbeat = read("app/api/streams/[streamId]/heartbeat/route.ts");
const sentinel = read("lib/streamFinalitySentinel.ts");

test("Postgres account and session locks are transaction-scoped and ordered", () => {
  assert.match(locks, /pg_advisory_xact_lock\(\$\{VIDEO_ACCOUNT_LOCK_DOMAIN\}, \$\{userId\}\)/);
  assert.match(locks, /pg_advisory_xact_lock\(\$\{VIDEO_SESSION_LOCK_DOMAIN\}, hashtext\(\$\{sessionKey\}\)\)/);
  assert.match(locks, /Number\.isSafeInteger\(userId\)/);
  assert.match(locks, /sessionKey\.length > 255/);
  assert.doesNotMatch(locks, /pg_advisory_lock\(/);
  for (const [name, source] of [["start", start], ["heartbeat", heartbeat]]) {
    const account = source.indexOf("await lockVideoBroadcaster(tx,");
    const session = source.indexOf("await lockVideoSessionPrimary(tx,");
    assert.ok(account > 0 && session > account, name + ": account before session");
    assert.match(source, /prisma\.\$transaction\(async \(tx\) => \{/);
    assert.match(source, /maxWait: 4_000, timeout: 12_000/);
  }
});

test("two concurrent starts cannot race the primary count ahead of account locking", () => {
  const account = start.indexOf("await lockVideoBroadcaster(tx, user.id)");
  const match = start.indexOf("await lockVideoSessionPrimary(tx, sessionKey)");
  const endPrior = start.indexOf("await tx.gameWatchStream.updateMany(");
  const primaryCount = start.indexOf("await tx.gameWatchStream.count(");
  const insert = start.indexOf("await tx.gameWatchStream.create(");
  assert.ok(0 < account && account < match && match < endPrior &&
    endPrior < primaryCount && primaryCount < insert);
  assert.doesNotMatch(start, /pg_advisory_unlock\(/);
});

test("late camera identity promotion cannot reactivate an ended recorder or override a chosen primary", () => {
  assert.match(heartbeat, /const current = await tx\.gameWatchStream\.findUnique\(/);
  assert.match(heartbeat, /!\["starting", "live"\]\.includes\(current\.status\)/);
  assert.match(heartbeat, /await tx\.gameWatchStream\.updateMany\(\{\s*where: \{ id, status: \{ in: \["starting", "live"\] \} \}/);
  assert.match(heartbeat, /priorPrimary === 0/);
  assert.match(heartbeat, /if \(updated\.isPrimary\)/);
  assert.match(heartbeat, /status: 409/);
});

test("a different account's same-named final replay cannot stop this recording", () => {
  const owner = sentinel.indexOf("const owner = await prisma.user.findUnique(");
  const lookup = sentinel.indexOf("const rows = await prisma.$queryRaw");
  assert.ok(owner > 0 && lookup > owner);
  assert.match(sentinel, /if \(!stream\.userId\) return null/);
  assert.match(sentinel, /where: \{ id: stream\.userId \}, select: \{ uid: true \}/);
  assert.match(sentinel, /if \(!owner\?\.uid\) return null/);
  assert.match(sentinel, /and gs\.user_uid = \$\{owner\.uid\}/);
  assert.match(sentinel, /where gs\.is_final = true/);
});

test("all chunk write and terminal paths serialize with the same transaction-scoped camera lock", () => {
  const chunks = read("app/api/streams/[streamId]/chunks/route.ts");
  const end = read("app/api/streams/[streamId]/end/route.ts");
  const writeLock = "await lockVideoChunkWriter(tx, id)";
  const writer = chunks.indexOf(writeLock);
  const physical = chunks.indexOf("await writeStreamChunk(id, sequence");
  const receipt = chunks.indexOf("await tx.gameWatchStream.updateMany(", physical);
  const count = chunks.indexOf("return updated ? { stored, updated } : null");
  assert.ok(writer > 0 && physical > writer && receipt > physical && count > receipt);
  assert.match(chunks, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(chunks, /maxWait: 4_000, timeout: 20_000/);
  assert.match(chunks, /chunkCreated: accepted\.stored\.created/);
  assert.match(chunks, /if \(!current \|\| !isAoE2WarManagedStream\(current, actor\.user\.id\)/);
  assert.match(chunks, /where: \{ id, status: \{ in: \["starting", "live"\] \} \}/);
  assert.match(end, /await lockVideoChunkWriter\(tx, id\)/);
  assert.match(end, /status: \{ in: \["starting", "live"\] \}/);
  assert.match(sentinel, /await lockVideoChunkWriter\(tx, stream\.id\)/);
  assert.match(start, /for \(const old of previous\) await lockVideoChunkWriter\(tx, old\.id\)/);
  assert.match(locks, /pg_advisory_xact_lock\(\$\{734102\}, \$\{streamId\}\)/);
  assert.doesNotMatch(locks, /pg_advisory_unlock\(/);
});

test("WebM storage remains atomic on disk and restart-reconcilable if DB acknowledgement rolls back", () => {
  const storage = read("lib/streamStorage.ts");
  assert.match(storage, /await fs\.open\(temporaryPath, "wx", 0o600\)/);
  assert.match(storage, /await handle\.sync\(\)/);
  assert.match(storage, /await fs\.link\(temporaryPath, filePath\)/);
  assert.match(storage, /const raced = await fs\.readFile\(filePath\)/);
  assert.match(storage, /await fs\.unlink\(temporaryPath\)\.catch\(\(\) => undefined\)/);
  assert.match(storage, /getStreamStorageUsage\(streamId\)/);
});
