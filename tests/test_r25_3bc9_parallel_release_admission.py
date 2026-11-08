"""R25 exact-3bc9 parallel-canary source/negative tests; never touch host services."""
from __future__ import annotations

import importlib.util
import hashlib
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/r25_3bc9_parallel_release_admission.py"
FIXTURE = ROOT / "tests/fixtures/r25_3bc9_deployed_web_unit.fixture"
spec = importlib.util.spec_from_file_location("r25_parallel", SOURCE)
assert spec is not None and spec.loader is not None
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

ORIGINAL = FIXTURE.read_bytes()
EXPECTED_ORIGINAL_SHA = "1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3"
OLD_GUARD = (ROOT / "scripts/r25_b_guard_production_v1.cjs").read_bytes()
CANDIDATE_GUARD = (ROOT / "scripts/r25_3bc9_guard_candidate_3033.cjs").read_bytes()


class TestFrozenSource(unittest.TestCase):
    def test_immutable_deployed_unit_fixture(self):
        self.assertEqual(gate.sha(ORIGINAL), EXPECTED_ORIGINAL_SHA)
        self.assertEqual(gate.EXPECTED_WEB_UNIT_SHA, EXPECTED_ORIGINAL_SHA)

    def test_pure_candidate_diff_is_explicit_and_repeatable(self):
        output = gate.render_candidate_unit(ORIGINAL)
        self.assertEqual(output, gate.render_candidate_unit(ORIGINAL))
        self.assertEqual(output.count(str(gate.STAGE).encode()), 4)
        self.assertNotIn(gate.CURRENT_STAGE.encode(), output)
        self.assertIn(b"PORT=3033 ", output)
        self.assertIn(b"--port 3033\n", output)
        self.assertIn(b"CacheDirectory=aoe2war-web-prod-candidate-3bc9\n", output)
        self.assertIn(b"MemoryHigh=1400M\nMemoryMax=1800M\n", output)
        self.assertIn(b"Restart=no\n", output)
        self.assertIn(b"NODE_OPTIONS=--require=" + str(gate.CANDIDATE_GUARD_PATH).encode(), output)
        self.assertNotIn(b"NODE_OPTIONS=--require=" + str(gate.OLD_GUARD_PATH).encode(), output)
        self.assertIn(b"WARGRAPH_RUNTIME_DISABLED=true", output)
        self.assertNotIn(b"NODE_TLS_REJECT_UNAUTHORIZED=0", output)

    def test_proposal_port_and_cache_are_isolated(self):
        output = gate.render_candidate_unit(ORIGINAL)
        self.assertNotIn(b"PORT=3032 ", output)
        self.assertNotIn(b"--port 3032\n", output)
        self.assertNotIn(b"BindPaths=/var/cache/aoe2war-web-prod:", output)
        self.assertNotIn(b"CacheDirectory=aoe2war-web-prod\n", output)
        self.assertIn(b"EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env\n", output)

    def test_changed_web_unit_refused(self):
        with self.assertRaisesRegex(gate.Hold, "LIVE_WEB_UNIT_BYTES_NOT_REVIEWED"):
            gate.render_candidate_unit(ORIGINAL + b"# unauthorized patch\n")

    def test_another_source_revision_refused(self):
        with self.assertRaisesRegex(gate.Hold, "LIVE_WEB_UNIT_BYTES_NOT_REVIEWED"):
            gate.render_candidate_unit(ORIGINAL.replace(b"/var/lib/aoe2war-web-prod-1a380cdf76ff", b"/var/lib/aoe2war-web-prod-unreviewed"))

    def test_missing_isolation_guard_refused(self):
        fake = ORIGINAL.replace(b"WARGRAPH_RUNTIME_DISABLED=true", b"WARGRAPH_RUNTIME_DISABLED=false")
        with self.assertRaisesRegex(gate.Hold, "SECURITY_SANDBOX_REQUIREMENT_MISSING"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_altered_database_boundary_refused(self):
        fake = ORIGINAL.replace(b"AOE2WAR_PROD_DB_PREVIEW=false", b"AOE2WAR_PROD_DB_PREVIEW=true")
        with self.assertRaisesRegex(gate.Hold, "SECURITY_SANDBOX_REQUIREMENT_MISSING"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_missing_capability_sandbox_refused(self):
        fake = ORIGINAL.replace(b"CapabilityBoundingSet=\n", b"CapabilityBoundingSet=CAP_SYS_ADMIN\n")
        with self.assertRaisesRegex(gate.Hold, "SECURITY_SANDBOX_REQUIREMENT_MISSING"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_extra_env_file_refused(self):
        fake = ORIGINAL + b"EnvironmentFile=/etc/unreviewed.env\n"
        with self.assertRaisesRegex(gate.Hold, "WEB_UNIT_SHAPE_CHANGED"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_duplicate_exec_refused(self):
        fake = ORIGINAL + b"ExecStart=/bin/sh -c unreviewed\n"
        with self.assertRaisesRegex(gate.Hold, "WEB_UNIT_SHAPE_CHANGED"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_wrong_number_of_stage_refs_refused(self):
        fake = ORIGINAL.replace(b"ReadOnlyPaths=/var/lib/aoe2war-web-prod-1a380cdf76ff\n", b"ReadOnlyPaths=/var/lib/other\n")
        with self.assertRaisesRegex(gate.Hold, "UNIT_REPLACEMENT_SCOPE_CHANGED"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_wrong_listen_port_refused(self):
        fake = ORIGINAL.replace(b"PORT=3032 ", b"PORT=3033 ")
        with self.assertRaisesRegex(gate.Hold, "UNIT_REPLACEMENT_SCOPE_CHANGED"):
            gate.render_candidate_unit(fake, gate.sha(fake))

    def test_no_direct_mutation_methods_in_runner(self):
        src = SOURCE.read_text()
        for forbidden in ("systemctl start", "systemctl stop", "systemctl restart",
                          "daemon-reload", "nft -f", "psql ", "ALTER ROLE", "os.kill(",
                          "subprocess.Popen(", "os.system(", "shutil.rmtree("):
            self.assertNotIn(forbidden, src)


class TestCandidateNetworkGuard(unittest.TestCase):
    def test_original_guard_file_is_exact_source_pinned(self):
        self.assertEqual(gate.sha(OLD_GUARD), gate.OLD_GUARD_SHA)

    def test_derivative_is_exact_byte_for_byte_source(self):
        derived = gate.render_candidate_guard(OLD_GUARD)
        self.assertEqual(derived, CANDIDATE_GUARD)
        self.assertEqual(gate.sha(derived), gate.CANDIDATE_GUARD_SHA)

    def test_candidate_guard_listener_cache_and_source_identity(self):
        self.assertIn(b'PORT: "3033"', CANDIDATE_GUARD)
        self.assertIn(b'Number(opts.port) === 3033', CANDIDATE_GUARD)
        self.assertIn(str(gate.CANDIDATE_GUARD_PATH).encode(), CANDIDATE_GUARD)
        self.assertIn(gate.CANARY_CACHE.encode(), CANDIDATE_GUARD)
        self.assertNotIn(b"3032", CANDIDATE_GUARD)
        self.assertNotIn(str(gate.OLD_GUARD_PATH).encode(), CANDIDATE_GUARD)

    def test_unchanged_native_egress_financial_deny_and_steam_cert(self):
        for needle in (
            b"DEDICATED_AUTH_DATABASE_ROLE_REQUIRED",
            b"STEAM_CERTIFICATE_AND_SNI_REQUIRED",
            b"NODE_EGRESS_DENIED",
            b"RAW_HTTPS_POST_DENIED",
            b"ONLY_READONLY_BACKEND_HTTP",
            b"ONLY_VALIDATED_STEAM_HTTPS",
            b"UNREVIEWED_ENVIRONMENT_KEY",
            b"EXACT_DEDICATED_UID_REQUIRED",
            b"ROOT_SEALED_STAGE_REQUIRED",
        ):
            self.assertIn(needle, OLD_GUARD)
            self.assertIn(needle, CANDIDATE_GUARD)

    def test_original_guard_egress_tamper_is_rejected(self):
        tampered = OLD_GUARD.replace(b"NODE_EGRESS_DENIED", b"NODE_EGRESS_ALLOWED")
        with self.assertRaisesRegex(gate.Hold, "LIVE_GUARD_SOURCE_BYTES_NOT_REVIEWED"):
            gate.render_candidate_guard(tampered)


class TestPhysicalAdmission(unittest.TestCase):
    @staticmethod
    def states(unit, *_keys):
        mapping = {
            "aoe2hdbets-web.service": {"ActiveState": "active", "MainPID": "2625090"},
            "aoe2hdbets-web-prod.service": {
                "ActiveState": "active", "MainPID": "2206791",
                "WorkingDirectory": "/var/lib/aoe2war-web-prod-1a380cdf76ff",
            },
            gate.REVIEWED_CANARY_UNIT: {
                "LoadState": "not-found", "ActiveState": "inactive", "MainPID": "0",
            },
        }
        return mapping[unit]

    def run_audit(self, *, ports=None, mem=None, candidate_present=False, pid=None):
        def get_state(unit, *_):
            state = self.states(unit)
            if unit == gate.REVIEWED_CANARY_UNIT and candidate_present:
                return {**state, "LoadState": "loaded"}
            if unit == "aoe2hdbets-web-prod.service" and pid:
                return {**state, "MainPID": str(pid)}
            return state

        with patch.object(gate, "source_stage", return_value={}), \
             patch.object(gate, "read_root_file", side_effect=lambda p, sha: (
                 ORIGINAL if p == gate.LIVE_WEB_UNIT else
                 OLD_GUARD if p == gate.OLD_GUARD_PATH else b"safe"
             )), \
             patch.object(gate, "unit_state", side_effect=get_state), \
             patch.object(gate, "listener_ports", return_value=ports if ports is not None else {3030, 3032}), \
             patch.object(gate, "resources", return_value=mem if mem is not None else {
                 "mem_available_bytes": 4 * 1024**3,
                 "swap_used_bytes": 1024**3,
             }), \
             patch.object(gate, "EXPECTED_WEB_UNIT_SHA", gate.sha(ORIGINAL)), \
             patch.object(gate, "EXPECTED_STEAM_UNIT_SHA", gate.sha(b"safe")), \
             patch.object(gate, "EXPECTED_NGINX_SHA", gate.sha(b"safe")):
            # Return the status or exception for callers to assert.
            return gate.runtime_audit()

    def test_resource_qualified_audit_remains_non_authorizing(self):
        result = self.run_audit()
        self.assertEqual(result["status"], "PASS_READONLY_PARALLEL_UNIT_PROPOSAL_NOT_INSTALL_AUTHORITY")
        self.assertFalse(result["finance_readonly_3030_rollback_certified"])
        self.assertFalse(result["owner_release_approval"])
        self.assertFalse(result["candidate_started"])
        self.assertFalse(result["web_cutover_authorized"])
        self.assertFalse(result["financial_authorized"])

    def test_low_available_memory_holds(self):
        with self.assertRaisesRegex(gate.Hold, "HOLD_CANARY_MEMORY"):
            self.run_audit(mem={"mem_available_bytes": 2 * 1024**3, "swap_used_bytes": 1024**3})

    def test_excess_swap_holds(self):
        with self.assertRaisesRegex(gate.Hold, "HOLD_CANARY_MEMORY"):
            self.run_audit(mem={"mem_available_bytes": 5 * 1024**3, "swap_used_bytes": 5 * 1024**3})

    def test_preexisting_candidate_unit_holds(self):
        with self.assertRaisesRegex(gate.Hold, "CANARY_UNIT_ALREADY_EXISTS"):
            self.run_audit(candidate_present=True)

    def test_exposed_funded_port_holds(self):
        with self.assertRaisesRegex(gate.Hold, "PUBLIC_OR_FUNDED_LISTENER_DRIFT"):
            self.run_audit(ports={3030, 3032, 8094})

    def test_occupied_canary_port_holds(self):
        with self.assertRaisesRegex(gate.Hold, "PUBLIC_OR_FUNDED_LISTENER_DRIFT"):
            self.run_audit(ports={3030, 3032, 3033})

    def test_3032_original_pid_drift_holds(self):
        with self.assertRaisesRegex(gate.Hold, "PROTECTED_WEBSITE_OR_ROLLBACK_IDENTITY_CHANGED"):
            self.run_audit(pid=999999)

    def test_missing_live_3032_socket_holds(self):
        with self.assertRaisesRegex(gate.Hold, "PUBLIC_OR_FUNDED_LISTENER_DRIFT"):
            self.run_audit(ports={3030})

    def test_systemd_plan_does_not_change_database_or_nginx(self):
        result = self.run_audit()
        self.assertTrue(result["existing_3032_and_3030_unmodified"])
        self.assertFalse(result["candidate_installed"])
        self.assertFalse(result["c03_complete"])


if __name__ == "__main__":
    unittest.main()
