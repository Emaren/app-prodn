---
id: "aoe2war.app-prodn.solo-owner-w1-release-v1"
title: "Solo-owner W1 / Post-W1 Release and Rollback — Operator v1"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain", "VPSSentry"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-29"
review_interval_days: 7
sensitivity: "internal"
---

# AoE2WAR — Solo-owner protected website release v1

**This runbook is executable evidence collection, NOT a deployment permit.** The W1 website candidate is frozen at SHA
b46a51f1592c9f296839924ae55e722618b10d35. The separately accepted post-W1 source is SHA
fa5c350b35cba7ace8d4515a7ad52ba4e1534295, including C #1004. Order is **W1 THEN post-W1**. Last historical pre-W1 live source: 33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a,
Next BUILD_ID DQ2jMprNQ_Njq6QM8GHju; **neither is fresh live evidence**.

## PASS / HOLD — historical latest accepted evidence, NOT remeasured here

- PASS: frozen W1 source accepted, post-W1 source accepted.
- PASS: legitimate one-human owner/v4 public identity historically verified; old owner-v4 PRE_STAGE and PRE_ACTIVATE approvals **consumed**, never reused.
- HOLD: draft #1008 is NOT installed production authority; W1 engine still demands four independent Source/Finance/Owner/Host roots incompatible with one real human operator.
- HOLD: HEL1 ~21.0264GiB available (previous exact 21.048GiB, effective used 92.563%, Finish used 92.869%), >=12.916GiB additional usable free + ongoing write margin needed. ALL required thresholds are >=30GiB ordinary free, <=88% effective used, <92% Finish used.
- HOLD: encrypted original-consistent offsite capture + third separate physical restore: 0/6 protected classes verified. Intel receiver/key/forced commands incomplete; 0 bytes physically recovered.
- HOLD: M1 4.6647GiB available; D clearance required before heavy build or scan.
- HOLD: Doctor 0 P0/0 P1, live financial writer/hash noninterference, authentic HEL1 root observation, stage/activation, rollback and authenticated Chrome unknown/not accepted.
- HOLD: G owns documentation baseline control; no hand edits or waiver to create fake green CI.

The 48.01079GiB active Traffic SQLite file is protected, and 2.25958GiB in-file freelist is NOT filesystem space reclaimed. No raw copying live SQLite, checkpoint, VACUUM, prune, service stop, transfer or deletion.

## 1. M1 Mac owner — run now, READ-ONLY

The expected operator shell is the 2021 M1 Mac, Darwin/arm64. This does not fetch, change HEAD, clean, merge or deploy. Every guard prints PASS/HOLD; no strict shell fail-fast settings.

~~~bash
bash <<'BASH'
echo '=== M1 WEBSITE SOURCE / DISK / STATUS ==='
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'HOLD: WRONG_HOST_EXPECTED_M1'
  exit 2
fi
R="$HOME/projects/AoE2HDBets/app-prodn"
if [ ! -e "$R/.git" ]; then
  echo "HOLD: CHECKOUT_NOT_FOUND $R"
  exit 2
fi
cd "$R" || exit 2
git rev-parse HEAD
git status --short
for sha in b46a51f1592c9f296839924ae55e722618b10d35 fa5c350b35cba7ace8d4515a7ad52ba4e1534295; do
  if git cat-file -e "$sha^{commit}" 2>/dev/null; then
    echo "PASS: COMMIT_LOCAL $sha"
  else
    echo "HOLD: COMMIT_NOT_PRESENT_OR_NOT_FETCHED $sha"
  fi
done
df -kP "$HOME"
./bin/aoe2war release status --json
echo "RELEASE_STATUS_EXIT=$?"
echo 'COMPLETE: READ_ONLY_NO_DEPLOYMENT'
BASH
~~~

Do not build or run a full M1 source scan until D independently clears the volume headroom gate. A missing local post-W1 commit is UNKNOWN/unfetched, not a candidate rejection.

## 2. HEL1 Ubuntu owner — run now, READ-ONLY

The expected shell is tony@ubuntu-4gb-hel1-11. Measure native live volume and website state, without changing anything. The internal compiled version endpoint is port 3030. That compiled version is **NOT** the same thing as the Next .next/BUILD_ID. HTTP 200 by itself is not a source-SHA certificate.

~~~bash
bash <<'BASH'
echo '=== HEL1 LIVE PHYSICAL / SOURCE / SERVICE ==='
if [ "$(uname -s)" != Linux ] || [ "$(hostname)" != ubuntu-4gb-hel1-11 ]; then
  echo 'HOLD: WRONG_HOST_EXPECTED_HEL1'
  exit 2
fi
python3 - <<'PY'
import os
v="/mnt/HC_Volume_105319120"
if not os.path.ismount(v):
    print("HOLD: MISSING_ATTACHED_VOLUME"); raise SystemExit(2)
s=os.statvfs(v); g=1024**3
total=s.f_blocks*s.f_frsize
used=(s.f_blocks-s.f_bfree)*s.f_frsize
free=s.f_bavail*s.f_frsize
eff=100*used/(used+free); finish=100*(total-free)/total
need=max(0,30*g-free,used-.88*(used+free),.08*total-free)
print(f"FREE_GIB={free/g:.3f}")
print(f"EFFECTIVE_USED_PCT={eff:.3f}")
print(f"FINISH_USED_PCT={finish:.3f}")
print(f"MIN_ADDITIONAL_GIB={need/g:.3f}")
print("CAPACITY_GATE="+("PASS" if free>=30*g and eff<=88 and finish<92 else "HOLD"))
PY
echo "CAPACITY_PROBE_EXIT=$?"
echo '=== WEBSITE ==='
systemctl is-active aoe2hdbets-web.service
echo "WEB_SERVICE_EXIT=$?"
R=/var/www/AoE2HDBets/app-prodn
if [ -e "$R/.git" ]; then
  git -C "$R" rev-parse HEAD
  git -C "$R" status --short
else
  echo 'HOLD: EXPECTED_PRODUCTION_CHECKOUT_NOT_FOUND'
fi
if [ -f "$R/.next/BUILD_ID" ]; then
  printf 'ACTIVE_NEXT_BUILD_ID='
  cat "$R/.next/BUILD_ID"
else
  echo 'HOLD: ACTIVE_BUILD_ID_NOT_FOUND'
fi
echo '=== INTERNAL COMPILED VERSION ==='
curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version
echo
echo "INTERNAL_VERSION_EXIT=$?"
echo '=== PUBLIC COMPILED VERSION ==='
curl -fsS --max-time 8 https://aoe2war.com/api/deployment-version
echo
echo "PUBLIC_VERSION_EXIT=$?"
echo '=== WOLO LISTENERS — OBSERVATION ONLY ==='
ss -ltn | grep -E ':(8092|8093)[[:space:]]' || echo 'HOLD: WOLO_LISTENERS_NOT_OBSERVED'
echo 'COMPLETE: READ_ONLY_NO_SERVICE_CHANGE'
BASH
~~~

For release acceptance, require installed HEL1 source SHA and BUILD_ID to match independently authenticated protected stage/activation receipts, plus internal/public compiled version, exact Wolo PID/executable/config/writer continuity, signed Doctor and real browser evidence. The printed HEL1 probes alone are not a signed root observer.

## 3. Authentic solo-owner authority — present HOLD, installation not yet authorized

The reviewed controller must reuse only the legitimate public owner-v4 RSA SPKI fingerprint
3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd.
It must issue **fresh separate PRE_STAGE and PRE_ACTIVATE** one-use requests under the new versioned domain, signed by the real owner only. It must not reuse v4 old nonce/permit packets, fabricate Source/Finance humans, or share the private key/passphrase.

Required trusted physical inputs: exact source/manifest/gate and independently reviewed transitive closure with zero unchecked financial writer edges; root SSH reader pinned to HEL1 ED25519
SHA256:8L7ZF+xPA/YXe6uY1+yVPZFdY58JxYvHjC5S/U+I1Og and actual root-protected collector SHA; current mount/capacity, six separate independent restore proofs, signed Doctor, real HD/DE/Wolo listener+writer identities; intact rollback and no source/financial mutation. A user-edited JSON, CI fixture or declared origin field cannot confer authority.

**Critical integration flaw to resolve before ANY mutation:** the original source controller in scripts/aoe2_release.py holds HEL1 release.lock as a long-running SSH flock. Separate nonce journal code attempting to acquire that lock and then invoke original stage will self-deadlock; releasing it first would lose atomicity. The approved successor must execute verified owner nonce consumption and genuine stage/activation within a single serialized leased transaction using reviewed host mechanics. Both existing frozen stage and activation functions still invoke incompatible multi-human require_admission. Do not monkeypatch it or modify frozen W1. An independently reviewed alternate protected controller/engine is mandatory.

**G owns DocsV2 repair:** regenerate the documentation baseline in a genuine full checkout using reviewed source changes; keep generated baseline only if exact checker passes, then request fresh exact-head CI. No documentation-baseline hand edits.

## 4. PRE_STAGE — explicit owner consent, exact stage command, CURRENT HOLD

After the protected separate controller has been independently reviewed, installed, and accepted, issue a fresh candidate-specific PRE_STAGE challenge; owner signs it using actual secure private-key UI; validated host observer rechecks before and after real stage. Native immutable W1 engine interface is:

    ./bin/aoe2war release ship --stage --json

**WARNING:** that current command invokes the OLD multi-signer admission and will fail closed. It is NOT safe to bypass or substitute a forged packet. The runnable guard below intentionally stops rather than attempts a production mutation.

~~~bash
bash <<'BASH'
echo '=== M1 W1 PRE_STAGE ==='
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'HOLD: WRONG_HOST'
  exit 2
fi
echo 'HOLD: PROTECTED_SOLO_ENGINE_NOT_INSTALLED_OR_AUTHORIZED'
echo 'NATIVE_ENGINE_INTERFACE=./bin/aoe2war release ship --stage --json'
echo 'REQUIRED=REAL_OWNER_PRE_STAGE_AND_ACTUAL_6/6_RESTORES_AND_VOLUME_DOCTOR_FINANCE_GO'
exit 2
BASH
~~~

Real protected success must produce immutable on-HEL1 stage-receipt.json and SHA, candidate source SHA, artifact and dependency digests, staged BUILD_ID; NO change to live source, BUILD_ID, finance or rollback.

## 5. PRE_ACTIVATE — separate owner signature and receipt-bound activation, CURRENT HOLD

Only after independently authenticating actual stage receipt and pre/post finance/host invariants, issue a **new** PRE_ACTIVATE challenge with distinct nonce, same attempt/lease, immutable stage receipt SHA, artifact/dependency hashes and staged BUILD_ID. Owner signs independently. Native immutable W1 interface:

    ./bin/aoe2war release ship --activate EXACT_STAGE_RECEIPT --json

**WARNING:** original engine still demands old multi-signer gate. The block below intentionally refuses a production mutation until the new approved controller genuinely implements this protected path.

~~~bash
bash <<'BASH'
echo '=== M1 W1 PRE_ACTIVATE ==='
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'HOLD: WRONG_HOST'
  exit 2
fi
echo 'HOLD: NO_AUTHENTICATED_STAGE_PLUS_FRESH_SOLO_PRE_ACTIVATE'
echo 'NATIVE_ENGINE_INTERFACE=./bin/aoe2war release ship --activate EXACT_STAGE_RECEIPT --json'
exit 2
BASH
~~~

Never overwrite/retire an ambiguous stage, rewrite prior receipts, restart web manually or waive Wolo hold.

## 6. Verification — run only after genuine signed activation

After ACTIVATE, rerun section 2 on HEL1. Require **exact** Git SHA equal W1 b46a51f..., active .next/BUILD_ID equal signed receipt, web service active, protected rollback path+SHA verified, internal and public compiled versions concordant with receipt and real host source, 8092/8093 and all financial writers unchanged, genuine soak PASS.

Actual authenticated browser acceptance (not CI substitutes): 375/768/1440px across Storage OS, Backup OS, Documents OS, General Inspections, Kingdom Intelligence, Work Board, navigation and route set; verify 401/403/405, UNKNOWN/stale truthful states and privacy. Record actual auth Chrome artifacts with source SHA+BUILD_ID. C/G own readmodel/visual acceptance after true deploy.

Existing operator read-only history and rollback dry-run, runnable NOW on M1:

~~~bash
bash <<'BASH'
echo '=== M1 RELEASE HISTORY / ROLLBACK READINESS ==='
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'HOLD: WRONG_HOST'
  exit 2
fi
cd "$HOME/projects/AoE2HDBets/app-prodn" || exit 2
./bin/aoe2war release releases --json
echo "HISTORY_EXIT=$?"
./bin/aoe2war release rollback --dry-run --json
echo "ROLLBACK_DRY_RUN_EXIT=$?"
echo 'COMPLETE: NO_ROLLBACK_EXECUTED'
BASH
~~~

## 7. Rollback — authenticated owner emergency action, CURRENT HOLD

**Real rollback is a production mutation.** Its existing protected interface is:

    ./bin/aoe2war release rollback --json

Before executing, owner must identify the actual activated source SHA, genuine activation receipt, durable and fast rollback path+SHA, and inspect output of the read-only dry-run above. New protected controller must independently preserve original rollback authority. The guard below deliberately refuses premature rollback, not a fake automatic success.

~~~bash
bash <<'BASH'
echo '=== M1 ROLLBACK AUTHORITY ==='
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'HOLD: WRONG_HOST'
  exit 2
fi
echo 'HOLD: NO_W1_CERTIFIED_ACTIVATION_OR_OWNER_ROLLBACK_AUTHORITY'
echo 'NATIVE_INTERFACE_WHEN_ADMITTED=./bin/aoe2war release rollback --json'
exit 2
BASH
~~~

Never use raw .next rename, manual DB copy or unapproved systemctl restart as an improvised rollback.

## 8. Post-W1 — NEW, separately admitted release, not same approval

Only after W1 genuinely certified production, repeat 1–7 with exact post-W1 SHA
fa5c350b35cba7ace8d4515a7ad52ba4e1534295 and **W1** as the verified previous live source, distinct source/gate/manifest/financial review, separately issued PRE_STAGE, real stage, separate PRE_ACTIVATE, new rollback+browser proofs. This does NOT authorize funded WOLO deployment or L2 deletion.

## Reporting / lane coordination

Publish real immutable operator receipts to [F #665](https://github.com/Emaren/app-prodn/issues/665) and [Central #934](https://github.com/Emaren/app-prodn/issues/934).
D owns M1 recovery; E owns six classes and Traffic #59 and Intel transport; B owns financial evidence; C owns signed data adoption; G owns DocsV2 and final authenticated Chrome. Relevant E sources: [migration #1007](https://github.com/Emaren/app-prodn/issues/1007), [E #23](https://github.com/Emaren/VPSSentry/issues/23), [Traffic #59](https://github.com/Emaren/traffic-api/issues/59).
Do not spend on paid remote access or backups; no unapproved data deletion.

**NO-GO until all source, physical, cryptographic, operational and owner approval gates are truly closed.**
