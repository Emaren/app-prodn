# WoloChain original daemon console — source-pinned restoration contract

Owner-approved UX: keep the **new upper LIVE WOLOCHAIN BLOCKS** card, restore the **lower WOLOCHAIN DAEMON** tile to its historical April 1, 2026 console behavior. Do not redesign `WoloChainTerminalTile.tsx`.

## Exact provenance
- `ae00f832b` (April 1): original CometBFT ANSI parser, plain white mode.
- `de8850c40` (April 1): click-anywhere Easter egg toggles `wolo-daemon-view` plain/premium.
- `63559ef62` (May 25): real `wolochaind-mainnet` journal endpoint.
- `bdf8d7974` (November 13): protected journal endpoint replaced real lines with static operator-only text.

## Architecture: real lines, public-safe projection, never public journal access
1. The separately approved protected operator root-installs **exactly** `scripts/wolo_public_daemon_feed_v1.py` into `/usr/local/libexec/aoe2war/wolo_public_daemon_feed_v1.py` (root:root 0500), plus the exact source-pinned one-shot unit and timer. Preserve SHA-256 of all source and original unit state, with installation-only receipt and inverse.
2. Operator creates root-owned `/var/lib/aoe2war-wolo-public-daemon-v1` with mode **0755**. The restricted one-shot root collector reads only `journalctl -u wolochaind-mainnet.service -n 60 -o cat`, filters **six known real block-processing event shapes**, rejects all unexpected events/fields/controls, and atomically publishes only `feed.json` as **root:root 0644**. It is not a daemon restart and cannot issue blockchain transactions.
3. The website endpoint reads ONLY this exact fixed projection file with no arbitrary path, env variable, journalctl, subprocess, socket, HTTP log proxy, or private operator access. It verifies root ownership, no symlinks, bounded bytes/line count, known schema/source, event names and <=15s freshness; stale, missing and invalid feeds fail closed to restricted status.
4. Existing `WoloChainTerminalTile` fetches every 3 seconds, displays **exact admitted journal fields** in plain white text by default, and reveals original gray timestamps / green INF / bold event / turquoise fields after a click. Click again to return plain. The original localStorage preference survives. No fake block lines.
5. Finance settlement/custody/funding remain quarantined; existing ports 8092–8095 closed. The RPC status/upper LIVE WOLOCHAIN BLOCKS tile remains entirely separate.

## Pre-release and negative acceptance
- Independent operator inspects real journal patterns, samples rejection set for secrets and unexpected events, hashes approved source against installed root bytes, runs no-write production simulation, then separately authorizes collector installation only.
- Confirm collector timer active, root-owned file mode+content+freshness, **40 genuine recent processing lines**, and actual advancing heights; no private fields or raw journal access to web OS account.
- Test anonymous endpoint has no path injection, command execution, credentials, or unauthorized chain writes; wrong ownership, stale/malformed/oversized feeds HOLD.
- Browser Emaren/Scribe and anonymous on /wolo: exact same LOWER daemon tile location, default white scroll, click to turquoise/green/white, second click back, storage preference; upper new block card remains.
- Run existing source/CI and protected Factory qualification, same-slot activate/rollback/reactivate/T10, preserve existing T10 runtime until separately accepted release.

This source change is **NOT** a root installation permit, accepted CI, authenticated production telemetry, or proof of a new live website build. Do not merge/deploy while the protected producer is missing.
