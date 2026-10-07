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
aoe2war truth native-control calibrate --run-id cal-32388-yyyymmddthhmmssz --api-source /absolute/governed/api-worktree
```

`prepare` alone accepts `--clang PATH` and `--lld-link PATH` only when their
SHA-256 identities match the reviewed installed clang and Rust stable lld-link
binaries. These overrides cannot select an unrelated toolchain. `run` consumes
the prepared intent. `verify` rehashes and
recomputes the existing immutable receipt without launching a game. Select a new
run ID for another attempt; the API owns serial execution and duplicate-attempt
rejection. Labels contain 1–48 lowercase ASCII letters, digits or hyphens and
begin with a letter or digit.

`calibrate` is a one-shot governed prerequisite for the close-point experiment.
It prepares immutable calibration intent, builds the exact API-owned observer,
Fast Playback controller and PE32 hardware-breakpoint canary, runs #32388 for a
short bounded window, independently recomputes the raw trace, seals the result,
and verifies the immutable receipt. Calibration run IDs must begin with
`cal-`. The canary arms DR0 at hot world-update entry `0x738720`. A calibration
`PASS` proves only an owned CrossOver/PE32 execution trap plus clean live-thread
restoration/detach. It does **not** prove EOF, winner truth or the close-point
`0x5a6e99` path. A clean no-hit remains `HOLD`; malformed identity, authority
or cleanup evidence is `REJECT`.

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
production or mutate WoloChain. Unknown-result execution remains locked. The
strengthened #32388 control must independently pass before additional known and
ambiguous controls can establish a wider execution or promotion gate.

A future Admin action should call this same adapter on the operator host and
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

The next step is now internalized as
`aoe2war truth native-control calibrate`. It targets the already documented
#32388 hot world-update entry `0x738720` and requires the exact owned DR0 trap,
independent observer/process/world binding, and live-thread restoration/detach.
Only a calibration `PASS` reopens a single #32388 close-point retry at
`0x5a6e99`. A calibration `HOLD` or `REJECT` keeps the close experiment
closed and sends work back to PE32/CrossOver breakpoint delivery. The
pre-release instruction hit, whole-input consumption, genuine EOF and wider
result semantics remain unproven; no broader control or unknown-game execution opens.
