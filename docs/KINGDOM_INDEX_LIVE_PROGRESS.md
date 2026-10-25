# Kingdom Index — live candidate telemetry

**Measured progress and certified 100-point scores are different authority domains.** Existing Kingdom Index already polls its own API every 60 seconds; this change adds a separate 60-second candidate feed for browser, accessibility and evidence coverage without requiring a website rebuild each time the operator's observation changes.

## Candidate producer

The additive `scripts/kingdom_index_live_collector.py` uses only read-only GitHub REST requests to find the newest successful `renaissance-88-factory.yml` run, downloads its original Chrome artifact, verifies the SHA-256 against GitHub's artifact digest, checks `coverage.json` schema, source SHA, emitted BUILD_ID, 88 route statuses and absence of grade claims, and derives axe affected-route counts only from measured raw route receipts. It atomically replaces a tiny JSON file only when a new successful run and artifact are present. On failure it leaves the last good observation intact so it can become STALE, never silently resets it to green.

Run with a read-only GitHub token in environment when available. Do **not** store tokens in source, a browser bundle or the public API. Only the private feed path must be configured in the website service environment; example:

```sh
export KINGDOM_INDEX_LIVE_PROGRESS_PATH=/PRIVATE/APP_UID_0700_DIR/kingdom-index-live.json
python3 scripts/kingdom_index_live_collector.py --output "$KINGDOM_INDEX_LIVE_PROGRESS_PATH"
```

That path is an illustrative placeholder, NOT an installation instruction. On HEL1, use the existing canonical website service identity and its approved private data directory. Both directory and feed must be owned by that service user, with 0700/0600 permissions. Verify its production filesystem, user and release governance before enabling the unit. No protected retention cleanup or Wolo service changes.

Suggested approved systemd timer: a fixed-read-only `Type=oneshot` service with `User=<WEBSITE_SERVICE_USER>`, `WorkingDirectory=<DEPLOYED_APP_PATH>`, `ExecStart=/usr/bin/python3 <DEPLOYED_APP_PATH>/scripts/kingdom_index_live_collector.py --output <PRIVATE_FEED_PATH>`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=<PRIVATE_FEED_DIR>`, no wallet/db permissions, plus `OnCalendar=*:0/5` timer with randomized 30-60 second delay and a hard execution timeout. Do not install raw placeholders. GitHub artifact download is triggered only for new successful run IDs; failures remain visible in operator logs.

## Website display contract

`GET /api/kingdom-index/live` reads this file on each GET without any write, filesystem scan, GitHub network call or credential exposure. It rejects symlinks, bad mode/owner, malformed counts, unknown routes, forged scores, bad hashes, unsupported CI links, and future timestamps. Observations are explicitly STALE after 36 hours; the UI also warns on a lost connection. The screen shows candidate PASS/88, not-PASS/88 and verified axe affected/scanned routes, plus candidate per-route status and exact CI source and build. No candidate grade is ever injected into official `/api/kingdom-index` scoring.

**Static inventory counts** such as 146 page templates or 276 handlers are build-source properties and cannot change on a deployed version until that version changes. **Runtime and historical CI observations** can update from producer receipts between deployments. The original independently signed criterion ingress already reads private evidence on each API GET and can show authenticated partial progress once the release/reviewer acceptance ceremony is completed.

## Acceptance before website-only deploy

Review source-census 146/276, Type/Node/Next/isolated PostgreSQL, dynamic API refusal tests, mobile keyboard and screen-reader output, 88-route browser regression, and DocsV2 reviewed source baseline. Obtain signed owner release authority and rollback; confirm deployed SHA/BUILD_ID, timer service account and private feed boundaries. Observe two legitimately different verified CI receipts on the deployed Index without rebuilding. Preserve held finance/WOLO flags; don't run any protected storage scans.