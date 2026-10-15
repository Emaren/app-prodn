import assert from "node:assert/strict";
import { test } from "node:test";
import { readWarSatchelBoundedUtf8 } from "../lib/warSatchelBoundedBody.ts";

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
const bytes = (s: string) => new TextEncoder().encode(s);

test("accepts an ordinary small JSON request without changing its bytes", async () => {
  const json = JSON.stringify({ challengeId: "a", keplrSignature: { signature: "abc" } });
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes(json.slice(0, 12)), bytes(json.slice(12))), 3072), json);
});

test("refuses oversized streaming bodies even without Content-Length", async () => {
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes("a".repeat(3072)), bytes("b")), 3072), null);
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes("x".repeat(1024 * 1024 + 1))), 1024 * 1024), null);
});

test("counts UTF-8 bytes rather than JavaScript UTF-16 characters", async () => {
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes("💥".repeat(800))), 3072), null);
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes("💥".repeat(768))), 3072), "💥".repeat(768));
});

test("refuses invalid UTF-8, empty bodies, and impossible limits", async () => {
  assert.equal(await readWarSatchelBoundedUtf8(stream(new Uint8Array([0xff])), 3072), null);
  assert.equal(await readWarSatchelBoundedUtf8(stream(), 3072), null);
  assert.equal(await readWarSatchelBoundedUtf8(null, 3072), null);
  assert.equal(await readWarSatchelBoundedUtf8(stream(bytes("hi")), 0), null);
});

test("bounds repeated empty chunks and fails closed on stream errors", async () => {
  const tiny = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 2049; i++) controller.enqueue(new Uint8Array());
      controller.close();
    },
  });
  assert.equal(await readWarSatchelBoundedUtf8(tiny, 3072), null);
  const broken = new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error("broken stream")); },
  });
  assert.equal(await readWarSatchelBoundedUtf8(broken, 3072), null);
});
