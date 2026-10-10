import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "aoe2-late-video-init-"));
process.env.AOE2_STREAM_STORAGE_DIR = root;
const { streamInitChunkExists, listStreamChunkSequences } = await import("../lib/streamStorage.ts");

test("long-game camera keeps its on-disk WebM init even after it falls outside rolling indexes", async t => {
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const id = 993312;
  const dir = path.join(root, String(id));
  await fs.mkdir(dir, { recursive: true });
  assert.equal(await streamInitChunkExists(id), false);
  await fs.writeFile(path.join(dir,"0.webm"), Buffer.from([0x1a,0x45,0xdf,0xa3,0x01]));
  for (let start=1; start<=540; start+=30) {
    await Promise.all(
      Array.from({length:Math.min(30,541-start)},(_,index)=>
        fs.writeFile(path.join(dir, String(start+index)+".webm"), Buffer.from([1,2,3])),
      ),
    );
  }
  const newest = await listStreamChunkSequences(id, 260);
  assert.equal(newest.includes(0), false, "init was evicted from newest-260 rolling index");
  assert.equal(await streamInitChunkExists(id), true, "read the physical header separately");
  await fs.unlink(path.join(dir,"0.webm"));
  assert.equal(await streamInitChunkExists(id), false, "never invent missing initialization");
});

test("manifest and rolling WebM routes check physical init instead of sliding sequence lists", () => {
  const manifest = readFileSync("app/api/streams/[streamId]/manifest/route.ts","utf8");
  const rolling = readFileSync("app/api/streams/[streamId]/rolling-webm/route.ts","utf8");
  assert.match(manifest,/const hasInit = await streamInitChunkExists\(stream.id\)/);
  assert.match(manifest,/initSeq: hasInit \? 0 : null/);
  assert.match(manifest,/availableSeqs: hasInit \? \[0, \.\.\.availableMediaSeqs\]/);
  assert.match(rolling,/const hasInit = await streamInitChunkExists\(stream.id\)/);
  assert.match(rolling,/chunkSequences = hasInit \? \[0, \.\.\.mediaRun\] : mediaRun/);
  assert.doesNotMatch(rolling,/availableSeqs\.includes\(0\)/);
});
