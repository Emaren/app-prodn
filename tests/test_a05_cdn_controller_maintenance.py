"""A05 one-use CDN hotfix scope contracts. Never connects to production."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / "scripts/r25_a05_cdn_controller_maintenance.py"
spec = importlib.util.spec_from_file_location("cdn_controller_maintenance_test", SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class CdnHotfix(unittest.TestCase):
    def test_release_isolation(self):
        self.assertEqual(m.SCOPE, "HOTFIX_A05_STEAM_CDN_VERIFIED_IPS_3032_ONLY")
        self.assertEqual(m.PID, 3874672)
        self.assertEqual(m.RUNTIME_SOURCE, "f50f814c065c329b6cb80f6aa45bb239b2528a0e")
        self.assertEqual(m.NEW_C_SHA, "9d17d780bc08989a42ed850eea8db244871f2434c38954ee0477195a3c85488e")
        self.assertNotEqual(m.OLD_C_SHA, m.NEW_C_SHA)
        self.assertEqual(m.RUNTIME_CI, 41955993026)

    def test_only_controller_and_policy_mutation_targets(self):
        with self.assertRaisesRegex(m.Hold, "TARGET_NOT_IN_CONTROLLER_POLICY"):
            m.atomic(Path("/etc/nginx/sites-available/aoe2war.com"), b"bad", 0o644)
        with self.assertRaisesRegex(m.Hold, "TARGET_NOT_IN_CONTROLLER_POLICY"):
            m.atomic(Path("/var/www/WoloChain-wolo-1/.env"), b"bad", 0o644)

    def test_systemd_only_steam_timer_and_refresh_allowed(self):
        with self.assertRaisesRegex(m.Hold, "SYSTEMD_SCOPE_DENIED"):
            m.systemd("restart", "aoe2hdbets-web.service")
        with self.assertRaisesRegex(m.Hold, "SYSTEMD_SCOPE_DENIED"):
            m.systemd("stop", "aoe2hdbets-web-prod.service")
        with self.assertRaisesRegex(m.Hold, "SYSTEMD_SCOPE_DENIED"):
            m.systemd("reload", "nginx")
        for action in ("stop", "start"):
            for service in (m.TIMER, m.SERVICE):
                with mock.patch.object(m.subprocess, "run",
                    return_value=mock.Mock(returncode=0)) as runner:
                    m.systemd(action, service)
                    self.assertEqual(runner.call_args.args[0],
                        ["/usr/bin/systemctl", action, service])

    def test_fail_closed_grant_and_owner_source_pins(self):
        body = SOURCE.read_text()
        for token in ("CONS​UMED_NO_REPLAY".replace("\u200b", ""),
                      "EXACT_GITHUB_SOURCE_BYTES_REQUIRED",
                      "CURRENT_CONTROLLER_GITGUARDIAN_NOT_GREEN",
                      "CURRENT_CONTROLLER_THREE_JOB_CI_REQUIRED",
                      "EXACT_PLAN_SHA_REQUIRED",
                      "ONE_USE_NONCE_SHAPE_REQUIRED",
                      "RELEASE_LOCK_IDENTITY_CHANGED",
                      "native_witness_sha256",
                      "PASS_EXACT_C_AND_POLICY_RESTORED"):
            self.assertIn(token, body)
        self.assertIn('stopped = True\n        systemd("stop", TIMER)', body)
        self.assertIn("flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)", body)
        self.assertNotIn('systemd("stop", "aoe2hdbets-web.service")', body)
        self.assertNotIn("nft flush ruleset", body)
        self.assertNotIn("ALTER ROLE", body)

    def test_owner_signed_financial_scope_never_accepted(self):
        text = SOURCE.read_text()
        self.assertIn('"financial_authorized": False', text)
        self.assertIn('"public_cutover_authorized": False', text)
        self.assertIn('"rollback_authorized": True', text)
        self.assertIn('c.production_grant({', text)
        self.assertIn('ci_qualification(c, args.script_ref, args.script_ci)', text)
        self.assertIn('sha(c.canonical(c.production_protected())) == PROTECTED_SHA', text)


if __name__ == "__main__":
    unittest.main()
