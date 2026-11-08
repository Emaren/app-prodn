"""No-mutation exact-avatar public-byte forensic and release-gate tests."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/r25_3bc9_avatar_byte_parity_audit.py"
spec = importlib.util.spec_from_file_location("avatar_gate_3bc9", SOURCE)
assert spec and spec.loader
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
WEBP_REF = b"RIFF" + (b"\x04\x00\x00\x00") + b"WEBP" + b"actual-managed"
WEBP_FALLBACK = b"RIFF" + (b"\x04\x00\x00\x00") + b"WEBP" + b"static-card"

class TestAvatarForensics(unittest.TestCase):
    def test_frozen_public_reference_has_three_known_aliases(self):
        self.assertEqual(set(gate.EXPECTED_3030), {"sniper", "dil-pascana", "emaren"})
        for entry in gate.EXPECTED_3030.values():
            self.assertEqual(len(entry["managed_sha256"]), 64)
            fallback = entry["static_fallback_sha256"]
            self.assertIsNone(fallback) if fallback is None else self.assertEqual(len(fallback), 64)

    def test_reference_and_candidate_match(self):
        with patch.dict(gate.EXPECTED_3030, {"sniper": {
            "managed_sha256": gate.sha256(WEBP_REF),
            "static_fallback_sha256": gate.sha256(WEBP_FALLBACK),
        }}):
            result = gate.comparison("sniper", WEBP_REF, WEBP_REF)
        self.assertTrue(result["candidate_matches_reference"])
        self.assertFalse(result["candidate_is_known_fallback"])

    def test_http_200_image_can_be_static_fallback(self):
        with patch.dict(gate.EXPECTED_3030, {"sniper": {
            "managed_sha256": gate.sha256(WEBP_REF),
            "static_fallback_sha256": gate.sha256(WEBP_FALLBACK),
        }}):
            result = gate.comparison("sniper", WEBP_REF, WEBP_FALLBACK)
        self.assertFalse(result["candidate_matches_reference"])
        self.assertTrue(result["candidate_is_known_fallback"])

    def test_source_reference_drift_is_hard_hold(self):
        with self.assertRaisesRegex(gate.Hold, "OLD_REFERENCE_MANAGED_BYTES_CHANGED"):
            gate.comparison("sniper", WEBP_REF, WEBP_REF)

    def test_alias_whitelist_refuses_unreviewed_player(self):
        with self.assertRaisesRegex(gate.Hold, "AVATAR_NOT_IN_FROZEN"):
            gate.comparison("../root/.env", WEBP_REF, WEBP_REF)

    def test_fetch_rejects_8092_or_8094_port(self):
        for port in (8092, 8093, 8094, 8095, 3031, 22, 443):
            with self.subTest(port=port), self.assertRaisesRegex(gate.Hold, "UNKNOWN_PORT"):
                gate.fetch_webp(port, "sniper")

    def test_fetch_rejects_unknown_alias(self):
        with self.assertRaisesRegex(gate.Hold, "UNKNOWN_PORT_OR_AVATAR"):
            gate.fetch_webp(3032, "some-unreviewed-name")

    def test_restricted_host_requires_root_for_audit(self):
        with patch.object(gate.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(gate.Hold, "ROOT_HEL1"):
                gate.audit(3032)

    def test_candidate_port_only_3032_or_3033(self):
        with patch.object(gate.os, "geteuid", return_value=0), \
             patch.object(gate.socket, "gethostname", return_value="ubuntu-4gb-hel1-11"):
            with self.assertRaisesRegex(gate.Hold, "CANDIDATE_PORT_NOT_REVIEWED"):
                gate.audit(3030)

    def test_genuine_200_parity_fails_on_one_fallback(self):
        references={alias:{"managed_sha256":gate.sha256(WEBP_REF),
                           "static_fallback_sha256":gate.sha256(WEBP_FALLBACK)}
                    for alias in gate.EXPECTED_3030}
        def fake(port,alias):
            return WEBP_REF if port==3030 or alias=="emaren" else WEBP_FALLBACK
        with patch.object(gate.os,"geteuid",return_value=0), \
             patch.object(gate.socket,"gethostname",return_value="ubuntu-4gb-hel1-11"), \
             patch.dict(gate.EXPECTED_3030,references), \
             patch.object(gate,"fetch_webp",side_effect=fake):
            report=gate.audit(3033)
        self.assertEqual(report["status"],"HOLD_AVATAR_MANAGED_BYTE_PARITY")
        self.assertEqual(report["matched"],1)
        self.assertEqual(report["known_fallback_substitutions"],2)
        self.assertFalse(report["production_mutation"])
        self.assertFalse(report["financial_authorized"])

    def test_all_three_matching_is_readonly_pass_only(self):
        references={alias:{"managed_sha256":gate.sha256(WEBP_REF),
                           "static_fallback_sha256":gate.sha256(WEBP_FALLBACK)}
                    for alias in gate.EXPECTED_3030}
        with patch.object(gate.os,"geteuid",return_value=0), \
             patch.object(gate.socket,"gethostname",return_value="ubuntu-4gb-hel1-11"), \
             patch.dict(gate.EXPECTED_3030,references), \
             patch.object(gate,"fetch_webp",return_value=WEBP_REF):
            report=gate.audit(3033)
        self.assertEqual(report["status"],"PASS_AVATAR_MANAGED_BYTE_PARITY")
        self.assertEqual(report["matched"],3)
        self.assertEqual(report["known_fallback_substitutions"],0)
        self.assertFalse(report["production_mutation"])

    def test_forensic_never_writes_or_approves_payments(self):
        source=SOURCE.read_text()
        for forbidden in ("subprocess.Popen(", "systemctl ", "ALTER ROLE", "UPDATE ",
                          "INSERT ", "DELETE FROM ", "os.system(", "os.kill(",
                          "executeTransfer", "signedPermit", "requests.post(", "method=\"POST\""):
            self.assertNotIn(forbidden,source)
        self.assertIn('"financial_authorized": False',source)
        self.assertIn('class NoRedirect',source)

if __name__ == "__main__":
    unittest.main()
