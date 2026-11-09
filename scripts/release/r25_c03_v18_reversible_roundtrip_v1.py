#!/usr/bin/env python3
"""V18 exact-source reversible public-only same-slot 3032 rollback and return.

Production adapter is isolated from the fake acceptance harness; the ONLY
production operation is an explicit --physical after source review. The public
R25 build must already be retained. No financial port, DB role, key, or WOLO
mutation. No third Next.js server, new port, MemoryMax or V8 increase.

A failed return attempts to restore the repaired site; if that is impossible,
preserves the exact original restricted R25 with Steam V18. One-use receipt
records negative results. Browser/financial gate acceptance is NEVER implied.
"""
from __future__ import annotations
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
from dataclasses import dataclass
from typing import Protocol

APP_SOURCE = "b1ef050b954be734c9f34147361e0d02d7c89b19"
BUILD_ID = "QVzgMJiQwhFvwrRbY9oZW"
BUILD_VERSION = "20261109194837-9ac998896a"
ORIGINAL_VERSION = "20261108182649-ca81f00609"
ORIGINAL_SOURCE = "4ab96cc7c1c0ba43a0403795485d3f410a6ba07f"
ORIGINAL_BUILD_ID = "YF_YxSAxc0izAfRG0ARsc"
ORIGINAL_UNIT_SHA = "42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621"
CANDIDATE_UNIT_SHA = "f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a"
V18_UNIT_SHA = "8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032"
V18_SOURCE_SHA = "42dbba88209ba703a5d8472e83c3865d890e5a9b7481587102b33deba5f51c4b"
MANIFEST_SHA = "a306aebc8643feb3ae0ae75249f3bf8b4c19b11a7f4957a8e882d0b845a1a58d"
STAGE_SHA = "c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7"
V18_CONTROLLER_SHA = "8af1ea1d06e2f60d60241fe14bb59a600041bd4e7adf2a041e12b511d677b199"
TRIAL_SHA = "af5fdcc3e6bbef0b6b56f9a80f6deb6df88d04e4f3e1febd506c2e421a9f4fea"
FIN_SNAPSHOT = "6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999"
NFT_SHAPE = "985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af"
MEMORY_MAX = 3355443200
ROOT = Path("/root/aoe2war-r25-b1ef-v18-roundtrip-20261109")
RELEASE_ROOT = Path("/root/aoe2war-r25-b1ef-v18-retained-release-20261109")
TRIAL_ROOT = Path("/root/aoe2war-r25-b1ef-single-slot-trial-v1-20261109")
LOCK = Path("/run/lock/aoe2war-r25-b1ef-v18-roundtrip.lock")


class Hold(RuntimeError):
    pass


def need(value: object, label: str) -> None:
    if not value:
        raise Hold("HOLD_" + label)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    return sha(path.read_bytes())


@dataclass(frozen=True)
class Snapshot:
    profile: str
    unit_sha: str
    pid: int
    build_version: str
    build_id: str
    app_source: str
    steam_unit_sha: str
    steam_source_sha: str
    fin_snapshot: str
    nft_shape: str
    memory_max: int
    memory_current: int
    restarts: int
    web_active: bool
    steam_timer_active: bool
    finance_ports_closed: bool
    legacy_masked: bool
    validator_pid: int
    rollback_3030_pid: int
    app_runtime_count: int


class Host(Protocol):
    def snapshot(self) -> Snapshot: ...
    def stop_timer(self) -> None: ...
    def stop_web(self) -> None: ...
    def install_web_unit(self, profile: str) -> None: ...
    def start_web(self) -> None: ...
    def wait_health(self, profile: str) -> None: ...
    def enroll(self, profile: str) -> None: ...
    def refresh_steam(self) -> None: ...
    def start_timer(self) -> None: ...


def check(s: Snapshot, profile: str, *, require_timer: bool = True) -> None:
    need(profile in ("candidate", "rollback"), "PROFILE_NOT_ALLOWLISTED")
    expected_unit = CANDIDATE_UNIT_SHA if profile == "candidate" else ORIGINAL_UNIT_SHA
    expected_version = BUILD_VERSION if profile == "candidate" else ORIGINAL_VERSION
    need(s.profile == profile, "STEAM_PROFILE_OR_ACTIVE_RUNTIME_DRIFT")
    need(s.unit_sha == expected_unit, "WEB_UNIT_SHA_DRIFT")
    need(s.build_version == expected_version, "WEB_BUILD_DRIFT")
    need(s.build_id == (BUILD_ID if profile == "candidate" else ORIGINAL_BUILD_ID),
         "WEB_BUILD_ID_DRIFT")
    need(s.app_source == (APP_SOURCE if profile == "candidate" else ORIGINAL_SOURCE),
         "WEB_SOURCE_DRIFT")
    need(s.steam_unit_sha == V18_UNIT_SHA and s.steam_source_sha == V18_SOURCE_SHA,
         "STEAM_V18_SOURCE_OR_UNIT_DRIFT")
    need(s.fin_snapshot == FIN_SNAPSHOT and s.nft_shape == NFT_SHAPE,
         "PROTECTED_FINANCE_NFT_TOPOLOGY_DRIFT")
    need(s.memory_max == MEMORY_MAX and 0 < s.memory_current < MEMORY_MAX,
         "WEB_MEMORY_LIMIT_OR_BREACH")
    need(s.restarts == 0 and s.pid > 0 and s.web_active, "WEB_NOT_ACTIVE_NO_RESTARTS")
    if require_timer:
        need(s.steam_timer_active, "STEAM_TIMER_NOT_RESTORED")
    need(s.finance_ports_closed and s.legacy_masked, "FINANCIAL_QUARANTINE_BREACH")
    need(s.validator_pid == 1009 and s.rollback_3030_pid == 2625090,
         "PROTECTED_VALIDATOR_OR_3030_IDENTITY_DRIFT")
    need(s.app_runtime_count == 2, "EXTRA_NEXT_RUNTIME")


def transfer(host: Host, profile: str, log: list[dict]) -> None:
    """One slot: stop old service BEFORE ever changing unit/starting new."""
    need(profile in ("candidate", "rollback"), "INVALID_UNIT_TARGET")
    host.stop_timer()
    host.stop_web()
    log.append({"transition": "WEB_STOPPED_BEFORE_UNIT_REPLACEMENT", "to": profile})
    host.install_web_unit(profile)
    host.start_web()
    host.wait_health(profile)
    log.append({"transition": "EXACT_BUILD_HEALTH_PROVEN", "to": profile})
    host.enroll(profile)
    host.refresh_steam()
    host.start_timer()
    check(host.snapshot(), profile)
    log.append({"transition": "FINANCE_RESTRICTED_V18_ENROLLMENT_PROVEN",
                "to": profile, "pid": host.snapshot().pid})


def reversible_cycle(host: Host) -> dict:
    """Never claim closure; tests the actual full source-bound transfer path."""
    changes: list[dict] = []
    status = "HOLD_INCOMPLETE_V18_ROUNDTRIP"
    error: str | None = None
    recovery: str | None = None
    before = host.snapshot()
    try:
        check(before, "candidate")
        changes.append({"transition": "PRECHECK_PINNED_CANDIDATE", "pid": before.pid})
        transfer(host, "rollback", changes)
        need(host.snapshot().pid != before.pid, "ROLLBACK_DID_NOT_RESTART_PROCESS")
        transfer(host, "candidate", changes)
        need(host.snapshot().pid != before.pid, "RETURN_DID_NOT_RESTART_PROCESS")
        status = "PASS_V18_ROLLBACK_AND_RETURN_TO_EXACT_B1EF_NO_FINANCE"
    except Exception as exc:
        error = type(exc).__name__ + ":" + str(exc)[:180]
        if changes:
            # If the timer or preflight failed BEFORE any website change, do
            # NOT restart a healthy production process just to log recovery.
            if not any(e["transition"]=="WEB_STOPPED_BEFORE_UNIT_REPLACEMENT"
                       for e in changes):
                try:
                    now=host.snapshot()
                    if now.web_active and now.unit_sha==CANDIDATE_UNIT_SHA:
                        if not now.steam_timer_active:
                            host.start_timer()
                        check(host.snapshot(),"candidate")
                        recovery="PASS_ORIGINAL_CANDIDATE_UNCHANGED"
                except Exception:
                    pass
            # After a website mutation, recover to the reviewed candidate,
            # else fall back to the true restricted original, never a 503 shim.
            if recovery is None:
                for destination in ("candidate", "rollback"):
                    try:
                        transfer(host, destination, changes)
                        recovery = "PASS_SAFE_RECOVERY_TO_" + destination.upper()
                        break
                    except Exception as rescued:
                        changes.append({"transition": "RECOVERY_ATTEMPT_FAILED",
                                        "profile": destination,
                                        "error_class": type(rescued).__name__})
                if recovery is None:
                    recovery = "HOLD_RECOVERY_NOT_ESTABLISHED"
        else:
            recovery = "PASS_NO_MUTATION_PRECHECK_DENIED"
    try:
        final = host.snapshot()
        final_identity = {"pid": final.pid, "profile": final.profile,
                          "unit_sha": final.unit_sha, "web_active": final.web_active,
                          "finance_ports_closed": final.finance_ports_closed,
                          "steam_timer_active": final.steam_timer_active}
        if status.startswith("PASS_"):
            check(final, "candidate")
    except Exception:
        status = "HOLD_UNOBSERVABLE_FINAL_STATE"
        final_identity = {"status": "UNOBSERVABLE"}
    return {
        "schema": "aoe2war.app.c03-v18-reversible-roundtrip.v1",
        "status": status,
        "app_source_sha": APP_SOURCE, "build_id": BUILD_ID,
        "unit_shas": [ORIGINAL_UNIT_SHA, CANDIDATE_UNIT_SHA],
        "steam_v18_sha": V18_SOURCE_SHA, "events": changes,
        "failure": error, "negative_recovery": recovery, "final": final_identity,
        "C03_APP_HANDOFF_ACCEPTED": False, "C02_APP_TRANSPORT": False,
        "browser_roles_verified": False, "finance_authorized": False,
        "money_moved": False,
    }


def load_reviewed(path: Path, digest: str, mode: int):
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and not path.is_symlink() and st.st_nlink == 1
         and st.st_uid == 0 and stat.S_IMODE(st.st_mode) == mode,
         "REVIEWED_SOURCE_OWNER_OR_MODE")
    need(file_sha(path) == digest, "REVIEWED_SOURCE_BYTES_DRIFT")
    spec = importlib.util.spec_from_file_location("r25_reviewed_" + digest[:8], path)
    need(spec is not None and spec.loader is not None, "SOURCE_MODULE_IMPORT")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SystemdHost:
    """No imports of or writes to live DB, no secrets exposed in receipts."""
    def __init__(self) -> None:
        need(os.geteuid() == 0, "PHYSICAL_ONLY_ROOT")
        self.v18 = load_reviewed(
            RELEASE_ROOT / "r25_c03_b1ef_v18_retained_release_v1.py",
            V18_CONTROLLER_SHA, 0o600)
        self.trial = load_reviewed(
            TRIAL_ROOT / "r25_c03_b1ef_single_slot_trial_v1.py",
            TRIAL_SHA, 0o600)
        # Existing signed source/release anchors remain sealed. This preflight
        # deliberately does not require a healthy Steam process to recover.
        self.v18.baseline(after_promotion=True)
        pinned = self.v18.own(self.v18.RESULT, 0o600,
                              "b9fe6dda2ba1a554b62186689c2323e1b3d4c2b591c06cdf2557575cc5f55b79")
        need(json.loads(pinned)["status"] ==
             "PASS_RUNNING_B1EF_PUBLIC_ONLY_R25_STEAM_V18_NOT_AUTH_CERTIFIED",
             "RETAINED_RELEASE_RECEIPT_DRIFT")
        need(not self.v18.RECOVERY.exists(), "EMERGENCY_ROLLBACK_ALREADY_USED")
        self.original = self.v18.own(self.v18.ORIGINAL_SRC, 0o600, ORIGINAL_UNIT_SHA)
        candidate = self.trial.new_unit(self.original)
        need(sha(candidate) == CANDIDATE_UNIT_SHA, "RECONSTRUCTED_CANDIDATE_UNIT_DRIFT")
        self.units = {"candidate": candidate, "rollback": self.original}
        self.initial_validator = self.v18.show("wolochaind-mainnet.service", "MainPID")
        self.initial_3030 = self.v18.show("aoe2hdbets-web.service", "MainPID")
        need(self.initial_validator == "1009" and self.initial_3030 == "2625090",
             "HOST_PROTECTED_SERVICES_DRIFT")

    def _show(self, unit: str, field: str) -> str:
        return self.v18.show(unit, field)

    def _finance(self) -> None:
        self.trial.finance()
        need(self._show(self.v18.WEB_SERVICE, "User") == "aoe2war-web-prod",
             "WEB_RESTRICTED_ROLE_DRIFT")

    def snapshot(self) -> Snapshot:
        web = self.v18.INSTALLED_WEB
        actual_hash = file_sha(web)
        need(actual_hash in (ORIGINAL_UNIT_SHA, CANDIDATE_UNIT_SHA),
             "UNKNOWN_ACTIVE_WEB_UNIT")
        profile = "candidate" if actual_hash == CANDIDATE_UNIT_SHA else "rollback"
        stage = self.trial.STAGE if profile == "candidate" else self.trial.OLD_STAGE
        main_pid = int(self._show(self.v18.WEB_SERVICE, "MainPID"))
        active = self._show(self.v18.WEB_SERVICE, "ActiveState") == "active"
        build = (stage / ".next/BUILD_ID").read_text().strip()
        source = (stage / ".aoe2war-source-sha").read_text().strip()
        need(source == (APP_SOURCE if profile == "candidate" else ORIGINAL_SOURCE)
             and build == (BUILD_ID if profile == "candidate" else ORIGINAL_BUILD_ID),
             "PINNED_RUNTIME_STAGE_IDENTITY_DRIFT")
        if profile == "candidate":
            need(file_sha(stage / ".aoe2war-runtime-manifest.json") == MANIFEST_SHA,
                 "CANDIDATE_MANIFEST_DRIFT")
        # 3031 was independently seen as a THIRD AoE2WAR Next runtime (PID
        # 1483304 on 2026-11-09 23:01 UTC). Do not fabricate two. Physical
        # rollback/return must HOLD until that extra runtime is qualified
        # or retired under its actual routing owner.
        sockets = self.v18.shell(["ss", "-H", "-ltnp"], 12)
        lines = sockets.splitlines()
        for port in ("3030", "3032"):
            need(any("127.0.0.1:" + port + " " in line
                     and "next-server" in line for line in lines),
                 "MISSING_PROTECTED_WEB_LISTENER_" + port)
        count = 2 + sum(
            any("127.0.0.1:" + port + " " in line
                and "next-server" in line for line in lines)
            for port in ("3031", "3033")
        )
        need(not any("127.0.0.1:3033 " in line
                     and "next-server" in line for line in lines),
             "UNAUTHORIZED_3033_NEXT_RUNTIME")
        version = (BUILD_VERSION if self.trial.wait_version(BUILD_VERSION, 6)
                   else ORIGINAL_VERSION if self.trial.wait_version(ORIGINAL_VERSION, 6)
                   else "UNOBSERVABLE")
        self._finance()
        accepted = json.loads((self.v18.PUBLIC_ROOT / "accepted-runtime.json").read_text())
        policy = json.loads((self.v18.PUBLIC_ROOT / "steam-refresh-policy.json").read_text())
        need(accepted.get("current_public_pid") == main_pid
             and accepted.get("unit_sha256") == actual_hash
             and accepted.get("profile") == profile,
             "V18_ENROLLMENT_IDENTITY_DRIFT")
        return Snapshot(
            profile=profile, unit_sha=actual_hash, pid=main_pid,
            build_version=version, build_id=build, app_source=source,
            steam_unit_sha=file_sha(self.v18.INSTALLED_STEAM),
            steam_source_sha=file_sha(self.v18.INSTALLED_V18),
            fin_snapshot=accepted.get("fin_snapshot_sha256", ""),
            nft_shape=accepted.get("nft_shape_sha256", ""),
            memory_max=int(self._show(self.v18.WEB_SERVICE, "MemoryMax")),
            memory_current=int(self._show(self.v18.WEB_SERVICE, "MemoryCurrent")),
            restarts=int(self._show(self.v18.WEB_SERVICE, "NRestarts")),
            web_active=active,
            steam_timer_active=self._show(self.v18.TIMER, "ActiveState") == "active",
            finance_ports_closed=True, legacy_masked=True,
            validator_pid=int(self.initial_validator),
            rollback_3030_pid=int(self.initial_3030),
            app_runtime_count=count)

    def stop_timer(self) -> None:
        self.v18.stop_timer()

    def stop_web(self) -> None:
        self.v18.shell(["systemctl", "stop", self.v18.WEB_SERVICE], 45)
        need(self._show(self.v18.WEB_SERVICE, "ActiveState") == "inactive",
             "OLD_WEB_NOT_FULLY_STOPPED")

    def install_web_unit(self, profile: str) -> None:
        need(profile in self.units, "NON_ALLOWLISTED_WEB_UNIT")
        need(self._show(self.v18.WEB_SERVICE, "ActiveState") == "inactive",
             "UNIT_WRITE_WHILE_WEB_ACTIVE")
        self.v18.replace_unit(self.v18.INSTALLED_WEB, self.units[profile])
        need(file_sha(self.v18.INSTALLED_WEB) ==
             (CANDIDATE_UNIT_SHA if profile == "candidate" else ORIGINAL_UNIT_SHA),
             "UNIT_POST_INSTALL_DRIFT")

    def start_web(self) -> None:
        self.v18.shell(["systemctl", "start", self.v18.WEB_SERVICE], 45)

    def wait_health(self, profile: str) -> None:
        art = json.loads(self.v18.own(self.v18.CI_ARTIFACT, 0o600,
                                      self.v18.CI_ARTIFACT_SHA))
        expected = BUILD_VERSION if profile == "candidate" else ORIGINAL_VERSION
        need(self.trial.wait_version(expected, 105), "RESTART_BUILD_NOT_HEALTHY")
        if profile == "candidate":
            self.trial.protected_public_health(art)
        else:
            code, body, _ = self.trial.api("/api/auth/session", 11)
            need(code == 401, "ORIGINAL_RESTRICTED_SESSION_NOT_PRIVATE")
        self._finance()

    def enroll(self, profile: str) -> None:
        need(profile in self.units, "WRONG_ENROLLMENT_PROFILE")
        self.v18.v18_command("--phase", "enroll", "--profile", profile, timeout=175)

    def refresh_steam(self) -> None:
        self.v18.shell(["systemctl", "start", self.v18.STEAM_SERVICE], 160)
        need(self._show(self.v18.STEAM_SERVICE, "Result") == "success",
             "STEAM_REFRESH_HOLD")
        self.v18.v18_command("--phase", "inspect", timeout=95)

    def start_timer(self) -> None:
        self.v18.shell(["systemctl", "start", self.v18.TIMER], 35)


def seal(path: Path, report: dict) -> str:
    need(path.parent.is_dir() and not path.parent.is_symlink()
         and stat.S_IMODE(path.parent.stat().st_mode) == 0o700,
         "PRIVATE_RECEIPT_DIRECTORY_REQUIRED")
    need(not path.exists() and not path.is_symlink(), "ONE_USE_RECEIPT_EXISTS")
    raw=(json.dumps(report,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    return sha(raw)


def main(argv: list[str]) -> int:
    if argv == ["--inspect"]:
        # Read-only physical preflight, with the same exact pinned admission
        # checks as the executing controller.
        host=SystemdHost()
        before=host.snapshot()
        check(before,"candidate")
        print(json.dumps({
            "status":"PASS_V18_ROUNDTRIP_PINNED_READONLY_PREFLIGHT",
            "pid":before.pid,"build_id":before.build_id,
            "source_sha":before.app_source,"unit_sha":before.unit_sha,
            "steam_v18_sha":before.steam_source_sha,
            "app_runtime_count":before.app_runtime_count,
            "no_mutation":True,"finance_authorized":False,
            "C03_APP_HANDOFF_ACCEPTED":False},sort_keys=True))
        return 0
    if argv != ["--physical"]:
        print(json.dumps({"status": "HOLD_NO_AUTOMATIC_PRODUCTION_ROUNDTRIP",
                          "required": "--inspect or explicit --physical",
                          "source_review_required": True,
                          "finance_authorized": False}))
        return 3
    need(os.geteuid() == 0 and ROOT.is_dir() and not ROOT.is_symlink()
         and ROOT.stat().st_uid == 0 and
         stat.S_IMODE(ROOT.stat().st_mode) == 0o700,
         "ROOT_ONLY_EXACT_PRIVATE_RUNTIME")
    lockfd=os.open(LOCK,os.O_CREAT|os.O_WRONLY,0o600)
    with os.fdopen(lockfd,"w") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        host=SystemdHost()
        receipt=ROOT/"one-use-physical-v18-roundtrip.json"
        need(not receipt.exists(), "ROUNDTRIP_ALREADY_USED")
        report=reversible_cycle(host)
        report["executed_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        report["isolated"]=False
        print("PHYSICAL_ROUNDTRIP_RECEIPT_SHA",seal(receipt,report))
        print(report["status"])
        return 0 if report["status"].startswith("PASS_") else 3


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as e:
        print("HOLD_V18_ROUNDTRIP",type(e).__name__,str(e)[:140])
        sys.exit(3)
