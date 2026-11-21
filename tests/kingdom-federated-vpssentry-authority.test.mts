import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync("config/aoe2war-os-registry.v1.json", "utf8"));

test("existing VPSSentry authority is ONE external federation, not a duplicate OS", () => {
  const fed = registry.federated_nonfinancial_host_observers;
  assert.equal(fed.length, 1);
  assert.equal(fed[0].id, "aoe2war.federation.vpssentry-bridge-storage.v1");
  assert.equal(fed[0].kind, "source-and-consumer-contract-not-new-subordinate-os");
  assert.equal(registry.subordinate_os.length, 15);
  assert.equal(registry.counts.planned_subordinate_os_total, 15);
  assert.ok(!registry.subordinate_os.some((x: any) => x.id === "vpssentry" || x.id === "bridge"));
});

test("native source identity, transport authority and action owners stay independent", () => {
  const x = registry.federated_nonfinancial_host_observers[0];
  assert.match(x.canonical_owners.infrastructure_measurement, /VPSSentry OS/);
  assert.match(x.canonical_owners.hel1_root_observation, /HEL1_ESTATE_OBSERVER/);
  assert.match(x.canonical_owners.transport, /Bridge OS/);
  assert.match(x.canonical_owners.classification, /Storage OS/);
  assert.match(x.canonical_owners.maintenance_scheduler, /Housekeeping OS/);
  assert.match(x.canonical_owners.release_executor, /WE2 Factory/);
  assert.equal(x.guardrails.source_identity_per_plane, true);
  assert.equal(x.guardrails.one_action_controller, true);
  assert.equal(x.guardrails.one_persisted_real_event_per_result, true);
});

test("registry never invents host credential enrollment or signed observation", () => {
  const x = registry.federated_nonfinancial_host_observers[0];
  assert.match(x.status, /HOST_ENROLLMENT_HOLD/);
  assert.match(x.adoption.host_enrollment, /^HOLD/);
  assert.match(x.guardrails.bridge_six_field_installation, /^HOLD/);
  assert.match(x.adoption.bridge_1439, /NOT_HOST_INSTALLED/);
  assert.match(x.adoption.sender_109, /NOT_HOST_INSTALLED/);
  assert.equal(x.adoption.synthetic_ack_permitted, false);
  assert.equal(x.guardrails.no_new_daemon_or_scheduler, true);
  assert.equal(x.guardrails.no_auto_cleanup_or_financial_writes, true);
  assert.equal(x.guardrails.v6_or_dormant_p256_owner_signer_required, false);
  assert.equal(x.guardrails.original_financial_seven_gates, "HOLD");
});
