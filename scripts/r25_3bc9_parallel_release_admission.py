#!/usr/bin/env python3
"""Fail-closed, NON-MUTATING R25 3033 parallel-canary admission proposal.

No phase starts a process, installs a unit, reloads systemd/Nginx, enables a
timer, reads private environment values, changes PostgreSQL, or signs WOLO.
A separate independently source-reviewed, one-use native installer is required.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys

SOURCE = "3bc9c3be73210552f1b344c188b1665407b83fee"
BUILD_ID = "W5WS0btc500n7GGUjWXSx"
BUILD_VERSION = "20261108014417-3c746c69db"
STAGE = Path("/var/lib/aoe2war-web-prod-3bc9c3be7321")
CURRENT_STAGE = "/var/lib/aoe2war-web-prod-1a380cdf76ff"
ARTIFACT_ROOT = Path("/var/lib/aoe2war-runtime-artifacts") / SOURCE
STAGE_RECEIPT_SHA = "f6502fac75d4fc7ce2eba23152a21d27e97190c9e5cb28dca2f32956ac077ac8"
ZIP_SHA = "25079fe2582630e2e3a85c09900a6d98f1eb62372e0b50b4620948d232461da0"
RUNTIME_SHA = "d37f940d163613d329ec345e1c11ea1688ae7c5045eafca2242644158dbfdc5b"
LIVE_WEB_UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
LIVE_STEAM_UNIT = Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
LIVE_NGINX = Path("/etc/nginx/sites-available/aoe2war.com")
EXPECTED_WEB_UNIT_SHA = "1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3"
OLD_GUARD_PATH = Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")
CANDIDATE_GUARD_PATH = Path("/usr/local/lib/aoe2war-web-prod/r25_3bc9_guard_candidate_3033.cjs")
OLD_GUARD_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
CANDIDATE_GUARD_SHA = "a2b6183a4a08873cf0551ad632aaf9b92d18e76da41fe81732b4f4b31a17ce0f"
EXPECTED_STEAM_UNIT_SHA = "89991b952bf1588640299bcef2b4f48810596f947c4ec0f7020d93eb17de5c36"
EXPECTED_NGINX_SHA = "9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7"
REVIEWED_CANARY_UNIT = "aoe2hdbets-web-prod-candidate.service"
CANARY_CACHE = "aoe2war-web-prod-candidate-3bc9"
MIN_AVAILABLE_BYTES = 3 * 1024**3
MAX_USED_SWAP_BYTES = 4 * 1024**3
C03_INCOMPLETE = True
FROZEN_3032_PID = 2206791
FROZEN_3030_PID = 2625090


class Hold(RuntimeError):
    pass


def need(ok: bool, reason: str) -> None:
    if not ok:
        raise Hold(reason)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_root_file(path: Path, expected_sha: str, max_bytes: int = 8_000_000) -> bytes:
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink() and
         info.st_uid == 0 and info.st_nlink == 1 and
         not info.st_mode & 0o022 and 0 < info.st_size <= max_bytes,
         "ROOT_SEALED_FILE_UNTRUSTED:" + path.name)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino, opened.st_uid, opened.st_size) ==
             (info.st_dev, info.st_ino, info.st_uid, info.st_size),
             "ROOT_FILE_OPEN_RACE:" + path.name)
        data = os.read(fd, max_bytes + 1)
    finally:
        os.close(fd)
    need(len(data) == info.st_size and sha(data) == expected_sha,
         "ROOT_FILE_PIN_CHANGED:" + path.name)
    return data


def replace_exact(raw: bytes, old: bytes, new: bytes, expected_count: int) -> bytes:
    need(raw.count(old) == expected_count and old != new,
         "UNIT_REPLACEMENT_SCOPE_CHANGED:" + old.decode("utf-8", "replace")[:72])
    return raw.replace(old, new)


def render_candidate_guard(old: bytes, expected_old_sha: str = OLD_GUARD_SHA) -> bytes:
    """Pure exact-byte derivation; never weaken the original network fence."""
    need(sha(old) == expected_old_sha, "LIVE_GUARD_SOURCE_BYTES_NOT_REVIEWED")
    out = replace_exact(old, str(OLD_GUARD_PATH).encode(),
                        str(CANDIDATE_GUARD_PATH).encode(), 1)
    out = replace_exact(out, b'PORT: "3032"', b'PORT: "3033"', 1)
    out = replace_exact(out, b'Number(opts.port) === 3032',
                        b'Number(opts.port) === 3033', 1)
    out = replace_exact(out, b'process.env.CACHE_DIRECTORY === "/var/cache/aoe2war-web-prod"',
                        b'process.env.CACHE_DIRECTORY === "/var/cache/' + CANARY_CACHE.encode() + b'"', 1)
    need(out.count(b"3032") == 0 and
         b'PORT: "3033"' in out and
         b'Number(opts.port) === 3033' in out and
         b"NODE_EGRESS_DENIED" in out and
         b"DEDICATED_AUTH_DATABASE_ROLE_REQUIRED" in out and
         b"ONLY_VALIDATED_STEAM_HTTPS" in out and
         b"STEAM_CERTIFICATE_AND_SNI_REQUIRED" in out and
         b"ONLY_READONLY_BACKEND_HTTP" in out,
         "GUARD_NEW_SCOPE_OR_ORIGINAL_DENIAL_CHANGED")
    return out


def render_candidate_unit(old: bytes, expected_old_sha: str = EXPECTED_WEB_UNIT_SHA) -> bytes:
    """Pure source-pinned proposal. Strictly scoped to a distinct local port/cache.

    A new independent unit preserves current 3032 and 3030 process identities.
    It must not be installed before owner-approved resource + C03 topology review.
    """
    need(sha(old) == expected_old_sha, "LIVE_WEB_UNIT_BYTES_NOT_REVIEWED")
    for required in (
        b"User=aoe2war-web-prod\n", b"Group=aoe2war-web-prod\n",
        b"EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env\n",
        b"WARGRAPH_RUNTIME_DISABLED=true", b"AOE2WAR_PROD_DB_PREVIEW=false",
        b"AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1",
        b"NoNewPrivileges=yes\n", b"CapabilityBoundingSet=\n",
        b"ProtectSystem=strict\n", b"ProtectHome=yes\n",
        b"PrivateTmp=yes\n", b"PrivateDevices=yes\n",
        b"RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX\n",
        b"InaccessiblePaths=/etc/aoe2hdbets /var/lib/postgresql",
        b"Restart=on-failure\n",
    ):
        need(required in old, "SECURITY_SANDBOX_REQUIREMENT_MISSING")
    need(old.count(b"EnvironmentFile=") == 1 and
         old.count(b"ExecStart=") == 1 and
         old.count(b"BindPaths=") == 1 and
         old.count(b"CacheDirectory=") == 1 and
         old.count(b"CacheDirectoryMode=") == 1, "WEB_UNIT_SHAPE_CHANGED")
    current = CURRENT_STAGE.encode()
    candidate = str(STAGE).encode()
    out = replace_exact(old, current, candidate, 4)
    out = replace_exact(out, b"PORT=3032 ", b"PORT=3033 ", 1)
    out = replace_exact(out, b"NODE_OPTIONS=--require=" + str(OLD_GUARD_PATH).encode(),
                        b"NODE_OPTIONS=--require=" + str(CANDIDATE_GUARD_PATH).encode(), 1)
    out = replace_exact(out, b"--port 3032\n", b"--port 3033\n", 1)
    out = replace_exact(out, b"CacheDirectory=aoe2war-web-prod\n",
                        b"CacheDirectory=" + CANARY_CACHE.encode() + b"\n", 1)
    out = replace_exact(out, b"BindPaths=/var/cache/aoe2war-web-prod:",
                        b"BindPaths=/var/cache/" + CANARY_CACHE.encode() + b":", 1)
    out = replace_exact(out, b"--max-old-space-size=2048",
                        b"--max-old-space-size=1024", 1)
    out = replace_exact(out, b"MemoryHigh=2700M\n", b"MemoryHigh=1400M\n", 1)
    out = replace_exact(out, b"MemoryMax=3200M\n", b"MemoryMax=1800M\n", 1)
    out = replace_exact(out, b"CPUQuota=150%\n", b"CPUQuota=100%\n", 1)
    out = replace_exact(out, b"Restart=on-failure\n", b"Restart=no\n", 1)
    out = replace_exact(out, b"Description=AoE2WAR nonfinancial production web\n",
                        b"Description=AoE2WAR isolated R25 nonfinancial 3033 candidate (NO PUBLIC ROUTE)\n", 1)
    need(current not in out and b"--port 3032" not in out and b"PORT=3032 " not in out,
         "CANARY_STILL_REFERENCES_PRODUCTION_RUNTIME")
    need(b"PORT=3033" in out and b"--port 3033" in out and
         out.count(candidate) == 4 and out.count(CANARY_CACHE.encode()) == 2,
         "CANARY_BOUNDED_TRANSFORM_UNPROVEN")
    need(b"EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env" in out and
         b"WARGRAPH_RUNTIME_DISABLED=true" in out and
         b"NODE_OPTIONS=--require=" + str(CANDIDATE_GUARD_PATH).encode() in out and
         b"NODE_OPTIONS=--require=" + str(OLD_GUARD_PATH).encode() not in out,
         "CANARY_NONFINANCIAL_GUARD_LOST")
    return out


def unit_state(unit: str, *keys: str) -> dict[str, str]:
    data = subprocess.check_output(
        ["/usr/bin/systemctl", "show", unit, *[f"-p{key}" for key in keys], "--no-pager"],
        timeout=9, text=True,
    )
    result = dict(line.split("=", 1) for line in data.splitlines() if "=" in line)
    need(all(key in result for key in keys), "SYSTEMD_UNIT_STATE_UNOBSERVABLE:" + unit)
    return result


def resources() -> dict[str, int]:
    raw = Path("/proc/meminfo").read_text(encoding="ascii")
    values = {k: int(v.split()[0]) * 1024
              for line in raw.splitlines()
              if ":" in line
              for k, v in [line.split(":", 1)]
              if k in ("MemAvailable", "SwapTotal", "SwapFree")}
    need(set(values) == {"MemAvailable", "SwapTotal", "SwapFree"} and
         0 <= values["SwapFree"] <= values["SwapTotal"], "MEMORY_PRESSURE_UNOBSERVABLE")
    return {"mem_available_bytes": values["MemAvailable"],
            "swap_used_bytes": values["SwapTotal"] - values["SwapFree"]}


def listener_ports() -> set[int]:
    data = subprocess.check_output(["/usr/bin/ss", "-H", "-lnt"], timeout=10, text=True)
    seen = set()
    for line in data.splitlines():
        columns = line.split()
        if len(columns) >= 4:
            match = re.search(r":([0-9]+)$", columns[3])
            if match:
                seen.add(int(match.group(1)))
    return seen


def source_stage() -> dict:
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == "ubuntu-4gb-hel1-11",
         "EXACT_ROOT_HEL1_ONLY")
    need(ARTIFACT_ROOT.is_dir() and ARTIFACT_ROOT.stat().st_uid == 0 and
         stat.S_IMODE(ARTIFACT_ROOT.stat().st_mode) == 0o700,
         "SOURCE_REVIEWED_ROOT_NAMESPACE_CHANGED")
    b = read_root_file(ARTIFACT_ROOT / "inert-stage-accepted.json", STAGE_RECEIPT_SHA)
    receipt = json.loads(b)
    need(receipt.get("schema") == "aoe2war.session-b.inert-r25-ci-stage.v1" and
         receipt.get("status") == "PASS_EXACT_SOURCE_CI_RUNTIME_INERT_STAGED" and
         receipt.get("source_sha") == SOURCE and
         receipt.get("build_id") == BUILD_ID and
         receipt.get("build_version") == BUILD_VERSION and
         receipt.get("zip_sha256") == ZIP_SHA and
         receipt.get("runtime_sha256") == RUNTIME_SHA and
         receipt.get("files") == 44924 and
         receipt.get("protected_preimage_verified_unchanged") is True and
         receipt.get("public_cutover_authorized") is False and
         receipt.get("financial_authorized") is False,
         "STAGE_ROOT_RECEIPT_CONTRACT_CHANGED")
    need(STAGE.is_dir() and not STAGE.is_symlink() and
         STAGE.stat().st_uid == 0 and
         (STAGE / ".aoe2war-source-sha").read_text().strip() == SOURCE and
         (STAGE / ".next/BUILD_ID").read_text().strip() == BUILD_ID,
         "STAGE_BUILD_OR_OWNER_CHANGED")
    need(sha((STAGE / ".aoe2war-runtime-manifest.json").read_bytes()) ==
         receipt.get("manifest_sha256"), "EXTRACTED_MANIFEST_DRIFT")
    return receipt


def runtime_audit() -> dict:
    source_stage()
    old = read_root_file(LIVE_WEB_UNIT, EXPECTED_WEB_UNIT_SHA)
    proposed = render_candidate_unit(old)
    old_guard = read_root_file(OLD_GUARD_PATH, OLD_GUARD_SHA)
    proposed_guard = render_candidate_guard(old_guard)
    need(sha(proposed_guard) == CANDIDATE_GUARD_SHA,
         "CANDIDATE_NETWORK_GUARD_SOURCE_DRIFT")
    need(sha(read_root_file(LIVE_STEAM_UNIT, EXPECTED_STEAM_UNIT_SHA)) ==
         EXPECTED_STEAM_UNIT_SHA, "STEAM_PREIMAGE_DRIFT")
    need(sha(read_root_file(LIVE_NGINX, EXPECTED_NGINX_SHA)) ==
         EXPECTED_NGINX_SHA, "NGINX_PREIMAGE_DRIFT")
    old_site = unit_state("aoe2hdbets-web.service", "ActiveState", "MainPID")
    prod = unit_state("aoe2hdbets-web-prod.service", "ActiveState", "MainPID", "WorkingDirectory")
    candidate = unit_state(REVIEWED_CANARY_UNIT, "LoadState", "ActiveState", "MainPID")
    need(old_site["ActiveState"] == "active" and
         old_site["MainPID"] == str(FROZEN_3030_PID) and
         prod["ActiveState"] == "active" and
         prod["MainPID"] == str(FROZEN_3032_PID) and
         prod["WorkingDirectory"] == CURRENT_STAGE,
         "PROTECTED_WEBSITE_OR_ROLLBACK_IDENTITY_CHANGED")
    need(candidate["LoadState"] == "not-found" and
         candidate["ActiveState"] == "inactive" and
         candidate["MainPID"] == "0", "CANARY_UNIT_ALREADY_EXISTS")
    ports = listener_ports()
    need(3032 in ports and 3030 in ports and
         3033 not in ports and 8094 not in ports and 8095 not in ports,
         "PUBLIC_OR_FUNDED_LISTENER_DRIFT")
    r = resources()
    need(r["mem_available_bytes"] >= MIN_AVAILABLE_BYTES and
         r["swap_used_bytes"] <= MAX_USED_SWAP_BYTES,
         "HOLD_CANARY_MEMORY_OR_SWAP_RESERVE_INSUFFICIENT")
    # These constraints cannot be solved by the web operator via C03 privileges.
    return {"schema": "aoe2war.r25.3bc9.parallel-canary-proposal.v1",
            "status": "PASS_READONLY_PARALLEL_UNIT_PROPOSAL_NOT_INSTALL_AUTHORITY",
            "source_sha": SOURCE, "build_id": BUILD_ID, "stage": str(STAGE),
            "old_unit_sha256": EXPECTED_WEB_UNIT_SHA,
            "candidate_unit_sha256": sha(proposed),
            "candidate_guard_sha256": sha(proposed_guard),
            "old_3032_pid": FROZEN_3032_PID, "old_3030_pid": FROZEN_3030_PID,
            "memory": r, "candidate_port": 3033,
            "existing_3032_and_3030_unmodified": True,
            "finance_readonly_3030_rollback_certified": False,
            "c03_complete": False, "funded_ports_off": True,
            "candidate_installed": False, "candidate_started": False,
            "owner_release_approval": False, "web_cutover_authorized": False,
            "financial_authorized": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True,
                        choices=("selftest", "render", "render-guard", "audit"))
    parser.add_argument("--unit-file", type=Path)
    parser.add_argument("--guard-file", type=Path)
    args = parser.parse_args()
    need((args.phase == "render" or args.unit_file is None) and
         (args.phase == "render-guard" or args.guard_file is None),
         "ONLY_PURE_RENDER_ACCEPTS_LOCAL_FILE")
    if args.phase == "selftest":
        need(SOURCE != "1a380cdf76ff773aa1d094abd161523500b32b4a"
             and C03_INCOMPLETE and FROZEN_3030_PID != FROZEN_3032_PID,
             "STATIC_SCOPE_INVALID")
        print("PASS_R25_3BC9_PARALLEL_CANARY_STATIC_NO_SERVICE_MUTATION")
    elif args.phase == "render":
        need(args.unit_file is not None and args.unit_file.is_file(),
             "REVIEWED_UNIT_INPUT_REQUIRED")
        candidate = render_candidate_unit(args.unit_file.read_bytes())
        # Emit exact raw unit bytes; avoid an extra print() newline and SHA drift.
        sys.stdout.buffer.write(candidate)
    elif args.phase == "render-guard":
        need(args.guard_file is not None and args.guard_file.is_file(),
             "REVIEWED_GUARD_INPUT_REQUIRED")
        sys.stdout.buffer.write(render_candidate_guard(args.guard_file.read_bytes()))
    else:
        print(json.dumps(runtime_audit(), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD_PARALLEL_CANARY_NO_MUTATION",
                          "reason": str(exc)[:170], "financial_authorized": False,
                          "web_cutover_authorized": False}, sort_keys=True))
        sys.exit(3)
