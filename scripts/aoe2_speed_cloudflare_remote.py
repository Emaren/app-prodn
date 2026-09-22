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
ASSET_RULE_DESCRIPTION = "AOE2WAR SpeedOS certified hero image v1"
ASSET_EDGE_TTL_SECONDS = 3600
ASSET_QUALITY = 95
ASSET_VARY_MEDIA_TYPES = ["image/avif", "image/webp", "image/*"]
FEATURED_AVATAR_RULE_DESCRIPTION = "AOE2WAR SpeedOS featured avatar cards v1"
FEATURED_AVATAR_EDGE_TTL_SECONDS = 3600
FEATURED_AVATAR_CACHE_VERSION = "20260630a"
FEATURED_AVATAR_VARY_MEDIA_TYPES = ["image/avif", "image/webp", "image/*"]
FEATURED_AVATAR_PASSTHROUGH_HEADERS = [
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-router-state-tree",
    "rsc",
]
SESSION_COOKIE_NAME = "aoe2hdbets_session"
DYNAMIC_ALLOWED_ROUTES = ("/academy", "/ai", "/battle-archive", "/champions", "/champions/world", "/clans", "/forum", "/game-stats/16218/review", "/kingdom", "/leaderboard/og", "/market", "/market/shops/chat-effects", "/matchups/c_u_0df73bdbb64646c19e4a9bfd225b3285/n_Seedy_SI69", "/matchups/team/WyJjX3VfMGRmNzNiZGJiNjQ2NDZjMTllNGE5YmZkMjI1YjMyODUiLCJjX3VfMTc4MTYzODQzNjFmNGM4YThkNTdjNjkzNDI2NTEwMGIiLCJuX2NvcHBlcl9oZWFkX3JvYWQiXQ/WyJuX2Nhcmxvc2lzbSIsIm5fUm9NYV9WaWNUb1JfIiwibl9UYW5rVG9wTWFzdGVyIl0", "/national-champions", "/players/by-name/Emaren", "/radio", "/traffic", "/wolo")
STATE = Path("/var/lib/aoe2war-speedos/cloudflare")
REQUEST = STATE / "request.json"
LAST_APPLY = STATE / "last-apply.json"
DYNAMIC_REQUEST = STATE / "dynamic-request.json"
LAST_DYNAMIC_APPLY = STATE / "last-dynamic-apply.json"
ASSET_REQUEST = STATE / "asset-request.json"
LAST_ASSET_APPLY = STATE / "last-asset-apply.json"
FEATURED_AVATAR_REQUEST = STATE / "featured-avatar-request.json"
LAST_FEATURED_AVATAR_APPLY = STATE / "last-featured-avatar-apply.json"
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


def canonical_asset_expression(
    source_path: str,
    responsive_widths: list[int],
    quality: int = ASSET_QUALITY,
) -> str:
    encoded_source = urllib.parse.quote(source_path, safe="")
    width_checks = " or ".join(
        f'any(http.request.uri.args["w"][*] == "{width}")'
        for width in responsive_widths
    )
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'http.request.uri.path eq "/_next/image" and '
        'len(http.request.uri.args["url"]) eq 1 and '
        f'any(http.request.uri.args["url"][*] == "{encoded_source}") and '
        'len(http.request.uri.args["q"]) eq 1 and '
        f'any(http.request.uri.args["q"][*] == "{quality}") and '
        'len(http.request.uri.args["w"]) eq 1 and '
        f'({width_checks}))'
    )


def canonical_featured_avatar_expression(
    paths: list[str],
    cache_version: str = FEATURED_AVATAR_CACHE_VERSION,
) -> str:
    quoted = " ".join(f'"{path}"' for path in paths)
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        f'http.request.uri.path in {{{quoted}}} and '
        'len(http.request.uri.args["size"]) eq 1 and '
        'any(http.request.uri.args["size"][*] == "card") and '
        'len(http.request.uri.args["v"]) eq 1 and '
        f'any(http.request.uri.args["v"][*] == "{cache_version}"))'
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


def validate_asset_request(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("schema") != 1:
        raise CloudflareError("unsupported asset apply request schema")
    if payload.get("kind") != "aoe2war-speedos-cloudflare-asset-apply-request":
        raise CloudflareError("invalid asset apply request kind")
    if payload.get("zone_name") != ZONE_NAME:
        raise CloudflareError("asset apply request targets the wrong zone")

    source_path = str(payload.get("source_path") or "")
    if (
        not source_path.startswith("/uploads/managed-assets/background/hero-chain-")
        or len(source_path) > 512
        or "?" in source_path
        or "#" in source_path
        or ".." in source_path
        or not source_path.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".avif"))
    ):
        raise CloudflareError("asset source path is outside the certified hero namespace")

    quality = int(payload.get("quality") or 0)
    if quality != ASSET_QUALITY:
        raise CloudflareError("asset quality must remain exactly 95")

    responsive_widths = payload.get("responsive_widths") or []
    if (
        not isinstance(responsive_widths, list)
        or not responsive_widths
        or responsive_widths != sorted(set(responsive_widths))
        or 1920 not in responsive_widths
        or len(responsive_widths) > 16
        or any(not isinstance(width, int) or width < 64 or width > 8192 for width in responsive_widths)
    ):
        raise CloudflareError("asset responsive width contract is invalid")

    ttl = int(payload.get("edge_ttl_seconds") or 0)
    if ttl != ASSET_EDGE_TTL_SECONDS:
        raise CloudflareError("asset edge TTL must remain exactly 3600 seconds")

    media_types = payload.get("vary_media_types") or []
    if media_types != ASSET_VARY_MEDIA_TYPES:
        raise CloudflareError("asset Accept normalization contract is invalid")

    expression = str(payload.get("expression") or "").strip()
    if expression != canonical_asset_expression(source_path, responsive_widths, quality):
        raise CloudflareError("asset expression does not exactly match bounded request metadata")

    for key, length in (("plan_sha256", 64), ("operator_source_sha", 40)):
        if not is_lower_hex(payload.get(key), length):
            raise CloudflareError(f"asset request {key} is invalid")

    return {
        **payload,
        "source_path": source_path,
        "quality": quality,
        "responsive_widths": responsive_widths,
        "edge_ttl_seconds": ttl,
        "vary_media_types": media_types,
        "expression": expression,
    }


def desired_asset_rule(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {
                "mode": "override_origin",
                "default": 0,
                "status_code_ttl": [
                    {"status_code_range": {"from": 200, "to": 299}, "value": ASSET_EDGE_TTL_SECONDS},
                    {"status_code_range": {"from": 300, "to": 499}, "value": 0},
                    {"status_code_range": {"from": 500, "to": 999}, "value": -1},
                ],
            },
            "vary": {
                "default": {"action": "bypass"},
                "headers": {
                    "accept": {
                        "action": "normalize",
                        "media_types": ASSET_VARY_MEDIA_TYPES,
                    }
                },
            },
        },
        "expression": request["expression"],
        "description": ASSET_RULE_DESCRIPTION,
        "enabled": True,
    }


def validate_featured_avatar_request(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("schema") != 1:
        raise CloudflareError("unsupported featured-avatar apply request schema")
    if payload.get("kind") != "aoe2war-speedos-cloudflare-featured-avatar-apply-request":
        raise CloudflareError("invalid featured-avatar apply request kind")
    if payload.get("zone_name") != ZONE_NAME:
        raise CloudflareError("featured-avatar apply request targets the wrong zone")

    paths = payload.get("eligible_exact_paths") or []
    if (
        not isinstance(paths, list)
        or not paths
        or len(paths) > 64
        or paths != sorted(set(paths))
        or any(
            not isinstance(path, str)
            or not path.startswith("/api/media-assets/avatar/user-")
            or not path.endswith("-featured")
            or "?" in path
            or "#" in path
            or len(path) > 256
            for path in paths
        )
    ):
        raise CloudflareError("featured-avatar request has an invalid exact-path allowlist")

    cache_version = str(payload.get("cache_version") or "")
    if cache_version != FEATURED_AVATAR_CACHE_VERSION:
        raise CloudflareError("featured-avatar cache version is invalid")

    ttl = int(payload.get("edge_ttl_seconds") or 0)
    if ttl != FEATURED_AVATAR_EDGE_TTL_SECONDS:
        raise CloudflareError("featured-avatar edge TTL must remain exactly 3600 seconds")

    media_types = payload.get("vary_media_types") or []
    if media_types != FEATURED_AVATAR_VARY_MEDIA_TYPES:
        raise CloudflareError("featured-avatar Accept normalization contract is invalid")
    passthrough = payload.get("vary_passthrough_headers") or []
    if passthrough != FEATURED_AVATAR_PASSTHROUGH_HEADERS:
        raise CloudflareError("featured-avatar Next router Vary contract is invalid")

    expression = str(payload.get("expression") or "").strip()
    if expression != canonical_featured_avatar_expression(paths, cache_version):
        raise CloudflareError("featured-avatar expression is not canonical")

    for key, length in (("plan_sha256", 64), ("operator_source_sha", 40), ("roster_sha256", 64)):
        if not is_lower_hex(payload.get(key), length):
            raise CloudflareError(f"featured-avatar request {key} is invalid")

    return {
        **payload,
        "eligible_exact_paths": paths,
        "cache_version": cache_version,
        "edge_ttl_seconds": ttl,
        "vary_media_types": media_types,
        "vary_passthrough_headers": passthrough,
        "expression": expression,
    }


def desired_featured_avatar_rule(request: dict[str, Any]) -> dict[str, Any]:
    vary_headers: dict[str, Any] = {
        "accept": {
            "action": "normalize",
            "media_types": FEATURED_AVATAR_VARY_MEDIA_TYPES,
        }
    }
    for header in FEATURED_AVATAR_PASSTHROUGH_HEADERS:
        vary_headers[header] = {"action": "passthrough"}
    return {
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {
                "mode": "override_origin",
                "default": 0,
                "status_code_ttl": [
                    {"status_code_range": {"from": 200, "to": 299}, "value": FEATURED_AVATAR_EDGE_TTL_SECONDS},
                    {"status_code_range": {"from": 300, "to": 499}, "value": 0},
                    {"status_code_range": {"from": 500, "to": 999}, "value": -1},
                ],
            },
            "vary": {
                "default": {"action": "bypass"},
                "headers": vary_headers,
            },
        },
        "expression": request["expression"],
        "description": FEATURED_AVATAR_RULE_DESCRIPTION,
        "enabled": True,
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


def find_asset_rule(ruleset: dict[str, Any] | None) -> dict[str, Any] | None:
    return find_rule(ruleset, ASSET_RULE_DESCRIPTION)


def find_featured_avatar_rule(ruleset: dict[str, Any] | None) -> dict[str, Any] | None:
    return find_rule(ruleset, FEATURED_AVATAR_RULE_DESCRIPTION)


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


def write_asset_apply_record(record: dict[str, Any]) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    LAST_ASSET_APPLY.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    os.chmod(LAST_ASSET_APPLY, 0o600)


def rollback_asset_record(record: dict[str, Any], zone: dict[str, Any]) -> dict[str, Any]:
    if record.get("schema") != 1 or record.get("kind") != "aoe2war-speedos-cloudflare-asset-apply-record":
        raise CloudflareError("asset rollback refuses legacy or unrecognized apply record")
    if zone["id"] != record.get("zone_id"):
        raise CloudflareError("asset rollback zone identity mismatch")
    current = phase_ruleset(zone["id"])
    if not current:
        raise CloudflareError("asset rollback cannot find cache ruleset")
    prior = record.get("prior_asset_rule")
    prior_id = record.get("prior_asset_rule_id")
    current_asset = find_asset_rule(current)
    if prior:
        if not prior_id:
            raise CloudflareError("asset rollback lacks prior rule identity")
        restored = api(
            "PATCH",
            f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{prior_id}",
            prior,
            allow_404=True,
        )
        if restored is None:
            api("POST", f"/zones/{zone['id']}/rulesets/{current['id']}/rules", prior)
            action = "recreated_prior_asset_rule"
        else:
            action = "restored_prior_asset_rule"
    elif current_asset:
        api("DELETE", f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{current_asset['id']}")
        action = "deleted_created_asset_rule"
    else:
        action = "no_asset_rule_present"
    record["state"] = "rolled_back"
    record["rolled_back_at"] = now()
    record["rollback_action"] = action
    write_asset_apply_record(record)
    return {"ok": True, "command": "rollback-asset", "action": action, "snapshot": record.get("snapshot")}


def cmd_apply_asset() -> dict[str, Any]:
    request = validate_asset_request(json.loads(ASSET_REQUEST.read_text()))
    live_source = production_source_sha()
    if request["operator_source_sha"] != live_source:
        raise CloudflareError("asset apply request source SHA does not match production")
    zone = resolve_zone()
    snapshot_path, prior_ruleset = snapshot(zone)
    if not prior_ruleset:
        raise CloudflareError("asset apply requires an existing cache ruleset")
    if not find_speedos_rule(prior_ruleset) or not find_dynamic_rule(prior_ruleset):
        raise CloudflareError("asset apply requires both certified HTML SpeedOS rules")
    prior_asset = find_asset_rule(prior_ruleset)
    record = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-asset-apply-record",
        "generated_at": now(),
        "state": "prepared",
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "snapshot": str(snapshot_path),
        "ruleset_id": prior_ruleset["id"],
        "prior_asset_rule_id": (prior_asset or {}).get("id"),
        "prior_asset_rule": safe_rule(prior_asset),
        "request_sha256": hashlib.sha256(ASSET_REQUEST.read_bytes()).hexdigest(),
        "plan_sha256": request["plan_sha256"],
        "operator_source_sha": request["operator_source_sha"],
        "source_path": request["source_path"],
        "quality": request["quality"],
        "responsive_widths": request["responsive_widths"],
        "edge_ttl_seconds": request["edge_ttl_seconds"],
    }
    write_asset_apply_record(record)
    try:
        rule = desired_asset_rule(request)
        if prior_asset:
            api("PATCH", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules/{prior_asset['id']}", rule)
        else:
            api("POST", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules", rule)
        current = phase_ruleset(zone["id"])
        asset_rule = find_asset_rule(current)
        if not current or not asset_rule:
            raise CloudflareError("asset apply did not produce a readable asset SpeedOS rule")
        if not find_speedos_rule(current) or not find_dynamic_rule(current):
            raise CloudflareError("asset apply lost an existing HTML SpeedOS rule")
        record.update({"state": "applied", "applied_at": now(), "rule_id": asset_rule["id"]})
        write_asset_apply_record(record)
    except Exception as exc:
        try:
            rollback = rollback_asset_record(record, zone)
        except Exception as rollback_exc:
            record["state"] = "rollback_failed"
            record["apply_error"] = str(exc)
            record["rollback_error"] = str(rollback_exc)
            write_asset_apply_record(record)
            raise CloudflareError(
                f"asset apply failed and rollback also failed: apply={exc}; rollback={rollback_exc}"
            ) from None
        record["state"] = "rolled_back_after_apply_failure"
        record["apply_error"] = str(exc)
        record["rollback_action"] = rollback["action"]
        write_asset_apply_record(record)
        raise CloudflareError(
            f"asset apply failed after prepare; rollback completed ({rollback['action']}): {exc}"
        ) from None
    return {
        "ok": True,
        "command": "apply-asset",
        "rule_id_suffix": str(record["rule_id"])[-8:],
        "edge_ttl_seconds": ASSET_EDGE_TTL_SECONDS,
        "source_path": request["source_path"],
        "snapshot": str(snapshot_path),
    }


def cmd_rollback_asset() -> dict[str, Any]:
    if not LAST_ASSET_APPLY.exists():
        raise CloudflareError("no asset Cloudflare apply record exists to roll back")
    record = json.loads(LAST_ASSET_APPLY.read_text())
    zone = resolve_zone()
    if str(record.get("state") or "").startswith("rolled_back"):
        return {
            "ok": True,
            "command": "rollback-asset",
            "action": "already_rolled_back",
            "snapshot": record.get("snapshot"),
        }
    return rollback_asset_record(record, zone)


def write_featured_avatar_apply_record(record: dict[str, Any]) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    LAST_FEATURED_AVATAR_APPLY.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    os.chmod(LAST_FEATURED_AVATAR_APPLY, 0o600)


def rollback_featured_avatar_record(record: dict[str, Any], zone: dict[str, Any]) -> dict[str, Any]:
    if record.get("schema") != 1 or record.get("kind") != "aoe2war-speedos-cloudflare-featured-avatar-apply-record":
        raise CloudflareError("featured-avatar rollback refuses unrecognized apply record")
    if zone["id"] != record.get("zone_id"):
        raise CloudflareError("featured-avatar rollback zone identity mismatch")
    current = phase_ruleset(zone["id"])
    if not current:
        raise CloudflareError("featured-avatar rollback cannot find cache ruleset")
    prior = record.get("prior_featured_avatar_rule")
    prior_id = record.get("prior_featured_avatar_rule_id")
    current_rule = find_featured_avatar_rule(current)
    if prior:
        if not prior_id:
            raise CloudflareError("featured-avatar rollback lacks prior rule identity")
        restored = api(
            "PATCH",
            f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{prior_id}",
            prior,
            allow_404=True,
        )
        if restored is None:
            api("POST", f"/zones/{zone['id']}/rulesets/{current['id']}/rules", prior)
            action = "recreated_prior_featured_avatar_rule"
        else:
            action = "restored_prior_featured_avatar_rule"
    elif current_rule:
        api("DELETE", f"/zones/{zone['id']}/rulesets/{current['id']}/rules/{current_rule['id']}")
        action = "deleted_created_featured_avatar_rule"
    else:
        action = "no_featured_avatar_rule_present"
    record["state"] = "rolled_back"
    record["rolled_back_at"] = now()
    record["rollback_action"] = action
    write_featured_avatar_apply_record(record)
    return {
        "ok": True,
        "command": "rollback-featured-avatar",
        "action": action,
        "snapshot": record.get("snapshot"),
    }


def cmd_apply_featured_avatar() -> dict[str, Any]:
    request = validate_featured_avatar_request(json.loads(FEATURED_AVATAR_REQUEST.read_text()))
    live_source = production_source_sha()
    if request["operator_source_sha"] != live_source:
        raise CloudflareError("featured-avatar request source SHA does not match production")
    zone = resolve_zone()
    snapshot_path, prior_ruleset = snapshot(zone)
    if not prior_ruleset:
        raise CloudflareError("featured-avatar apply requires an existing cache ruleset")
    if not find_speedos_rule(prior_ruleset) or not find_dynamic_rule(prior_ruleset) or not find_asset_rule(prior_ruleset):
        raise CloudflareError("featured-avatar apply requires all three certified SpeedOS rules")
    prior_rule = find_featured_avatar_rule(prior_ruleset)
    record = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-featured-avatar-apply-record",
        "generated_at": now(),
        "state": "prepared",
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "snapshot": str(snapshot_path),
        "ruleset_id": prior_ruleset["id"],
        "prior_featured_avatar_rule_id": (prior_rule or {}).get("id"),
        "prior_featured_avatar_rule": safe_rule(prior_rule),
        "request_sha256": hashlib.sha256(FEATURED_AVATAR_REQUEST.read_bytes()).hexdigest(),
        "plan_sha256": request["plan_sha256"],
        "roster_sha256": request["roster_sha256"],
        "operator_source_sha": request["operator_source_sha"],
        "eligible_exact_paths": request["eligible_exact_paths"],
        "edge_ttl_seconds": request["edge_ttl_seconds"],
    }
    write_featured_avatar_apply_record(record)
    try:
        rule = desired_featured_avatar_rule(request)
        if prior_rule:
            api("PATCH", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules/{prior_rule['id']}", rule)
        else:
            api("POST", f"/zones/{zone['id']}/rulesets/{prior_ruleset['id']}/rules", rule)
        current = phase_ruleset(zone["id"])
        installed = find_featured_avatar_rule(current)
        if not current or not installed:
            raise CloudflareError("featured-avatar apply did not produce a readable rule")
        if not find_speedos_rule(current) or not find_dynamic_rule(current) or not find_asset_rule(current):
            raise CloudflareError("featured-avatar apply lost an existing SpeedOS rule")
        record.update({"state": "applied", "applied_at": now(), "rule_id": installed["id"]})
        write_featured_avatar_apply_record(record)
    except Exception as exc:
        try:
            rollback = rollback_featured_avatar_record(record, zone)
        except Exception as rollback_exc:
            record["state"] = "rollback_failed"
            record["apply_error"] = str(exc)
            record["rollback_error"] = str(rollback_exc)
            write_featured_avatar_apply_record(record)
            raise CloudflareError(
                f"featured-avatar apply failed and rollback also failed: apply={exc}; rollback={rollback_exc}"
            ) from None
        record["state"] = "rolled_back_after_apply_failure"
        record["apply_error"] = str(exc)
        record["rollback_action"] = rollback["action"]
        write_featured_avatar_apply_record(record)
        raise CloudflareError(
            f"featured-avatar apply failed after prepare; rollback completed ({rollback['action']}): {exc}"
        ) from None
    return {
        "ok": True,
        "command": "apply-featured-avatar",
        "rule_id_suffix": str(record["rule_id"])[-8:],
        "edge_ttl_seconds": FEATURED_AVATAR_EDGE_TTL_SECONDS,
        "eligible_path_count": len(request["eligible_exact_paths"]),
        "snapshot": str(snapshot_path),
    }


def cmd_rollback_featured_avatar() -> dict[str, Any]:
    if not LAST_FEATURED_AVATAR_APPLY.exists():
        raise CloudflareError("no featured-avatar Cloudflare apply record exists to roll back")
    record = json.loads(LAST_FEATURED_AVATAR_APPLY.read_text())
    zone = resolve_zone()
    if str(record.get("state") or "").startswith("rolled_back"):
        return {
            "ok": True,
            "command": "rollback-featured-avatar",
            "action": "already_rolled_back",
            "snapshot": record.get("snapshot"),
        }
    return rollback_featured_avatar_record(record, zone)


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
    parser.add_argument("command", choices=["verify", "snapshot", "apply", "rollback", "apply-dynamic", "rollback-dynamic", "apply-asset", "rollback-asset", "apply-featured-avatar", "rollback-featured-avatar"])
    args = parser.parse_args()
    try:
        result = {
            "verify": cmd_verify,
            "snapshot": cmd_snapshot,
            "apply": cmd_apply,
            "rollback": cmd_rollback,
            "apply-dynamic": cmd_apply_dynamic,
            "rollback-dynamic": cmd_rollback_dynamic,
            "apply-asset": cmd_apply_asset,
            "rollback-asset": cmd_rollback_asset,
            "apply-featured-avatar": cmd_apply_featured_avatar,
            "rollback-featured-avatar": cmd_rollback_featured_avatar,
        }[args.command]()
    except (CloudflareError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "command": args.command, "error": str(exc)}))
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
