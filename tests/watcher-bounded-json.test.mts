import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readBoundedWatcherJson } from "../lib/watcherBoundedJson.ts";

function request(body: string) {
  return new Request("https://example.invalid/api/watcher/events", {
    method: "POST", body,
  });
}

test("normal watcher telemetry event retains its original JSON shape", async () => {
  const payload = { event_type: "heartbeat", metadata: { telemetryEventId: "telemetry_" + "a".repeat(32) } };
  assert.deepEqual(await readBoundedWatcherJson(request(JSON.stringify(payload))), {
    kind: "ok", payload,
  });
});

test("exact byte budget succeeds and the next byte is rejected", async () => {
  const exact = JSON.stringify({ x: "x".repeat(22) });
  assert.equal(Buffer.byteLength(exact), 30);
  assert.equal((await readBoundedWatcherJson(request(exact),30)).kind, "ok");
  assert.equal((await readBoundedWatcherJson(request(exact+" "),30)).kind, "too_large");
});

test("streamed body is bounded even without a length header", async () => {
  const encoder = new TextEncoder();
  let served = 0;
  const parts = [encoder.encode('{"event_type":"heartbeat"'),encoder.encode("q".repeat(66_000)),
    encoder.encode('}'),encoder.encode("unused")];
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (served===parts.length) { controller.close(); return; }
      controller.enqueue(parts[served++]);
    },
  }, { highWaterMark: 0 });
  const input = new Request("https://example.invalid/api/watcher/events",{
    method:"POST",body:stream,duplex:"half",
  } as RequestInit & {duplex:"half"});
  assert.equal((await readBoundedWatcherJson(input)).kind,"too_large");
  assert.ok(served < parts.length, "ingress must stop at the overflow");
});

test("malformed JSON is invalid while UTF-8 across chunk boundaries is preserved", async () => {
  assert.equal((await readBoundedWatcherJson(request("{oops"))).kind,"invalid");
  const bytes = new TextEncoder().encode(JSON.stringify({ city:"Québec", flag:"🇨🇦" }));
  const index = bytes.findIndex(x=>x>127);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0,index+1));
      controller.enqueue(bytes.subarray(index+1));
      controller.close();
    },
  });
  const input=new Request("https://example.invalid/",{method:"POST",body:stream,duplex:"half"} as RequestInit & {duplex:"half"});
  assert.deepEqual(await readBoundedWatcherJson(input),{kind:"ok",payload:{city:"Québec",flag:"🇨🇦"}});
});

test("route no longer buffers unbounded JSON requests", () => {
  const source=readFileSync(new URL("../app/api/watcher/events/route.ts",import.meta.url),"utf8");
  assert.match(source,/readBoundedWatcherJson\(request, MAX_BODY_BYTES\)/);
  assert.doesNotMatch(source,/request\.json\(\)/);
  assert.match(source,/read\.kind === "too_large"/);
});
