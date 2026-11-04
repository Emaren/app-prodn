"""Pure source-only R25 candidate refresh tests. Never contact HEL1/systemd."""
import importlib.util
import json
from pathlib import Path
from unittest import mock
import unittest

SOURCE=Path(__file__).resolve().parents[1]/"scripts/r25_c_contained_runtime_refresh_a9eb.py"
spec=importlib.util.spec_from_file_location("contained_runtime_refresh",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def unit_bytes():
    old=m.OLD_STAGE
    return ("\n".join((
        "[Service]",
        "User=aoe2war-web-prod",
        "Group=aoe2war-web-prod",
        "Restart=no",
        "NoNewPrivileges=yes",
        "ProtectSystem=strict",
        "CapabilityBoundingSet=",
        "Environment=WARGRAPH_RUNTIME_DISABLED=true AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1",
        "ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032",
        "WorkingDirectory="+old,
        "ReadOnlyPaths="+old,
        "BindPaths=/var/cache/aoe2war-web-prod:"+old+"/.next/cache",
        "BindReadOnlyPaths=/mnt/HC_Volume_105319120/aoe2-downloads:"+old+"/public/downloads",
        "",
    ))).encode()

def flight(chunk):
    return '<script>self.__next_f.push([1,'+json.dumps(chunk)+'])</script>'

class ContainedRefreshNextTests(unittest.TestCase):
    def test_nonpublic_exact_released_source_and_provenance(self):
        self.assertEqual(m.OLD, "dfee677881a501665c2eade0724c3757d5e4e59e")
        self.assertEqual(m.NEW, "a9eb6d6e32df3471d88ebbe3007b8c621d5e82a8")
        self.assertEqual(m.STAGE_RECEIPT_SHA, "c9e1cece317347183624bd7cccc3a8d9b42cd6cee4acbc484867e6464313223e")
        self.assertEqual(m.ARTIFACT_SHA, "0dddc87d4d424c10d97f947b4b464883ee7efe36d9c7add607fdf5759581ff1c")
        self.assertEqual(m.SCOPE, "REFRESH_EXISTING_NONFINANCIAL_3032_ONLY")

    def test_unit_retarget_preserves_security_and_exact_four_paths(self):
        old=unit_bytes()
        result=m.render_unit(old)
        self.assertEqual(result.count(m.NEW_STAGE.encode()),4)
        self.assertNotIn(m.OLD_STAGE.encode(),result)
        self.assertIn(b"NoNewPrivileges=yes",result)
        self.assertIn(b"WARGRAPH_RUNTIME_DISABLED=true",result)
        self.assertIn(b"port 3032",result)
        self.assertNotIn(b"3030",result)
        self.assertNotIn(b"8092",result)
        self.assertNotIn(b"8093",result)

    def test_changed_user_or_public_command_fails_closed(self):
        for mutation in (
            lambda b:b.replace(b"User=aoe2war-web-prod",b"User=root"),
            lambda b:b.replace(b"port 3032",b"port 3030"),
            lambda b:b.replace(b"NoNewPrivileges=yes",b"NoNewPrivileges=no"),
            lambda b:b.replace(m.OLD_STAGE.encode(),b"/var/www/AoE2HDBets/app-prodn"),
        ):
            with self.subTest(mutation=mutation):
                with self.assertRaises(m.Hold):
                    m.render_unit(mutation(unit_bytes()))

    def test_systemctl_command_whitelist_does_not_touch_old_web_or_wolo(self):
        for action, unit in (("start","aoe2hdbets-web.service"),
                             ("stop","wolochaind-mainnet.service"),
                             ("restart",m.UNIT.name), ("enable",m.TIMER)):
            with self.subTest(action=action, unit=unit), mock.patch.object(m.subprocess,"run") as run:
                with self.assertRaises(m.Hold):
                    m.candidate_systemd(action, unit)
                run.assert_not_called()
        with mock.patch.object(m.subprocess,"run") as run:
            run.return_value.returncode = 0
            m.candidate_systemd("start",m.UNIT.name)
            run.assert_called_once()

    def test_real_next_flight_error_does_not_look_like_healthy_html(self):
        good=flight('0:D{"name":"Players"}\n')+flight('1:["$","main",null,{}]\n')
        bad=good+flight('8:E{"digest":"3720221088"}\n')
        self.assertFalse(m.rsc_error(good))
        self.assertTrue(m.rsc_error(bad))
        split = good + flight('8:E{"dig') + flight('est":"3720221088"}\n')
        self.assertTrue(m.rsc_error(split))
        self.assertFalse(m.rsc_error(good+'forum quotes 8:E{"digest":"3720221088"}'))
        with self.assertRaises(m.Hold):m.rsc_error("<html>looked fine</html>")

    def test_uses_real_profile_snapshot_and_new_pid_admission(self):
        from tempfile import TemporaryDirectory
        c = mock.Mock()
        catalog = {"read_acl_sha256": "fixture"}
        c.production_wait.return_value = (177, 41)
        c.production_database_witness.return_value = catalog
        c.production_database_admission.return_value = {"db": True}
        c.production_kernel_probe.return_value = {"kernel": True}
        c.production_steam_probe.return_value = {"steam": True}
        c.production_witness.return_value = {"candidate_pid": 177}
        plan = {"old_pid": 12, "catalog": catalog, "protected_snapshot_sha256": "snapshot"}
        profile = {"stage": m.NEW_STAGE, "source_sha": m.NEW, "steam_addresses": ["fixture"],
                   "protected_snapshot_sha256": "snapshot"}
        with TemporaryDirectory() as directory, mock.patch.object(m, "write_atomic") as write, \
             mock.patch.object(m, "candidate_systemd"), mock.patch.object(m, "timer_active"), \
             mock.patch.object(m, "assert_protected") as protected:
            journal = Path(directory)
            proof = m.ready_profile(c, profile, journal, plan, {}, "fixture", "fixture")
            raw = (journal / "runtime-admission.json").read_bytes()
        self.assertEqual(proof["candidate_pid"], 177)
        self.assertEqual(json.loads(raw)["candidate_start_ticks"], 41)
        self.assertEqual(profile["admission_sha256"], m.sha(raw))
        self.assertEqual(profile["protected_snapshot_sha256"], "snapshot")
        self.assertEqual(write.call_args.args[0], m.POLICY)
        protected.assert_called_once_with(c, "snapshot")

    def test_guest_content_records_all_holds_without_claiming_full_pass(self):
        good = flight('1:["$","main",null,{}]\n').encode()
        failure = flight('1:E{"digest":"3720221088"}\n').encode()
        with mock.patch.object(m, "get", side_effect=lambda _, route: failure if route == "/players" else good):
            result = m.guest_probes()
        self.assertEqual(set(result), set(m.ROUTES))
        self.assertEqual(result["/players"]["status"], "RSC_ERROR")
        self.assertEqual(result["/rivalries"]["status"], "NO_RSC_ERROR")

    def test_canonical_source_pin_matches_catalog_controller(self):
        raw = (SOURCE.parent / "r25_c_start_root.py").read_bytes()
        self.assertEqual(len(raw), m.NEW_CONTROLLER_SIZE)
        self.assertEqual(m.sha(raw), m.NEW_CONTROLLER_SHA)

if __name__=="__main__":unittest.main()
