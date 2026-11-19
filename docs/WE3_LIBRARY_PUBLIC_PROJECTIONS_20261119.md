---
id: "aoe2war.app-prodn.we3-library-public-projections-20261119"
title: "WE3 Library Public Read Projection Contract"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-only-library-review"
reviewed_at: "2026-11-19"
review_interval_days: 30
sensitivity: "internal"
---

# WE3 Library Public Read Projection Contract

**SOURCE ONLY · ZERO PRODUCTION DB/ROLE CHANGES · WE1 SQL ACCEPTANCE AND WE2 INSTALL REQUIRED.**

## Actual failure, narrower remedy

The public site has observed `SQLSTATE 42501 permission denied for table
user_activity_events`, and player Library/Activity returns HTTP 503/500.
A website-role unrestricted SELECT on raw activity or watcher tables would
expose event/private metadata. It must not be granted.

WE1 WoloChain draft #248 source-only filtered read model:
`scripts/c03_library_public_projection_candidate.sql` (blob
`a051c6ca688e4653a2a6423f420afc44020606ec`), separate exact inverse
`scripts/c03_library_public_projection_inverse_candidate.sql` (blob
`a472c349acae55e21c48508e594dd5a946fcff86`).
WE1 explicitly requires separate source-qualified NONFINANCIAL owner
substitutions for two existing event tables. This WE3 candidate does
not infer or install the owners, perform SQL grants or change finance.

## Exact application read boundaries

`lib/libraryPublicProjection.ts` contains four **literal, parameterized
SELECT queries** against only these WE1-owned, new-object views:

- `aoe2war_library_activity_public.replay_uploads`: latest 64 public
  replay-upload receipts for Activity and all package receipts for historical
  game-ID correlation. The view returns a strict metadata whitelist:
  packageUpload, viaWatcher, received/uploaded/parsed/resultReady/duplicate/
  failed counts and gameIds. No original filenames, IP, headers, arbitrary
  metadata, wallet or private telemetry is selected or emitted in JSON.
- `aoe2war_library_watcher_public.batch_receipts`: latest 512 allowed
  Watcher batch-state events in a **bound six-hour window**, and all successful
  hash-bearing receipts for per-user replay provenance. No raw watcher
  metadata/IP/header fields. The application never returns the sessionId or
  watcherId as unfiltered private metadata.

The already-existing public replay/gameStats/user reads remain separate.
Account names use only uid, inGameName, steamPersonaName. Events with
missing user relations display an unknown actor rather than throwing.
All output remains no-store. Historical filters preserve exact provenance
and distinguish unknown from source-attested Watcher/ZIP. Source read
failures return 503 with unavailable wording; **never synthesize zero
activity or filtered totals** when a view is absent.

## Actual restricted UID650 disposable PostgreSQL 16 acceptance

Using a fresh private Unix-socket-only PostgreSQL 16 cluster, WE3 executed
the exact pinned upstream SQL fixture and its no-CASCADE inverse with distinct
nonfinancial event owners and a restricted website reader. **6/6 tests PASS**
(including 5 source/denial checks): original event/sequence ACLs before, during
and after match; sanitized replay receipt and successful Watcher receipt are
visible; private event classes, IP/headers/arbitrary JSON and financial table
reads are blocked. The originally seeded financial row remains unchanged.
Temporary cluster stopped and removed. This does **not** prove real HEL1
owner substitution, live metadata schema, complete authorization or installation
permission.

## Admission and rollback

WE1 must independently prove both original event owners, role graph,
column whitelist and field semantics against actual HD + DE, and verify
the signed SQL/inverse do not alter any legacy raw ACL/attacl/proacl, make
financial grants or expose unauthorized event JSON. WE2 alone can install
an owner-authorized source-bound projection and T10 the website release.

WE2 may separately deploy the PRODUCT code ONLY if missing projections
fail closed (503) until the corresponding read SQL is admitted. No direct
legacy raw event fallback is permitted.

Browser postflight: GET Library Activity and game history under existing
ordinary Scribe account; verify real dates, truthful pagination, filters,
unknown source classification, 503 on view removal, no private event
metadata/financial data returned. Repeat anonymous denial where relevant,
plus admin Emaren session continuity. Confirm prod source/build headers and
rollback restore the exact prior code/bytes. **No deployment claimed here.**
