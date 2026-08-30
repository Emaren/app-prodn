import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aoe2war-stream-storage-"));
process.env.AOE2_STREAM_STORAGE_DIR = storageRoot;

const storage = await import("../lib/streamStorage.ts");

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test("chunk writes are atomic, idempotent, and conflict-safe", async () => {
  const first = await storage.writeStreamChunk(991_001, 0, Buffer.from("init"));
  assert.equal(first.created, true);
  assert.deepEqual(first.usage, {
    chunkCount: 1,
    totalBytes: 4,
    latestSequence: 0,
  });

  const retry = await storage.writeStreamChunk(991_001, 0, Buffer.from("init"));
  assert.equal(retry.created, false);
  assert.deepEqual(retry.usage, first.usage);

  await assert.rejects(
    storage.writeStreamChunk(991_001, 0, Buffer.from("different")),
    storage.StreamChunkConflictError,
  );
  assert.equal((await storage.readStreamChunk(991_001, 0)).toString(), "init");
});

test("multi-chunk playback refuses an oversized in-memory window", async () => {
  await storage.writeStreamChunk(991_002, 0, Buffer.from("1234"));
  await storage.writeStreamChunk(991_002, 1, Buffer.from("5678"));

  await assert.rejects(
    storage.readStreamChunksBounded(991_002, [0, 1], 7),
    storage.StreamStorageLimitError,
  );

  const bounded = await storage.readStreamChunksBounded(991_002, [0, 1], 8);
  assert.equal(bounded.totalBytes, 8);
  assert.equal(Buffer.concat(bounded.chunks).toString(), "12345678");
});

test("storage identities reject aliases instead of silently rewriting them", () => {
  assert.throws(
    () => storage.streamChunkDir("../991001"),
    /Invalid stream id/,
  );
  assert.throws(
    () => storage.streamChunkDir("0991001"),
    /Invalid stream id/,
  );
  assert.throws(
    () => storage.streamChunkPath(991_003, "1e2"),
    /Invalid stream chunk sequence/,
  );
});
