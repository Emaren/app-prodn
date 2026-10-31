#!/usr/bin/env python3
"""R24 D separate website-only admission policy; never an installer or RSA bypass.

This is an independent, versioned policy for a future C/F root-SSH web-only
transaction. Old #1063 six signer / six restore policy remains untouched.
Source guards are NOT proof of B/C/E physical facts or owner's consent.
"""
import hashlib
import json
import re

POLICY = "aoe2war.website-only.root-ssh.v1"
SITE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
OLD_CONTROLLER = "18052e01a191b15525664c1a058de80d7a8bc150"
HOST = "ubuntu-4gb-hel1-11"
WEB = "aoe2hdbets-web.service"
OLD_OWNER_RSA_SPKI = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
OLD_LOCK = (2064, 6185747, 1000, 0o644)
H40 = re.compile(r"[a-f0-9]{40}\Z")
H64 = re.compile(r"[a-f0-9]{64}\Z")

# EXACT prior independently reviewed Git SHAs to be sealed by later F integration.
# No self-referential final commit SHA: F review must predate integration. Empty HOLD.
B_FINANCE_REVIEW_SHA = ""
C_ROOT_OPERATOR_SHA = ""
E_CAPACITY_REVIEW_SHA = ""
F_REVIEW_AUTHORITY_SHA = ""


class Hold(ValueError):
    pass


def need(ok, code):
    if not ok:
        raise Hold("R24_D_WEB_ONLY_HOLD:" + code)


def shape(x, keys, code):
    need(type(x) is dict and set(x) == set(keys), code)


def h40(x):
    return type(x) is str and bool(H40.fullmatch(x))


def h64(x):
    return type(x) is str and bool(H64.fullmatch(x))


def canonical(x):
    return json.dumps(x, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(x):
    return hashlib.sha256(canonical(x)).hexdigest()


def source_seals():
    seals = (B_FINANCE_REVIEW_SHA, C_ROOT_OPERATOR_SHA,
             E_CAPACITY_REVIEW_SHA, F_REVIEW_AUTHORITY_SHA)
    need(all(h40(x) for x in seals) and len(set(seals)) == 4,
         "INDEPENDENT_REVIEW_SOURCE_SEALS_ABSENT")
    return seals


def finance_scope(x):
    shape(x, ("candidate_sha", "status", "b_review_sha256",
              "http_method_graph_sha256", "startup_graph_sha256",
              "web_db_acl_sha256", "systemd_boundary_sha256",
              "finance_write_routes", "startup_finance_writers",
              "web_financial_credentials", "unresolved_edges",
              "proposed_financial_restarts"), "B_SCOPE_SHAPE")
    need(x["candidate_sha"] == SITE and
         x["status"] == "B_INDEPENDENT_FINANCE_ISOLATED_REVIEW" and
         all(h64(x[k]) for k in ("b_review_sha256", "http_method_graph_sha256",
             "startup_graph_sha256", "web_db_acl_sha256",
             "systemd_boundary_sha256")), "B_REVIEWED_SOURCE_SCOPE_MISSING")
    for key in ("finance_write_routes", "startup_finance_writers",
                "web_financial_credentials", "unresolved_edges",
                "proposed_financial_restarts"):
        need(x[key] == [], "FINANCIAL_ISOLATION_UNPROVEN:" + key)


def finance_host(x):
    shape(x, ("origin", "root_observation_sha256", "unit_identities",
              "process_identities", "financial_state_sha256",
              "cron_db_ingress_sha256", "listeners",
              "unresolved_root_processes", "unresolved_writers"),
          "FINANCIAL_OBSERVATION_SHAPE")
    need(x["origin"] == "C_AUTHENTICATED_HEL1_ROOT" and
         h64(x["root_observation_sha256"]) and
         h64(x["financial_state_sha256"]) and
         h64(x["cron_db_ingress_sha256"]),
         "FINANCE_REQUIRES_AUTHENTICATED_ROOT_NOT_B_UNSIGNED_BEFORE")
    for k in ("unit_identities", "process_identities"):
        need(type(x[k]) is dict and len(x[k]) >= 25 and
             all(type(n) is str and h64(v) for n,v in x[k].items()),
             "INCOMPLETE_FINANCIAL_IDENTITIES:" + k)
    need(x["unresolved_root_processes"] == [] and
         x["unresolved_writers"] == [], "UNRESOLVED_FINANCIAL_ORIGINS")
    shape(x["listeners"], ("8092", "8093"), "TWO_WOLO_LISTENERS_REQUIRED")
    for port in ("8092", "8093"):
        row = x["listeners"][port]
        shape(row, ("pid", "start_ticks", "socket_inode",
                    "executable_sha256"), "WOLO_PROVENANCE_SHAPE")
        need(all(type(row[k]) is int and row[k] > 0 for k in
                 ("pid", "start_ticks", "socket_inode")) and
             h64(row["executable_sha256"]), "WOLO_SOCKET_PID_NOT_PROVEN")


def root_observation(x):
    shape(x, ("origin", "host", "euid", "release_lock", "old_owner_spki",
              "old_owner_trust_unchanged", "source_sha", "build_id",
              "web_unit", "web_pid", "web_start_ticks", "web_artifact_sha256",
              "rollback", "capacity", "finance"), "HOST_BOUNDARY_SHAPE")
    need(x["origin"] == "C_AUTHENTICATED_HEL1_ROOT" and x["host"] == HOST and
         x["euid"] == 0 and x["release_lock"] == list(OLD_LOCK) and
         x["old_owner_spki"] == OLD_OWNER_RSA_SPKI and
         x["old_owner_trust_unchanged"] is True,
         "ORIGINAL_ROOT_LOCK_OR_RSA_TRUST_DRIFT")
    need(h40(x["source_sha"]) and
         type(x["build_id"]) is str and 1 <= len(x["build_id"]) <= 128 and
         x["web_unit"] == WEB and type(x["web_pid"]) is int and x["web_pid"] > 0 and
         type(x["web_start_ticks"]) is int and x["web_start_ticks"] > 0 and
         h64(x["web_artifact_sha256"]), "WEB_RUNTIME_IDENTITY_MISSING")
    rb=x["rollback"]
    shape(rb, ("source_sha", "build_id", "artifact_sha256",
               "entrypoint_sha256", "durable", "readback_verified"),
          "EXACT_ROLLBACK_PROOF_MISSING")
    need(h40(rb["source_sha"]) and type(rb["build_id"]) is str and
         bool(rb["build_id"]) and h64(rb["artifact_sha256"]) and
         h64(rb["entrypoint_sha256"]) and rb["durable"] is True and
         rb["readback_verified"] is True, "ROLLBACK_NOT_USABLE")
    cap=x["capacity"]
    shape(cap, ("mount_device", "free_bytes", "new_build_peak_bytes",
                "rollback_bytes", "required_remaining_bytes",
                "native_measurement_sha256"), "E_CAPACITY_SHAPE")
    need(cap["mount_device"] == OLD_LOCK[0] and
         all(type(cap[k]) is int and cap[k] >= 0 for k in
             ("free_bytes", "new_build_peak_bytes", "rollback_bytes",
              "required_remaining_bytes")) and
         cap["new_build_peak_bytes"] > 0 and
         h64(cap["native_measurement_sha256"]) and
         cap["free_bytes"] >= cap["new_build_peak_bytes"] +
         cap["rollback_bytes"] + cap["required_remaining_bytes"],
         "E_WEBSITE_BUILD_ROLLBACK_CAPACITY_HOLD")
    finance_host(x["finance"])


def plan_contract(x):
    shape(x, ("schema", "policy", "candidate_sha", "controller_source_sha",
              "prior_sha", "prior_build_id", "target_build_id",
              "target_artifact_sha256", "rollback_artifact_sha256",
              "attempt_id", "web_unit", "isolation",
              "allowed", "forbidden"), "WEB_ONLY_PLAN_SHAPE")
    need(x["schema"] == 1 and x["policy"] == POLICY and
         x["candidate_sha"] == SITE and
         x["controller_source_sha"] == OLD_CONTROLLER and
         h40(x["prior_sha"]) and x["prior_sha"] != SITE and
         type(x["prior_build_id"]) is str and bool(x["prior_build_id"]) and
         type(x["target_build_id"]) is str and bool(x["target_build_id"]) and
         h64(x["target_artifact_sha256"]) and
         h64(x["rollback_artifact_sha256"]) and
         h64(x["attempt_id"]) and x["web_unit"] == WEB,
         "SOURCE_OR_BUILD_OR_ATTEMPT_IDENTITY_DRIFT")
    need(x["allowed"] == ["isolated_build", "isolated_stage", "web_only_switch",
                          "read_only_health", "web_only_rollback"] and
         x["forbidden"] == ["money", "database_migration",
                            "financial_unit_restart", "wolo_restart",
                            "source_reset", "snapshot_delete",
                            "legacy_release_lock_bypass",
                            "old_owner_key_replacement"],
         "UNREVIEWED_OPERATION_SCOPE")
    finance_scope(x["isolation"])


def owner_phrase(plan):
    """C must request typed text on OWNER Mac over verified root SSH channel.

    This string by itself is NOT owner authentication. C must tie to root-issued
    one-time attempt, locked original release.lock and root O_EXCL audit.
    """
    plan_contract(plan)
    return "AUTHORIZE AOE2WAR WEB ONLY " + SITE + " PLAN " + digest(plan)


def match_consent_text(plan, typed):
    need(type(typed) is str and typed == owner_phrase(plan),
         "OWNER_EXACT_PLAN_CONSENT_ABSENT")
    return {"status": "TEXT_MATCH_ONLY_NOT_OWNER_AUTHENTICATED",
            "release_authorized": False, "plan_sha256": digest(plan)}


def before_gate(plan, before):
    source_seals()
    plan_contract(plan)
    root_observation(before)
    need(before["source_sha"] == plan["prior_sha"] and
         before["build_id"] == plan["prior_build_id"] and
         before["rollback"]["artifact_sha256"] ==
         plan["rollback_artifact_sha256"],
         "BEFORE_RUNTIME_OR_ROLLBACK_NOT_PLAN_BOUND")
    return {"status": "REVIEWABLE_WEB_ONLY_SCOPE_NOT_OWNER_AUTHORIZED",
            "policy": POLICY, "plan_sha256": digest(plan),
            "signed_six_origins_claimed": False,
            "financial_operation_authorized": False}


def after_gate(plan, before, after):
    before_gate(plan, before)
    root_observation(after)
    need(after["source_sha"] == SITE and
         after["build_id"] == plan["target_build_id"] and
         after["web_artifact_sha256"] == plan["target_artifact_sha256"] and
         after["web_start_ticks"] != before["web_start_ticks"],
         "NEW_SOURCE_BUILD_AND_WEB_PID_NOT_LIVE")
    need(after["rollback"] == before["rollback"], "ROLLBACK_DRIFT")
    need(after["finance"] == before["finance"], "FINANCIAL_PROCESS_OR_WOLO_DRIFT")
    return {"status": "ROOT_WEB_ONLY_POSTCHECK_NOT_PUBLIC_LIVE_VERIFIED",
            "candidate_sha": SITE, "next_build_id": after["build_id"],
            "plan_sha256": digest(plan), "signed_six_origins_claimed": False,
            "financial_operation_authorized": False}
