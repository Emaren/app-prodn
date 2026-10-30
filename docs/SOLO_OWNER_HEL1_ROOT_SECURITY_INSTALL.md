---
id: "aoe2war.app-prodn.hel1-root-security-install-v1"
title: "Session C: HEL1 original-lock and root SSH installation"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "VPSSentry"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-30"
review_interval_days: 7
sensitivity: "internal"
---

# Session C: HEL1 original-lock and root SSH installation

**DRAFT — not installed, no owner approval implied.**

The original release.lock at
/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock
must preserve EXACT inode, UID1000, mode0644 and continuous FD200 flock.
The only permitted directory ownership changes are root ownership of
os-control and os-control/locks, top-down, with NO group/world write.
Any higher writable ancestor or active original flock is HOLD. Do NOT
chown, recreate or replace the lock itself. Confirm affected workloads
do not need to create files in those two directories.

Exactly TWO distinct actual Ed25519 wire public keys must be independently
enrolled in root-owned approved-ssh-keys.json: observer and command.
Each has ONE restricted, forced-command authorized_keys entry. Alternate
unrestricted entries and other SSHD authorized-key providers are forbidden
for these credentials. Existing unrelated administrative root keys remain.

The source must be independently reviewed by F and all installed helper
bytes pinned to exact Git SHA256 before host installation. Copy the reviewed
host-security installer and forced dispatcher to root-owned protected paths
under /usr/local/libexec/aoe2war. Provision two genuine different public
keys into /etc/aoe2war/solo-owner-website-v1/approved-ssh-keys.json using
fields "observer" and "command". Do not paste private keys or invent keys.

## HEL1 read-only installation plan

~~~bash
bash <<'BASH'
if [ "$(hostname -s)" != "ubuntu-4gb-hel1-11" ] || [ "$(uname -s)" != "Linux" ]; then
  echo 'HOLD: WRONG_HOST'; exit 2
fi
if [ -z "$SSH_CONNECTION" ]; then echo 'HOLD: SSH_CONTEXT_MISSING'; exit 2; fi
sudo -n /usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-host-security.py \
  plan --ssh-connection "$SSH_CONNECTION"
BASH
~~~

## HEL1 explicit owner-authorized installation (MUTATES — DO NOT RUN YET)

~~~bash
bash <<'BASH'
if [ "$(hostname -s)" != "ubuntu-4gb-hel1-11" ] || [ "$(uname -s)" != "Linux" ]; then
  echo 'HOLD: WRONG_HOST'; exit 2
fi
if [ -z "$SSH_CONNECTION" ]; then echo 'HOLD: SSH_CONTEXT_MISSING'; exit 2; fi
sudo /usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-host-security.py \
  install --ssh-connection "$SSH_CONNECTION" < /dev/tty
BASH
~~~

Requires a real interactive typed owner approval. The /dev/tty redirection is essential because the surrounding here-document is not interactive stdin. The installer checks the
original flock is idle, holds the same inode, protects the two permitted
ancestors, fsyncs a root-only backup of authorized_keys, and atomically
appends exactly two distinct restricted entries. Failure restores the
original authorized_keys if safe. Hardened directories stay hardened.

## HEL1 read-only verification

~~~bash
bash <<'BASH'
if [ "$(hostname -s)" != "ubuntu-4gb-hel1-11" ] || [ "$(uname -s)" != "Linux" ]; then
  echo 'HOLD: WRONG_HOST'; exit 2
fi
if [ -z "$SSH_CONNECTION" ]; then echo 'HOLD: SSH_CONTEXT_MISSING'; exit 2; fi
sudo -n /usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-host-security.py \
  verify --ssh-connection "$SSH_CONNECTION"
BASH
~~~

## M1 owner — actual negative SSH boundary proof (after approved install ONLY)

This is a read-only *negative* root-login test. It passes only if sshd
authenticates each enrolled key, runs the reviewed forced helper and that
helper specifically rejects arbitrary root execution. An SSH authentication
failure alone is NOT a passing forced-command proof.

~~~bash
bash <<'BASH'
if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo 'HOLD: WRONG_OWNER_M1'; exit 2
fi
if [ -z "$SOLO_OBSERVER_KEY" ] || [ -z "$SOLO_COMMAND_KEY" ]; then
  echo 'HOLD: TWO_OWNER_APPROVED_ROOT_KEY_PATHS_REQUIRED'; exit 2
fi
sudo -v || exit 2
for key in "$SOLO_OBSERVER_KEY" "$SOLO_COMMAND_KEY"; do
  result=$(sudo -n /usr/bin/ssh -T -n -o BatchMode=yes \
    -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
    -o GlobalKnownHostsFile=/dev/null \
    -o UserKnownHostsFile=/private/etc/aoe2war/solo-owner-website-v1/hel1-known-hosts \
    -o HostKeyAlgorithms=ssh-ed25519 -i "$key" \
    root@157.180.114.124 /usr/bin/id 2>&1)
  rc=$?
  if [ "$rc" -eq 0 ]; then echo 'HOLD: UNRESTRICTED_ROOT_EXEC'; exit 2; fi
  case "$result" in
    *FORCED_SSH_HOLD:*) echo 'PASS: ENROLLED_ROOT_KEY_FORCED_HELPER_REJECTED_ID' ;;
    *) echo 'HOLD: SSH_AUTH_OR_FORCED_HELPER_NOT_PROVEN'; exit 2 ;;
  esac
done
BASH
~~~

Do not infer HEL1 actual FD200 or systemd orphan-build behavior from this
negative SSH test; F still requires a separately approved native trial.

After approved enrollment, F/C must independently verify sshd effective
Match configuration, native actual root forced commands, SHA-pinned helper
bytes, exact original lock dev/inode/uid/mode, and REJECTED arbitrary root
shell, Python, forwarding and wrong-role requests from the real M1 SSH keys.
Real orphan FD200 testing on HEL1 requires separate owner approval.
A source fixture is not native evidence.

## HEL1 owner-approved rollback of NEW root-key enrollment (MUTATES)

~~~bash
bash <<'BASH'
if [ "$(hostname -s)" != "ubuntu-4gb-hel1-11" ] || [ "$(uname -s)" != "Linux" ]; then
  echo 'HOLD: WRONG_HOST'; exit 2
fi
if [ -z "$SSH_CONNECTION" ]; then echo 'HOLD: SSH_CONTEXT_MISSING'; exit 2; fi
sudo /usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-host-security.py \
  rollback-keys --ssh-connection "$SSH_CONNECTION" < /dev/tty
BASH
~~~

Requires a separate exact typed owner approval via /dev/tty. It removes the two new
restricted entries ONLY when authorized_keys equals original backup plus
those exact two entries; all unrelated admin root access stays untouched.
**Never automatically revert secured parent directories**: that would
restore the split-lock vulnerability. Any separate directory rollback
requires zero release holders, independent analysis and new owner approval.

HOST INSTALL REMAINS HOLD until legitimate signed B/C/E/Doctor financial
and restore receipts, real six-class independent recovery, original HEL1
volume Finish <92%, owner phase authorization and runtime/rollback proof.
