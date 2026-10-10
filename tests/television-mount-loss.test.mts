import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const parent = await fs.mkdtemp(path.join(os.tmpdir(), "aoe2-mount-loss-"));
const videoRoot = path.join(parent, "missing-video-mount");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
process.env.AOE2_STREAM_STORAGE_DIR = videoRoot;
const { writeStreamChunk, removeStreamChunks, StreamStorageLimitError } =
  await import("../lib/streamStorage.ts");

test("lost mounted video filesystem never triggers a recursive directory recreation on VPS root", async t => {
  t.after(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await fs.rm(parent, { recursive: true, force: true });
  });
  await assert.rejects(
    writeStreamChunk(948712, 0, Buffer.from("webm")),
    (error: unknown) => error instanceof StreamStorageLimitError &&
      error.reason === "capacity_unverified",
  );
  await assert.rejects(fs.stat(videoRoot), { code: "ENOENT" });
  // Directory exists but is just a fallback on the same root device.
  await fs.mkdir(videoRoot);
  await assert.rejects(
    writeStreamChunk(948712, 0, Buffer.from("webm")),
    (error: unknown) => error instanceof StreamStorageLimitError &&
      error.reason === "capacity_unverified",
  );
  await assert.rejects(fs.stat(path.join(videoRoot, "948712")), { code: "ENOENT" });
  await assert.rejects(
    removeStreamChunks(948712),
    (error: unknown) => error instanceof StreamStorageLimitError &&
      error.reason === "capacity_unverified",
  );
});
