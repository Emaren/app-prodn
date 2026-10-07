---
id: "aoe2war.app-prodn.docs-native-replay-control"
title: "Native Replay Control"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-07"
review_interval_days: 30
sensitivity: "restricted"
---

# Native Replay Control

`aoe2war truth native-control` invokes the API-owned #32388 pre-release control
from the operator host. It prepares immutable intent, runs one bounded normal
Steam-context observation, and independently revalidates its evidence. The
instruction at `0x5a6e99` is a stream-release frontier; reaching it does not prove
EOF. This command creates candidate research evidence only.

## Commands

Run from the governed app checkout:

```bash
aoe2war truth native-control prepare --run-id control-32388-yyyymmddthhmmssz --api-source /absolute/governed/api-worktree
aoe2war truth native-control run --run-id control-32388-yyyymmddthhmmssz --api-source /absolute/governed/api-worktree
aoe2war truth native-control verify --run-id control-32388-yyyymmddthhmmssz --api-source /absolute/governed/api-worktree
```

`prepare` alone accepts `--clang PATH` and `--lld-link PATH` only when their
SHA-256 identities match the reviewed installed clang and Rust stable lld-link
binaries. These overrides cannot select an unrelated toolchain. `run` consumes
the prepared intent. `verify` rehashes and
recomputes the existing immutable receipt without launching a game. Select a new
run ID for another attempt; the API owns serial execution and duplicate-attempt
rejection. Labels contain 1–48 lowercase ASCII letters, digits or hyphens and
begin with a letter or digit.

Without `--api-source`, the adapter resolves the canonical sibling API checkout
from the app's Git common directory. An explicit source must be that checkout or
one of its worktrees; a foreign repository, checkout subdirectory or symlink is
rejected. The adapter forwards its own app source internally. The API binds and
validates both source heads, runtime prerequisites, the exact #32388 archive and
historical control provenance before observation. It owns clean-source checks,
immutable intent, tool hashes, attempt locks and cleanup.

## Shared contract and receipts

The app adapter is `scripts/aoe2_native_control.py`. Its shared
`invoke_control` entry point delegates to API
`scripts/replay_engine_native_control.py`; API
`utils/replay_engine_native_control.py` owns preparation, execution, independent
refereeing and the machine-readable evidence contract. Successful delegation
preserves API JSON and exit status without interpreting candidate flags. Adapter
prerequisite failures emit `aoe2war.native_control.adapter_rejection.v1` with
`REJECT`, `candidateOnly: true`, and every authority false.

The API resolves durable evidence through its Git common checkout. Prepared
intent and receipts live under canonical
`api-prodn/instance/native-replay-worker/native-controls/<run-id>/`; raw captures
live under the sibling `attempts/<run-id>/`. Source worktree retirement does not
remove these files. Immutable SHA-named intent and receipt files use
`aoe2war.native_control_intent.v1` and `aoe2war.native_control_receipt.v1`;
operation replies use `aoe2war.native_control_operation.v1`. Receipts record source
and attempt identity, artifact hashes, capture integrity, cleanup,
`PASS` / `HOLD` / `REJECT`, and the propositions still unproven. A preparation
`PASS` proves prepared intent only; `eofControlStatus` is a separate gate. The old
census receipt writer is not used for this operation.

## Authority and expansion gate

Raw capture, native observations, candidate conclusions, adjudications, public
truth, financial authority and WoloChain settlement remain separate. Stream
closure, a terminal partition or a candidate referee `PASS` cannot substitute for
independently validated complete replay consumption and genuine EOF. Missing
instruction binding, an early close, seek/error, unexplained finalization,
teardown or incomplete capture remains `HOLD` or `REJECT` as the API determines.

This capability does not query or refresh the census, write production or parser
rows, create adjudications, promote results, alter bets, settle markets, deploy
production or mutate WoloChain. Unknown-result execution remains locked. A
diverse known-result control ladder must independently validate the native
terminal family before any bounded unknown-result cohort is opened.

### Known-control native memory ladder

The general native replay worker now wires the API-owned read-only memory
observer and one-shot Fast Playback controller into known-result manifest runs.
For each run it writes the canonical manifest into durable preflight evidence,
builds the observer/controller twice with the fixed reviewed host toolchain,
requires byte-identical helpers, and passes their exact hashes plus the exact
manifest file hash into the API runner. The API runner still owns the normal
Steam/CrossOver launch and stages every runtime input into the immutable attempt.

Manifest-mode terminal validation is memory-first. The app independently imports
the API memory referee after execution, rehashes the raw
`memory-observer.jsonl`, recomputes the repeated coherent terminal partition,
and requires it to equal both the stored API candidate and the receipt winner /
loser partition before comparing against the already-trusted control result.
Attempt-new append-safe AILog remains a supported legacy candidate family, but a
dormant AILog no longer blocks a valid memory-terminal control.

This closes the prior API-memory / app-AILog verification mismatch. It does not
open unknown execution or automatic promotion. A passing known control produces
stats-only commissioner review evidence; it does not affect stats until reviewed
and never carries betting, settlement or Wolo authority.

For isolated host review, the Operator Bridge may receive
`AOE2WAR_NATIVE_API_SOURCE=/absolute/api-worktree`. It forwards that path only
to the native worker; the worker rejects symlinks, subdirectories and foreign
repositories and requires the selected path to share the canonical API Git common
checkout. Durable attempt/preflight evidence still lives under the canonical API
checkout rather than the disposable worktree.

A future Admin action should call this same worker / bridge contract on the operator host and
render the API receipt, including unresolved propositions and cleanup. It must
not implement a separate native launch, infer EOF from `PASS`, accept arbitrary
game paths or addresses, or turn operation completion into result authority. This
checkpoint adds no Admin action or production deployment.

## Current bounded frontier — 2026-10-07 UTC

`close-32388-20261007t161000z` attached to the normal Steam-created game, armed
and immediately read back six debug contexts, but received no owned instruction
hit. Last valid active cursor was **665378 / 665734**; **356 bytes** remained
unobserved before the stream became null at terminal simulation **1485022 ms**.
The existing native partition referee remains candidate-only `PASS`. Process
exit preceded failed restoration of its terminated main thread; raw debug cleanup
was false, so this operation is **REJECT** and the strengthened EOF gate **HOLD**.
Runner cleanup completed, no game process remained, and the existing Steam client
was preserved. `verify` reproduces the rejection; repeating `run` verifies and
reuses its receipt without another launch.

The identical checked-in handoff is
[`native-pre-release-capability-handoff-2026-10-07.json`](replay-receipts/native-pre-release-capability-handoff-2026-10-07.json),
SHA-256 `4c9f160eaccecea81d50fb1c8eb31ab79fa5dceacf51b82db82458bb92f60be9`.
The immutable canonical copy is
`.aoe2war-release/truth-receipts/native-pre-release-control-4c9f160eaccecea81d50fb1c8eb31ab79fa5dceacf51b82db82458bb92f60be9.json`.
The retained three-account census is 99 unknowns, zero eligible; it was not
refreshed and no new truth was promoted.

Hardware-breakpoint calibration remains a diagnostic lane for the exact EOF
research question, but it is no longer the shortest path to reducing historical
result debt. The operational priority is now the native-memory control ladder:
run several distinct known-result replays through the same manifest, exact-load,
Fast Playback, repeated-terminal and independent-referee contract. Include
different roster sizes / outcomes and at least one negative or ambiguous control.

Only after that ladder is reviewed may source open a deliberately bounded
unknown-result candidate cohort. Unknown candidates must remain candidate-only
and produce commissioner-review evidence rather than direct truth writes.
Whole-input consumption, genuine EOF and its cause remain separately unproven;
those propositions are not silently redefined merely to recover historical
winner truth.
