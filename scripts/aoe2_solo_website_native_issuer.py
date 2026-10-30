#!/usr/bin/python3 -I
"""HEL1 root-native signed-evidence assembler for F's solo-owner audit ABI.

This process NEVER signs on behalf of B/C/E/Doctor/source/stage producers.
Only independently enrolled producer signatures on genuine source material
are admissible. Missing inputs fail closed. No service or finance mutations.
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
from datetime import datetime, timezone, timedelta

HOST = "ubuntu-4gb-hel1-11"
POLICY = "aoe2war.solo-owner.website.admission.v1"
FROZEN = "b46a51f1592c9f296839924ae55e722618b10d35"
CLASSES = ("doctor", "recovery", "finance", "host", "source", "stage")
PHASES = ("PRE_STAGE", "PRE_ACTIVATE", "POST_ACTIVATE", "POST_ROLLBACK")
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
BASE = Path("/var/lib/aoe2war-solo-website-v1/native-admission")
INSTALL = Path("/usr/local/libexec/aoe2war")
STATE = Path("/var/lib/aoe2war-solo-website-v1")
VOLUME = Path("/mnt/HC_Volume_105319120")
LOCK = VOLUME / "aoe2war/os-control/locks/release.lock"
REPO = Path("/var/www/AoE2HDBets/app-prodn")
TRUST = Path("/etc/aoe2war/solo-owner-website-v1/trusted-producers.json")
MAX_REPORT = 262144
CLASSES_RECOVERY = frozenset({"APP_DB", "TRAFFIC_SQLITE_WAL", "WOLO_CONSENSUS_FINANCE",
                              "LOOP4_FINANCIAL", "WATCHER_REPLAY_MEDIA", "RELEASE_ROLLBACK_CONFIG"})


class Hold(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__("NATIVE_ISSUER_HOLD:" + code)


def require(ok, code):
    if not ok:
        raise Hold(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def sha(value):
    return hashlib.sha256(value).hexdigest()


def unique(pairs):
    result = {}
    for name, value in pairs:
        require(name not in result, "DUPLICATE_JSON_PROPERTY")
        result[name] = value
    return result


def secure_bytes(path, maximum):
    """Root-owned, non-writable ancestry and exact O_NOFOLLOW file metadata."""
    require(path.is_absolute(), "RELATIVE_RECEIPT_PATH")
    for parent in (path.parent, *path.parent.parents):
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                not info.st_mode & 0o022, "UNTRUSTED_RECEIPT_PARENT")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and
            not before.st_mode & 0o022 and 0 < before.st_size <= maximum,
            "UNTRUSTED_OR_OVERSIZED_RECEIPT")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) ==
                (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns),
                "RECEIPT_CHANGED_BEFORE_READ")
        body = os.read(fd, maximum + 1)
        after = os.fstat(fd)
        visible = path.lstat()
        require(len(body) == before.st_size and
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) ==
                (visible.st_dev, visible.st_ino, visible.st_size, visible.st_mtime_ns) ==
                (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns),
                "RECEIPT_CHANGED_DURING_READ")
        return body
    finally:
        os.close(fd)


def read_object(path, limit=MAX_REPORT):
    raw = secure_bytes(path, limit)
    try:
        value = json.loads(raw, object_pairs_hook=unique,
                           parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
        require(type(value) is dict, "RECEIPT_NOT_OBJECT")
        return value
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise Hold("INVALID_RECEIPT_JSON") from exc


def utc(value):
    require(type(value) is str and value.endswith("Z"), "NON_UTC_RECEIPT")
    try:
        d = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise Hold("INVALID_TIME") from exc
    require(d.utcoffset() == timedelta(0), "NON_UTC_RECEIPT")
    return d


def environment():
    require(sys.platform == "linux" and os.geteuid() == 0 and
            socket.gethostname() == HOST, "NOT_HEL1_ROOT")
    require(os.path.realpath(__file__) == str(INSTALL / "solo-v1-native-admission"),
            "UNINSTALLED_OR_UNPINNED_PROGRAM_LOCATION")
    require("PYTHONPATH" not in os.environ and "PYTHONHOME" not in os.environ,
            "PYTHON_ENVIRONMENT_INJECTION")


def original_lease():
    """F must invoke this under its original FD200 lease, not invent a new one."""
    try:
        held = os.fstat(200)
        actual = LOCK.lstat()
    except OSError as exc:
        raise Hold("MISSING_ORIGINAL_FD200_LEASE") from exc
    require(stat.S_ISREG(held.st_mode) and not stat.S_ISLNK(actual.st_mode) and
            (held.st_dev, held.st_ino, held.st_uid, stat.S_IMODE(held.st_mode)) ==
            (actual.st_dev, actual.st_ino, 1000, 0o644),
            "ORIGINAL_LOCK_INODE_OR_OWNER_CHANGED")
    # Issuer is the grandchild of the original root SSH command channel.
    # Inode equality alone is not evidence that FD200 owns its original FLOCK.
    if str(INSTALL) not in sys.path:
        sys.path.insert(0,str(INSTALL))
    from aoe2_solo_website_nonce_ledger import Journal
    try: Journal().inherited_lease_fd(owner_depth=2)
    except Exception as exc:
        raise Hold("ORIGINAL_FD200_NOT_OWNED_BY_RELEASE_CHANNEL") from exc
    return (held.st_dev, held.st_ino)


def installed_verifiers():
    """Import only F-reviewed installed modules, not cwd/PYTHONPATH sources."""
    require(INSTALL.is_dir() and not INSTALL.is_symlink(), "F_MODULE_ROOT_MISSING")
    if str(INSTALL) not in sys.path:
        sys.path.insert(0, str(INSTALL))
    import aoe2_solo_website_financial_proof as financial
    import aoe2_solo_website_producer_receipts as producer
    return financial, producer


def live_snapshot():
    """Cheap native current evidence. Never run HTTP probes/finance or scan DB."""
    require(VOLUME.is_mount(), "VOLUME_NOT_MOUNTED")
    mount = VOLUME.stat()
    require(mount.st_dev != VOLUME.parent.stat().st_dev, "VOLUME_NOT_DISTINCT_DEVICE")
    fs = os.statvfs(VOLUME)
    total = fs.f_blocks * fs.f_frsize
    free = fs.f_bavail * fs.f_frsize
    used = fs.f_blocks * fs.f_frsize - fs.f_bfree * fs.f_frsize
    require(total > 0 and used + free > 0, "VOLUME_UNMEASURABLE")
    try:
        result = subprocess.run(["/usr/bin/git", "-C", str(REPO), "rev-parse", "HEAD"],
                                capture_output=True, text=True, timeout=3)
        require(result.returncode == 0 and bool(HEX40.fullmatch(result.stdout.strip())),
                "LIVE_SOURCE_SHA_UNKNOWN")
        source = result.stdout.strip()
        svc = subprocess.run(["/usr/bin/systemctl", "is-active", "aoe2hdbets-web.service"],
                             capture_output=True, text=True, timeout=3)
        require(svc.returncode == 0 and svc.stdout.strip() == "active", "LIVE_WEB_NOT_ACTIVE")
        # Application build is intentionally owned by `tony`, not root. Do
        # not loosen signed-trust input rules just to read its BUILD_ID.
        bp = REPO / ".next/BUILD_ID"
        for part in (REPO, REPO / ".next", bp):
            st = part.lstat()
            require(not stat.S_ISLNK(st.st_mode) and st.st_uid in (0, 1000) and
                    not st.st_mode & 0o002, "LIVE_BUILD_PATH_UNSAFE")
        st = bp.lstat()
        require(stat.S_ISREG(st.st_mode) and 0 < st.st_size <= 256,
                "LIVE_BUILD_ID_UNTRUSTED")
        fd = os.open(bp, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            require((opened.st_dev, opened.st_ino, opened.st_size) ==
                    (st.st_dev, st.st_ino, st.st_size), "LIVE_BUILD_ID_RACE")
            build = os.read(fd, 257).decode("utf-8").strip()
        finally:
            os.close(fd)
        require(bool(build) and len(build) < 128, "LIVE_BUILD_ID_UNTRUSTED")
    except subprocess.TimeoutExpired as exc:
        raise Hold("LIVE_OBSERVATION_TIMEOUT") from exc
    return {"host": HOST, "mount": str(VOLUME), "mounted": True,
            "free_bytes": free, "effective_used_pct": round(100 * used / (used + free), 6),
            "finish_used_pct": round(100 * (total - free) / total, 6),
            "mount_device": mount.st_dev, "source_sha": source, "active_build_id": build}


def distinct_signers(trust):
    """Actual separate enrolled public identities, NEVER generate keys here."""
    require(type(trust) is dict and set(trust) == set(CLASSES), "SIX_ENROLLED_KEYS_REQUIRED")
    identities = set()
    paths = set()
    for name in CLASSES:
        record = trust[name]
        require(type(record) is dict and set(record) == {"public_key_path", "public_spki_sha256"},
                "BAD_PRODUCER_ENROLLMENT")
        p = record.get("public_key_path")
        spki = record.get("public_spki_sha256")
        require(type(p) is str and p.startswith("/etc/aoe2war/") and
                bool(HEX64.fullmatch(spki or "")) and p not in paths and spki not in identities,
                "PRODUCER_KEY_ROLE_REUSE_OR_SCOPE")
        paths.add(p)
        identities.add(spki)
        secure_bytes(Path(p), 16384)
    return True


def verify_current_systemd(census, financial_module):
    """Remeasure 25 native unit states and current PID identity read-only.

    B's signed discovery retains ownership of cron, DB and external ingress;
    the local root observation independently guards against stale/fictional
    systemd MainPID and idle oneshot process assertions.
    """
    names = sorted(census["units"])
    require(len(names) <= 96 and
            all(bool(re.fullmatch(r"[a-zA-Z0-9_.@:-]{1,128}", name)) for name in names),
            "UNBOUNDED_OR_UNSAFE_SYSTEMD_UNIT_SET")
    try:
        result = subprocess.run(
            ["/usr/bin/systemctl", "show", "--no-pager",
             "--property=Id,ActiveState,MainPID", *names],
            capture_output=True, text=True, timeout=7)
    except subprocess.TimeoutExpired as exc:
        raise Hold("NATIVE_SYSTEMD_TIMEOUT") from exc
    require(result.returncode == 0 and len(result.stdout) <= 128 * 1024,
            "NATIVE_SYSTEMD_READ_FAILED")
    observed = {}
    for item in result.stdout.strip().split("\n\n"):
        pair = {}
        for line in item.splitlines():
            key, sep, val = line.partition("=")
            require(sep and key in ("Id", "ActiveState", "MainPID") and
                    key not in pair, "MALFORMED_SYSTEMD_PROPERTIES")
            pair[key] = val
        if not pair:
            continue
        name = pair.get("Id")
        require(name in names and name not in observed and
                set(pair) == {"Id", "ActiveState", "MainPID"},
                "SYSTEMD_UNEXPECTED_OR_INCOMPLETE_UNIT")
        observed[name] = pair
    require(set(observed) == set(names), "SYSTEMD_UNIT_INVENTORY_DRIFT")
    for name in names:
        signed = census["units"][name]
        live = observed[name]
        try:
            pid = int(live["MainPID"])
        except ValueError as exc:
            raise Hold("SYSTEMD_INVALID_MAINPID") from exc
        require(pid >= 0 and signed.get("state") == live["ActiveState"] and
                signed.get("main_pid") == pid, "SYSTEMD_PID_OR_STATE_DRIFT")
        if pid == 0:
            require(signed.get("start_time_ticks") == 0 and
                    signed.get("executable_sha256") is None,
                    "IDLE_ONESHOT_FICTITIOUS_PROCESS")
            continue
        proc = Path("/proc") / str(pid)
        try:
            # /proc/pid/stat uses (comm) with spaces: split after last ')' .
            stat_line = (proc / "stat").read_text()
            remainder = stat_line[stat_line.rfind(")")+2:].split()
            start_ticks = int(remainder[19])  # stat field 22, after pid+comm
            uid = proc.stat().st_uid
            cg = (proc / "cgroup").read_bytes()
        except (OSError, IndexError, ValueError) as exc:
            raise Hold("PROCESS_IDENTITY_NOT_REMEASURABLE") from exc
        require(len(cg) <= 65536 and uid == signed.get("uid") and
                start_ticks == signed.get("start_time_ticks") and
                sha(cg) == signed.get("process_cgroup_sha256"),
                "NATIVE_PROCESS_UID_START_CGROUP_DRIFT")
    return True


def classify_financial(finance, source_scope, financial_module):
    """B's exact 25 units + idle oneshots + non-systemd/route graph must pass."""
    census = financial_module.verify_writer_census(finance)
    require(set(census["units"]) >= financial_module.REQUIRED_UNITS and
            len(financial_module.REQUIRED_UNITS) == 25, "WRITER_CENSUS_25_UNITS")
    require(census["discovery"]["coverage"] == "CLOSED_WORLD_VERIFIED", "WRITER_DISCOVERY_INCOMPLETE")
    require(all(census["discovery"][k] == [] for k in
                ("unresolved_writers", "unclassified_financial_jobs", "unknown_http_effects",
                 "unmapped_external_ingress", "unaccounted_pids", "incomplete_units")),
            "UNACCOUNTED_FINANCIAL_INGRESS")
    verify_current_systemd(census, financial_module)
    graph = financial_module.verify_closed_graph(source_scope)
    require(type(graph) is dict and
            source_scope.get("read_side_effect_policy") not in ({}, None),
            "HTTP_SIDE_EFFECTS_UNCLASSIFIED")
    # Frozen W1 *does* reach a real financial writer on public GET/prewarm.
    # A reviewer must fix/fence this in F; never classify it as safe to stage.
    if source_scope.get("candidate_sha") == FROZEN:
        raise Hold("W1_PUBLIC_GET_PREWARM_FINANCIAL_WRITER_REACHABLE")
    return census


def check_recovery(proof, transfer_module=None):
    """A six-item boolean/list is not physical evidence. Each class needs trio."""
    require(type(proof) is dict and proof.get("status") == "PHYSICALLY_ACCEPTED" and
            set(proof.get("isolated_restored_classes", [])) == CLASSES_RECOVERY and
            proof.get("different_physical_restore_host") is True,
            "SIX_PHYSICAL_RESTORES_MISSING")
    chains = proof.get("signed_restore_chains")
    require(type(chains) is dict and set(chains) == CLASSES_RECOVERY,
            "SIX_INDEPENDENT_SIGNED_RESTORE_CHAINS_ABSENT")
    require(transfer_module is not None, "C_RESTORE_RECEIPT_VERIFIER_NOT_INSTALLED")
    trust = transfer_module.load_trust()
    # Native C trust and actual signed source -> receiver -> isolated restore.
    for label in sorted(CLASSES_RECOVERY):
        receipts = chains[label]
        require(type(receipts) is list and len(receipts) == 3,
                "RESTORE_CHAIN_INCOMPLETE")
        validated = [transfer_module.validate_envelope(envelope, trust) for envelope in receipts]
        bodies = [item[0] for item in validated]
        hashes = [item[1] for item in validated]
        a, b, c = bodies
        require([x["role"] for x in bodies] == ["source", "receiver", "restore"] and
                a["protected_class"] == label and
                a["campaign_id"] == b["campaign_id"] == c["campaign_id"] and
                a["cohort_id"] == b["cohort_id"] == c["cohort_id"] and
                a["sequence"] == b["sequence"] == c["sequence"] and
                b["source_receipt_sha256"] == hashes[0] and
                c["receiver_receipt_sha256"] == hashes[1] and
                b["ciphertext_sha256"] == b["readback_sha256"] == a["ciphertext_sha256"] and
                b["bytes_received"] == a["ciphertext_bytes"] and
                c["restored_bytes"] == a["source_bytes"] and
                c["restored_source_sha256"] == a["source_sha256"] and
                c["restore_failure_domain_id"] not in
                (a["source_failure_domain_id"], b["receiver_failure_domain_id"]),
                "RESTORE_WITNESS_LINK_OR_DOMAIN_CONFLICT")
    return True


def phase_evidence(candidate, phase, attempt, now=None):
    """Read immutable separately published signed producer snapshots only."""
    require(bool(HEX40.fullmatch(candidate)) and bool(HEX64.fullmatch(attempt)) and
            phase in PHASES, "INVALID_PHASE_ATTEMPT_SOURCE")
    now = now or datetime.now(timezone.utc)
    folder = BASE / attempt / phase
    sections = {}
    envelopes = {}
    observed = None
    for name in CLASSES:
        value = read_object(folder / (name + ".json"), MAX_REPORT)
        require(set(value) == {"schema", "class", "section", "receipt"} and
                value["schema"] == "aoe2war.solo.native-issuer-input.v1" and
                value["class"] == name and type(value["section"]) is dict and
                type(value["receipt"]) is dict, "INVALID_PRODUCER_SECTION")
        signed = value["receipt"]
        payload = signed.get("payload", {})
        content = value["section"].get("mount") if name == "host" else value["section"]
        require(type(content) is dict and type(payload) is dict and
                payload.get("candidate_sha") == candidate and
                payload.get("phase") == phase and payload.get("attempt_id") == attempt and
                payload.get("producer") == name and payload.get("host") == HOST and
                payload.get("content_sha256") == sha(canonical(content)),
                "PRODUCER_SECTION_NOT_BOUND")
        when = payload.get("observed_at")
        require(timedelta(0) <= now - utc(when) <= timedelta(seconds=120),
                "PRODUCER_EXPIRED_OR_FUTURE")
        if observed is None:
            observed = when
        require(when == observed, "PRODUCER_SNAPSHOT_TIME_SKEW")
        sections[name] = value["section"]
        envelopes[name] = signed
    return sections, envelopes, observed


def reconcile_live(report, live, phase="PRE_STAGE", attempt=None):
    """All host fields signed by host producer and remeasured by THIS root."""
    mount = report["mount"]
    for key in ("host", "mount", "mounted", "mount_device"):
        require(mount.get(key) == live[key], "SIGNED_MOUNT_DEVICE_DRIFT")
    for key in ("free_bytes", "effective_used_pct", "finish_used_pct"):
        require(type(mount.get(key)) in (int, float), "SIGNED_CAPACITY_UNMEASURED")
    require(abs(mount["free_bytes"] - live["free_bytes"]) <= 16 * 2**20 and
            abs(mount["effective_used_pct"] - live["effective_used_pct"]) <= 0.05 and
            abs(mount["finish_used_pct"] - live["finish_used_pct"]) <= 0.05,
            "SIGNED_CAPACITY_DRIFT")
    require(mount["free_bytes"] >= 30 * 2**30 and
            mount["effective_used_pct"] <= 88 and mount["finish_used_pct"] < 92 and
            live["free_bytes"] >= 30 * 2**30 and
            live["effective_used_pct"] <= 88 and live["finish_used_pct"] < 92,
            "SIGNED_AND_LIVE_CAPACITY_HOLD")
    rollback = report["rollback"]
    require(mount.get("source_sha") == live["source_sha"] and
            mount.get("active_build_id") == live["active_build_id"] and
            mount.get("rollback_sha256") == sha(canonical(rollback)),
            "ROLLBACK_SOURCE_BUILD_PROVENANCE_DRIFT")
    if phase in ("POST_ACTIVATE", "POST_ROLLBACK"):
        require(type(attempt) is str and bool(HEX64.fullmatch(attempt)),
                "ROLLBACK_PRIOR_ATTEMPT_MISSING")
        prior = read_object(STATE / (attempt + "-PRE_ACTIVATE-observation.json"))
        before = prior.get("observation")
        require(type(before) is dict and
                rollback.get("previous_source_sha") == before.get("source_sha"),
                "ROLLBACK_PREVIOUS_SOURCE_JOURNAL_DRIFT")
    else:
        require(rollback.get("previous_source_sha") == live["source_sha"] and
                rollback.get("active_build_id") == live["active_build_id"],
                "ROLLBACK_PREVIOUS_SOURCE_DRIFT")


def stage_source_bytes(path):
    """Stage output is tony-owned; inspect native bytes without following links."""
    base = VOLUME / "aoe2war/deploy-receipts"
    require(path.is_absolute() and path.name == "stage-receipt.json" and
            path.parent.parent == base and path.parent.name.startswith("stage-") and
            not path.is_symlink(), "UNTRUSTED_NATIVE_STAGE_PATH")
    for node in (base, path.parent, path):
        st = node.lstat()
        require(not stat.S_ISLNK(st.st_mode) and st.st_uid in (0, 1000) and
                not st.st_mode & 0o002, "STAGE_OWNERSHIP_OR_SYMLINK_DRIFT")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        a = os.fstat(fd)
        require(stat.S_ISREG(a.st_mode) and 0 < a.st_size <= MAX_REPORT,
                "STAGE_RECEIPT_SIZE_OR_TYPE")
        raw = os.read(fd, MAX_REPORT + 1)
        b = os.fstat(fd)
        require(len(raw) == a.st_size and
                (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) ==
                (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns),
                "STAGE_NATIVE_FILE_CHANGED")
        return raw
    finally:
        os.close(fd)


def verify_durable_stage(stage, phase, attempt, candidate, boundary):
    """F stage/activation/rollback stage bytes, including PRE_STAGE post-stage."""
    require(type(stage) is dict, "STAGE_EVIDENCE_MISSING")
    if phase == "PRE_STAGE" and boundary == "pre-phase":
        require(stage.get("status") in ("NOT_STAGED", "UNKNOWN") and
                stage.get("receipt") is None, "PRE_STAGE_INVENTED_ARTIFACT")
        return
    require(stage.get("status") == "STAGED" and
            stage.get("origin") == "HEL1_DURABLE_PROTECTED_STORE" and
            type(stage.get("receipt_sha256")) is str and
            bool(HEX64.fullmatch(stage["receipt_sha256"])) and
            type(stage.get("receipt")) is dict and
            stage["receipt"].get("release_sha") == candidate and
            stage.get("release_sha") == candidate,
            "STAGE_ABI_OR_CANDIDATE_MISMATCH")
    if phase == "PRE_STAGE":
        # mark_staged calls F.audit(PRE_STAGE, post_stage=True) BEFORE its
        # root journal seal exists. Read exact E/HEL1 raw original in place.
        rp = stage.get("remote_path")
        require(type(rp) is str, "STAGE_NATIVE_PATH_MISSING")
        raw = stage_source_bytes(Path(rp))
        require(sha(raw) == stage["receipt_sha256"] and
                json.loads(raw, object_pairs_hook=unique) == stage["receipt"],
                "STAGE_ORIGINAL_RAW_SHA_MISMATCH")
    else:
        durable = read_object(STATE / (attempt + "-PRE_STAGE-stage-receipt.json"))
        require(durable.get("receipt") == stage["receipt"] and
                durable.get("stage_receipt_sha256") == stage["receipt_sha256"],
                "ORIGINAL_STAGE_ROOT_SEALED_BYTES_MISMATCH")
    require(stage["receipt"].get("staged_build_id") == stage.get("staged_build_id") and
            stage["receipt"].get("artifact_sha256") == stage.get("artifact_sha256") and
            stage["receipt"].get("candidate_node_modules_sha256") ==
                stage.get("node_modules_sha256"), "STAGE_BUILD_OR_DEPENDENCY_DRIFT")



def assemble(candidate, phase, attempt, boundary, *, native=None,
             financial=None, producer=None, restore_verifier=None):
    """No successful report unless every independent source verifies."""
    require((phase == "PRE_STAGE" and boundary in ("pre-phase", "post-stage")) or
            (phase == "PRE_ACTIVATE" and boundary == "pre-phase") or
            (phase in ("POST_ACTIVATE", "POST_ROLLBACK") and boundary == "post-stage"),
            "WRONG_PHASE_BOUNDARY")
    original_lease()
    financial, producer = (financial, producer) if financial and producer else installed_verifiers()
    require(distinct_signers(read_object(TRUST, 32768)), "UNENROLLED_PRODUCERS")
    sections, signed, observed = phase_evidence(candidate, phase, attempt)
    # Recovered host `section` contains signed mount+rollback, not a caller claim.
    host = sections["host"]
    require(set(host) == {"mount", "rollback"}, "HOST_MOUNT_AND_ROLLBACK_REQUIRED")
    for k in ("mount", "rollback"):
        require(type(host[k]) is dict, "HOST_SECTION_MISSING")
    report = {"schema": 1, "policy": POLICY, "status": "INDEPENDENT_NATIVE_VERIFIED",
              "candidate_sha": candidate, "phase": phase, "attempt_id": attempt,
              "observed_at": observed, "doctor": sections["doctor"],
              "recovery": sections["recovery"], "finance": sections["finance"],
              "rollback": host["rollback"], "source_scope": sections["source"],
              "mount": host["mount"], "stage": sections["stage"],
              "receipt_provenance": {"signed_source_receipts_verified": True,
                                     "original_root_measurements": True,
                                     "signed_producers": signed}}
    # F's host producer binds only report.mount. Host-side input signature must
    # include BOTH the mount and rollback, so the signed content hash differs.
    # REQUIRE the signed host digest covers mount as F expects and rollback is
    # separately bound by a root-owned immutable signed host source reference.
    hp = signed["host"]["payload"]
    require(hp.get("content_sha256") == sha(canonical(report["mount"])),
            "HOST_SIGNATURE_NOT_F_ABI_COMPATIBLE")
    require(report["mount"].get("rollback_sha256") == sha(canonical(report["rollback"])),
            "UNSIGNED_ROLLBACK_SECTION")
    if native is None:
        native = live_snapshot()
    reconcile_live(report, native, phase, attempt)
    check_recovery(report["recovery"], restore_verifier)
    verify_durable_stage(report["stage"], phase, attempt, candidate, boundary)
    # F's native signature verifier validates six actual root-enrolled Ed25519
    # envelopes and their content in the exact expected ABI.
    require(producer.verify_all(report) is True, "NATIVE_SIGNATURE_VERIFIER_REFUSED")
    classify_financial(report["finance"], report["source_scope"], financial)
    financial.verify_source_closure(report)
    from aoe2_solo_website_native_audit_adapter import verify_financial_identity, validate_stage_boundary
    verify_financial_identity(report["finance"])
    validate_stage_boundary(report["stage"], phase, candidate,
                            post_stage=boundary == "post-stage")
    require(report["doctor"].get("signed") is True and report["doctor"].get("p0") ==
            report["doctor"].get("p1") == 0, "DOCTOR_P0_P1_OR_SIGNATURE_HOLD")
    require(len(canonical(report)) <= MAX_REPORT, "AUDIT_OUTPUT_TOO_LARGE")
    return report


def status():
    """Unauthoritative 15-min heartbeat: no finance scanning, no signed GO."""
    live = live_snapshot()
    return {"schema": "aoe2war.solo.native-audit-status.v1", "host": HOST,
            "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "status": "OBSERVATION_ONLY_NOT_ADMITTED", "mounted": live["mounted"],
            "mount_device": live["mount_device"], "free_bytes": live["free_bytes"],
            "effective_used_pct": live["effective_used_pct"],
            "finish_used_pct": live["finish_used_pct"],
            "active_build_id": live["active_build_id"], "source_sha": live["source_sha"],
            "finance": "UNKNOWN", "doctor": "UNKNOWN", "recovery": "UNKNOWN",
            "signed_producers": False, "financial_movement_authorized": False,
            "release_authorized": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--read-only", action="store_true")
    parser.add_argument("--candidate")
    parser.add_argument("--phase", choices=PHASES)
    parser.add_argument("--attempt")
    parser.add_argument("--boundary", choices=("pre-phase", "post-stage"))
    parser.add_argument("--status-only", action="store_true")
    a = parser.parse_args(argv)
    try:
        environment()
        require(a.read_only and (a.status_only or all((a.candidate, a.phase, a.attempt, a.boundary))),
                "READ_ONLY_ARGS_REQUIRED")
        if a.status_only:
            require(not any((a.candidate, a.phase, a.attempt, a.boundary)), "STATUS_HAS_RELEASE_ARGS")
            result = status()
        else:
            # F invokes this under separate exact owner RSA approval, verified
            # earlier by its existing native_audit_adapter.
            try:
                import aoe2_storage_transfer_receipts as restore
            except ImportError:
                restore = None
            result = assemble(a.candidate, a.phase, a.attempt, a.boundary,
                              restore_verifier=restore)
        print(canonical(result).decode("ascii"))
        return 0
    except (Hold, OSError, KeyError, ValueError, TypeError, subprocess.TimeoutExpired) as exc:
        print("HOLD:" + (exc.code if isinstance(exc, Hold) else type(exc).__name__),
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
