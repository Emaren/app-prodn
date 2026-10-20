import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readBoundedSatchelBankJson } from "../lib/warSatchelBankJsonTransport.ts";

const rpc = "https://rpc-mainnet.aoe2war.com/status";
const bank = "https://rest-mainnet.aoe2war.com/cosmos/bank/v1beta1/balances/wolo1" + "q".repeat(38) + "/by_denom?denom=uwolo";
const bytes = (s: string) => new TextEncoder().encode(s);
const body = (...parts: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); },
});
const reply = (stream: ReadableStream<Uint8Array>, headers?: Record<string,string>) =>
  new Response(stream, {status:200, headers});
const deny = /WAR_SATCHEL_FUNDED_REFUSED:/;

test("private bank and status JSON use bounded transport with no finance authority", async () => {
  const calls: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method, "GET");
    assert.equal(init?.headers && (init.headers as Record<string,string>).Accept, "application/json");
    assert.ok(init?.signal instanceof AbortSignal);
    return reply(body(bytes('{"result":{"node_info":{"network":"wolo-1"}}}')));
  }) as typeof fetch;
  assert.deepEqual((await readBoundedSatchelBankJson(rpc,fake)).result,{node_info:{network:"wolo-1"}});
  assert.ok((await readBoundedSatchelBankJson(bank,fake)).result);
  assert.deepEqual(calls,[rpc,bank]);
  const ledger=readFileSync(new URL("../lib/warSatchelFundedLedger.ts",import.meta.url),"utf8");
  assert.match(ledger,/readBoundedSatchelBankJson\(/);
  assert.doesNotMatch(ledger,/response\.text\(\)/);
  assert.match(ledger,/noFundsUntilCertified\(\)/);
});

test("refuses URL aliases and redirects without making a network request", async () => {
  let called=0;
  const fake=(async()=>{called++;return reply(body(bytes("{}")));}) as typeof fetch;
  for(const url of [bank.replace("https:","http:"),bank+"#fragment",bank.replace("denom=uwolo","denom=wolo"),
    bank.replace("rest-mainnet","rest-mainnet.evil"),rpc+"/",rpc+"?q=1",bank.replace("q".repeat(38),"q".repeat(91))]){
    await assert.rejects(readBoundedSatchelBankJson(url,fake),/untrusted_chain_endpoint/);
  }
  assert.equal(called,0);
  const redirect=(async()=>new Response(null,{status:302,headers:{location:bank}})) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,redirect),/bank_network_unavailable/);
});

test("oversized, dishonest, missing and malformed Content-Length never force unbounded buffering", async () => {
  let readChunks=0;
  const oversize = new ReadableStream<Uint8Array>({
    pull(controller) { readChunks++;controller.enqueue(new Uint8Array(4096).fill(0x61)); },
    cancel(){},
  });
  const fake=(async()=>reply(oversize)) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,fake),/bank_body_too_large/);
  assert.ok(readChunks <= 20, "bounded reader must stop after the first over-limit chunk");
  const declared=(async()=>reply(body(bytes("{}")),{"content-length":"65537"})) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,declared),/bank_body_too_large/);
  const malformed=(async()=>reply(body(bytes("{}")),{"content-length":"Infinity"})) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,malformed),/bank_body_too_large/);
  const dishonest=(async()=>reply(body(bytes("x".repeat(65535)),bytes("more")),{"content-length":"1"})) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,dishonest),/bank_body_too_large_or_invalid_utf8/);
});

test("rejects non-object JSON, empty body and invalid UTF-8; accepts exact 64 KiB", async () => {
  for(const raw of ["","[]","null","1","{bad"]){
    const fake=(async()=>reply(body(bytes(raw)))) as typeof fetch;
    await assert.rejects(readBoundedSatchelBankJson(rpc,fake),deny);
  }
  const utf8=(async()=>reply(body(new Uint8Array([0xff])))) as typeof fetch;
  await assert.rejects(readBoundedSatchelBankJson(rpc,utf8),/bank_body_too_large_or_invalid_utf8/);
  const valid = '{"a":"' + "z".repeat(65528) + '"}';
  assert.equal(bytes(valid).byteLength,65536);
  const exact=(async()=>reply(body(bytes(valid)))) as typeof fetch;
  assert.equal((await readBoundedSatchelBankJson(rpc,exact)).a, "z".repeat(65528));
});
