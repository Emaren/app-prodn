# R25 Deployment OS — website-only parallel v1

Status: additive policy source, **NOT approval to deploy**. P0 is frozen website #1061 (0cee3c836c4b0760478280c145e02e81e470ce0e) on separate 3031, followed by owner-authorized nginx-only route. Never stop or restart the original possibly settlement-capable 3030 PID. Wolo/finance remain untouched.

## Existing machinery — inventory and preservation

| Existing file | Existing capability | R25 boundary |
|---|---|---|
| bin/aoe2war | deploy, release, releases, rollback, finish, gate, manifest, context | All existing commands remain unchanged |
| scripts/aoe2_release.py | canonical global release lease, certified runtime, release history | Preserve original FD200 release.lock and certification |
| scripts/aoe2_release_ship.py | source, stage receipts and governed in-place activation | Do not use original old-web restart on parallel release |
| scripts/aoe2_release_rollback.py | validated fast and durable certified rollback | Preserve historical certification/receipts; no deletion |
| protected controller #1063 | full-finance owner-RSA, six real producer signers, six real restores | Remains mandatory for original finance policy; do not fake it |
| D #1079 | reviewed website-only release-scope checks | Reuse source review; do not silently waive it |
| F #1083 | owner/root-SSH nginx-only 3030-to-3031 transaction | **Sole operator** for physical route changes and restoration |

## Versioned parallel state machine

Policy discriminator: aoe2war.deploy-os.website-parallel.v1. Source: scripts/aoe2_deploy_os_web_parallel.py. It is based on frozen #1061 and adds no changes to old release machinery.

| Transition | Required authenticated evidence |
|---|---|
| New to SOURCE | F pinned exact #1061 source/old PID and immutable attempt and B/C/D/E/F/G **source-review SHA** (NOT six original signing identities) |
| SOURCE to STAGED | C exact artifact SHA + Next BUILD_ID; E numeric peak-space budget and durable rollback readback SHA |
| STAGED to ISOLATED | B server-enforced SELECT-only DB, WarGraph disabled, no finance secrets/writes/unknown startup edges |
| ISOLATED to RUNNING | C isolated new service on 3031, old 3030 PID/start unchanged, exact staged build; B runtime |
| RUNNING to ROUTED | F nginx config preimage and route proof, owner typed plan/route phrase with independently verified root nonce and original release lock **held**, B protected finance and Wolo unchanged |
| ROUTED to VERIFIED | G actual internal and public HTTP, exact Next BUILD_ID/artifact/source/PID and old PID, B unchanged finance |
| VERIFIED to CERTIFIED | F actual rollback exercise and exact staged rollback SHA, G live proof, B invariants |
| ROUTED / VERIFIED / CERTIFIED to ROLLED_BACK | F actual old nginx route restored, G original public BUILD_ID, B protected finances unchanged |
| Active to HOLD | Scoped P1 subsystem blocker. Return only to previous state with independently verified F P1 resolution receipt |

A HOLD after ROUTED is **not** evidence of actual restoration. F must execute nginx restore and G verify the original public build. No policy module action is a production operation.

## Trust, owner consent and append-only history

Every witness is referenced by SHA256 and resolved by F's independently reviewed root/source-authenticated verifier callback, which must check actual received bytes, source pins, issuer, authenticated HEL1 origin, plan/attempt identity, and real observation. A user-supplied JSON PASS or ordinary GitHub commit is not authority. Without a trusted resolver admission is HOLD. The local unit tests use explicitly synthetic witnesses only.

The typed consent phrase derives from the full immutable plan SHA and exact nginx route receipt SHA. The phrase alone is NOT owner authentication: F/C must bind it to authenticated Mac-to-root SSH, root O_EXCL one-use audit, and the original FD200 lease held across routing. Original RSA public trust and six-signature full-finance process remain unchanged.

Journal(root, owner_uid=0) stores numbered root-owned 0600 records in an existing root-owned 0700 directory. O_NOFOLLOW, O_EXCL, flock, file and directory fsync, sequence continuity and SHA256 hash chain. Event fields: schema, sequence, timestamp, plan_sha256, previous_sha256, event_sha256, from_state, to_state, priority, role-to-evidence refs, scoped blocker, immutable staged artifact / Next BUILD_ID / rollback bindings. Tampering and gaps HOLD. This ledger does not itself acquire FD200 or seal an off-host audit; F must do that.

## Operator interface

Implemented read-only commands:

    python3 scripts/aoe2_deploy_os_web_parallel.py capabilities
    python3 scripts/aoe2_deploy_os_web_parallel.py operator-interface
    python3 scripts/aoe2_deploy_os_web_parallel.py task-schema
    python3 scripts/aoe2_deploy_os_web_parallel.py ledger-status --journal-dir ROOT_OWNED_DIR

Future F-integrated command namespace (SPECIFICATION ONLY; no bin/aoe2war edits):

    aoe2war deploy-os website-only parallel status
    aoe2war deploy-os website-only parallel plan
    aoe2war deploy-os website-only parallel stage
    aoe2war deploy-os website-only parallel isolate
    aoe2war deploy-os website-only parallel run
    aoe2war deploy-os website-only parallel route
    aoe2war deploy-os website-only parallel verify
    aoe2war deploy-os website-only parallel certify
    aoe2war deploy-os website-only parallel rollback

The existing command dispatcher and rollback engine are not replaced.

## Agent/task ledger schema: eventual 1,000 sessions, never a P0 prerequisite

Strict schema: aoe2war.deploy-os.agent-task.v1, validated by task_check.

Fields: schema, task_id (stable), lane (B/C/D/E/F/G/CENTRAL), session_id, priority (P0/P1/P2/P3), objective, depends_on (task IDs), status (QUEUED / ASSIGNED / EVIDENCE_SUBMITTED / REVIEWED / BLOCKED / CLOSED), source_sha, evidence_refs (SHA256s), blockers ({subsystem,code,evidence_sha256}), reviewed_by, timestamp. Future task updates append event receipts, never infer an agent is actively running from a comment. Separate old task attempts from new ones.

Priorities: P0 website LIVE_VERIFIED and rollback; P1 direct P0 blockers; P2 approved standing engineering queue; P3 orchestration and fleet maintenance. task_check prevents an ORCHESTRATION blocker on a P0 task. A 1,000-agent scheduler must never be required for this website release.

## Tests and integration

    python3 -m unittest discover -s tests -p 'test_aoe2_deploy_os_web_parallel.py' -v

23 focused synthetic tests cover stage progression, fake/absent verifier, B isolation/WarGraph and DB role, E bytes/rollback, original PID, consent/FD200, finance/Wolo drift, G live, F certification, scoped HOLD and tamper-evident journal. These tests are not root/physical production evidence.

F must independently review, integrate B/C/E/G production receipts with its root-SSH adapter and nginx-only runner, reseal canonical DocsV2 and obtain CI and owner-specific approval. Do not merge this source and presume the website is live.
