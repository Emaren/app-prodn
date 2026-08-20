---
id: "aoe2war.app-prodn.docs-player-war-archive-operations"
title: "Player War Archive Operations"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-08-20"
review_interval_days: 30
sensitivity: "internal"
---

# Player War Archive Operations

## Purpose

This runbook is the canonical operator path for answering questions such as:

> Did this AoE2WAR player upload a private War Archive document, and do the
> managed metadata and physical file agree?

It exists to prevent schema-based database guessing, shadow-database confusion,
and partial verification.

## Production authority

For AoE2WAR HD / `app-prodn`:

```text
production PostgreSQL database = aoe2hd_db
```

The sister AoE2DE database is:

```text
aoe2de_db
```

It is not HD truth even when the schema looks familiar.

`aoe2hdbets_shadow` and any other shadow/test database are development
environments and are never production evidence.

Do not discover the database by "first database containing the expected table".
Select the owning database explicitly.

## War Archive implementation contract

The private profile-document implementation is `lib/profileDocuments.ts`.

Metadata is stored in:

```text
managed_media_assets
```

A live profile document has:

```text
kind   = 'document'
target = 'profile-documents-' || <player uid>
active = true
```

Stored references use:

```text
profile-document:v1:<uid>/<YYYY>/<MM>/<uuid>.<ext>
```

The effective byte root is `PROFILE_DOCUMENT_UPLOAD_DIR` when explicitly
configured. Otherwise production defaults to:

```text
/mnt/HC_Volume_105319120/aoe2war/profile-documents-private
```

The implementation creates UTC year/month subdirectories.

Current per-player limits are:

- 25 MB per document;
- 30 active documents;
- 250 MB total active document bytes.

War Archive documents are private owner/admin material. They are not Workshop
artifacts and do not become public because the Workshop mentions the feature.

## Canonical read-only metadata inspection

Run on the VPS. Set the exact canonical player UID first.

```bash
PLAYER_UID='u_REPLACE_ME'

sudo -u postgres psql \
  -X \
  -d aoe2hd_db \
  -v ON_ERROR_STOP=1 \
  -v uid="$PLAYER_UID" \
  -P pager=off <<'SQL'
BEGIN READ ONLY;

SELECT
  uid,
  in_game_name,
  steam_id
FROM users
WHERE uid = :'uid';

SELECT
  id,
  key,
  kind,
  target,
  original_name,
  mime_type,
  size_bytes,
  active,
  url,
  uploaded_by_uid,
  created_at,
  updated_at
FROM managed_media_assets
WHERE kind = 'document'
  AND target = 'profile-documents-' || :'uid'
ORDER BY created_at DESC, id DESC;

COMMIT;
SQL
```

This is intentionally an explicit `aoe2hd_db` query inside a read-only
transaction.

Do not use bare `psql` from a root or arbitrary shell and assume it selected the
application database. Peer/default identity can select the shell user or a
different database. Do not use the HD/DE schema resemblance as a selector.

## Canonical physical-file inspection

Use the same exact UID:

```bash
PLAYER_UID='u_REPLACE_ME'
ROOT='/mnt/HC_Volume_105319120/aoe2war/profile-documents-private'

if [ -d "$ROOT/$PLAYER_UID" ]; then
  find "$ROOT/$PLAYER_UID" \
    -maxdepth 3 \
    -type f \
    -printf '%TY-%Tm-%TdT%TH:%TM:%TSZ %s %p\n' \
    | sort
else
  echo "No private War Archive directory for $PLAYER_UID"
fi
```

If production has an explicit `PROFILE_DOCUMENT_UPLOAD_DIR` override, use that
effective root instead of the default above.

## Full upload verification

A complete managed-upload verification requires both sides:

1. canonical player identity resolves in `aoe2hd_db`;
2. `managed_media_assets` contains the expected active document row;
3. the row has `kind='document'`;
4. the target is exactly `profile-documents-<uid>`;
5. the row `url` begins with `profile-document:v1:`;
6. the referenced file exists beneath the effective private root;
7. the physical path remains inside that root;
8. size/name/timestamp evidence is consistent with the managed row.

A metadata row without bytes is incomplete storage evidence.

A private file without the managed metadata row is not proof that the user
uploaded it through the War Archive product.

For the normal "did the user upload the document?" question, require the
managed row **and** the corresponding physical file.

## Privacy and safety

- Do not print or copy document contents unless the task explicitly requires
  opening the private document and the operator has authority.
- Do not move private files into `public/`, nginx roots, Workshop media roots, or
  general managed-media public storage.
- Do not repair missing metadata or bytes while performing a verification
  query.
- Do not use a shadow database as fallback evidence when production truth is
  unavailable; report the production check as unresolved instead.
- Never expose database URLs, credentials or unrelated private user data in a
  diagnostic transcript.

## When truth disagrees

If metadata exists but the file is missing, or a file exists without its
managed row:

1. stop at diagnosis;
2. record exact UID, row ID/reference and physical path evidence;
3. do not fabricate or silently heal the missing side;
4. inspect application/service logs and storage history;
5. perform repair only through a separately reviewed recovery procedure.

## Related authority

- `lib/profileDocuments.ts` — implementation and storage contract
- `prisma/schema.prisma` — current Prisma model
- `prisma/migrations/20260615_103000_add_managed_media_assets/migration.sql`
  — physical metadata table
- `ARCHITECTURE.md` — application/database boundary
- `docs/WORKSHOP_ARCHITECTURE.md` — public Workshop/privacy boundary
- `docs/OPERATOR_START_HERE.md` — fresh-session authority and recovery rules
