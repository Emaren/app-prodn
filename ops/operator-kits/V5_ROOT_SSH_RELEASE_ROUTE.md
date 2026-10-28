# AoE2WAR — owner-v5 HEL1 root-SSH authority recovery

## Verified execution state

- Owner Mac signed-key self-test **PASS** with encrypted Ed25519 v5 key, SPKI fingerprint `3730382540cbb93672fa03b9c4f236a895500c30e22ccca8b884946b9308001c`, public PEM SHA256 `a60623079218c934295502350f0cbedcbcf9e42559f0d07469b0d703f59cb13b`.
- Owner test `ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes root@hel1 'id -u ...'` returned `REMOTE_UID=0`, root filesystem 68G available, evidence volume 23G available/92% occupied, `aoe2hdbets-web.service active`. This is an actual authorization route; **no sudo password needed**.
- Previous `tony@hel1` sudo attempt rejected three passwords; no confirmed root trust mutation. Do not blindly replay; root rotation has create-once audit guard.

## Source-pinned, non-download route

The existing installed **Mac** operator `~/Downloads/aoe2war_owner_v5_enroll_hel1_ttyfix.py` is SHA256 `ae8b84bbeba3fe35b8e089a9833afa3a94dd8c2a2e531c1245e86229899a6139`, 269 lines. Its remote `REMOTE_SOURCE` and `LOADER` are already bounded, independently hashed, and tested on a synthetic filesystem with a previous-public backup, release flock, type/fingerprint guards, atomic public trust replacement, audited root preview, and second-run refusal. It **does not stage, park or activate** anything and does not touch Wolo. The code under root uses `/etc/aoe2war/website-owner-v4/owner-public.pem` and `owner-public.spki.sha256` as the stable trusted controller path: the bytes are switched to v5 Ed25519; the filename is kept for controller compatibility.

To use the *proven root SSH access*, make **exactly two transport substitutions** in a new local copy after verifying the existing operator's SHA256:

1. Replace Mac transport construction:
   ```python
    remote_args=['sudo','-p','[HEL1 sudo] Password: ','/usr/bin/python3','-c',LOADER,
   ```
   with
   ```python
    remote_args=['/usr/bin/python3','-c',LOADER,
   ```
2. Replace:
   ```python
        proc=subprocess.run([*ssh[:-2],'-tt',HOST,remote_command],stdin=tty,timeout=390)
   ```
   with:
   ```python
        proc=subprocess.run([*ssh[:-2],'-tt','root@'+HOST,remote_command],stdin=tty,timeout=390)
   ```

A locally syntax-checked deterministic copy of that exact two-line patch has SHA256 **`da5c17305bc83e765d208d530b210fffa67d56b67acd70c8031abccfbb3df953`**. Its remote operator payload is byte-for-byte unchanged; **only privileged transport uses existing root SSH instead of invalid sudo**. An owner-controlled local block checks before invoking the new copy:

```bash
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes root@hel1 'test "$(cat /etc/aoe2war/website-owner-v4/owner-public.spki.sha256)" = 3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd && test ! -e /var/lib/aoe2war-owner-key-rotations/v5-3730382540cb-20261028'
```

Must get `OWNER_V5_ENROLLED_PREVIEW_PASS` inside actual root transaction before treating rotation as complete. **Never rerun following an unknown SSH outcome**. Once successful, the old Mac v4 private key stays preserved; old public trust archived as immutable root audit; no v4 signing attempt.

## Next release steps

The previously pinned `AOE2WAR_STAGE_PARK_RESUME_V1.py` script was bound to the incompatible RSA-v4 authority and sudo. It **must not** be reused without re-verifying and patching signing key path/public fingerprint and switching privileged execution to the proven root SSH channel. Remote installed controller `44a897e07d6999a15042885cfe8f0773c4645771a33011c700ef1c58293e2be4` remains pinned and independently validates one-use Ed25519 permit and historical stage receipt hashes. Only after `PARKED_NO_DELETE` then stage the new website target `ade91ac70bbab9866012a1a05b6a842bb5c0b515`; independent site activation/BUILD_ID receipt required. Do **not** enable funded WOLO: bank proof is held.

Canonical local Storage OS extended reclaim PR [#954](https://github.com/Emaren/app-prodn/pull/954) was merged to main `9ec7e283e49e32640ba88edfc4db748ba7fc88b2`, with exactly eight allowlisted caches and new `--extended`; four legacy caches were already measured 0.00GiB reclaim, receipt `20261028T041238Z-local-maintenance.json`. Do not claim extra bytes reclaimed until the owner runs the extended command and measures `df`.
