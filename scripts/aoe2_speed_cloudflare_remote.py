#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_BASE = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "aoe2war.com"
PHASE = "http_request_cache_settings"
RULE_DESCRIPTION = "AOE2WAR SpeedOS exact public HTML v1"
DYNAMIC_RULE_DESCRIPTION = "AOE2WAR SpeedOS qualified dynamic HTML v1"
SESSION_COOKIE_NAME = "aoe2hdbets_session"
DYNAMIC_ALLOWED_ROUTES = ("/academy", "/champions", "/national-champions")
STATE = Path("/var/lib/aoe2war-speedos/cloudflare")
REQUEST = STATE / "request.json"
LAST_APPLY = STATE / "last-apply.json"
DYNAMIC_REQUEST = STATE / "dynamic-request.json"
LAST_DYNAMIC_APPLY = STATE / "last-dynamic-apply.json"
PRODUCTION_APP_ROOT = Path("/var/www/AoE2HDBets/app-prodn")


class CloudflareError(RuntimeError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def token() -> str:
    value = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    if not value:
        raise CloudflareError("CLOUDFLARE_API_TOKEN is unavailable")
    return value


def api(method: str, path: str, payload: Any | None = None, *, allow_404: bool = False) -> dict[str, Any] | None:
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    req = urllib.request.Request(
        API_BASE + path,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "User-Agent": "AOE2WAR-SpeedOS/1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        if allow_404 and exc.code == 404:
            return None
        try:
            parsed = json.loads(raw or b"{}")
            errors = parsed.get("errors") or []
        except Exception:
            errors = []
        raise CloudflareError(f"Cloudflare API HTTP {exc.code}: {errors}") from None
    except urllib.error.URLError as exc:
        raise CloudflareError(f"Cloudflare API transport error: {exc.reason}") from None
    parsed = json.loads(raw or b"{}")
    if not parsed.get("success", False):
        raise CloudflareError(f"Cloudflare API rejected request: {parsed.get('errors') or []}")
    return parsed


def resolve_zone() -> dict[str, Any]:
    query = urllib.parse.urlencode({"name": ZONE_NAME, "status": "active", "per_page": 50})
    payload = api("GET", f"/zones?{query}") or {}
    rows = payload.get("result") or []
    exact = [row for row in rows if row.get("name") == ZONE_NAME]
    if len(exact) != 1:
        raise CloudflareError(f"expected exactly one active {ZONE_NAME} zone; found {len(exact)}")
    return exact[0]


def phase_ruleset(zone_id: str) -> dict[str, Any] | None:
    payload = api("GET", f"/zones/{zone_id}/rulesets") or {}
    candidates = [
        row for row in (payload.get("result") or [])
        if row.get("phase") == PHASE and row.get("kind") == "zone"
    ]
    if not candidates:
        return None
    if len(candidates) != 1:
        raise CloudflareError(f"expected at most one {PHASE} zone ruleset; found {len(candidates)}")
    ruleset_id = candidates[0]["id"]
    return (api("GET", f"/zones/{zone_id}/rulesets/{ruleset_id}") or {}).get("result")


def safe_rule(rule: dict[str, Any] | None) -> dict[str, Any] | None:
    if not rule:
        return None
    allowed = ("action", "action_parameters", "expression", "description", "enabled")
    return {key: rule[key] for key in allowed if key in rule}


def snapshot(zone: dict[str, Any]) -> tuple[Path, dict[str, Any] | None]:
    ruleset = phase_ruleset(zone["id"])
    STATE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = STATE / f"snapshot-{stamp}.json"
    payload = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-snapshot",
        "generated_at": now(),
        "zone_id": zone["id"],
        "account_id": (zone.get("account") or {}).get("id"),
        "zone_name": zone.get("name"),
        "phase": PHASE,
        "ruleset": ruleset,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    os.chmod(path, 0o600)
    return path, ruleset


def canonical_expression(routes: list[str], cookie_names: list[str]) -> str:
    quoted = " ".join(json.dumps(path) for path in routes)
    cookie_bypass = " and ".join(
        f'not http.cookie contains "{name}="' for name in cookie_names
    )
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'not http.request.uri.query contains "_rsc=" and '
        f'{cookie_bypass} and '
        f'http.request.uri.path in {{{quoted}}})'
    )


def canonical_dynamic_expression(routes: list[str], cookie_names: list[str]) -> str:
    quoted = " ".join(json.dumps(path) for path in routes)
    cookie_bypass = " and ".join(
        f'not http.cookie contains "{name}="' for name in cookie_names
    )
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'http.request.uri.query eq "" and '
        f'{cookie_bypass} and '
        f'http.request.uri.path in {{{quoted}}})'
    )


def is_lower_hex(value: Any, length: int) -> bool:
    text = str(value or "")
    return len(text) == length and all(ch in "0123456789abcdef" for ch in text)


def validate_request(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("schema") != 2:
        raise CloudflareError("unsupported apply request schema")
    if payload.get("kind") != "aoe2war-speedos-cloudflare-apply-request":
        raise CloudflareError("invalid apply request kind")
    if payload.get("zone_name") != ZONE_NAME:
        raise CloudflareError("apply request targets the wrong zone")

    routes = payload.get("eligible_exact_routes") or []
    if (
        not isinstance(routes, list)
        or not routes
        or routes != sorted(set(routes))
        or any(
            not isinstance(route, str)
            or not route.startswith("/")
            or route.startswith("/api")
            or "?" in route
            or "#" in route
            for route in routes
        )
    ):
        raise CloudflareError("apply request has no valid sorted exact-route allowlist")

    cookie_names = payload.get("cookie_bypass_names") or []
    if (
        not isinstance(cookie_names, list)
        or not cookie_names
        or cookie_names != sorted(set(cookie_names))
        or SESSION_COOKIE_NAME not in cookie_names
        or any(
            not isinstance(name, str)
            or not name
            or len(name) > 128
            or any(not (ch.isalnum() or ch in "_-.") for ch in name)
            for name in cookie_names
        )
    ):
        raise CloudflareError("apply request has an invalid cookie-bypass contract")

    expression = str(payload.get("expression") or "").strip()
    expected_expression = canonical_expression(routes, cookie_names)
    if expression != expected_expression:
        raise CloudflareError("apply request expression does not exactly match bounded request metadata")

    ttl = int(payload.get("edge_ttl_seconds") or 0)
    if ttl < 30 or ttl > 300:
        raise CloudflareError("edge TTL must remain between 30 and 300 seconds until purge authority exists")
    if not is_lower_hex(payload.get("plan_sha256"), 64):
        raise CloudflareError("apply request plan digest is invalid")
    if not is_lower_hex(payload.get("operator_source_sha"), 40):
        raise CloudflareError("apply request operator source SHA is invalid")
    return {
        **payload,
        "expression": expression,
        "edge_ttl_seconds": ttl,
        "eligible_exact_routes": routes,
        "cookie_bypass_names": cookie_names,
    }


def validate_dynamic_request(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("schema") != 1:
        raise CloudflareError("unsupported dynamic apply request schema")
    if payload.get("kind") != "aoe2war-speedos-cloudflare-dynamic-apply-request":
        raise CloudflareError("invalid dynamic apply request kind")
    if payload.get("zone_name") != ZONE_NAME:
        raise CloudflareError("dynamic apply request targets the wrong zone")

    routes = payload.get("eligible_exact_routes") or []
    if (
        not isinstance(routes, list)
        or not routes
        or routes != sorted(set(routes))
        or any(route not in DYNAMIC_ALLOWED_ROUTES for route in routes)
    ):
        raise CloudflareError("dynamic apply request contains unauthorized routes")

    cookie_names = payload.get("cookie_bypass_names") or []
    if (
        not isinstance(cookie_names, list)
        or not cookie_names
        or cookie_names != sorted(set(cookie_names))
        or SESSION_COOKIE_NAME not in cookie_names
        or any(
            not isinstance(name, str)
            or not name
            or len(name) > 128
            or any(not (ch.isalnum() or ch in "_-.") for ch in name)
            for name in cookie_names
        )
    ):
        raise CloudflareError("dynamic apply request has an invalid cookie-bypass contract")

    ttl = int(payload.get("edge_ttl_seconds") or 0)
    if ttl != 30:
        raise CloudflareError("dynamic edge TTL must be exactly 30 seconds")

    expression = str(payload.get("expression") or "").strip()
    if expression != canonical_dynamic_expression(routes, cookie_names):
        raise CloudflareError("dynamic expression does not exactly match bounded request metadata")

    for key, length in (
        ("plan_sha256", 64),
        ("policy_sha256", 64),
        ("qualification_sha256", 64),
        ("operator_source_sha", 40),
    ):
        if not is_lower_hex(payload.get(key), length):
            raise CloudflareError(f"dynamic request {key} is invalid")
    return {
        **payload,
        "expression": expression,
        "edge_ttl_seconds": ttl,
        "eligible_exact_routes": routes,
        "cookie_bypass_names": cookie_names,
    }


def desired_dynamic_rule(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {
                "mode": "override_origin",
                "default": 0,
                "status_code_ttl": [
                    {"status_code_range": {"from": 200, "to": 299}, "value": 30},
                    {"status_code_range": {"from": 300, "to": 499}, "value": 0},
                    {"status_code_range": {"from": 500, "to": 999}, "value": -1},
                ],
            },
        },
        "expression": request["expression"],
        "description": DYNAMIC_RULE_DESCRIPTION,
        "enabled": True,
    }


def desired_rule(request: dict[str, Any]) -> dict[str, Any]:
    ttl = request["edge_ttl_seconds"]
    return {
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {
                "mode": "override_origin",
                "default": 0,
                "status_code_ttl": [
                    {"status_code_range": {"from": 200, "to": 299}, "value": ttl},
                    {"status_code_range": {"from": 300, "to": 499}, "value": 0},
                    {"status_code_range": {"from": 500, "to": 999}, "value": -1},
                ],
            },
        },
        "expression": request["expression"],
        "description": RULE_DESCRIPTION,
        "enabled": True,
    }


def cmd_verify() -> dict[str, Any]:
    verify = api("GET", "/user/tokens/verify") or {}
    zone = resolve_zone()
    ruleset = phase_ruleset(zone["id"])
    return {
        "ok": True,
        "command": "verify",
        "token_status": (verify.get("result") or {}).get("status"),
        "zone_name": zone.get("name"),
        "zone_status": zone.get("status"),
        "account_id_suffix": str((zone.get("account") or {}).get("id") or "")[-8:],
        "zone_id_suffix": str(zone.get("id") or "")[-8:],
        "cache_ruleset_present": bool(ruleset),
        "cache_rule_count": len((ruleset or {}).get("rules") or []),
    }


def cmd_snapshot() -> dict[str, Any]:
    zone = resolve_zone()
    path, ruleset = snapshot(zone)
    return {
        "ok": True,
        "command": "snapshot",
        "snapshot": str(path),
        "cache_ruleset_present": bool(ruleset),
        "cache_rule_count": len((ruleset or {}).get("rules") or []),
    }


def find_rule(ruleset: dict[str, Any] | None, description: str) -> dict[str, Any] | None:
    return next(
        (
            rule
            for rule in ((ruleset or {}).get("rules") or [])
            if rule.get("description") == description
        ),
        None,
    )


def find_speedos_rule(ruleset: dict[str, Any] | None) -> dict[str, Any] | None:
    return find_rule(ruleset, RULE_DESCRIPTION)


def find_dynamic_rule(ruleset: dict[str, Any] | None) -> dict[str, Any] | None:
    return find_rule(ruleset, DYNAMIC_RULE_DESCRIPTION)


def write_apply_record(record: dict[str, Any]) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    LAST_APPLY.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    os.chmod(LAST_APPLY, 0o600)


def rollback_record(record: dict[str, Any], zone: dict[str, Any]) -> dict[str, Any]:
    if record.get("schema") != 2 or record.get("kind") != "aoe2war-speedos-cloudflare-apply-record":
        raise CloudflareError("rollback refuses legacy or unrecognized apply record")
    if zone["id"] != record.get("zone_id"):
        raise CloudflareError("rollback zone identity mismatch")
    current = phase_ruleset(zone["id"])
    prior_ruleset_present = bool(record.get("prior_ruleset_present"))
    prior_speedos = record.get("prior_speedos_rule")
    prior_speedos_id = record.get("prior_speedos_rule_id")

    if not prior_ruleset_present:
        current_speedos = find_speedos_rule(current)
        if current and current_speedos:
            api("DELETE", f"/zones/{zone['id']}/rulesets/{current['id']}")
            action = "deleted_created_ruleset"
        elif current:
            action = "no_speedos_rule_present"
        else:
            action = "no_ruleset_present"
    elif prior_speedos:
        ruleset_id = str(record.get("prior_ruleset_id") or (current or {}).get("id") or "")
        if not ruleset_id or not prior_speedos_id:
            raise CloudflareError("rollback lacks prior SpeedOS rule identity")
        restored = api(
            "PATCH",
            f"/zones/{zone['id']}/rulesets/{ruleset_id}/rules/{prior_speedos_id}",
            prior_speedos,
            allow_404=True,
        )
        if restored is None:
            api("POST", f"/zones/{zone['id']}/rulesets/{ruleset_id}/rules", prior_speedos)
            action = "recreated_prior_speedos_rule"
        else:
            action = "restored_prior_speedos_rule"
    else:
        current_speedos = find_speedos_rule(current)
        if current and current_speedos:
            api(
                "DELETE",
                f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{current_speedos['id']}",
            )
            action = "deleted_created_rule"
        else:
            action = "no_created_rule_present"

    record["state"] = "rolled_back"
    record["rolled_back_at"] = now()
    record["rollback_action"] = action
    write_apply_record(record)
    return {"ok": True, "command": "rollback", "action": action, "snapshot": record.get("snapshot")}


def cmd_apply() -> dict[str, Any]:
    request = validate_request(json.loads(REQUEST.read_text()))
    zone = resolve_zone()
    snapshot_path, prior_ruleset = snapshot(zone)
    prior_speedos = find_speedos_rule(prior_ruleset)
    record = {
        "schema": 2,
        "kind": "aoe2war-speedos-cloudflare-apply-record",
        "generated_at": now(),
        "state": "prepared",
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "snapshot": str(snapshot_path),
        "prior_ruleset_present": bool(prior_ruleset),
        "prior_ruleset_id": (prior_ruleset or {}).get("id"),
        "prior_speedos_rule_id": (prior_speedos or {}).get("id"),
        "prior_speedos_rule": safe_rule(prior_speedos),
        "request_sha256": hashlib.sha256(REQUEST.read_bytes()).hexdigest(),
        "plan_sha256": request.get("plan_sha256"),
        "edge_ttl_seconds": request["edge_ttl_seconds"],
        "eligible_route_count": len(request["eligible_exact_routes"]),
    }
    # The rollback record exists before the first remote mutation. A response-loss
    # error can therefore be recovered by re-reading live state and rolling back.
    write_apply_record(record)
    try:
        rule = desired_rule(request)
        if prior_ruleset:
            ruleset_id = prior_ruleset["id"]
            if prior_speedos:
                api(
                    "PATCH",
                    f"/zones/{zone['id']}/rulesets/{ruleset_id}/rules/{prior_speedos['id']}",
                    rule,
                )
            else:
                api("POST", f"/zones/{zone['id']}/rulesets/{ruleset_id}/rules", rule)
        else:
            api(
                "POST",
                f"/zones/{zone['id']}/rulesets",
                {
                    "name": "AOE2WAR SpeedOS cache settings",
                    "kind": "zone",
                    "phase": PHASE,
                    "description": "Governed AoE2WAR SpeedOS cache settings",
                    "rules": [rule],
                },
            )

        # Mutation responses are not authoritative identity. Re-read the zone
        # phase so response-shape changes or a lost response cannot orphan state.
        current_ruleset = phase_ruleset(zone["id"])
        speedos_rule = find_speedos_rule(current_ruleset)
        if not current_ruleset or not speedos_rule:
            raise CloudflareError("Cloudflare apply did not produce a readable SpeedOS rule")
        record.update(
            {
                "state": "applied",
                "applied_at": now(),
                "ruleset_id": current_ruleset["id"],
                "rule_id": speedos_rule["id"],
                "created_ruleset": not bool(prior_ruleset),
            }
        )
        write_apply_record(record)
    except Exception as exc:
        try:
            rollback = rollback_record(record, zone)
        except Exception as rollback_exc:
            record["state"] = "rollback_failed"
            record["apply_error"] = str(exc)
            record["rollback_error"] = str(rollback_exc)
            write_apply_record(record)
            raise CloudflareError(
                f"Cloudflare apply failed and rollback also failed: apply={exc}; rollback={rollback_exc}"
            ) from None
        record["state"] = "rolled_back_after_apply_failure"
        record["apply_error"] = str(exc)
        record["rollback_action"] = rollback["action"]
        write_apply_record(record)
        raise CloudflareError(
            f"Cloudflare apply failed after prepare; rollback completed ({rollback['action']}): {exc}"
        ) from None

    return {
        "ok": True,
        "command": "apply",
        "ruleset_id_suffix": str(record["ruleset_id"])[-8:],
        "rule_id_suffix": str(record["rule_id"])[-8:],
        "created_ruleset": record["created_ruleset"],
        "edge_ttl_seconds": record["edge_ttl_seconds"],
        "eligible_route_count": record["eligible_route_count"],
        "snapshot": str(snapshot_path),
    }


def cmd_rollback() -> dict[str, Any]:
    if not LAST_APPLY.exists():
        raise CloudflareError("no Cloudflare apply record exists to roll back")
    record = json.loads(LAST_APPLY.read_text())
    zone = resolve_zone()
    if str(record.get("state") or "").startswith("rolled_back"):
        return {
            "ok": True,
            "command": "rollback",
            "action": "already_rolled_back",
            "snapshot": record.get("snapshot"),
        }
    return rollback_record(record, zone)



def production_source_sha() -> str:
    proc = subprocess.run(
        [
            "git",
            "-c",
            f"safe.directory={PRODUCTION_APP_ROOT}",
            "-C",
            str(PRODUCTION_APP_ROOT),
            "rev-parse",
            "HEAD",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )
    value = proc.stdout.strip().lower()
    if proc.returncode != 0 or not is_lower_hex(value, 40):
        raise CloudflareError("cannot prove current production source SHA")
    return value

def write_dynamic_apply_record(record: dict[str, Any]) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    LAST_DYNAMIC_APPLY.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    os.chmod(LAST_DYNAMIC_APPLY, 0o600)


def rollback_dynamic_record(record: dict[str, Any], zone: dict[str, Any]) -> dict[str, Any]:
    if record.get("schema") != 1 or record.get("kind") != "aoe2war-speedos-cloudflare-dynamic-apply-record":
        raise CloudflareError("dynamic rollback refuses legacy or unrecognized apply record")
    if zone["id"] != record.get("zone_id"):
        raise CloudflareError("dynamic rollback zone identity mismatch")
    current = phase_ruleset(zone["id"])
    if not current:
        raise CloudflareError("dynamic rollback cannot find cache ruleset")
    prior = record.get("prior_dynamic_rule")
    prior_id = record.get("prior_dynamic_rule_id")
    current_dynamic = find_dynamic_rule(current)
    if prior:
        if not prior_id:
            raise CloudflareError("dynamic rollback lacks prior rule identity")
        restored = api(
            "PATCH",
            f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{prior_id}",
            prior,
            allow_404=True,
        )
        if restored is None:
            api("POST", f"/zones/{zone['id']}/rulesets/{current['id']}/rules", prior)
            action = "recreated_prior_dynamic_rule"
        else:
            action = "restored_prior_dynamic_rule"
    elif current_dynamic:
        api("DELETE", f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{current_dynamic['id']}")
        action = "deleted_created_dynamic_rule"
    else:
        action = "no_dynamic_rule_present"
    record["state"] = "rolled_back"
    record["rolled_back_at"] = now()
    record["rollback_action"] = action
    write_dynamic_apply_record(record)
    return {"ok": True, "command": "rollback-dynamic", "action": action, "snapshot": record.get("snapshot")}


def cmd_apply_dynamic() -> dict[str, Any]:
    request = validate_dynamic_request(json.loads(DYNAMIC_REQUEST.read_text()))
    live_source = production_source_sha()
    if request["operator_source_sha"] != live_source:
        raise CloudflareError("dynamic apply request source SHA does not match production")
    zone = resolve_zone()
    snapshot_path, prior_ruleset = snapshot(zone)
    if not prior_ruleset:
        raise CloudflareError("dynamic apply requires an existing cache ruleset")
    if not find_speedos_rule(prior_ruleset):
        raise CloudflareError("dynamic apply requires the certified static SpeedOS rule")
    prior_dynamic = find_dynamic_rule(prior_ruleset)
    record = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-dynamic-apply-record",
        "generated_at": now(),
        "state": "prepared",
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "snapshot": str(snapshot_path),
        "ruleset_id": prior_ruleset["id"],
        "prior_dynamic_rule_id": (prior_dynamic or {}).get("id"),
        "prior_dynamic_rule": safe_rule(prior_dynamic),
        "request_sha256": hashlib.sha256(DYNAMIC_REQUEST.read_bytes()).hexdigest(),
        "plan_sha256": request["plan_sha256"],
        "policy_sha256": request["policy_sha256"],
        "qualification_sha256": request["qualification_sha256"],
        "edge_ttl_seconds": 30,
        "eligible_route_count": len(request["eligible_exact_routes"]),
    }
    write_dynamic_apply_record(record)
    try:
        rule = desired_dynamic_rule(request)
        if prior_dynamic:
            api("PATCH", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules/{prior_dynamic['id']}", rule)
        else:
            api("POST", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules", rule)
        current = phase_ruleset(zone["id"])
        dynamic = find_dynamic_rule(current)
        if not current or not dynamic:
            raise CloudflareError("dynamic apply did not produce a readable dynamic SpeedOS rule")
        if not find_speedos_rule(current):
            raise CloudflareError("dynamic apply lost the static SpeedOS rule")
        record.update({
            "state": "applied",
            "applied_at": now(),
            "rule_id": dynamic["id"],
        })
        write_dynamic_apply_record(record)
    except Exception as exc:
        try:
            rollback = rollback_dynamic_record(record, zone)
        except Exception as rollback_exc:
            record["state"] = "rollback_failed"
            record["apply_error"] = str(exc)
            record["rollback_error"] = str(rollback_exc)
            write_dynamic_apply_record(record)
            raise CloudflareError(
                f"dynamic apply failed and rollback also failed: apply={exc}; rollback={rollback_exc}"
            ) from None
        record["state"] = "rolled_back_after_apply_failure"
        record["apply_error"] = str(exc)
        record["rollback_action"] = rollback["action"]
        write_dynamic_apply_record(record)
        raise CloudflareError(
            f"dynamic apply failed after prepare; rollback completed ({rollback['action']}): {exc}"
        ) from None
    return {
        "ok": True,
        "command": "apply-dynamic",
        "rule_id_suffix": str(record["rule_id"])[-8:],
        "edge_ttl_seconds": 30,
        "eligible_route_count": record["eligible_route_count"],
        "snapshot": str(snapshot_path),
    }


def cmd_rollback_dynamic() -> dict[str, Any]:
    if not LAST_DYNAMIC_APPLY.exists():
        raise CloudflareError("no dynamic Cloudflare apply record exists to roll back")
    record = json.loads(LAST_DYNAMIC_APPLY.read_text())
    zone = resolve_zone()
    if str(record.get("state") or "").startswith("rolled_back"):
        return {
            "ok": True,
            "command": "rollback-dynamic",
            "action": "already_rolled_back",
            "snapshot": record.get("snapshot"),
        }
    return rollback_dynamic_record(record, zone)


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war-speedos-cloudflare")
    parser.add_argument("command", choices=["verify", "snapshot", "apply", "rollback", "apply-dynamic", "rollback-dynamic"])
    args = parser.parse_args()
    try:
        result = {
            "verify": cmd_verify,
            "snapshot": cmd_snapshot,
            "apply": cmd_apply,
            "rollback": cmd_rollback,
            "apply-dynamic": cmd_apply_dynamic,
            "rollback-dynamic": cmd_rollback_dynamic,
        }[args.command]()
    except (CloudflareError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "command": args.command, "error": str(exc)}))
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
