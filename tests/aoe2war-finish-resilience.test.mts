import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("finish owns docs-history and filesystem-capacity reconciliation", async () => {
  const finish = await source("scripts/aoe2_finish.py");

  assert.match(finish, /def reconcile_managed_docs_history/);
  assert.match(finish, /LOCAL_AHEAD/);
  assert.match(finish, /push_and_verify/);
  assert.match(finish, /def production_capacity_snapshot/);
  assert.match(finish, /root_free_warn_gib/);
  assert.match(finish, /final_capacity/);
});

test("update bounds context retention and proves capture headroom", async () => {
  const update = await source("scripts/aoe2_update.py");

  assert.match(update, /def prune_context_before_capture/);
  assert.match(update, /"KEEP_N": "1"/);
  assert.match(update, /env\["PRUNE_LATEST"\] = "1"/);
  assert.match(update, /def context_capture_headroom/);
  assert.match(update, /expected exactly one .* context archive/);
  assert.match(update, /context SHA mismatch/);
});
