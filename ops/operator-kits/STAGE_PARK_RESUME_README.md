# AoE2WAR — signed stage-park resume operator (transport only)

**Source:** original owner-approved ChatGPT operator ZIP `AOE2WAR_STAGE_PARK_RESUME_KIT.zip`, extracted source `AOE2WAR_STAGE_PARK_RESUME_V1.py`.

**Permanent transport blob:** `ops/operator-kits/AOE2WAR_STAGE_PARK_RESUME_V1.py.gz.b64` is a deterministic gzip-compressed and base64-encoded copy of the exact operator, to support `git fetch` on the Mac without ChatGPT attachment preview/download.

- Raw transport text SHA-256 (including terminal newline): `e9ba8b45a437a2027375040c4be787ddd67d5cc59e5a0f266e2b09592444424e`
- Decompressed Python byte SHA-256: `91b6ebc16f70cce9b7b1eea5bec6f0965b55cf8d7aaa81d5dd9f3b07a59c0b54`
- Merged GitHub release main expected: `b115d5a94db9c1048b070b5a9a8f9170b4c29323`
- Previously owner-proven installed HEL1 controller: `44a897e07d6999a15042885cfe8f0773c4645771a33011c700ef1c58293e2be4`
- Owner-v4 public DER/SPKI fingerprint: `3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd`

## Extraction on owner Mac

Fetch the dedicated branch without changing any checked-out worktree files:

```bash
git -C "$HOME/projects/AoE2HDBets/app-prodn" fetch origin ops/stage-park-resume-kit-20261028
```

Then get the blob from `FETCH_HEAD`, verify raw SHA, decode and verify extracted source. The Python source must be explicitly reviewed and run only by the owner; don't automatically run this branch content from CI or merge into production website runtime. **DO NOT run or re-run if an earlier signed PARK_ONLY permit may already have been used or may have unknown outcome.**

```bash
REPO="$HOME/projects/AoE2HDBets/app-prodn"
DEST="$HOME/Downloads/AOE2WAR_STAGE_PARK_RESUME_V1.py"
BLOB="ops/operator-kits/AOE2WAR_STAGE_PARK_RESUME_V1.py.gz.b64"
git -C "$REPO" show "FETCH_HEAD:$BLOB" | shasum -a 256
# Must equal e9ba8b45... ; then decode via base64 -D | gzip -dc
# Decompressed bytes MUST equal 91b6ebc16f70... before attempting --execute.
```

## Scope and threat boundary

The operator constructs a **20-minute, one-use, Ed25519-signed PARK_ONLY permit on the owner's Mac** bound to the known repaired Oct 27 stage receipt. The existing HEL1 root-owned controller revalidates hashes, keys, live source/BUILD_ID, Wolo listeners, stage inodes, nonce and shared lease. It then *renames*, not deletes, the two historical stage directories on the same filesystem. No website activation, database migration, financial transaction, Docker rebuild, watcher restart, or WOLO movement is authorized by this tool.

This branch is a durable **operator transport and review artifact**, not release approval or evidence of any successful park. Owner explicitly confirms the operation and authenticates to HEL1 through sudo. Keep encrypted private key on the Mac, and never upload the key or passwords.

The reviewed stage-receipt mode repair did **not** park anything: last demonstrated state is HEL1 `PREVIEW_ONLY` PASS; `PARKED_NO_DELETE` not yet witnessed.
