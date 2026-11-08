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
reviewed_at: "2026-11-08"
review_interval_days: 30
sensitivity: "internal"
---

# WoloChain Civic Rail Handoff Prompt

Paste the following into a separate Codex task rooted in WoloChain.

Substantively re-reviewed on 2026-11-08 against the **held, non-deployed**
WoloChain source `32fddb7590553a7a6122e62a3a237a08039e41fa`,
[WoloChain Satchel operator gates](https://github.com/Emaren/wolochain/blob/32fddb7590553a7a6122e62a3a237a08039e41fa/docs/war-satchel-mainnet-execution.md),
[mainnet services and ports](https://github.com/Emaren/wolochain/blob/32fddb7590553a7a6122e62a3a237a08039e41fa/docs/mainnet-services-and-ports.md),
and the [Chain financial release register](https://github.com/Emaren/wolochain/issues/5).
The historical 2026-10-08 prompt below is revised to **local/test-only**
advisory instructions. This review establishes source/architecture boundaries,
**not** acceptance of C01–C09, Oracle/Forge funding, live signer identity,
remote backups, independent witnesses, or transaction/payment finality.
No WoloChain or HEL1 runtime source was modified as part of this review.

```text
Locate the actual WoloChain repository first; on the operator Mac the
verified project root is `$HOME/projects/WoloChain`, not the old
`/Users/tonyblum/projects/WoloChain-wolo-1` path. Never treat that checkout's
default `main` as the held financial release source. Obtain an explicitly
reviewed source commit and create a separate isolated worktree without modifying
Session A's existing branches, worktrees, or uncommitted files. As of this
review, `32fddb7590553a7a6122e62a3a237a08039e41fa` is a
**read-only reference for architecture**, not permission to merge or deploy.

Start with a concrete execution plan, source/branch inventory, and path audit.
Read the actual worktree's `AGENTS.md`, `README.md`,
`docs/mainnet-settlement-runbook.md`,
`docs/mainnet-services-and-ports.md`,
`docs/war-satchel-mainnet-execution.md`, `docs/warbound-trophies.md`,
`cmd/wolochaind/cmd/settlement.go`,
`cmd/wolochaind/cmd/settlement_challenge.go`, `app/app_config.go`, and
`app/upgrades.go` where present in the **selected reviewed source**.
Cross-check the canonical architecture and storage maps, but do not use stale
local context captures as a substitute for the actual live inventory. If
required paths moved or are absent, report the difference and stop for source
selection rather than silently substituting the historical default branch.

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

- Read the generated current-state blocks in the canonical system maps and
  Wolo-owned service documentation, then independently observe the exact source,
  running binary, override configuration, chain state, and services before work.
  A historical checkout or binary seal does not establish current runtime truth.
  Never normalize consensus from Git parity alone.
- The incumbent Bet/Founder settlement services have been observed on 8092
  and 8093, but **their root-owned producer processes and Wolo REST/RPC
  paths are not yet proven C03-contained**. Current root-owned listeners also
  include REST 1318 and RPC 27657. A loopback bind or UID1000 firewall denial
  does not prove financial quiescence or prevent all root/credential signing.
- The dedicated **War Satchel execution/review reservation uses 8094/8095**,
  with both funded services inactive and C01–C09 financially held. Never
  reuse 8094 or 8095 for Oracle or Forge; never route new funded flows back
  through the incumbent 8092/8093 path.
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
   loopback listener selected **only after** a new independent host port,
   service identity, network access, custody and credential audit. **Do not
   propose or reserve 8094/8095**: those are allocated to the held War Satchel
   executor and reserve reviewer, respectively. The old 8094 Oracle suggestion
   is explicitly retired; no replacement port is pre-approved here.

7. Parameterize health, backup, restore, and alert verification for that isolated
   profile. A systemd unit being active is insufficient. Health must prove
   `ok=true`, the exact chain/denom/prefix, expected signer address, balance above
   the configured reserve/fee floor, dry-run success, writable protected state,
   and backup/restore evidence.

8. Define a separate Kingdom Forge custody contract and deployment profile. It
   must use its own purpose namespace, escrow address, signer, credentials, state,
   independently audited port (never 8092, 8093, 8094 or 8095), reserve,
   and reconciliation ledger. Do not route Forge deposits through Oracle,
   Satchel, Bet or Founder custody. Keep Forge milestone authorization and draw
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

Before any Oracle/Forge funding-profile activation, independently satisfy
its **own** custody/signers, writer-containment, bank/liability solvency,
fresh coordinated encrypted backup, same-backup restore, real independent
governance and transaction-specific owner approval. Do not borrow the still-held
C01–C09 War Satchel permissions or reuse 8094/8095 for another product.

Stop and report before any action that would touch production chain state,
production keys, live WOLO balances, the pinned consensus runtime, the
incumbent 8092/8093 rails, or reserved 8094/8095 services. Completing the
local/test rail does not authorize a production install or activation.
```
