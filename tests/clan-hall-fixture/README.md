---
id: "aoe2war.app-prodn.clan-hall-restricted-regression"
title: "Restricted Clan Hall combined regression and native release gates"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war", "app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-clan-hall-regression"
reviewed_at: "2026-11-26"
review_interval_days: 14
sensitivity: "internal"
---

# Restricted Clan Hall combined regression and native release gates

Scope: active clan members only, local single PNG/JPEG/WebP up to 10MB, image-only body, no administrator override of image/history authorization. Text and image reads require the same signed-session UID, no raw web/sidecar database grants. Nonmember history, reactions, management, legacy media, remote images, video/audio, presence writes and Scribe replies are not admitted in this profile.

The canonical Node test inventory discovers the reader and image suites. Before T6 run the exact combined real PostgreSQL fixture against verified WE1 #264 and #266 source paths:

```sh
python3 -I -B tests/run_clan_hall_pg16.py --pg-bin /path/to/pgsql16/bin --we1-reader /path/to/verified/scripts/clan_hall_reader_v1 --we1-image /path/to/verified/scripts/c03_hd_clan_image_v1_install_candidate.sql
```

It uses a disposable socket-only PG16, exact input hashes, synthetic signed identities, actual restricted role, actual image decoder, idempotent file storage, history and metadata readers, and no production connection. The fixture adds the existing created_at column to the synthetic attachment table before applying the image SQL. Stop and remove the disposable instance on all paths. Fixture passing is not a live browser witness or release authority.

Actual native prerequisites: independent exact HD/DE catalog/ACL and dependency review for both SQL capabilities, signed root admission, sidecar/NGINX/R25 guard exact static /api/social/clan-image POST and distinct private writer/reader roots, paired service configuration and preserved rollback. Verify storage root ownership/mode and group, no new listener or financial access, no legacy read fallback. Require actual authenticated Emaren/Scribe member and nonmember evidence: one image posted, recipient refresh and decode, one same-key retry without duplicate, text reload, revocation denial and prior release rollback. Do not widen production privileges to get green UI.

Observed native fixture: 17/17 combined actual PostgreSQL/JWT/PNG/storage checks and 12 focused reader/image Node checks. New source must also pass full CI and independent Linux artifact verification. Record actual source, build ID, receipt and native/browser outcomes separately. This is not an authorization to mutate production.

## Release preflight learned from the November 26 CI failure

Run the following against the exact candidate in the designated PRODUCT commit bench (not an arbitrary temporary checkout). Use installed dependencies; never bypass the UID650 pre-commit guard or copy credentials into the PRODUCT lane.

1. Regenerate the page-change manifest with `python3 -B scripts/generate_page_change_manifest.py` and refresh the source census with `node scripts/kingdom_index_source_audit.mjs --write`. Inspect and commit only the actual derived deltas. Two private Clan APIs change the handler inventory from 293 to 295; they are not new public Index pages.
2. Run `node scripts/kingdom_index_source_audit.mjs --check`, the exact changed-file lint, and `python3 -B -m unittest discover -s tests -p test_renaissance_88_factory.py`. A clean committed checkout is required by the source census tests. Rerun the page-change generator and require no tracked diffs. The Linux exporter must continue refusing a dirty source tree; do not weaken it.
3. Refresh DocsV2 against the actual remote implementation commit, not a divergent local SHA. If the existing authorized GitHub connector is used for transport because the PRODUCT bench has no Git push credential, first verify the local hook-qualified commit and require the exact resulting Git tree hash and a fast-forward expected-head lease. Preserve the local qualified commit; do not fabricate review or native authority.
4. Keep the Direct Chat frozen artifact separate; the new combined source needs its own exact build. Report source/build/byte review, DB admission, runtime guard, owner permit and browser witness independently.
