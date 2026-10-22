---
id: "aoe2war.app-prodn.release-flight-recorder"
title: "AoE2WAR Release Flight Recorder"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "observational-evidence-only"
reviewed_at: "2026-10-22"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Release Flight Recorder

The one-click **Release Flight Recorder (evidence only)** GitHub Actions workflow
answers a recurring engineering handoff question: *which source SHA, PR head
and check conclusion actually existed when someone claimed a Satchel release
was ready?* It is not the release controller or financial approval.

## Run it

Go to **GitHub → app-prodn → Actions → Release Flight Recorder (evidence only)
→ Run workflow**. Select the branch containing this workflow and supply the
current AoE2WAR and WoloChain candidate PR numbers. The historical defaults
are #801 and #82; enter new PR numbers as the release evolves.

The workflow reads current PR heads, both repository main heads, exact-head
GitHub check runs, and the state/body hash of WoloChain financial issue #5.
It generates a rendered step summary and three 14-day GitHub Actions artifacts:
release-evidence.json, release-evidence.md and release-evidence.sha256.

The SHA256 detects changes to the downloaded report bytes. It is **not** a
financial signature, custody attestation, authenticated bank evidence or
production release permit.

The workflow has only read permissions. It does not contact aoe2war.com,
production VPS, PostgreSQL, signers, wallets, Keplr or chain RPC endpoints.
It cannot deploy, spend, sign or alter live configuration. An inaccessible
cross-repo source, moving PR head, absent exact check, skipped required check
or malformed input is treated as **UNVERIFIED / PENDING / RED**, never GREEN.

If WoloChain becomes private, a token with specifically scoped cross-repository
read permission may be required. Without access, the report stays UNVERIFIED;
**never grant write permission to fix an evidence-read gap**.

## Local invocation

Run the offline regression suite:

    python3 -m unittest discover -s tests -p 'test_release_flight_recorder.py' -v

Then, with optional GH_TOKEN read access:

    python3 scripts/release_flight_recorder.py --app-pr 801 --wolo-pr 82 --output-dir /tmp/aoe2war-flight-recorder

--strict-source exits with code 2 unless every mandatory source check is
green. Even GREEN does not imply deployment readiness: the fields
production_deployment_authorized=false and
financial_activation=HARD_HOLD_UNCERTIFIED are unconditional.

## Maintenance

This observer is deliberately separate from protected release scripts,
betting engines, original-LIVE admission, custody, Traffic and the financial
release workflow. Update exact required GitHub job names and tests together
if the canonical CI contract changes. Do not turn its evidence report into
a substitute for issue #5, independent operator/witness approval, solvency,
vault custody or the existing protected deployment controller.
