#!/usr/bin/env python3
"""WE2 exact-five HEL1 extracted-runtime retirement. SOURCE ONLY until reviewed,
root-installed byte-pinned, and one fresh owner-v4 Ed25519 packet is issued.
Never authorizes deleting Factory ZIPs, non-listed paths or financial records.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile

PARENT = Path("/var/lib")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
STATE = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/we2-exact-five-retire-v1")
TRUST = Path("/etc/aoe2war/website-owner-v4/owner-public.pem")
TRUST_PIN = Path("/etc/aoe2war/website-owner-v4/owner-public.spki.sha256")
ROOT_INSTALL = Path("/usr/local/libexec/aoe2war/we2_exact_five_runtime_retire_v1.py")
DOMAIN = b"AOE2WAR.WE2.EXACT_FIVE_RUNTIME_RETIRE.V1\n"
SCHEMA = "aoe2war.we2.exact-five-runtime-retire.v1"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
NONCE = re.compile(r"[A-Za-z0-9_-]{32,80}\Z")
# Each source is independently verified in the original retained Factory ZIP.
# The only mutable on-host exception was public/factory/status.json; its
# observed hash was copied and checked in the protected M1 owner vault.
TARGETS = (
    ("39a2d8b2eba9", "39a2d8b2eba9b5cc37d7351003d464554dc692f9", 5402971, 1586778112,
     "c0634dc42ba2e9f85b6ff4cc6c7a2f6bfcc5710e1313990c2b21b3bfa03a4b57",
     "1fc4b4c38bf8ae34ccb92e8a1665fff0f7985b640a63243367fdda61f243ca1e"),
    ("e31e1c053a3b", "e31e1c053a3b39904929a64a1a9af700a9ad5426", 532237, 1590300672,
     "d7c7a9bc0576f694efeaac081773240590c5e73cd62346e4080c2a6afe3ae1d0",
     "cf29efa9109d78899c5c11cb86c685fb54ee6a654d7f58f807598a5203599e2f"),
    ("9c5fb786b066", "9c5fb786b06636a813235bc13cb2cdffaf51ffc4", 7944, 1587179520,
     "337f016102dcad715c0d938451c0585ae27e105119a2ca6b2dfb1c24847c98b4",
     "5f96007cf74e3dfa6a8073231b5846fe9be48f0c0020b3867ca3f41d0e2e5007"),
    ("8ccf253bd470", "8ccf253bd470ed623e1101a6d1b30f8fab2ff5d6", 1459524, 1590669312,
     "c11fc6754c01a5149c849af9e76786d3774f3aa65926b000539d305716b27294",
     "5de4bffd6b2466ae80f26144cb48560cf101ebd5346a8a8d11480595e2ed093f"),
    ("303fdf6d7e53", "303fdf6d7e53929f1022ceb32c17e4d6c6175a0b", 5531256, 1586954240,
     "da3832b4026614a94e940f8c24f2c396176a7b44c8b65e5bbe4392777080629d",
     "adfdd3e70f70f06127625dea35cb610186de6423a74cb79d89f775b4a5781c19"),
)
KEEP = frozenset(("fcd58f2ac05b", "9a51e962a7fb", "f50ead889c61"))
PORTS_UP = (3030, 3032, 3033, 9447)
PORTS_DOWN = (8092, 8093, 8094, 8095)


class Hold(Exception):
    pass


def need(ok: bool, reason: str) -> None:
    if not ok:
        raise Hold(reason)


def canonical(x: object) -> bytes:
    return json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode()


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def unique_pairs(pairs):
    result = {}
    for k, v in pairs:
        need(k not in result, "DUPLICATE_SIGNED_JSON_KEY")
        result[k] = v
    return result


def filebytes(path: Path, *, limit: int = 12_000_000) -> bytes:
    s = path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and 0 < s.st_size <= limit,
         "FILE_SHAPE_" + path.name)
    with path.open("rb") as f:
        return f.read(limit + 1)


def trusted_ancestors(path: Path, *, uid: int = 0) -> None:
    need(path.is_absolute(), "RELATIVE_PATH")
    cur = path
    while True:
        s = cur.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid == uid
             and not s.st_mode & 0o022, "UNTRUSTED_ANCESTOR_" + str(cur))
        if cur == Path("/"):
            break
        cur = cur.parent


def exact_inventory() -> list[dict]:
    result = []
    for prefix, source, inode, gross, manifest, status in TARGETS:
        need(prefix not in KEEP, "PROTECTED_RUNTIME_IN_SCOPE")
        result.append(dict(prefix=prefix, source_sha=source,
                           path=str(PARENT / ("aoe2war-web-prod-" + prefix)),
                           root_dev=2049, root_inode=inode, gross_allocated_bytes=gross,
                           manifest_sha256=manifest, mutable_status_sha256=status))
    return result


def inventory_digest() -> str:
    return sha(canonical(exact_inventory()))


def command(argv: list[str], *, timeout: int = 15) -> str:
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    need(p.returncode == 0, "LIVE_COMMAND_FAILED_" + Path(argv[0]).name)
    return p.stdout


def host_identity() -> None:
    need(sys.platform == "linux" and os.geteuid() == 0, "EXACT_ROOT_LINUX_ONLY")
    need("hel1" in socket.gethostname().lower(), "WRONG_HOST")
    trusted_ancestors(PARENT)
    need(PARENT.stat().st_dev == 2049 and Path("/").stat().st_dev == 2049,
         "ROOT_MOUNT_DRIFT")


def inspect_one(entry: dict) -> None:
    p = Path(entry["path"])
    need(p.parent == PARENT and p.name == "aoe2war-web-prod-" + entry["prefix"],
         "WRONG_TARGET_PATH")
    s = p.lstat()  # no following a symlink
    need(stat.S_ISDIR(s.st_mode) and s.st_dev == entry["root_dev"]
         and s.st_ino == entry["root_inode"] and s.st_uid == 0
         and not s.st_mode & 0o022, "TARGET_METADATA_DRIFT_" + p.name)
    need(filebytes(p / ".aoe2war-source-sha", limit=128).strip().decode() ==
         entry["source_sha"], "SOURCE_DRIFT_" + p.name)
    need(sha(filebytes(p / ".aoe2war-runtime-manifest.json")) ==
         entry["manifest_sha256"], "MANIFEST_DRIFT_" + p.name)
    need(sha(filebytes(p / "public/factory/status.json", limit=50000)) ==
         entry["mutable_status_sha256"], "STATUS_DELTA_DRIFT_" + p.name)


def live_refs(entries: list[dict]) -> None:
    prefixes = tuple(e["path"] for e in entries)
    self_pid = os.getpid()
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit() or int(proc.name) == self_pid:
            continue
        links = [proc / x for x in ("cwd", "root", "exe")]
        try:
            links.extend(list((proc / "fd").iterdir()))
        except FileNotFoundError:
            continue
        except PermissionError as exc:
            raise Hold("PROC_FD_VISIBILITY_INCOMPLETE") from exc
        for link in links:
            try:
                t = os.readlink(link)
            except FileNotFoundError:
                continue
            except PermissionError as exc:
                raise Hold("PROC_LINK_VISIBILITY_INCOMPLETE") from exc
            if any(t == p or t.startswith(p + "/") or
                   t.startswith(p + " (deleted)") for p in prefixes):
                raise Hold("ACTIVE_PROCESS_REFERENCES_" + proc.name)
        try:
            args = (proc / "cmdline").read_bytes()
        except FileNotFoundError:
            continue
        except PermissionError as exc:
            raise Hold("PROC_ARGS_VISIBILITY_INCOMPLETE") from exc
        need(not any(p.encode() in args for p in prefixes),
             "PROCESS_ARGUMENT_REFERENCES_" + proc.name)
    units = command(["/usr/bin/systemctl", "list-units", "--all", "--type=service",
                     "--plain", "--no-legend", "--no-pager"], timeout=20)
    names = [l.split()[0] for l in units.splitlines() if l.split() and
             l.split()[0].endswith(".service")]
    need(0 < len(names) < 500, "UNBOUNDED_UNIT_CENSUS")
    info = command(["/usr/bin/systemctl", "show", *names, "-p", "Id",
                    "-p", "WorkingDirectory", "-p", "ExecStart", "-p", "ExecStartPre",
                    "-p", "ExecStartPost", "-p", "ExecStop"], timeout=25)
    need(not any(p in info for p in prefixes), "SYSTEMD_UNIT_REFERENCES_TARGET")


def services() -> dict:
    primary = command(["/usr/bin/systemctl", "show",
                       "aoe2hdbets-web-prod.service", "-p", "ActiveState",
                       "-p", "WorkingDirectory", "-p", "MainPID", "-p", "NRestarts"])
    need("ActiveState=active" in primary and
         "WorkingDirectory=/var/lib/aoe2war-web-prod-fcd58f2ac05b" in primary,
         "PUBLIC_3032_RUNTIME_DRIFT")
    sockets = command(["/usr/bin/ss", "-H", "-ltn"])
    for port in PORTS_UP:
        need(len(re.findall(r":" + str(port) + r"\s", sockets)) == 1,
             "PROTECTED_LISTENER_" + str(port))
    for port in PORTS_DOWN:
        need(not re.search(r":" + str(port) + r"\s", sockets),
             "FINANCIAL_LISTENER_" + str(port))
    # The factory status file is the canonical live/rollback pointer; its
    # previousRelease must never point into the retirement set.
    status = json.loads(filebytes(Path("/var/lib/aoe2war-web-prod-fcd58f2ac05b")
                                  / "public/factory/status.json", limit=100000))
    need(status["liveRelease"]["id"] ==
         "fcd58f2ac05bc94ddb8154cce9e130e244d501b0" and
         status["previousRelease"]["id"] ==
         "9a51e962a7fb1c181c6698dbc957ca4b606b4e2e" and
         status["pipelineStage"].get("active") is None,
         "CURRENT_OR_FAST_ROLLBACK_POINTER_DRIFT")
    pointers = canonical({k: status.get(k) for k in
                          ("liveRelease", "previousRelease", "candidateRelease",
                           "pipelineStage")})
    need(not any(e["source_sha"].encode() in pointers or
                 e["prefix"].encode() in pointers for e in exact_inventory()),
         "FACTORY_STATUS_CONTAINS_PROTECTED_CANDIDATE_POINTER")
    out = command(["/usr/bin/curl", "-fsSI", "--max-time", "12",
                   "https://aoe2war.com/"], timeout=16)
    need("HTTP/2 200" in out or "HTTP/1.1 200" in out, "PUBLIC_HTTPS_NOT_200")
    need("fcd58f2ac05bc94ddb8154cce9e130e244d501b0" in out,
         "PUBLIC_SOURCE_DRIFT")
    return {"runtime": "fcd58f2ac05b", "https_200": True,
            "protected_up": list(PORTS_UP), "financial_down": list(PORTS_DOWN)}


def free_bytes() -> int:
    s = os.statvfs("/")
    return s.f_bavail * s.f_frsize


def preflight() -> dict:
    host_identity()
    inventory = exact_inventory()
    for e in inventory:
        inspect_one(e)
    live_refs(inventory)
    health = services()
    return {"schema": SCHEMA, "status": "PREVIEW_ONLY",
            "authority": "OWNER_SIGNATURE_NOT_CONSUMED",
            "controller_sha256": sha(filebytes(Path(__file__), limit=100000)),
            "owner_spki_sha256": filebytes(TRUST_PIN, limit=100).decode().strip(),
            "inventory_sha256": inventory_digest(), "targets": inventory,
            "gross_allocated_bytes": sum(t["gross_allocated_bytes"] for t in inventory),
            "free_root_before_bytes": free_bytes(), "health": health,
            "requires_explicit_signed_once_use_owner_consent": True}


def validate_packet(packet: dict, preview: dict, *, now: datetime) -> dict:
    need(set(packet) == {"payload", "signature_base64"}, "PERMIT_SCHEMA")
    x = packet["payload"]
    need(isinstance(x, dict) and x.get("schema") == SCHEMA
         and x.get("action") == "RETIRE_EXACT_FIVE_ONLY"
         and x.get("financial_authorized") is False
         and x.get("owner") == "Emaren", "WRONG_OWNER_SCOPE")
    need(x.get("controller_sha256") == preview["controller_sha256"]
         and x.get("inventory_sha256") == preview["inventory_sha256"]
         and x.get("targets") == preview["targets"]
         and x.get("owner_spki_sha256") == preview["owner_spki_sha256"]
         and x.get("live_runtime") == preview["health"]["runtime"],
         "OWNER_SIGNED_PREIMAGE_DRIFT")
    need(NONCE.fullmatch(str(x.get("nonce", ""))) is not None,
         "OWNER_NONCE_MISSING")
    issued = datetime.fromisoformat(x["issued_utc"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(x["expires_utc"].replace("Z", "+00:00"))
    need(issued.tzinfo and expires.tzinfo and
         issued.utcoffset().total_seconds() == 0 and
         expires.utcoffset().total_seconds() == 0 and
         issued <= now < expires and 0 < (expires-issued).total_seconds() <= 900,
         "OWNER_PERMIT_EXPIRED_OR_FUTURE")
    return x


def owner_signature(packet: dict) -> None:
    trusted_ancestors(TRUST.parent)
    owner_key = filebytes(TRUST, limit=30000)
    expected = filebytes(TRUST_PIN, limit=100).decode().strip()
    need(HEX64.fullmatch(expected) is not None, "OWNER_SPKI_PIN")
    spki = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in",
                           str(TRUST), "-pubout", "-outform", "DER"],
                          capture_output=True, timeout=15)
    need(spki.returncode == 0 and sha(spki.stdout) == expected,
         "OWNER_SIGNER_IDENTITY_DRIFT")
    sig = base64.b64decode(packet["signature_base64"], validate=True)
    need(len(sig) == 64, "OWNER_SIGNATURE_LENGTH")
    with tempfile.TemporaryDirectory(prefix="we2-retire-verify-", dir=STATE) as tmp:
        msg, signature = Path(tmp)/"message", Path(tmp)/"signature"
        msg.write_bytes(DOMAIN + canonical(packet["payload"]))
        signature.write_bytes(sig)
        result = subprocess.run(["/usr/bin/openssl", "pkeyutl", "-verify", "-pubin",
                                 "-inkey", str(TRUST), "-rawin", "-in", str(msg),
                                 "-sigfile", str(signature)], capture_output=True,
                                timeout=15)
    need(result.returncode == 0, "OWNER_SIGNATURE_INVALID")


def receipt_write(name: str, value: dict) -> None:
    need(re.fullmatch(r"[A-Za-z0-9_-]{1,100}\.json", name) is not None,
         "BAD_RECEIPT_NAME")
    path = STATE / name
    data = canonical(value) + b"\n"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    directory_fd = os.open(STATE, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def guarded_destroy(entry: dict, nonce: str) -> tuple[int, int]:
    before = free_bytes()
    inspect_one(entry)
    # Quarantine on the exact same filesystem first: if health fails, restore
    # the name before any bytes are removed. No broad wildcard or user path.
    original = Path(entry["path"])
    quarantine = PARENT / (".we2-retire-" + entry["prefix"] + "-" + nonce[:12])
    need(not quarantine.exists() and not quarantine.is_symlink(),
         "QUARANTINE_COLLISION")
    os.rename(original, quarantine)
    try:
        q = quarantine.lstat()
        need(q.st_ino == entry["root_inode"] and q.st_dev == entry["root_dev"],
             "QUARANTINE_IDENTITY_DRIFT")
        live_refs(exact_inventory())
        services()
    except Exception:
        os.rename(quarantine, original)
        raise
    need(shutil.rmtree.avoids_symlink_attacks, "NO_FD_SAFE_TREE_REMOVAL")
    shutil.rmtree(quarantine)
    need(not quarantine.exists() and not original.exists(), "INCOMPLETE_REMOVAL")
    after = free_bytes()
    need(after > before, "NO_PHYSICAL_ROOT_RECLAIM")
    services()
    return before, after


def execute(path: Path) -> None:
    host_identity()
    need(Path(__file__) == ROOT_INSTALL and
         not Path(__file__).is_symlink(), "UNINSTALLED_ROOT_SOURCE")
    trusted_ancestors(ROOT_INSTALL.parent)
    trusted_ancestors(STATE)
    s = STATE.lstat()
    need(s.st_uid == 0 and stat.S_IMODE(s.st_mode) == 0o700,
         "RETIRE_STATE_NOT_ENROLLED")
    trusted_ancestors(LOCK.parent)
    with LOCK.open("rb") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        preview = preflight()
        data = filebytes(path, limit=40000)
        packet = json.loads(data, object_pairs_hook=unique_pairs)
        scope = validate_packet(packet, preview, now=datetime.now(timezone.utc))
        owner_signature(packet)
        nonce = scope["nonce"]
        receipt_write("nonce-" + nonce + ".json",
                      {"schema": SCHEMA, "packet_sha256": sha(data),
                       "started_utc": datetime.now(timezone.utc).isoformat(),
                       "targets": preview["targets"]})
        for e in preview["targets"]:
            # Reread all remaining target identities, services and refs before
            # every unlink; a drift stops the entire transaction.
            for remaining in preview["targets"]:
                if Path(remaining["path"]).exists():
                    inspect_one(remaining)
            live_refs(preview["targets"])
            services()
            before, after = guarded_destroy(e, nonce)
            receipt_write("retired-" + e["prefix"] + "-" + nonce + ".json",
                          {"schema": SCHEMA, "source": e["source_sha"],
                           "root_inode": e["root_inode"], "root_dev": e["root_dev"],
                           "manifest_sha256": e["manifest_sha256"],
                           "gross_allocated_bytes": e["gross_allocated_bytes"],
                           "df_before_bytes": before, "df_after_bytes": after,
                           "measured_reclaimed_bytes": after-before,
                           "public_https_and_protected_ports": "PASS",
                           "packet_sha256": sha(data),
                           "completed_utc": datetime.now(timezone.utc).isoformat()})
            print("PASS_ONE_EXACT_RUNTIME_RETIRED", e["prefix"], after-before,
                  flush=True)


def main() -> None:
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--preview", action="store_true")
    g.add_argument("--execute", type=Path)
    args = p.parse_args()
    try:
        if args.preview:
            print(json.dumps(preflight(), sort_keys=True))
        else:
            execute(args.execute)
    except (Hold, OSError, ValueError, KeyError, RuntimeError,
            subprocess.TimeoutExpired) as exc:
        print("HOLD_WE2_EXACT_FIVE_RETIREE", str(exc)[:240], file=sys.stderr)
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()