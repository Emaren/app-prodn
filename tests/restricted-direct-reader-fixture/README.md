---
id: "aoe2war.app-prodn.restricted-direct-reader-fixture"
title: "Restricted Direct Chat release regression contract"
type: "runbook"
status: "draft"
owner: "product"
systems: ["aoe2war", "app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-restricted-direct-chat-regression"
reviewed_at: "2026-11-26"
review_interval_days: 14
sensitivity: "internal"
---

# Restricted Direct Chat release regression contract

This source fixture is not production admission, a browser witness, or authorization to run SQL against HEL1.

## Mandatory pre-T6 checks

1. Exact source/build lineage includes canonical main; exact owner-source admission for the literal legacy dynamic attachment route, no general bracket/path exception.
2. Run the canonical Node contract inventory (the `restricted-direct-reader-contract.test.mts` wrapper registers the two focused suites and route-boundary checks).
3. Run the real PostgreSQL 16 fixture on the exact candidate checkout. The separate WE1 source directory must contain the exact SHA256-pinned install and synthetic fixture from WoloChain #265; no production data, secrets, or network DB access. Example:
   
   ```sh
   python3 -I -B tests/run_restricted_direct_reader_pg16.py --pg-bin /opt/homebrew/opt/postgresql@16/bin --we1-fixture /path/to/verified/wolochain/scripts/direct_inbox_reader_v1
   ```
   
   The runner creates a private disposable AF_UNIX-only PG16 instance, rejects root, exercises the restricted role, actual JWT verification, actual Next request/response classes, private image bytes and denied legacy Prisma fallback. Fixture socket client calls the actual sidecar core in-process; this is not a production AF_UNIX listener, NGINX, or browser test.
4. Require exact independent WE1 catalog/ACL preimage, signed narrow HD-only admission, DE deny, inverse/postimage evidence, and actual WE2 coordinated service/ingress/storage admission. Never grant raw private or financial table access.
5. T10 remains real Emaren Incognito/Scribe regular Chrome: send text/image, verify committed readback, recipient delivery, reload, image decode, unrelated actor denial, Clan Hall member text and image, Lobby text. No fake sessions, no account creation, no premature seal.

## Explicit current scope

The reader supports bounded summaries (100 threads and explicit overflow flag), 80-message history, 40 literal-search results, exact sync marker, private new-format PNG/JPEG/WebP metadata and committed readback. Historical unadmitted attachments, challenges/financial honors, legacy reactions, draft/pin actions and read receipts beyond delivered state are not claimed to work. Clan image admission is separate (#264). No GET mutation. The prior live T9 #1509 remains frozen until successor admission.

Evidence: M1 UID650 disposable PG16, 17 real signed core/DTO/storage checks and 15 actual Next HTTP response checks passed; one initial fixture module-resolution failure was corrected using a CommonJS facade to the installed actual Next classes. Neither the fixture nor a CI pass constitutes live browser acceptance.
