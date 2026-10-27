#!/usr/bin/env python3
"""Private, evidence-bound Storage OS three-plane telemetry. Read-only.

This adapts the *existing* Storage OS census; it does not scan hosts, fetch
from a public route, install an agent, or grant a cleanup capability.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any

PLANES = ("mac", "hel1-root", "hel1-volume-105319120")
CLASSES = {"protected", "active", "generated_rebuildable", "historical_review",
           "personal_human_review", "unknown"}
COVERAGE = {"complete", "partial", "inaccessible"}
UTC = dt.timezone.utc
SCHEMA = "aoe2war.storage-atlas.private.v1"
PUBLIC = "aoe2war.storage-atlas.public.v1"
DEFAULT_TTL = 300
GIB = 1024 ** 3

class AtlasHold(ValueError):
    pass

def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()

def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()

def instant(value: str) -> dt.datetime:
    if not isinstance(value, str):
        raise AtlasHold("missing UTC measurement time")
    try:
        x = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise AtlasHold("invalid timestamp") from e
    if x.tzinfo is None or x.utcoffset() != dt.timedelta(0):
        raise AtlasHold("timestamp must be UTC")
    return x

def number(value: Any, name: str) -> int:
    if type(value) is not int or value < 0 or value >= 2 ** 63:
        raise AtlasHold("invalid nonnegative integer: " + name)
    return value

def classify(row: dict[str, Any]) -> str:
    s = str(row.get("classification", "")).upper()
    if "PROTECT" in s or "RESTORE" in s or "WOLO" in s or "ROLLBACK" in s:
        return "protected"
    if "ACTIVE" in s or "LIVE" in s:
        return "active"
    if "PERSONAL" in s or "CREATIVE" in s or "RECORDING" in s:
        return "personal_human_review"
    if "PROVEN_REGENERABLE_ALLOWLIST" in s:
        return "generated_rebuildable"
    if "REVIEW" in s or "ARCHIVE" in s or "LEGACY" in s:
        return "historical_review"
    return "unknown"

def normalize_plane(raw: dict[str, Any], *, at: dt.datetime) -> dict[str, Any]:
    """Require source-supplied identity; never infer device from hostname/name."""
    pid = raw.get("plane")
    if pid not in PLANES:
        raise AtlasHold("unrecognized plane")
    coverage = raw.get("coverage")
    if coverage not in COVERAGE:
        raise AtlasHold("missing coverage")
    source = raw.get("source", {})
    if not isinstance(source, dict) or source.get("source_sha") is None or not isinstance(source.get("collector"), str):
        raise AtlasHold("collector/source SHA required")
    sha = str(source["source_sha"])
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise AtlasHold("source SHA not a full lowercase Git commit")
    observed = instant(raw.get("observed_at"))
    ttl = number(raw.get("ttl_seconds"), "ttl_seconds")
    if not 1 <= ttl <= 86400:
        raise AtlasHold("unbounded freshness TTL")
    if observed > at + dt.timedelta(seconds=30):
        raise AtlasHold("future-dated observation")
    identity = raw.get("filesystem", {})
    if not isinstance(identity, dict):
        raise AtlasHold("missing filesystem identity")
    fs = str(identity.get("fs_type", ""))
    if fs not in ("apfs", "ext4", "unknown"):
        raise AtlasHold("unrecognized filesystem")
    ident = identity.get("uuid")
    device = identity.get("mount_source")
    mount = identity.get("mountpoint")
    if not all(isinstance(s, str) and s and len(s) <= 2048 for s in (ident, device, mount)):
        coverage = "inaccessible"
    if pid == "mac" and fs not in ("apfs", "unknown"):
        raise AtlasHold("mac APFS identity mismatch")
    if pid != "mac" and fs not in ("ext4", "unknown"):
        raise AtlasHold("HEL1 filesystem identity mismatch")
    figures = raw.get("capacity")
    capacity = None
    if isinstance(figures, dict):
        try:
            total = number(figures["total_bytes"], "total")
            free = number(figures["free_blocks_bytes"], "free_blocks")
            ordinary = number(figures["ordinary_free_bytes"], "ordinary_free")
            if total <= 0 or ordinary > free or free > total:
                raise AtlasHold("incoherent filesystem block accounting")
            used = total - free
            reserved = free - ordinary
            effective = used + ordinary
            capacity = {"total_bytes": total, "effective_bytes": effective,
                        "used_bytes": used, "free_blocks_bytes": free,
                        "reserved_bytes": reserved, "ordinary_free_bytes": ordinary,
                        "effective_used_percent": round(100 * used / effective, 2) if effective else None}
        except (KeyError, TypeError):
            coverage = "partial"
    if capacity is None:
        coverage = "inaccessible"
    if raw.get("mount_verified") is not True:
        coverage = "partial" if capacity is not None else "inaccessible"
    rows = raw.get("consumers", [])
    if not isinstance(rows, list):
        raise AtlasHold("invalid consumer collection")
    valid_rows = []
    for row in rows:
        if not isinstance(row, dict):
            raise AtlasHold("invalid consumer row")
        exact = row.get("path")
        if not isinstance(exact, str) or not exact.startswith("/") or "/../" in exact or len(exact) > 4096:
            coverage = "partial"
            continue
        klass = row.get("class") or classify(row)
        if klass not in CLASSES:
            raise AtlasHold("unknown retention class")
        measured = row.get("measured_bytes")
        if measured is not None:
            measured = number(measured, "consumer bytes")
        if row.get("probe_ok") is not True or measured is None:
            coverage = "partial" if coverage != "inaccessible" else coverage
        valid_rows.append({
            "path": exact, "owner": row.get("owner") if isinstance(row.get("owner"), str) else "UNKNOWN",
            "class": klass, "measured_bytes": measured, "probe_ok": row.get("probe_ok") is True,
            "rebuild_proof": row.get("rebuild_proof") or None,
            "redundancy_proof": row.get("redundancy_proof") or None,
            "references_proof": row.get("references_proof") or None,
            "restore_dependencies": row.get("restore_dependencies") or [],
            "cleanup_authorized": False,
        })
    valid_rows.sort(key=lambda x: (x["measured_bytes"] is None, -(x["measured_bytes"] or 0), x["path"]))
    if raw.get("census_complete") is not True and coverage == "complete":
        coverage = "partial"
    expired = (at - observed).total_seconds() > ttl
    utilization = capacity["effective_used_percent"] if capacity else None
    high = pid == "hel1-volume-105319120" and utilization is not None and utilization >= 88
    low_mac = pid == "mac" and capacity is not None and capacity["ordinary_free_bytes"] < 15 * GIB
    severity = "UNKNOWN" if capacity is None else ("CRITICAL" if high else ("WATCH" if low_mac or utilization >= 90 else "OBSERVE"))
    if coverage != "complete" or expired:
        severity = "HOLD" if severity not in ("CRITICAL",) else severity
    return {
        "plane": pid, "filesystem": identity, "source": source, "observed_at": raw["observed_at"],
        "ttl_seconds": ttl, "stale": expired, "coverage": coverage, "census_complete": coverage == "complete",
        "capacity": capacity, "consumers": valid_rows, "severity": severity,
        "proposed_reclaim_bytes": number(raw.get("proposed_reclaim_bytes", 0), "proposed reclaim"),
        # Unauthenticated JSON can never set an actual-reclaim metric. Only a
        # separately verified before/after OS capacity receipt can promote it.
        "measured_reclaimed_bytes": None,
        "post_cleanup_receipt": raw.get("post_cleanup_receipt") if isinstance(raw.get("post_cleanup_receipt"), dict) else None,
        "cleanup_authorized": False, "issues": raw.get("issues") if isinstance(raw.get("issues"), list) else [],
        "growth_bytes_per_day": None,
    }

def build_snapshot(inputs: list[dict[str, Any]], *, now: dt.datetime | None = None,
                   previous: dict[str, Any] | None = None) -> dict[str, Any]:
    at = now or dt.datetime.now(UTC)
    if at.tzinfo is None:
        raise AtlasHold("naive comparison timestamp")
    found = {}
    for raw in inputs:
        row = normalize_plane(raw, at=at)
        if row["plane"] in found:
            raise AtlasHold("duplicate plane")
        found[row["plane"]] = row
    previous_planes = {x["plane"]: x for x in previous.get("planes", [])} if isinstance(previous, dict) else {}
    for name, row in found.items():
        old = previous_planes.get(name)
        if old and old.get("filesystem", {}).get("uuid") == row["filesystem"].get("uuid"):
            try:
                elapsed = (instant(row["observed_at"]) - instant(old["observed_at"])).total_seconds()
                if elapsed > 0 and row["capacity"] and old.get("capacity"):
                    row["growth_bytes_per_day"] = round((row["capacity"]["used_bytes"] - old["capacity"]["used_bytes"]) * 86400 / elapsed)
                    if row["growth_bytes_per_day"] > 5 * GIB:
                        row["issues"].append("UNUSUAL_STORAGE_GROWTH")
            except (KeyError, TypeError, AtlasHold):
                row["issues"].append("GROWTH_BASELINE_UNVERIFIED")
    for name in PLANES:
        if name not in found:
            found[name] = {"plane": name, "coverage": "inaccessible", "stale": True,
                           "census_complete": False, "capacity": None, "consumers": [],
                           "severity": "HOLD", "measured_reclaimed_bytes": None,
                           "proposed_reclaim_bytes": 0, "cleanup_authorized": False,
                           "issues": ["NO_AUTHENTICATED_OBSERVATION"], "growth_bytes_per_day": None}
    planes = [found[name] for name in PLANES]
    result = {"schema": SCHEMA, "kind": "aoe2war-storage-atlas-snapshot",
              "assembled_at": at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
              "planes": planes, "admission": "HOLD", "remote_cleanup_enabled": False,
              "completeness": "complete" if all(x["coverage"] == "complete" and not x["stale"] for x in planes) else "partial",
              "authenticity": "OPERATOR_SOURCE_UNVERIFIED",
              "public_projection_only": True}
    result["snapshot_sha256"] = digest(result)
    return result

def public_projection(private: dict[str, Any], *, now: dt.datetime | None = None) -> dict[str, Any]:
    """Deliberately discard host paths, UUIDs, owners, hashes and receipt secrets."""
    if private.get("schema") != SCHEMA:
        raise AtlasHold("unsupported private snapshot schema")
    assembled = instant(private["assembled_at"])
    at = now or dt.datetime.now(UTC)
    out = []
    for p in private.get("planes", []):
        if p.get("plane") not in PLANES:
            raise AtlasHold("unexpected plane")
        age = None
        try:
            age = max(0, int((at - instant(p["observed_at"])).total_seconds()))
        except (KeyError, TypeError, AtlasHold):
            pass
        stale = p.get("stale") is True or age is None or age > p.get("ttl_seconds", 0)
        cap = p.get("capacity") or {}
        out.append({"plane": p["plane"], "coverage": p["coverage"], "stale": stale,
                    "age_seconds": age, "severity": "HOLD" if stale or p["coverage"] != "complete" else p.get("severity", "UNKNOWN"),
                    "effective_used_percent": cap.get("effective_used_percent"),
                    "ordinary_free_bytes": cap.get("ordinary_free_bytes"),
                    "measured_reclaimed_bytes": p.get("measured_reclaimed_bytes"),
                    "top_consumer_classes": [r["class"] for r in p.get("consumers", [])[:5]]})
    return {"schema": PUBLIC, "as_of": assembled.isoformat().replace("+00:00", "Z"),
            "live": False, "financial_or_cleanup_authority": False,
            "planes": out, "admission": "HOLD"}

def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only Storage OS three-drive normalization")
    ap.add_argument("--inputs", type=Path, required=True, help="local private JSON array of operator observations")
    ap.add_argument("--previous", type=Path)
    ap.add_argument("--public", action="store_true")
    args = ap.parse_args()
    try:
        if args.inputs.is_symlink() or not args.inputs.is_file() or args.inputs.stat().st_size > 8 * 1024 * 1024:
            raise AtlasHold("inputs must be bounded plain file")
        rows = json.loads(args.inputs.read_text())
        if not isinstance(rows, list):
            raise AtlasHold("input must be array")
        before = json.loads(args.previous.read_text()) if args.previous else None
        output = build_snapshot(rows, previous=before)
        print(json.dumps(public_projection(output) if args.public else output, indent=2, sort_keys=True))
        return 0
    except (AtlasHold, OSError, ValueError) as e:
        print(json.dumps({"schema": SCHEMA, "admission": "HOLD", "error": str(e)}))
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
