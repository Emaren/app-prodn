#!/usr/bin/env python3
"""Read-only HEL1 release acceptance. Never stages, activates or restarts anything.

PASS requires independently enrolled producer signatures AND D's explicitly
reviewed artifact signature; copied JSON/CLI flags alone never convey trust.
Run on HEL1 after F's actual activation, not in CI as production evidence.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.request import Request, build_opener, HTTPRedirectHandler

HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
BUILD = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
HOST = "ubuntu-4gb-hel1-11"
REPO = Path("/var/www/AoE2HDBets/app-prodn")
SERVICE = "aoe2hdbets-web.service"
PUBLIC = "https://aoe2war.com/api/deployment-version"
INTERNAL = "http://127.0.0.1:3030/api/deployment-version"
D_DOMAIN = b"AOE2WAR.G.FINAL_RELEASE_ARTIFACT.V1\n"
REQUIRED_NATIVE = ("doctor", "recovery", "finance", "host", "source", "stage")


class Hold(Exception):
    pass


def check(ok, code):
    if not ok:
        raise Hold(code)


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def no_duplicate(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, "DUPLICATE_JSON_FIELD")
        result[key] = value
    return result


def read_json(path, limit=262144):
    blob = Path(path).read_bytes()
    check(0 < len(blob) <= limit, "INVALID_EVIDENCE_SIZE")
    val = json.loads(blob, object_pairs_hook=no_duplicate)
    check(type(val) is dict, "INVALID_EVIDENCE_OBJECT")
    return val


def native_file(path, limit=262144):
    """Require root-protected original bytes; reject symlinks/UID1000 ancestor."""
    p = Path(path)
    check(p.is_absolute(), "EVIDENCE_RELATIVE_PATH")
    for part in (p, *p.parents):
        st = part.lstat()
        check(not stat.S_ISLNK(st.st_mode), "EVIDENCE_SYMLINK")
        check(st.st_uid == 0 and not (st.st_mode & 0o022),
              "EVIDENCE_UNTRUSTED_ANCESTOR")
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        check(stat.S_ISREG(st.st_mode) and 0 < st.st_size <= limit,
              "EVIDENCE_NOT_BOUNDED_REGULAR")
        raw = os.read(fd, limit + 1)
        check(len(raw) == st.st_size, "EVIDENCE_READ_RACE")
        return raw
    finally:
        os.close(fd)


def command(argv, timeout=7):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                       check=False, stdin=subprocess.DEVNULL)
    check(p.returncode == 0, "NATIVE_COMMAND_FAILED:" + argv[0])
    return p.stdout.strip()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Hold("VERSION_REDIRECT_FORBIDDEN")


def version(url):
    response = build_opener(NoRedirect).open(Request(url, headers={
        "Accept": "application/json", "Cache-Control": "no-cache",
        "User-Agent": "aoe2war-readonly-acceptance-v1"
    }), timeout=8)
    with response:
        check(response.status == 200, "VERSION_HTTP_NOT_200")
        check("no-store" in response.headers.get("Cache-Control", "").lower(),
              "VERSION_CACHE_CONTROL_MISSING")
        payload = response.read(4097)
        check(len(payload) <= 4096, "VERSION_PAYLOAD_TOO_LARGE")
    parsed = json.loads(payload, object_pairs_hook=no_duplicate)
    check(type(parsed) is dict and type(parsed.get("buildVersion")) is str
          and parsed["buildVersion"] not in ("", "unknown"),
          "VERSION_BUILD_UNKNOWN")
    return parsed["buildVersion"]


def native_signed_report(path, expected, label):
    """Verify full six-producer signed bytes with the existing F trust store."""
    raw = native_file(path)
    report = json.loads(raw, object_pairs_hook=no_duplicate)
    check(type(report) is dict and
          report.get("candidate_sha") == expected, label + "_WRONG_CANDIDATE")
    try:
        from aoe2_solo_website_producer_receipts import verify_all
        from aoe2_solo_website_native_audit_adapter import verify_financial_identity
        verify_all(report)  # all six signatures and pinned root-protected trust
        verify_financial_identity(report["finance"])
    except (ImportError, KeyError, ValueError, Exception) as exc:
        # Real producer trust missing or stale is HOLD, never a fixture PASS.
        raise Hold(label + "_NATIVE_SIGNATURE_HOLD:" + type(exc).__name__) from exc
    check(report.get("status") == "INDEPENDENT_NATIVE_VERIFIED",
          label + "_NATIVE_AUDIT_NOT_VERIFIED")
    return report, digest(raw)


def verify_d_artifact(path, key_path, pinned_spki, expected_sha, build_id,
                      stage_sha, artifact_sha):
    """D contract proposal: out-of-band pinned D Ed25519 signer, no self-cert."""
    check(bool(HEX64.fullmatch(pinned_spki)), "D_KEY_PIN_ABSENT")
    raw = native_file(path, 65536)
    doc = json.loads(raw, object_pairs_hook=no_duplicate)
    check(type(doc) is dict and set(doc) == {"schema", "payload", "signature_base64"}
          and doc["schema"] == "aoe2war.g.d-artifact.v1" and
          type(doc["payload"]) is dict, "D_RECEIPT_SCHEMA_HOLD")
    value = doc["payload"]
    check(set(value) == {"source_sha", "build_id", "stage_receipt_sha256",
                          "artifact_sha256", "certification", "producer"},
          "D_RECEIPT_FIELDS_HOLD")
    check(value == {"source_sha": expected_sha, "build_id": build_id,
                    "stage_receipt_sha256": stage_sha,
                    "artifact_sha256": artifact_sha,
                    "certification": "D_INDEPENDENTLY_VERIFIED",
                    "producer": "D"}, "D_ARTIFACT_IDENTITY_MISMATCH")
    pem = native_file(key_path, 16384)
    p = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-outform", "DER"],
                       input=pem, capture_output=True, timeout=8)
    check(p.returncode == 0 and digest(p.stdout) == pinned_spki, "D_KEY_PIN_MISMATCH")
    sig = base64.b64decode(doc["signature_base64"], validate=True)
    check(32 <= len(sig) <= 256, "D_SIGNATURE_LENGTH")
    with tempfile.TemporaryDirectory(prefix="aoe2-g-d-verify-") as temp:
        inp, signature = Path(temp) / "data", Path(temp) / "sig"
        inp.write_bytes(D_DOMAIN + canonical(value))
        signature.write_bytes(sig)
        result = subprocess.run(["/usr/bin/openssl", "pkeyutl", "-verify",
                                 "-pubin", "-inkey", str(key_path), "-rawin",
                                 "-in", str(inp), "-sigfile", str(signature)],
                                capture_output=True, timeout=8)
    check(result.returncode == 0, "D_SIGNATURE_INVALID")
    return digest(raw)


def cert_values(blob):
    result = {}
    for line in blob.decode("utf8").splitlines():
        check("=" in line, "F_CERT_FORMAT")
        k, v = line.split("=", 1)
        check(k and k not in result, "F_CERT_DUPLICATE_FIELD")
        result[k] = v
    return result


def listener_counts():
    raw = command(["ss", "-H", "-lnt"])
    counts = {"8092": 0, "8093": 0}
    for line in raw.splitlines():
        fields = line.split()
        if len(fields) < 4:
            continue
        endpoint = fields[3]
        for port in counts:
            if endpoint.endswith(":" + port):
                counts[port] += 1
    return counts


def host_check(args):
    check(socket.gethostname() == HOST and sys.platform.startswith("linux"),
          "WRONG_HOST_EXPECTED_HEL1")
    check(bool(HEX40.fullmatch(args.expected_sha)) and
          bool(BUILD.fullmatch(args.expected_build_id)) and
          bool(args.expected_version) and args.expected_version != "unknown",
          "EXPECTED_IDENTITIES_INVALID")
    check(REPO.is_dir() and not REPO.is_symlink(), "HOST_REPOSITORY_MISSING")
    sha = command(["git", "-C", str(REPO), "rev-parse", "HEAD"])
    check(sha == args.expected_sha, "INSTALLED_SOURCE_SHA_MISMATCH")
    check(not command(["git", "-C", str(REPO), "status", "--porcelain",
                       "--untracked-files=all"]), "INSTALLED_SOURCE_DIRTY")
    build_path = REPO / ".next" / "BUILD_ID"
    check(not build_path.is_symlink() and build_path.is_file(),
          "INSTALLED_BUILD_ID_MISSING")
    build_id = build_path.read_text().strip()
    check(build_id == args.expected_build_id, "INSTALLED_BUILD_ID_MISMATCH")
    build_version_path = REPO / ".aoe2war-build-version"
    check(build_version_path.is_file() and not build_version_path.is_symlink(),
          "INSTALLED_VERSION_FILE_MISSING")
    compiled = build_version_path.read_text().strip()
    check(compiled == args.expected_version, "INSTALLED_VERSION_MISMATCH")
    service = command(["systemctl", "is-active", SERVICE])
    check(service == "active", "WEBSITE_SERVICE_INACTIVE")
    pid_str = command(["systemctl", "show", SERVICE, "-p", "MainPID", "--value"])
    check(pid_str.isdecimal() and int(pid_str) > 1 and
          Path("/proc/" + pid_str + "/exe").exists(), "WEBSITE_MAINPID_UNHEALTHY")
    internal, public = version(INTERNAL), version(PUBLIC)
    check(internal == compiled, "INTERNAL_VERSION_MISMATCH")
    check(public == compiled, "PUBLIC_VERSION_MISMATCH")
    counts = listener_counts()
    check(counts == {"8092": 1, "8093": 1}, "WOLO_LISTENER_COUNT_MISMATCH")
    return {"source_sha": sha, "next_build_id": build_id,
            "build_version": compiled, "internal_version": internal,
            "public_version": public, "service": service,
            "service_mainpid": int(pid_str), "listeners": counts}


def receipt_check(args, host):
    base = Path(args.activation_directory)
    cert = cert_values(native_file(base / "certification.txt", 65536))
    stage_raw = native_file(base / "stage-receipt.json")
    stage = json.loads(stage_raw, object_pairs_hook=no_duplicate)
    check(type(stage) is dict, "F_STAGE_RECEIPT_INVALID")
    check(cert.get("status") == "CERTIFIED", "F_ACTIVATION_NOT_CERTIFIED")
    check(cert.get("source_sha") == host["source_sha"] and
          cert.get("release_sha") == host["source_sha"],
          "F_ACTIVATION_SOURCE_MISMATCH")
    check(cert.get("active_build_id") == host["next_build_id"] and
          stage.get("staged_build_id") == host["next_build_id"],
          "F_STAGE_ACTIVE_BUILD_MISMATCH")
    check(cert.get("candidate_build_version") == host["build_version"],
          "F_CERT_VERSION_MISMATCH")
    stage_digest = digest(stage_raw)
    check(cert.get("stage_receipt_sha256") == stage_digest,
          "F_STAGE_RECEIPT_DIGEST_MISMATCH")
    artifact_sha = cert.get("artifact_sha256")
    check(bool(artifact_sha and HEX64.fullmatch(artifact_sha)) and
          stage.get("artifact_sha256") == artifact_sha,
          "F_ARTIFACT_DIGEST_MISMATCH")
    for port in ("8092", "8093"):
        check(cert.get("wolo" + port) == "1", "F_LISTENER_RECEIPT_MISMATCH")
    for field in ("fast_rollback", "fast_rollback_modules", "durable_rollback"):
        target = cert.get(field)
        check(bool(target) and Path(target).is_dir(), "F_ROLLBACK_MISSING:" + field)
    return {"stage_sha256": stage_digest, "artifact_sha256": artifact_sha,
            "certificate_sha256": digest(native_file(base / "certification.txt", 65536))}


def run_acceptance(args):
    checks = {}
    def gate(name, callback):
        try:
            value = callback()
            checks[name] = {"status": "PASS"}
            return value
        except Exception as exc:
            checks[name] = {"status": "HOLD", "code": str(exc)[:200]}
            return None
    host = gate("installed_host_source_build_versions_service", lambda: host_check(args))
    receipt = gate("f_durable_activation_artifact_rollback", lambda: receipt_check(args, host)
                   if host else (_ for _ in ()).throw(Hold("HOST_GATE_NOT_PASSED")))
    native_before = gate("native_before_signed_six_producers",
                         lambda: native_signed_report(args.native_before, args.expected_sha, "BEFORE"))
    native_after = gate("native_after_signed_six_producers",
                        lambda: native_signed_report(args.native_after, args.expected_sha, "AFTER"))
    def continuity():
        check(native_before is not None and native_after is not None,
              "SIGNED_NATIVE_FINANCE_NOT_AVAILABLE")
        before, after = native_before[0], native_after[0]
        check(before["finance"]["protected"] == after["finance"]["protected"],
              "PROTECTED_WRITER_PROCESS_IDENTITY_DRIFT")
        check(after["finance"].get("financial_movement_authorized") is False,
              "PROTECTED_FINANCIAL_AUTHORITY_CHANGED")
        return True
    gate("protected_writers_full_identity_continuity", continuity)
    dsha = gate("d_independent_artifact_receipt", lambda: verify_d_artifact(
        args.d_artifact_receipt, args.d_public_key, args.d_spki_sha256,
        args.expected_sha, args.expected_build_id,
        receipt["stage_sha256"] if receipt else "",
        receipt["artifact_sha256"] if receipt else ""))
    result = {"schema": "aoe2war.g.final-release-host.v1",
              "source": "HEL1_OPERATOR_READ_ONLY_NATIVE",
              "expected_source_sha": args.expected_sha,
              "expected_build_id": args.expected_build_id,
              "host": HOST, "observed_at": datetime.now(timezone.utc).isoformat(),
              "checks": checks, "status": "PASS" if all(x["status"] == "PASS"
                                  for x in checks.values()) else "HOLD",
              "fingerprints": {"f_activation": receipt,
                               "native_before": native_before[1] if native_before else None,
                               "native_after": native_after[1] if native_after else None,
                               "d_artifact": dsha},
              "browser_acceptance": "NOT_EXECUTED_BY_THIS_HOST_CHECK"}
    output = Path(args.out)
    check(output.is_absolute() and not output.is_symlink(), "OUTPUT_UNSAFE_PATH")
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(result, out, indent=2, sort_keys=True)
        out.write("\n")
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "PASS" else 2


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--expected-sha", required=True)
    p.add_argument("--expected-build-id", required=True)
    p.add_argument("--expected-version", required=True)
    p.add_argument("--activation-directory", required=True)
    p.add_argument("--native-before", required=True)
    p.add_argument("--native-after", required=True)
    p.add_argument("--d-artifact-receipt", required=True)
    p.add_argument("--d-public-key", required=True)
    p.add_argument("--d-spki-sha256", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    try:
        return run_acceptance(a)
    except Exception as exc:
        print("FINAL_RELEASE_HOLD:" + type(exc).__name__ + ":" + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
