# Renaissance website release v4 — verified operator boundary

**Status: HOLD — no protected stage/activate controller integrated; do NOT sign yet.**

This is an operator handoff. It is **not** a release receipt, owner approval,
chain/Wolo certification, or a waiver of any existing production gate.

## Exact source identities

| Witness | Source |
|---|---|
| Last observed Mac/site live Git SHA | `6be434c00469afa4acb0623715c3bcf724f927f4` |
| Last observed live Next BUILD_ID | `xqX6Oi-zV5gSKH1kIC4zC` |
| Qualified Renaissance candidate #922 | `6d2a78224e5a5c647345d6b5ffc91bf94dc84b59` |
| Candidate source tree Git OID | `2b8232c950ec58a8f0d16ea0c625528948b6b206` |
| Live baseline source tree Git OID | `d0568f80e290242898c8ddfb37ccb07b457e57ac` |
| Reviewed candidate path delta | 128; 63 added, 65 modified, 0 removed |
| Separate controller-v3 baseline #874 | `74047f8b5e2a87b495ac3466eb17b447a44d4cb5` |
| Source scope manifest | `config/renaissance-website-v4-frozen-scope.json` |
| Source reviewer | `scripts/aoe2_renaissance_v4_scope.py` |
| Owner-v4 challenge review protocol | `scripts/aoe2_renaissance_owner_authority_v4.py` |

Source checks must be repeated if the candidate HEAD changes even by one
line. The source inventory uses Git tree and blob SHA-1 object identity; it
is **not** itself the separate SHA-256 owner-signed release manifest.

## Independent candidate tests (not live deployment)

* #922 application CI: 3,464 Node PASS / 0 FAIL / 24 SKIP; TypeScript, Next,
  PostgreSQL and DocsV2 PASS on exact source.
* Integrated Brain/Intelligence Chrome, including 246/246 Intelligence checks.
* Independent 88/88 real Chrome route acceptance, 0 FAILED/UNKNOWN.
* Owner-v4 source/crypto foundation #924: 9 disposable Git source tests and
  10 disposable RSA owner challenge/nonce/replay tests pass in CI.
* 3 source paths conservatively classified FINANCIAL despite visual-only
  diffs: `app/wolomania/WolomaniaPageClient.tsx`,
  `components/bets/BetsDisplayRail.tsx`,
  `components/wolo/WoloHeroTile.tsx`.
* 4 source paths classified WATCHER and 1 classified REPLAY_TRUTH.
  Do not silently downgrade any release class. A 120-path cut that removed
  all eight risk-classified changes (#925) failed two real Node contracts
  and was closed **without** merge or deployment.
* #924 DocsV2 is **review-only proposal**, not yet governed strict final
  doc-baseline acceptance. No source/owner approval is implied.

## Purely local Mac read-only source check (no npm or build)

The owner can run these commands **only after fetching the reviewed branches**.
Do not alter the clean canonical `main` checkout. A small detached worktree
allows the verified reviewer to inspect the full candidate directly.

```bash
set -euo pipefail
APP="$HOME/projects/AoE2HDBets/app-prodn"
REVIEW="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
BASE="6be434c00469afa4acb0623715c3bcf724f927f4"
CAND="6d2a78224e5a5c647345d6b5ffc91bf94dc84b59"
git -C "$APP" fetch --no-tags origin "$CAND"
git -C "$APP" cat-file -e "$BASE^{commit}"
git -C "$APP" cat-file -e "$CAND^{commit}"
git -C "$APP" merge-base --is-ancestor "$BASE" "$CAND"
git -C "$APP" diff --name-status --no-renames "$BASE" "$CAND" | tail -5
git -C "$APP" status --short
# The v4 reviewer is source-only and must run from the reviewed v4 checkout;
# do not execute arbitrary GitHub PR scripts in the owner-signing shell.
```

## Remaining independent release admission

1. Review the exact **128-path expanded source and risk** with website-only
   read-only/financial exclusion proof, including protected startup side effects.
2. Review/accept a new v4 release/gate manifest tied to every source blob,
   retained last-live rollback SHA/BUILD_ID and exact operator code identity.
3. Integrate a **separately versioned protected v4 dispatch adapter** under
   existing global lease, source/financial/Wolo observer and receipts. The
   existing v3 engine targets an earlier ten-path release; merely changing
   its constants is forbidden. Its v3 nonce journal remains immutable.
4. Enroll/verify the protected v4 owner **public** key. The owner's encrypted
   private key must stay on their Mac, outside Git and outside chat.
5. Issue NEW `PRE_STAGE` nonce and have the owner inspect and sign exact
   source/controller/manifest. One protected stage, no retry after ambiguous
   transport. Prove staged artifact SHA, actual Next BUILD_ID, receipt hash,
   rollback identity and unchanged Wolo/financial runtime.
6. Issue separate NEW `PRE_ACTIVATE` nonce for **that exact artifact**.
   Owner separately signs; one protected activation. No other service changes.
7. Independently verify live Git SHA, Next BUILD_ID, deployment endpoint,
   actual 88-route smoke, relevant APIs, full financial service identity and
   rollback. Keep immutable source-bound receipts.

## No deployment actions have occurred

CI, document generation, source/candidate branch commits and offline crypto
tests **do not** modify HEL1's running website. All protected financial and
custody authority is still separate from this release. No Wolo mainnet
transfer is authorized by this document.

Source issue: https://github.com/Emaren/app-prodn/issues/921
Source reviewer PR: https://github.com/Emaren/app-prodn/pull/924
Qualified candidate PR: https://github.com/Emaren/app-prodn/pull/922
