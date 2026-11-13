import assert from "node:assert/strict";
import test from "node:test";
import { parseWoloBrowserRpcStatus } from "../lib/woloBrowserRpcStatus.ts";

const now = Date.parse("2026-11-13T20:30:10.000Z");
function sample(height = "2967025", date = "2026-11-13T20:30:05.000Z") {
  return { result: {
    node_info: { network: "wolo-1", moniker: "wolo-mainnet-hel1", version: "0.38.17" },
    sync_info: { latest_block_height: height, latest_block_time: date,
      catching_up: false, latest_block_hash: "A".repeat(64), latest_app_hash: "B".repeat(64) },
  }};
}
test("fresh verified public head does not invent advancement or peer count", () => {
  const data = parseWoloBrowserRpcStatus(sample(), null, now);
  assert.equal(data.healthy, true);
  assert.equal(data.latestBlockHeight, "2967025");
  assert.equal(data.statusLabel, "Fresh block");
  assert.equal(data.peers, null);
  assert.equal(data.source, "/rpc/status");
});
test("successive increasing height is observed advancement", () => {
  const data = parseWoloBrowserRpcStatus(sample("2967026"), "2967025", now);
  assert.equal(data.statusLabel, "Advancing");
  assert.equal(data.consensusStatus, "advancing");
});
test("stalled or catching-up nodes never appear healthy", () => {
  assert.equal(parseWoloBrowserRpcStatus(sample("2967025", "2026-11-13T20:29:00Z"), null, now).healthy, false);
  const catching = sample(); catching.result.sync_info.catching_up = true;
  assert.equal(parseWoloBrowserRpcStatus(catching, null, now).healthy, false);
});
test("wrong chain, malformed height, future timestamp, and height regression fail closed", () => {
  const wrong = sample(); wrong.result.node_info.network = "different-1";
  assert.throws(() => parseWoloBrowserRpcStatus(wrong, null, now), /WRONG_CHAIN/);
  for (const h of ["0", "-1", "0x2", "1e9", "001", ""]) {
    assert.throws(() => parseWoloBrowserRpcStatus(sample(h), null, now), /INVALID_HEIGHT/);
  }
  assert.throws(() => parseWoloBrowserRpcStatus(sample("2967024"), "2967025", now), /HEIGHT_REGRESSION/);
  assert.throws(() => parseWoloBrowserRpcStatus(sample("2967025", "2026-11-13T21:30:00Z"), null, now), /FUTURE_BLOCK/);
  assert.throws(() => parseWoloBrowserRpcStatus({}, null, now), /MALFORMED/);
});
