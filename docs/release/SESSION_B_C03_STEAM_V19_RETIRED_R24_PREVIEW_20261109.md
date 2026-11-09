---
id: "aoe2war.app-prodn.session-b-c03-steam-v19-retired-r24-preview-20261109"
title: "C03 Steam V19 exact retired R24 preview admission and guarded service repair"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "source-pinned Steam-only 3031 retirement repair without financial release"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 Steam V19 exact retired R24 preview admission and guarded service repair

## Incident: real V18 HOLD after formerly unobserved protected 3031 source

After source-pinned R25 b1ef public release was retained in production PID465815, the unrelated old parallel R24 web process on 3031 PID1483304 was stopped under a root-only receipt. The preview had zero Nginx selectors, zero established connections, no reverse service dependents, a disabled-at-boot systemd unit and 0.5GiB MemoryCurrent before removal. This one-service operation preserved the live protected 3032, original restricted 3030, validator, masked legacy finance and all closed 8092–8095. Quiesce receipt SHA256 38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3.

Extended Steam V18 timer refresh subsequently failed with HOLD_STEAM_V18 PRESERVED_PREVIEW_PID_DRIFT. The original immutable scripts/r25_c_start_root.py line680 still pins preview MainPID 1483304 through original source V5Z. This obsolete predicate survived previous V18 adoption. The failure is genuine, not a reason to bypass nft or re-enable financial services. Website PID465815 stayed alive and Steam failed closed. Explicit corrections were posted to App #1212 and Chain #239.

## Strict real retired-preview admission

V19 is derived from reviewed V18 Steam source: original V5Z, original C03 observer guard V9, original C04 masked listener guard V11, exact two inert C01 source/base/drop-in guards, secured PG/3030/3032 source, original 3355443200-byte memory cap, restricted UID, protected nft socket and Steam TLS SNI are untouched. Only the single old C03 requirement PRESERVED_PREVIEW_PID_DRIFT can be superseded, **after** all of the following are independently confirmed: root-mode0400 byte-exact quiesce receipt with fingerprint 38cec; archived PID1483304, present repaired PID465815, original rollback PID2625090 and old V18/web source identity; R24 systemd unit disabled and inactive with MainPID0, no daemon reload; exact unit_config SHA a634e21312ba4b1226f81bcd26634b54eb00a715ace47069d5491f1b5291f79f; no 3031 listener, no routing selector or reverse dependent; never any money, finances or role change. No fake old process PID is inserted into a snapshot.

The AUTHENTIC current snapshot SHA is 3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15, and the reconstructed exact pre-C01 inactive-unit snapshot is 2dec2527fad7a53730a998898e26bc94b6d2c8c930db80aa7de1b44578a20f42. Independently verified unchanged nft shape SHA985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af. Existing C01 exact source constants remain independently pinned to old 6bef and 064a values before only these two new expected canonical snapshots are installed **in memory**; the real C01 role/ELF/command/drop-ins and all other FIN/C04 checks remain unchanged.

The V19 root-private source was physically copied to HEL1 without starting any service. Its authentic read-only native_snapshot() returned PASS after all C01/C03/C04 protected checks. Source SHA256 76f48e21de2bc504af121f1c0ae91a8353b72b51bac360ddb7d3f7a24468ba1c, systemd unit SHA256 99df0015a6eeb8ad218ab703fd2b1db5daba3ff4b9bbabb87211d3f042ae1892. This was not a production Steam refresh.

The separate one-use root installer source reads only exact source, root receipt and v18 accepted runtime, inspects without mutation, stages v19 root-only policy artifacts, quiesces only the Steam timer/oneshot, installs exact V19 Steam unit and source, proves selftest/inspect, re-enrolls V19 against actual retained PID465815, executes one real refresh and resumes timer. If any checkpoint fails it restores the exact prior V18 service unit, preserving fail-closed state rather than fabricating a successful Steam policy. No website, nginx or database mutation and no 8092/8093/8094/8095 use.

## Release/acceptance limits

Never execute the installer until the exact reviewed source/test PR CI is green, physical read-only --inspect passes and the immutable V18 rollback unit is available. Even successful first V19 refresh is not durable across multiple lease boundaries, signed-in user acceptance, C03 financial writer acceptance, or a complete authenticated V18/V19 rollback-and-return. The independent source-pinned C03 roundtrip draft #1282 is held while Steam correction is unresolved. C03_APP_HANDOFF_ACCEPTED=HOLD, C02_APP_TRANSPORT=HOLD, no owner financial permission.
