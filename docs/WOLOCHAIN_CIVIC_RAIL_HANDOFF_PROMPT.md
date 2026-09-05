---
id: "aoe2war.app-prodn.docs-wolochain-civic-rail-handoff-prompt"
title: "WoloChain Civic Rail Handoff Prompt"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "cross-repository-handoff"
reviewed_at: "2026-08-08"
review_interval_days: 30
sensitivity: "internal"
---

# WoloChain Civic Rail Handoff Prompt

Paste the following into a separate Codex task rooted in WoloChain.

```text
Work only in `/Users/tonyblum/projects/WoloChain-wolo-1`.

Start by writing a concrete execution plan. Then inspect the real repo and
implement, test, and document the requested local/test-only settlement work.
Read that repo's `AGENTS.md`, `/Users/tonyblum/projects/VPSSentry/context/SYSTEM_MAP.md`,
`/Users/tonyblum/projects/VPSSentry/context/SERVER_STORAGE_MAP.md`, `README.md`,
`docs/mainnet-settlement-runbook.md`, `docs/mainnet-services-and-ports.md`,
`docs/warbound-trophies.md`, `cmd/wolochaind/cmd/settlement.go`,
`cmd/wolochaind/cmd/settlement_challenge.go`, `app/app_config.go`, and
`app/upgrades.go` before changing code. Trust the actual tree if a path moved.

Objective

Build an app-neutral, purpose-bound funding-proof primitive and a dedicated,
isolated Oracle custody/settlement profile that AoE2HDBets can integrate later.
Reuse the proven challenge-validation and idempotent grouped-settlement patterns,
but keep all product market math and product policy in AoE2HDBets.

Immutable ownership boundaries

- Canonical chain identity is `wolo-1` / `uwolo` / `wolo` / `WOLO`, six
  decimals, with `wolo1...` addresses.
- AoE2HDBets owns Round Chamber identity and ballots, the product staking-reward
  cap, Forge project/deed accounting, Oracle questions, outcomes, rules,
  probabilities, fees, resolution decisions, disputes, and entitlement math.
- WoloChain owns signed transaction proof, exact custody balances, generic
  validation, replay protection, idempotent settlement execution, and chain
  truth.
- Do not implement the 1,000,000-WOLO reward cap in `x/staking` or change chain
  delegation/distribution. It is applied per linked AoE2WAR identity by the app's
  daily reward job.
- Do not map Round Chamber ballots onto stake-weighted `x/gov`.
- Do not add a consensus module, store key, genesis change, or chain upgrade in
  this pass.
- Oracle and Kingdom Forge must never share a custody address, signer, keyring,
  passphrase, state directory, request namespace, reserve policy, or service
  profile with each other or with Bet/Founder settlement.

Production safety boundary

- The Wolo source checkout is currently based on
  `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`.
- Consensus deliberately runs the preserved pre-upgrade binary commit
  `d3bd62414a047a492a3814b7d3baa2717d64db2e` through a node-binary override.
- Existing Bet and Founder settlement services use their established binary and
  listen on loopback ports 8092 and 8093.
- Do not replace, restart, rebuild, relink, or normalize the production consensus
  binary. Do not remove its override, alter genesis, schedule an upgrade, create
  or fund live keys, transfer WOLO, install a service, or mutate production state.
- Do not overwrite `/usr/local/bin/wolochaind-mainnet` for testing. Use local
  binaries and disposable local-chain state. Any future service artifact must
  have its own versioned path.
- Preserve the existing root-owned settlement state directories. Put temporary
  builds, caches, and test state on appropriate disposable or volume-backed
  storage; production root headroom is tight.

Deliverables

1. Add an architecture/boundary document for Round Chamber, Kingdom Forge, and
   Oracle. It must state which facts belong to AoE2HDBets versus WoloChain, why
   the reward cap is app-owned, why a Forge support signal is not spendable
   development capital, and why Oracle/Forge custody must remain isolated.

2. Implement a versioned, purpose-bound funding proof by adapting the existing
   challenge transaction-verification pattern. It must fail closed unless it can
   prove all of:
   - chain id `wolo-1`;
   - a successful bank send;
   - exact configured recipient and exact expected sender;
   - exact `uwolo` amount;
   - strict, canonical, versioned memo fields;
   - unique transaction hash plus observed height and time;
   - a canonical transaction-proof URL.
   Expose deterministic CLI validation and loopback HTTP read/validate APIs.
   Wrong chain, sender, recipient, denom, amount, memo, purpose, or duplicate hash
   must be rejected.

3. Define and version the Oracle funding memo/schema. Include stable fields for
   source app, purpose, market id, market version, deposit/position id,
   side/bucket (`YES`, `NO`, or `BOND`), sender, recipient, and exact `uwolo`
   amount. Canonicalization and validation must be deterministic. WoloChain may
   validate caller-supplied identity fields but must never decide the question,
   side, odds, winner, creator-bond disposition, fee, refund, or payout amount.

4. Implement a funded grouped-run reconciliation path for Oracle settlement and
   voids. A caller-supplied run must:
   - cite accepted, unique funding transaction hashes;
   - reject deposit reuse across runs or purposes;
   - bind every input to the same market id/version and Oracle custody profile;
   - prove the total referenced collateral;
   - require `signer_role=escrow`;
   - prove payouts, caller-declared treasury fee, bond return/slash routing, and
     refunds do not exceed referenced collateral;
   - preserve idempotency through a stable run id and immutable replay payload.
   The rail executes validated outputs only. It must not infer market outcomes or
   recompute pool math.

5. Add schemas and examples plus unit and bounded local-chain end-to-end tests.
   Cover YES and NO deposits, creator bond return and slash routes supplied by the
   caller, settled payouts, full void/refund, duplicate funding hash, duplicate
   run id with an altered payload, wrong chain/sender/recipient/denom/amount,
   wrong market/version/side/purpose/memo, and undercollateralized output refusal.
   Prove successful retries return the original idempotent receipt.

6. Add an example isolated Oracle service profile only; do not install or start
   it on production. It requires a dedicated Oracle escrow key/address, root-only
   keyring and passphrase, unique auth token and request namespace, separate
   volume-backed state and backup paths, reserve floor and fee headroom, and a
   loopback listener selected only after a live port audit. Port 8094 is only a
   candidate because 8092 and 8093 are already occupied.

7. Parameterize health, backup, restore, and alert verification for that isolated
   profile. A systemd unit being active is insufficient. Health must prove
   `ok=true`, the exact chain/denom/prefix, expected signer address, balance above
   the configured reserve/fee floor, dry-run success, writable protected state,
   and backup/restore evidence.

8. Define a separate Kingdom Forge custody contract and deployment profile. It
   must use its own purpose namespace, escrow address, signer, credentials, state,
   port, reserve, and reconciliation ledger. Do not route Forge deposits through
   Oracle, Bet, or Founder custody. Keep Forge milestone authorization and draw
   amounts caller-supplied by AoE2HDBets; WoloChain validates and executes exact
   authorized transfers without inventing project policy. Implement only the
   shared proof primitives needed now and leave any live Forge funding profile as
   an uninstalled example unless its independent tests can be completed safely.

9. Do not add chain-native Feature Deeds. If future chain-native deeds are
   proposed, write a separate future upgrade note; do not combine it with this
   non-consensus settlement work or the already-pending Warbound Trophy store
   addition.

10. Run the repo's real gates, including `go test ./...`, `go build`, generated
    proto checks if present, chain invariants, and the new bounded local e2e.
    Exercise the CLI and loopback HTTP contracts. Do not substitute mocks for the
    transaction-proof cases that can run against the disposable local chain.

11. Update WoloChain docs with exact request/response schemas, memo
    canonicalization, replay/idempotency rules, isolated service examples,
    backup/restore steps, failure modes, and an AoE2HDBets integration handoff.
    Report every changed file, test command and result, unresolved app/ops work,
    and an explicit statement that production state and services were not changed.

Stop and report before any action that would touch production chain state,
production keys, live WOLO balances, the pinned consensus runtime, or the
existing 8092/8093 rails. Completing the local/test rail does not authorize a
production install or activation.
```
