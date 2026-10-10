import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

const root = await fs.mkdtemp(path.join(tmpdir(), "aoe2-video-sequence-index-"));
process.env.AOE2_STREAM_STORAGE_DIR = root;
const { listStreamChunkSequences, removeStreamChunks } = await import("../lib/streamStorage.ts");

test("concurrent spectators share a bounded directory index, expire stale external writes and invalidate on removal", async t => {
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const id = 99123456;
  const dir = path.join(root, String(id));
  await fs.mkdir(dir, { recursive: true });
  for (const n of [0,1,2]) await fs.writeFile(path.join(dir, n + ".webm"), "segment");

  const calls = await Promise.all(Array.from({length: 16}, () => listStreamChunkSequences(id, 2)));
  for (const value of calls) assert.deepEqual(value, [1,2]);
  assert.deepEqual(await listStreamChunkSequences(id, 260), [0,1,2]);

  // Another worker writes a segment without knowing this process's cache.
  await fs.writeFile(path.join(dir, "3.webm"), "external segment");
  assert.deepEqual(await listStreamChunkSequences(id, 260), [0,1,2]);
  // TTL is deliberately shorter than the spectator's 3-second fetch cadence.
  await new Promise(resolve => setTimeout(resolve, 925));
  assert.deepEqual(await listStreamChunkSequences(id, 260), [0,1,2,3]);
  await removeStreamChunks(id);
  assert.deepEqual(await listStreamChunkSequences(id, 260), []);
});

test("sequence-index memory and lifecycle remain explicit, bounded and write-invalidated", () => {
  const source = readFileSync("lib/streamStorage.ts", "utf8");
  assert.match(source, /STREAM_SEQUENCE_INDEX_TTL_MS = 850/);
  assert.match(source, /STREAM_SEQUENCE_INDEX_MAX_STREAMS = 128/);
  assert.match(source, /STREAM_SEQUENCE_INDEX_MAX_ENTRIES = 512/);
  assert.match(source, /if \(prior\?\.pending\)/);
  assert.match(source, /invalidateStreamSequenceIndex\(streamId\);/);
  assert.match(source, /fs\.readdir\(dir\)/);
});
