import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchBoundedWoloTxJson } from "../lib/woloBoundedTxLookup.ts";

const lookup = "https://rest.example.test/cosmos/tx/v1beta1/txs/" + "A".repeat(64);
const json = JSON.stringify({ tx_response: { txhash: "A".repeat(64), height: "12" }, tx: { body: { messages: [] } } });

function responder(body: BodyInit | null, status = 200, headers: HeadersInit = {}) {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.signal?.aborted, false);
    assert.equal(init?.headers && (init.headers as Record<string,string>).accept, "application/json");
    return new Response(body, { status, headers });
  }) as typeof fetch;
}

test("bounded legacy settlement tx reader accepts ordinary canonical JSON transport", async () => {
  const data = await fetchBoundedWoloTxJson(lookup, {
    fetcher: responder(json, 200, { "content-length": String(Buffer.byteLength(json)) }),
  });
  assert.equal((data?.tx_response as { height?: string })?.height, "12");
});

test("HTTP success is strict 200, never redirect, partial body or error", async () => {
  for (const status of [206, 201, 204, 301, 404, 500]) {
    assert.equal(await fetchBoundedWoloTxJson(lookup, {
      fetcher: responder(status === 204 ? null : json, status),
    }), null, "status " + status);
  }
  assert.equal(await fetchBoundedWoloTxJson(lookup, {
    fetcher: (async () => { throw new Error("timed out"); }) as typeof fetch,
  }), null);
});

test("advertised sizes and unadvertised chunked responses obey a 750KB cap", async () => {
  for (const header of ["750001", "999999999999", "unsafe", "-2", "1.5", "000100"]) {
    assert.equal(await fetchBoundedWoloTxJson(lookup, {
      fetcher: responder(json, 200, { "content-length": header }),
    }), null);
  }
  const streaming = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(400_000));
      controller.enqueue(new Uint8Array(350_001));
      controller.close();
    },
  });
  assert.equal(await fetchBoundedWoloTxJson(lookup, {
    fetcher: responder(streaming),
  }), null);
});

test("empty, malformed, nonobject and missing payloads fail without throwing", async () => {
  for (const body of ["", "{", "null", "false", "[]", "\"string\""]) {
    assert.equal(await fetchBoundedWoloTxJson(lookup, { fetcher: responder(body) }), null);
  }
  assert.equal(await fetchBoundedWoloTxJson(lookup, { fetcher: responder(null) }), null);
});

test("escrow/staking legacy tx lookup is connected to the shared bounded reader", () => {
  const settlement = readFileSync(new URL("../lib/woloBetSettlement.ts", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../lib/woloBoundedTxLookup.ts", import.meta.url), "utf8");
  const begin = settlement.indexOf("async function fetchTx(txHash: string)");
  const end = settlement.indexOf("function sleep(", begin);
  assert.ok(begin > 0 && end > begin);
  assert.match(settlement.slice(begin, end), /fetchBoundedWoloTxJson\(/);
  assert.doesNotMatch(settlement.slice(begin, end), /response\.json\(|await fetch\(/);
  assert.match(reader, /AbortSignal\.timeout\(6500\)/);
  assert.match(reader, /redirect: "error"/);
  assert.match(reader, /readWarSatchelBoundedUtf8\(response\.body, maximumBytes\)/);
});
