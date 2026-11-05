"""Source contracts for a one-use, candidate-only F50 runtime upgrade."""
import importlib.util
from pathlib import Path
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "r25_a05_f50_native_upgrade.py"
spec = importlib.util.spec_from_file_location("a05_f50", SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class F50UpgradeTest(unittest.TestCase):
    def unit(self):
        fields = [
            "WorkingDirectory=" + str(mod.OLD_STAGE),
            "ReadOnlyPaths=" + str(mod.OLD_STAGE),
            "BindPaths=/var/cache/aoe2war-web-prod:" + str(mod.OLD_STAGE) + "/.next/cache",
            "BindReadOnlyPaths=/mnt/HC_Volume_105319120/aoe2-downloads:" + str(mod.OLD_STAGE) + "/public/downloads",
            "Restart=on-failure", "MemoryMax=3200M",
            "ExecStart=/usr/bin/node --max-old-space-size=2048 next",
            "NoNewPrivileges=yes", "ProtectSystem=strict",
            "TemporaryFileSystem=/run:ro", "AOE2WAR_PROD_DB_PREVIEW=false",
            "WARGRAPH_RUNTIME_DISABLED=true",
        ]
        return ("\n".join(fields)+"\n").encode()

    def test_exact_four_stage_paths_only(self):
        old = self.unit()
        new = mod.new_unit(old)
        self.assertEqual(new.count(str(mod.NEW_STAGE).encode()), 4)
        self.assertNotIn(str(mod.OLD_STAGE).encode(), new)
        self.assertEqual(new.replace(str(mod.NEW_STAGE).encode(), str(mod.OLD_STAGE).encode()), old)

    def test_stage_drift_rejected(self):
        old = self.unit().replace(b"WorkingDirectory=", b"RemovedDirectory=")
        with self.assertRaisesRegex(mod.Hold, "UNIT_STAGE_BIND_COUNT_DRIFT"):
            mod.new_unit(old.replace(str(mod.OLD_STAGE).encode(), b"/wrong/working", 1))

    def test_memory_reduction_rejected(self):
        for old, new in ((b"Restart=on-failure", b"Restart=no"),
                         (b"MemoryMax=3200M", b"MemoryMax=2000M"),
                         (b"--max-old-space-size=2048", b"--max-old-space-size=1000")):
            with self.subTest(old=old):
                with self.assertRaisesRegex(mod.Hold, "UNIT_SAFETY_CHANGED"):
                    mod.new_unit(self.unit().replace(old, new))

    def test_finance_confinement_reduction_rejected(self):
        for old, new in ((b"ProtectSystem=strict", b"ProtectSystem=false"),
                         (b"NoNewPrivileges=yes", b"NoNewPrivileges=no"),
                         (b"WARGRAPH_RUNTIME_DISABLED=true", b"WARGRAPH_RUNTIME_DISABLED=false"),
                         (b"AOE2WAR_PROD_DB_PREVIEW=false", b"AOE2WAR_PROD_DB_PREVIEW=true")):
            with self.subTest(old=old):
                with self.assertRaisesRegex(mod.Hold, "UNIT_SAFETY_CHANGED"):
                    mod.new_unit(self.unit().replace(old, new))

    def test_unapproved_atomic_target_denied(self):
        with self.assertRaisesRegex(mod.Hold, "UNREVIEWED_TARGET"):
            mod.atomic(Path("/etc/nginx/sites-available/aoe2war.com"), b"x", 0o644)

    def test_service_action_allowlist(self):
        with self.assertRaisesRegex(mod.Hold, "SYSTEMD_ACTION_DENIED"):
            mod.call_systemd("reload")

    def test_source_identity_bound_to_release(self):
        self.assertEqual(mod.NEW, "f50f814c065c329b6cb80f6aa45bb239b2528a0e")
        self.assertNotEqual(mod.OLD, mod.NEW)
        self.assertEqual(mod.CI_RUN, 41955993026)
        self.assertEqual(mod.ARTIFACT_ID, 13383851635)

    def test_no_public_or_custody_mutation_targets(self):
        text = SOURCE.read_text()
        self.assertIn("public_cutover_authorized", text)
        self.assertIn("financial_authorized", text)
        self.assertNotIn('atomic(PUBLIC,', text)
        self.assertNotIn('call_systemd("stop",', text)
        self.assertIn('need(pid != plan["old_pid"]', text)
        self.assertIn('status": "CONSUMED_NO_REPLAY"', text)


if __name__ == "__main__":
    unittest.main()
