#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import shlex
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from aoe2_release_gate import (
    GATE_DIR,
    MANIFEST_DIR,
    ROOT,
    gate_release,
    manifest_release,
)
from aoe2_release_ship import (
    PROD_HOST,
    PROD_REPO,
    PUBLIC,
    SERVICE,
    activate_release,
    load_stage_receipt,
    parse_kv,
)
from aoe2_release_stage import (
    REMOTE_RECEIPT_ROOT,
    STAGE_RECEIPT_DIR,
    stage_release,
)


class AutoShipError(RuntimeError):
    pass


CONTROL_PLANE_DOCS = {
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}


def run(args: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def git(*args: str) -> str:
    p = run(["git", *args], timeout=120)
    if p.returncode != 0:
        raise AutoShipError(
            f"git {' '.join(args)} failed: {(p.stderr or '').strip()}"
        )
    return (p.stdout or "").rstrip("\n")


def is_ancestor(older: str, newer: str) -> bool:
    return (
        run(
            ["git", "merge-base", "--is-ancestor", older, newer],
            timeout=60,
        ).returncode
        == 0
    )


def changed_paths(base: str, head: str) -> list[str]:
    if base == head:
        return []
    return [
        line
        for line in git("diff", "--name-only", f"{base}..{head}").splitlines()
        if line.strip()
    ]


def documentation_only(paths: list[str]) -> bool:
    return bool(paths) and all(
        path.startswith("docs/")
        or path.endswith(".md")
        or path.endswith(".mdx")
        for path in paths
    )


def porcelain_paths(text: str) -> set[str]:
    result: set[str] = set()
    for line in text.splitlines():
        value = line[3:] if len(line) > 3 else line
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        if value:
            result.add(value)
    return result


def preflight_errors(data: dict) -> list[str]:
    local = data["local"]
    prod = data["production"]
    errors: list[str] = []

    if local.get("branch") != "main":
        errors.append("local branch must be main")
    if local.get("dirty_count") != 0:
        errors.append("local worktree must be clean; review and commit edits first")
    if not local.get("head"):
        errors.append("local HEAD is unavailable")
    if data["documentation"].get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline is not a valid ancestor")
    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is not clean")
    if prod.get("service") != "active":
        errors.append("AoE2WAR production service is not active")
    if not prod.get("version_parity"):
        errors.append("internal/public production version parity is not healthy")
    if prod.get("wolo_8092_count") != 1:
        errors.append("protected WOLO listener 8092 count must be exactly 1")
    if prod.get("wolo_8093_count") != 1:
        errors.append("protected WOLO listener 8093 count must be exactly 1")
    if (
        not prod.get("staged_build_id")
        and local.get("head")
        and prod.get("source_sha") == local.get("head")
    ):
        errors.append("production already serves local HEAD; there is nothing new to ship")

    return errors


def ensure_documentation_baseline(data: dict) -> str:
    head = git("rev-parse", "HEAD")
    baseline = data["documentation"].get("implementation_baseline")
    if not baseline:
        raise AutoShipError("Documentation Baseline is unavailable.")
    if not is_ancestor(baseline, head):
        raise AutoShipError(
            "Documentation Baseline is not an ancestor of local HEAD."
        )

    since_baseline = changed_paths(baseline, head)
    if not since_baseline or documentation_only(since_baseline):
        return head

    p = run(
        [
            "python3",
            "scripts/docs_v2_check.py",
            "--write",
            "--refresh-baseline",
        ],
        timeout=180,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "documentation baseline refresh failed:\n"
            + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        )

    dirty = porcelain_paths(
        git("status", "--porcelain", "--untracked-files=all")
    )
    unexpected = sorted(dirty - CONTROL_PLANE_DOCS)
    if unexpected:
        raise AutoShipError(
            "documentation refresh changed unexpected paths: "
            + ", ".join(unexpected)
        )

    if dirty:
        p = run(
            [
                "git",
                "add",
                "docs/DOCUMENTATION_CONTROL_PLANE.md",
                "docs/document-registry.json",
            ]
        )
        if p.returncode != 0:
            raise AutoShipError("unable to stage documentation baseline refresh")

        p = run(
            [
                "git",
                "commit",
                "-m",
                f"Document release implementation {head[:12]}",
            ],
            timeout=120,
        )
        if p.returncode != 0:
            raise AutoShipError(
                "documentation baseline commit failed:\n"
                + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
            )

    final_head = git("rev-parse", "HEAD")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise AutoShipError(
            "worktree is not clean after documentation baseline refresh"
        )
    return final_head


def publish_exact(head: str) -> None:
    parts = git("ls-remote", "origin", "refs/heads/main").split()
    remote_sha = parts[0] if parts else ""

    if remote_sha == head:
        return

    if not remote_sha:
        raise AutoShipError("GitHub main could not be resolved")
    if not is_ancestor(remote_sha, head):
        raise AutoShipError(
            "GitHub main is not an ancestor of local HEAD; "
            "refusing non-fast-forward publish"
        )

    p = run(
        ["git", "push", "origin", f"{head}:refs/heads/main"],
        timeout=180,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "git push failed:\n"
            + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        )

    parts = git("ls-remote", "origin", "refs/heads/main").split()
    remote_after = parts[0] if parts else ""
    if remote_after != head:
        raise AutoShipError(
            "GitHub main did not land on the exact sealed release HEAD"
        )


def latest_stage_receipt(
    release_sha: str,
    staged_build_id: str | None = None,
) -> Path:
    candidates: list[tuple[float, Path]] = []
    for path in STAGE_RECEIPT_DIR.glob(f"{release_sha}-*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (
            payload.get("status") == "STAGED"
            and payload.get("release_sha") == release_sha
            and (
                staged_build_id is None
                or payload.get("staged_build_id") == staged_build_id
            )
        ):
            candidates.append((path.stat().st_mtime, path))

    if not candidates:
        raise AutoShipError(
            "no exact local STAGED receipt matches the release SHA and live candidate BUILD_ID"
        )
    return max(candidates, key=lambda item: item[0])[1]


def remote_stage_hydration_script(
    *,
    release_sha: str,
    staged_build_id: str,
    previous_sha: str,
    active_build_id: str,
    live_build_version: str,
) -> str:
    """Build a read-only VPS proof for one exact durable staged candidate."""
    q = shlex.quote
    return f"""
set -Eeuo pipefail
cd {q(PROD_REPO)}
RELEASE={q(release_sha)}
STAGED_BUILD={q(staged_build_id)}
PREVIOUS={q(previous_sha)}
ACTIVE_BUILD={q(active_build_id)}
LIVE_VERSION={q(live_build_version)}
SERVICE={q(SERVICE)}
RECEIPT_ROOT={q(REMOTE_RECEIPT_ROOT)}

die() {{ echo "$1" >&2; exit "${{2:-44}}"; }}
assert_eq() {{
  label="$1"; actual="$2"; expected="$3"
  [ "$actual" = "$expected" ] || die "$label mismatch"
}}
wolo_count() {{ ss -ltn | grep -Ec ":$1[[:space:]]" || true; }}
artifact_hash() {{
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -C "$1" -cf - . \
  | sha256sum | awk '{{print $1}}'
}}
status_value() {{
  key="$1"
  count="$(grep -Ec "^${{key}}=" "$status_file" || true)"
  [ "$count" = 1 ] || die "durable stage status has missing or duplicate $key"
  sed -n "s/^${{key}}=//p" "$status_file"
}}

test -d "$RECEIPT_ROOT" || die "durable stage receipt root is missing" 43
mapfile -d '' receipt_dirs < <(
  find "$RECEIPT_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name "stage-*-${{RELEASE:0:12}}" -print0 | sort -z
)
matching=()
for candidate in "${{receipt_dirs[@]}}"; do
  candidate_status="$candidate/stage-status.txt"
  [ -f "$candidate_status" ] || continue
  if grep -Fxc "release_sha=$RELEASE" "$candidate_status" >/dev/null \
    && grep -Fxc "staged_build_id=$STAGED_BUILD" "$candidate_status" >/dev/null; then
    matching+=("$candidate")
  fi
done
printf 'match_count\t%s\n' "${{#matching[@]}}"
[ "${{#matching[@]}}" = 1 ] \
  || die "expected exactly one durable receipt for the live staged candidate" 42

receipt="${{matching[0]}}"
status_file="$receipt/stage-status.txt"
for evidence in release-manifest.json gate-receipt.json stage-status.txt \
  stage-receipt.json stage-receipt.json.sha256; do
  [ -f "$receipt/$evidence" ] \
    || die "missing durable stage evidence: $evidence" 43
  [ ! -L "$receipt/$evidence" ] \
    || die "durable stage evidence must not be a symlink: $evidence" 43
done

source_sha="$(git rev-parse HEAD)"
dirty_count="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
service_state="$(systemctl is-active "$SERVICE" || true)"
active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
candidate_build="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
sidecar_version="$(tr -d '\r\n' < .aoe2war-build-version 2>/dev/null || true)"
internal_version="$(
  curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion", ""))'
)"
wolo8092="$(wolo_count 8092)"
wolo8093="$(wolo_count 8093)"

assert_eq "production source" "$source_sha" "$PREVIOUS"
assert_eq "production dirty count" "$dirty_count" 0
assert_eq "service state" "$service_state" active
assert_eq "active BUILD_ID" "$active_build" "$ACTIVE_BUILD"
assert_eq "staged BUILD_ID" "$candidate_build" "$STAGED_BUILD"
assert_eq "live build-version sidecar" "$sidecar_version" "$LIVE_VERSION"
assert_eq "internal build version" "$internal_version" "$LIVE_VERSION"
assert_eq "WOLO 8092 listener count" "$wolo8092" 1
assert_eq "WOLO 8093 listener count" "$wolo8093" 1
test ! -e .next-release/cache || die "staged artifact contains rebuildable cache"

artifact_sha="$(artifact_hash .next-release)"
manifest_sha="$(sha256sum "$receipt/release-manifest.json" | awk '{{print $1}}')"
gate_sha="$(sha256sum "$receipt/gate-receipt.json" | awk '{{print $1}}')"
stage_receipt_sha="$(sha256sum "$receipt/stage-receipt.json" | awk '{{print $1}}')"
sidecar_receipt_sha="$(awk 'NR == 1 {{print $1}}' "$receipt/stage-receipt.json.sha256")"
assert_eq "durable stage receipt digest" "$stage_receipt_sha" "$sidecar_receipt_sha"

assert_eq "stage status" "$(status_value status)" STAGED
assert_eq "status release SHA" "$(status_value release_sha)" "$RELEASE"
assert_eq "status previous SHA" "$(status_value previous_sha)" "$PREVIOUS"
assert_eq "status source SHA" "$(status_value source_sha)" "$PREVIOUS"
assert_eq "status active BUILD_ID" "$(status_value active_build_id)" "$ACTIVE_BUILD"
assert_eq "status staged BUILD_ID" "$(status_value staged_build_id)" "$STAGED_BUILD"
assert_eq "status live build version" "$(status_value live_build_version)" "$LIVE_VERSION"
candidate_version="$(status_value candidate_build_version)"
[ -n "$candidate_version" ] || die "candidate build version is missing"
assert_eq "status artifact digest" "$(status_value artifact_sha256)" "$artifact_sha"
assert_eq "status service" "$(status_value service)" active
assert_eq "status WOLO 8092" "$(status_value wolo8092)" 1
assert_eq "status WOLO 8093" "$(status_value wolo8093)" 1
assert_eq "status receipt directory" "$(status_value receipt_dir)" "$receipt"
assert_eq "isolated worktree proof" "$(status_value isolated_worktree)" 1
assert_eq "dependency-contract proof" "$(status_value dependency_contract_unchanged)" 1
assert_eq "cache-free proof" "$(status_value cache_free_artifact)" 1
assert_eq "artifact relocation proof" "$(status_value artifact_path_relocated)" 1
assert_eq "live source mutation proof" "$(status_value live_source_mutated)" 0
assert_eq "live public mutation proof" "$(status_value live_public_mutated)" 0
assert_eq "live node_modules mutation proof" "$(status_value live_node_modules_mutated)" 0
assert_eq "live build-version mutation proof" "$(status_value live_build_version_mutated)" 0

printf 'status\tSTAGED\n'
printf 'release_sha\t%s\n' "$RELEASE"
printf 'previous_sha\t%s\n' "$PREVIOUS"
printf 'source_sha\t%s\n' "$source_sha"
printf 'active_build_id\t%s\n' "$active_build"
printf 'staged_build_id\t%s\n' "$candidate_build"
printf 'live_build_version\t%s\n' "$internal_version"
printf 'candidate_build_version\t%s\n' "$candidate_version"
printf 'artifact_sha256\t%s\n' "$artifact_sha"
printf 'service\t%s\n' "$service_state"
printf 'wolo8092\t%s\n' "$wolo8092"
printf 'wolo8093\t%s\n' "$wolo8093"
printf 'receipt_dir\t%s\n' "$receipt"
printf 'manifest_sha256\t%s\n' "$manifest_sha"
printf 'gate_sha256\t%s\n' "$gate_sha"
printf 'stage_receipt_sha256\t%s\n' "$stage_receipt_sha"
printf 'manifest_b64\t'; base64 -w0 "$receipt/release-manifest.json"; printf '\n'
printf 'gate_b64\t'; base64 -w0 "$receipt/gate-receipt.json"; printf '\n'
printf 'stage_receipt_b64\t'; base64 -w0 "$receipt/stage-receipt.json"; printf '\n'
"""


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _decode_evidence(result: dict[str, str], key: str) -> bytes:
    raw = result.get(key)
    if not raw:
        raise AutoShipError(f"durable stage evidence is missing {key}")
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise AutoShipError(f"durable stage evidence has invalid {key}") from exc


def _is_lower_hex(value: object, length: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) == length
        and all(ch in "0123456789abcdef" for ch in value)
    )


def validate_hydrated_stage_evidence(
    result: dict[str, str],
    *,
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> tuple[bytes, bytes, bytes, dict, dict, dict]:
    expected = {
        "status": "STAGED",
        "release_sha": release_sha,
        "previous_sha": production.get("source_sha"),
        "source_sha": production.get("source_sha"),
        "active_build_id": production.get("active_build_id"),
        "staged_build_id": staged_build_id,
        "live_build_version": production.get("internal_build_version"),
        "service": "active",
        "wolo8092": "1",
        "wolo8093": "1",
    }
    for key, value in expected.items():
        if not value or result.get(key) != str(value):
            raise AutoShipError(
                f"durable stage evidence {key} does not match live production"
            )

    for key in (
        "artifact_sha256",
        "manifest_sha256",
        "gate_sha256",
        "stage_receipt_sha256",
    ):
        if not _is_lower_hex(result.get(key), 64):
            raise AutoShipError(f"durable stage evidence has invalid {key}")

    receipt_dir = result.get("receipt_dir") or ""
    if not receipt_dir.startswith(f"{REMOTE_RECEIPT_ROOT}/stage-"):
        raise AutoShipError("durable stage evidence is outside the canonical receipt root")
    if not result.get("candidate_build_version"):
        raise AutoShipError("durable stage evidence is missing candidate build version")

    manifest_bytes = _decode_evidence(result, "manifest_b64")
    gate_bytes = _decode_evidence(result, "gate_b64")
    stage_receipt_bytes = _decode_evidence(result, "stage_receipt_b64")
    for key, content in (
        ("manifest_sha256", manifest_bytes),
        ("gate_sha256", gate_bytes),
        ("stage_receipt_sha256", stage_receipt_bytes),
    ):
        if _sha256_bytes(content) != result[key]:
            raise AutoShipError(f"durable stage evidence digest mismatch: {key}")

    try:
        manifest = json.loads(manifest_bytes)
        gate = json.loads(gate_bytes)
        receipt = json.loads(stage_receipt_bytes)
    except Exception as exc:
        raise AutoShipError("durable stage evidence contains invalid JSON") from exc

    previous_sha = str(production["source_sha"])
    if manifest.get("schema") != 1 or manifest.get("kind") != "aoe2war-release-manifest":
        raise AutoShipError("durable release manifest kind/schema is invalid")
    if manifest.get("release_sha") != release_sha:
        raise AutoShipError("durable release manifest release SHA mismatch")
    if manifest.get("previous_production_sha") != previous_sha:
        raise AutoShipError("durable release manifest previous source mismatch")
    if manifest.get("migration_paths"):
        raise AutoShipError("durable staged release contains Prisma migrations")
    if "yarn.lock" in (manifest.get("changed_files") or []):
        raise AutoShipError(
            "durable staged release changes yarn.lock; isolated dependency swap is required"
        )

    gate_binding = manifest.get("gate") or {}
    gate_rel = gate_binding.get("receipt_path")
    if not gate_rel or gate_binding.get("receipt_sha256") != result["gate_sha256"]:
        raise AutoShipError("durable manifest does not bind the exact gate receipt")
    gate_path = (ROOT / str(gate_rel)).resolve()
    try:
        gate_path.relative_to(GATE_DIR.resolve())
    except ValueError as exc:
        raise AutoShipError("durable gate receipt path is outside the gate directory") from exc
    if (
        gate.get("schema") != 1
        or gate.get("kind") != "gate-receipt"
        or gate.get("status") != "PASS"
        or gate.get("target_sha") != release_sha
        or gate.get("scope_sha256") != manifest.get("scope_sha256")
    ):
        raise AutoShipError("durable gate receipt does not match the release manifest")

    receipt_expectations = {
        "schema": 1,
        "kind": "aoe2war-stage-result",
        "status": "STAGED",
        "release_sha": release_sha,
        "previous_production_sha": previous_sha,
        "source_sha": previous_sha,
        "active_build_id": str(production["active_build_id"]),
        "staged_build_id": staged_build_id,
        "live_build_version": str(production["internal_build_version"]),
        "candidate_build_version": result["candidate_build_version"],
        "artifact_sha256": result["artifact_sha256"],
        "manifest_sha256": result["manifest_sha256"],
        "gate_sha256": result["gate_sha256"],
        "remote_receipt_dir": receipt_dir,
        "service": "active",
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
        "isolated_worktree": True,
        "dependency_contract_unchanged": True,
        "cache_free_artifact": True,
        "artifact_path_relocated": True,
        "live_source_mutated": False,
        "live_public_mutated": False,
        "live_node_modules_mutated": False,
        "live_build_version_mutated": False,
        "live_runtime_mutated": False,
        "wolo_mutated": False,
    }
    for key, value in receipt_expectations.items():
        if receipt.get(key) != value:
            raise AutoShipError(f"durable stage receipt mismatch: {key}")

    manifest_path = MANIFEST_DIR / f"{release_sha}.json"
    if receipt.get("manifest_path") != str(manifest_path.relative_to(ROOT)):
        raise AutoShipError("durable stage receipt manifest path mismatch")
    if receipt.get("gate_path") != str(gate_path.relative_to(ROOT)):
        raise AutoShipError("durable stage receipt gate path mismatch")
    if manifest.get("risk_class") != receipt.get("risk_class"):
        raise AutoShipError("durable stage receipt risk class mismatch")

    return (
        manifest_bytes,
        gate_bytes,
        stage_receipt_bytes,
        manifest,
        gate,
        receipt,
    )


def _install_exact_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if not path.is_file() or path.read_bytes() != content:
            raise AutoShipError(
                f"local release evidence conflicts with durable evidence: {path.relative_to(ROOT)}"
            )
        return

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent,
            prefix=f".{path.name}.hydrate-",
            delete=False,
        ) as handle:
            temp_name = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, 0o600)
        try:
            os.link(temp_name, path)
        except FileExistsError:
            if not path.is_file() or path.read_bytes() != content:
                raise AutoShipError(
                    f"local release evidence raced with conflicting content: {path.relative_to(ROOT)}"
                )
    finally:
        if temp_name:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass


def hydrate_stage_receipt(
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> Path:
    previous_sha = production.get("source_sha")
    active_build_id = production.get("active_build_id")
    live_build_version = production.get("internal_build_version")
    if not _is_lower_hex(release_sha, 40) or not _is_lower_hex(previous_sha, 40):
        raise AutoShipError("cannot hydrate a stage receipt without exact release/source SHAs")
    if not staged_build_id or not active_build_id or not live_build_version:
        raise AutoShipError("cannot hydrate a stage receipt without exact live build identity")
    if production.get("wolo_8092_count") != 1 or production.get("wolo_8093_count") != 1:
        raise AutoShipError("cannot hydrate while protected WOLO listener counts are unsafe")

    script = remote_stage_hydration_script(
        release_sha=release_sha,
        staged_build_id=staged_build_id,
        previous_sha=str(previous_sha),
        active_build_id=str(active_build_id),
        live_build_version=str(live_build_version),
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=180,
    )
    result = parse_kv(p.stdout or "")
    if p.returncode != 0:
        count = result.get("match_count")
        if count is not None and count != "1":
            raise AutoShipError(
                "cross-host stage recovery requires exactly one durable receipt; "
                f"found {count}"
            )
        detail = ((p.stderr or "") or (p.stdout or "")).strip()
        raise AutoShipError(
            "durable stage receipt verification failed"
            + (f": {detail}" if detail else "")
        )

    (
        manifest_bytes,
        gate_bytes,
        stage_receipt_bytes,
        manifest,
        _gate,
        receipt,
    ) = validate_hydrated_stage_evidence(
        result,
        release_sha=release_sha,
        staged_build_id=staged_build_id,
        production=production,
    )

    gate_path = (ROOT / str(manifest["gate"]["receipt_path"])).resolve()
    manifest_path = MANIFEST_DIR / f"{release_sha}.json"
    manifest_digest_path = manifest_path.with_suffix(".json.sha256")
    stage_path = STAGE_RECEIPT_DIR / (
        f"{release_sha}-{receipt['artifact_sha256'][:12]}.json"
    )
    _install_exact_bytes(gate_path, gate_bytes)
    _install_exact_bytes(manifest_path, manifest_bytes)
    _install_exact_bytes(
        manifest_digest_path,
        f"{result['manifest_sha256']}  {manifest_path.name}\n".encode(),
    )
    _install_exact_bytes(stage_path, stage_receipt_bytes)

    try:
        load_stage_receipt(str(stage_path))
    except Exception as exc:
        raise AutoShipError(
            f"hydrated stage receipt failed the activation contract: {exc}"
        ) from exc
    return stage_path


def resolve_stage_receipt(
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> tuple[Path, bool]:
    try:
        return latest_stage_receipt(release_sha, staged_build_id), False
    except AutoShipError:
        return hydrate_stage_receipt(release_sha, staged_build_id, production), True


def route_proof() -> None:
    for path in ("/", "/api/lobby", "/api/bets", "/api/deployment-version"):
        with urllib.request.urlopen(
            PUBLIC.rstrip("/") + path,
            timeout=12,
        ) as response:
            if response.status != 200:
                raise AutoShipError(
                    f"public route failed: {path} -> {response.status}"
                )

    remote = (
        "set -euo pipefail; "
        "for p in / /api/lobby /api/bets /api/deployment-version; do "
        'curl -fsS --max-time 12 -o /dev/null "http://127.0.0.1:3030$p"; '
        "done"
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(remote)}",
        ],
        timeout=90,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "independent internal route proof failed: "
            + ((p.stderr or "") or (p.stdout or "")).strip()
        )


def final_errors(data: dict, release_sha: str) -> list[str]:
    prod = data["production"]
    cert = data.get("certification", {})
    errors: list[str] = []

    if prod.get("source_sha") != release_sha:
        errors.append("production source does not equal shipped release")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is dirty")
    if prod.get("service") != "active":
        errors.append("AoE2WAR service is not active")
    if prod.get("staged_build_id"):
        errors.append("staged build still exists after activation")
    if not prod.get("version_parity"):
        errors.append("internal/public build-version parity failed")
    if prod.get("wolo_8092_count") != 1:
        errors.append("WOLO 8092 listener count is not exactly 1 after ship")
    if prod.get("wolo_8093_count") != 1:
        errors.append("WOLO 8093 listener count is not exactly 1 after ship")
    if cert.get("status") != "CERTIFIED":
        errors.append("active runtime does not have matching certified provenance")
    if cert.get("release_sha") != release_sha:
        errors.append("certification receipt does not bind shipped release")

    return errors


def activate_and_certify(
    *,
    collect: Callable[[], dict],
    release_head: str,
    stage_receipt: Path,
) -> int:
    staged_data = collect()

    print()
    print("== ACTIVATION PREFLIGHT ==")
    if (
        activate_release(
            staged_data,
            stage_receipt=str(stage_receipt),
            dry_run=True,
            json_output=False,
        )
        != 0
    ):
        return 1

    print()
    print("== ACTIVATE SOURCE + BUILD + RUNTIME, THEN CERTIFY ==")
    if (
        activate_release(
            staged_data,
            stage_receipt=str(stage_receipt),
            dry_run=False,
            json_output=False,
        )
        != 0
    ):
        return 1

    print()
    print("== INDEPENDENT FINAL PROOF ==")
    final = collect()
    errors = final_errors(final, release_head)
    if errors:
        print("STOP: FINAL CERTIFICATION FAILED")
        for error in errors:
            print(f"  - {error}")
        return 2

    route_proof()

    cert = final["certification"]
    prod = final["production"]
    print(f"Source:         {prod['source_sha']}")
    print(f"Active build:   {prod['active_build_id']}")
    print(f"Build version:  {prod['internal_build_version']}")
    print(f"Provenance:     {cert['status']}")
    print(f"Receipt:        {cert['receipt_path']}")
    print(
        "WOLO:           "
        f"8092={prod['wolo_8092_count']}  "
        f"8093={prod['wolo_8093_count']}  UNTOUCHED"
    )
    print()
    print("PASS: RELEASE SHIPPED + CERTIFIED — WOLO UNTOUCHED")
    return 0


def ship_all(
    *,
    collect: Callable[[], dict],
    initial: dict,
    json_output: bool = False,
) -> int:
    if json_output:
        print(
            json.dumps(
                {
                    "status": "ERROR",
                    "error": (
                        "plain one-command ship currently uses operator text output; "
                        "use phase-specific --json commands for machine automation"
                    ),
                },
                indent=2,
            )
        )
        return 2

    errors = preflight_errors(initial)
    if errors:
        print("STOP: ONE-COMMAND SHIP PREFLIGHT BLOCKED")
        for error in errors:
            print(f"  - {error}")
        return 2

    print("⚔️  AOE2WAR ONE-COMMAND SHIP")
    print("Mode:           fail-closed automatic transmission")
    print("Commit policy:  user code must already be committed")
    print("Docs policy:    generated baseline may be committed automatically")
    print("WOLO:           observe only")
    print()

    try:
        staged_build_id = initial["production"].get("staged_build_id")
        if staged_build_id:
            release_head = str(initial["local"]["head"])
            print("== RESUME EXACT STAGED RELEASE ==")
            stage_receipt, hydrated = resolve_stage_receipt(
                release_head,
                str(staged_build_id),
                initial["production"],
            )
            print(f"Release HEAD:   {release_head}")
            print(f"Staged build:   {staged_build_id}")
            print(f"Stage receipt:  {stage_receipt.relative_to(ROOT)}")
            if hydrated:
                print("Receipt source: durable VPS evidence (rehydrated and re-verified)")
            print("Resume policy:  exact receipt + artifact only; no rebuild or republish")
            return activate_and_certify(
                collect=collect,
                release_head=release_head,
                stage_receipt=stage_receipt,
            )

        print("== DOCUMENTATION BASELINE ==")
        release_head = ensure_documentation_baseline(initial)
        print(f"Release HEAD:   {release_head}")

        data = collect()

        print()
        print("== RELEASE GATE ==")
        if gate_release(data, json_output=False) != 0:
            return 1

        print()
        print("== GITHUB EXACT PUBLISH ==")
        publish_exact(release_head)
        print(f"GitHub main:    {release_head}")

        data = collect()

        print()
        print("== RELEASE MANIFEST ==")
        if manifest_release(data, json_output=False) != 0:
            return 1

        print()
        print("== STAGE BESIDE LIVE ==")
        if stage_release(data, json_output=False) != 0:
            return 1

        staged_data = collect()
        staged_build_id = staged_data["production"].get("staged_build_id")
        if not staged_build_id:
            raise AutoShipError(
                "stage reported success but production has no staged BUILD_ID"
            )
        stage_receipt, hydrated = resolve_stage_receipt(
            release_head,
            str(staged_build_id),
            staged_data["production"],
        )
        print(f"Stage receipt:  {stage_receipt.relative_to(ROOT)}")
        if hydrated:
            print("Receipt source: durable VPS evidence (rehydrated and re-verified)")
        return activate_and_certify(
            collect=collect,
            release_head=release_head,
            stage_receipt=stage_receipt,
        )

    except (
        AutoShipError,
        OSError,
        subprocess.SubprocessError,
        urllib.error.URLError,
    ) as exc:
        print(f"STOP: ONE-COMMAND SHIP FAILED: {exc}")
        return 2
