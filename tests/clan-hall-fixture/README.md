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
