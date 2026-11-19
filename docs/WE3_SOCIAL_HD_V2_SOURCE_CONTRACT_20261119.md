---
id: "aoe2war.app-prodn.we3-social-hd-v2-source-contract-20261119"
title: "WE3 HD-Only Restricted Social Gateway V2 Source Contract"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-only-restricted-db-handoff"
reviewed_at: "2026-11-19"
review_interval_days: 30
sensitivity: "restricted"
---

# WE3 HD-Only Restricted Social Gateway V2 Source Contract

**SOURCE ONLY. NOT A FINANCIAL PERMIT, ROOT INSTALLER, OR WEBSITE DEPLOYMENT.**

## Known real physical risks

WE1's original owner-present authenticated read-only catalog established that
HD social base objects are owned by `aoe2hd_user`; four legacy serial
sequences have raw NULL `relacl`, while eight original table ACLs are
explicit. HD `users` has real ON DELETE CASCADE references into seven
financial/wager/staking categories. DE has only seven of twelve named social
objects; **the gateway must only target `aoe2hd_db`**. The previous
`social_gateway_v1` proposal left elevated function ownership and an
unrestricted Direct SELECT capability. It is **REJECTED / DO NOT INSTALL**.

## Exact independent WE1 source, not recopied or modified

Canonical WoloChain draft PR #248, source head
`c3fb22b2c6d55e7b1fdb5c2736fa3cb67acd3818`:

- `scripts/c03_hd_gateway_v2_restricted_install_candidate.sql`, Git
  blob `f38636b7ea1b7efe178831e1a40a78dad5604749`.
- `scripts/c03_hd_gateway_v2_restricted_inverse_candidate.sql`, Git
  blob `1c11073a44643e90bd59ae36118432001772b1da`.
- `scripts/c03_hd_gateway_v2_physical_rehearsal.py`, Git
  blob `eca1fd003ca90129be6e6a5c4eb3f05bc2e0edfc`.

WE1 [real Linux PostgreSQL 16.15 run #44538479233](https://github.com/Emaren/wolochain/actions/runs/44538479233):
**51/51 PASS**, including original table/sequence/column raw ACL parity,
two signed-UID-parameterized high-level operations, persistent Clan/Direct
records, membership/recipient privacy, replay/cooldown, drafts and reply,
negative privileges and exact no-CASCADE inverse. This is source-only and
not proof of live deployment or that a stolen writer credential cannot spoof
a UID. Do not copy or commit the WE1 SQL into PRODUCT: the PRODUCT guard
forbids `.sql` executable artifacts and WE1 owns database acceptance.

## Restricted execution ownership

WE1's installation candidate creates only one new HD schema:
`aoe2war_social_hd_v2`, one external role `aoe2war_social_writer`,
and one **NOLOGIN / NOINHERIT / NOSUPERUSER** high-level executor
`aoe2war_social_exec_v2` with no inherited membership, original social
table or sequence grants, `public.users` DELETE or finance capability.

New **view ownership** is explicitly assigned to the original
`aoe2hd_user` for projection-only reads available exclusively to the
restricted executor. No external writer may SELECT global Direct
messages or the original social tables. Five new functions use fixed names
and schema-qualified object references:

- Three tiny leaf functions, owned by original `aoe2hd_user`, are
  restricted to approved fixed social operations: Clan INSERT;
  Direct pair and participant INSERT; Direct message INSERT + own receipt
  UPDATE / draft DELETE. No dynamic SQL, user DELETE or finance queries.
  The restricted executor alone can EXECUTE these leaves; the external
  social writer and PUBLIC cannot.
- Two high-level SECURITY DEFINER operations owned by the restricted
  NOLOGIN executor: `clan_text(text,text,text,text)` and
  `direct_text(text,text,text,integer)`. Only these two are executable
  by the external social writer, and PUBLIC execute is revoked. The
  executor cannot CREATE gateway objects after owner transfer.

Check owner and privilege postimage, PUBLIC function execution, direct
table/sequence denial, recursive FK/trigger/definer financial reachability
and exact inverse against real HD before any maintenance permit.
WE1's source test proves a bounded synthetic graph, **not** a complete
authority census or sidecar secret confinement.

## Actual WE3 application boundary

`lib/socialWriterCore.mjs` now issues only these **two fixed statements**,
parameterized in an explicit serializable transaction:

`SELECT aoe2war_social_hd_v2.clan_text($1::text,$2::text,$3::text,$4::text) AS decision`

`SELECT aoe2war_social_hd_v2.direct_text($1::text,$2::text,$3::text,$4::integer) AS decision`

The **first parameter is always the UID derived from the verified
sidecar-held signed session**, never from JSON body, URL or a client
header. Allowed request fields are strictly limited; arbitrary author,
sender, conversation ID, attachment and SQL choices are rejected before
database connect. Only bounded, recognized success/denial decision
envelopes are forwarded; a malformed response or SQL failure fails
closed. On every business denial the transaction is rolled back.
Cooldown, audience policy, membership, persistent history, readback,
Direct recipient membership and draft cleanup occur inside WE1's
fixed-purpose high-level SQL, not by selecting unrestricted views in
the external writer.

`bin/social-writer.mjs` remains the fixed AF_UNIX service
`/run/aoe2war-social-writer/social.sock`; the Next.js public handlers
stay exact `/api/social/clan-text` and `/api/contact-emaren`, with
origin and session checks, no FINANCIAL endpoints. Preserve the
protected dynamic Clan route. WE2 must independently restrict socket
peer, service secrets, R25 exact POST guard, HBA and systemd before
production; possession of a raw writer credential is still sufficient
to impersonate a UID via SQL, so keep that credential confined.

## New WE3 source-exact private PG16 integration receipt

WE3 used the **three immutable WE1 Git blobs listed above**, verified their
Git blob identity locally, then executed the exact install against a fresh
UID650-only private AF_UNIX PostgreSQL 16 cluster using the original WE1
synthetic HD schema/ACL fixture. Under the real newly installed, restricted
`aoe2war_social_writer` role, the actual
`tests/social-gateway-integration-pg.test.mjs` invoked WE3's
`executeSocialTextWrite` through the two reviewed high-level functions.

**11/11 Node source + real DB integration tests PASS; no skipped tests.**
The fixture proved two different simulated signed users, persistent Clan
messages and Direct replies, same-message replay, membership and system
identity denial, no unrestricted writer Direct SELECT, no user DELETE or
financial read, blocked leaf bypass, no author spoof and no invalid-session
SQL call. Exact WE1 inverse succeeded and the original 12 legacy raw ACL
representations matched the preimage throughout; persisted Direct messages
remained. Disposable database shut down and was deleted. The private
test driver and SQL bytes are NOT committed to PRODUCT. This is **not**
an Emaren/Scribe real Chrome session witness or a production DB role permit.

## Source admission and WE2 handoff

WE3's synthetic Node session/sidecar boundary and parameter/rollback
negative tests are source evidence only. WE1 must independently accept
the exact HD SQL+inverse, actual role/trigger/function/FDW financial
graph and writer credential secrecy; the previous broad owner or
`social_gateway_v1` SQL must NEVER be installed. WE2 exclusively
owns protected root installation, Factory same-slot artifact, T10
rollback and genuine existing Emaren/Scribe authenticated Chrome tests.
The two-user postflight must verify send, reply, reload/history,
member/nonmember denial, receiver-only Direct history and anonymous
denial without unsolicited messages. Other PRODUCT releases must not
wait on this database contract.

**SOURCE FIXED** is distinct from **CI GREEN**, **DATABASE ACCEPTED**,
**DEPLOYED**, and **LIVE VERIFIED**. No live claim in this document.
