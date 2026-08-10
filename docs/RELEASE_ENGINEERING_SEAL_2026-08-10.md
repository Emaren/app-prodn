---
id: "aoe2war.app-prodn.docs-release-engineering-seal-2026-08-10"
title: "AoE2WAR Certified Release Engineering Seal — 2026-08-10"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "release-evidence"
reviewed_at: "2026-08-10"
review_interval_days: 0
sensitivity: "restricted"
---

# AoE2WAR Certified Release Engineering Seal — 2026-08-10

## Lifecycle

This is frozen historical release evidence.

For current operation use `DEPLOY.md`, `docs/RELEASE_ENGINEERING.md`, and
`aoe2war status`. Do not rewrite this document to follow later production
deployments.

## Final certified production identity

The final release-engineering deployment completed at
`2026-08-10T04:12:44.738278Z`.

| Layer | Identity |
|---|---|
| Implementation SHA | `3a01a658f0a2c875a25447877336c7bb705ca244` |
| Release SHA | `f77413662e7819eb82a180f2a01f8a181f56bfe4` |
| Previous production SHA | `59188800b9797243109877666cfa18850320e7f2` |
| Active BUILD_ID | `jC7k39PxGZyNOGoJzwHEP` |
| Build version | `20260810040737-108deccc84` |
| Artifact SHA-256 | `e28979037cfe4cf836fb50770975ee088e153c2cac73c614499f4ee401d11805` |
| Gate SHA-256 | `32ad5281032c8683f2eb59673cdf5cb3804335889934bbe5fa3db0200a040d61` |
| Manifest SHA-256 | `c0af09a10583727341d616bf2c238158063ded911374648925fc59148e5d9194` |
| Service | `aoe2hdbets-web.service` active on `127.0.0.1:3030` |
| Public version parity | `YES` |
| Provenance | `CERTIFIED` |
| WOLO | `8092=UP`, `8093=UP`, untouched |

Local activation receipt:

```text
.aoe2war-release/activation-receipts/
f77413662e7819eb82a180f2a01f8a181f56bfe4-e28979037cfe.json
```

Durable activation/deployment receipt:

```text
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/
activate-20260810T041046Z-f77413662e78
```

Durable prior-runtime rollback:

```text
/mnt/HC_Volume_105319120/aoe2war/rollbacks/
activate-20260810T041046Z-f77413662e78
```

Fast rollback created by the final activation:

```text
.next-rollback-activate-20260810T041057Z
```

## Final release proof

The final deployment passed:

- exact documentation baseline generation;
- 86 release-engineering tests;
- explicit Python compilation including rollback tooling;
- exact GitHub publish;
- SHA-bound release manifest;
- stage-beside-live;
- zero-mutation activation preflight;
- candidate artifact verification;
- internal and public critical-route proof;
- 60-second / six-sample post-activation health soak;
- exact source/build/version/content proof;
- protected WOLO continuity;
- post-certification fast-rollback retention;
- independent final provenance proof.

The final activation reported:

```text
Health soak:    60s / 6 samples  PASS
Fast retention: PASS  keep=2  pruned=2  reclaimed=1653296KB  unmatched-kept=0
PASS: RELEASE ACTIVATED + CERTIFIED — WOLO UNTOUCHED
PASS: RELEASE SHIPPED + CERTIFIED — WOLO UNTOUCHED
```

`unmatched-kept=0` describes the managed
`.next-rollback-activate-*` / `.next-rollback-manual-*` retention namespaces
encountered by that final pass. Older legacy rollback directory names outside
those namespaces were not candidates and were not deleted.

At final certified status, root free space was approximately `6665228 KB` and
mounted-volume free space approximately `14079376 KB`.

## Operator CLI seal

The repository operator command is:

```text
bin/aoe2war
```

Tony's MBP installed:

```text
/Users/tonyblum/bin/aoe2war
```

as a tiny wrapper that execs the repository command.

The verified operator surface is:

```bash
aoe2war status
aoe2war context
aoe2war deploy
aoe2war releases --limit 5
aoe2war rollback --dry-run
aoe2war rollback
aoe2war gate
aoe2war manifest
```

The global wrapper is workstation configuration, not a second release engine.

## Deployment lock

Mutating release commands are serialized through
`.aoe2war-release/deploy.lock` using a non-blocking `flock`.

The lock records holder PID/command metadata and fails closed when another
mutating release command already owns the lock.

This protects against two terminals, two agents, or an accidental double deploy
racing production mutation.

## Certified release history

The release engine gained a read-only activation history backed by certified
activation receipts.

At the final seal, recent history included:

1. `f77413662e...` — build `jC7k39PxGZyNOGoJzwHEP`;
2. `59188800b9...` — build `MSKLZN_QPyCD62yLhWqz7`;
3. `59188800b9...` — build `FH5Vj53CNXP37Mv1GZVn-`;
4. `c93b5a36c4...` — build `sro3ZPbf0ZWcC8PLtM4Rw`;
5. `6208cecc0e...` — build `zNyuVFGNQJN3IWyElit3K`;
6. `83ae6daae3...` — build `5Y4JSNQzBjO1yd0L7El5K`.

The two different certified builds for release `59188800...` prove why Git SHA
and runtime artifact identity must remain separate.

## Live certified rollback fire drill

The rollback feature was not accepted on unit tests alone.

### Dry-run proof

From certified release:

```text
59188800b9797243109877666cfa18850320e7f2
BUILD_ID FH5Vj53CNXP37Mv1GZVn-
```

the dry run resolved the immediately previous certified target:

```text
c93b5a36c410a1eb544c7513dc6cbdf9baffef69
BUILD_ID sro3ZPbf0ZWcC8PLtM4Rw
version 20260810031910-0df202d3c2
```

and ended:

```text
PASS: CERTIFIED ROLLBACK PREFLIGHT — ZERO PRODUCTION MUTATION
```

### Live rollback

The real rollback restored the exact target source/build/version, kept the web
service active, preserved public version parity, and left WOLO unchanged.

It created forward rescue:

```text
.next-rollback-manual-20260810T034034Z
```

and local receipt:

```text
.aoe2war-release/rollback-receipts/
59188800b979-to-c93b5a36c410-20260810T034049Z.json
```

The post-rollback state correctly reported repository-level `PUBLISHED`
because GitHub/main remained on the newer release while production deliberately
served the older certified release.

### Forward recovery

The newer `59188800...` source was then deployed again through the ordinary
one-command pipeline and rebuilt as:

```text
BUILD_ID MSKLZN_QPyCD62yLhWqz7
version 20260810034928-269df5113e
```

It reached `CERTIFIED` with exact Mac/GitHub/production parity.

This proved the complete path:

```text
new CERTIFIED
  -> rollback dry-run
  -> previous CERTIFIED live rollback
  -> forward rescue preserved
  -> ordinary deploy
  -> new CERTIFIED again
```

## Storage/retention fire-drill finding

Before bounded retention was automated, the production root contained nine fast
rollback directories totaling approximately `4309 MB`.

The audit found:

- five modern large rollback/rescue directories with durable BUILD_ID evidence;
- four small legacy August 9 directories with no durable match.

The safety audit stopped rather than claiming all nine were deletable.

A guarded manual reclaim then removed only three older modern copies whose
durable twins were proven, reclaiming roughly 2.4 GB and moving root usage from
89% to 83%. The four unmatched legacy artifacts were left untouched.

The final release engine then encoded the policy:

- manage only `.next-rollback-activate-*` and `.next-rollback-manual-*`;
- require a durable BUILD_ID twin;
- keep the newest two verified fast copies by default;
- never auto-delete unmatched state;
- run retention only after certification;
- make retention failure non-fatal;
- re-prove active runtime and WOLO continuity afterward.

The final activation automatically pruned two additional verified redundant
modern copies and reclaimed `1653296 KB`.

## WOLO invariant

Throughout staging, activation, health soak, rollback fire drill, forward
recovery, retention, and final deployment:

```text
8092 = live
8093 = live
mutation = forbidden
```

The release engine observes these settlement surfaces as protected
dependencies. It does not claim chain, wager-custody, payout, or settlement
authority.

## Remaining boundary

The automated release lane intentionally refuses Prisma migration releases.

A future controlled migration lane may be justified when migration frequency
makes it worthwhile, but at this seal fail-closed refusal is the correct
behavior. Multi-node blue/green, canary scoring, fleet orchestration, and
similar distributed-deployment machinery are beyond the useful scope of the
current one-VPS architecture.
