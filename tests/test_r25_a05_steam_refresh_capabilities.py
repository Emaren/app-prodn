import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
C = (ROOT / "scripts/r25_c_start_root.py").read_text()
G = (ROOT / "scripts/aoe2_r25_f_g_parallel_observer.py").read_text()


class SteamRefreshCapabilityTests(unittest.TestCase):
    def test_exact_required_capabilities(self):
        self.assertIn(
            "CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID",
            C
        )
        self.assertIn(
            '{"cap_net_admin", "cap_setuid", "cap_setgid"}',
            C
        )

    def test_existing_sandbox_remains(self):
        for guard in (
            "NoNewPrivileges=yes",
            "ProtectHome=yes",
            "PrivateTmp=yes",
            "ProtectSystem=strict",
            "RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX",
        ):
            self.assertIn(guard, C)

    def test_readiness_observer_exactly_allowlisted(self):
        self.assertIn(
            '"aoe2war-release-readiness-observer.service":'
            '"aoe2war-release-readiness-observer.timer"',
            G
        )

    def test_steam_dns_uses_exact_pam_free_confined_identity(self):
        import importlib.util
        import json
        from unittest import mock
        source = ROOT / "scripts/r25_c_start_root.py"
        spec = importlib.util.spec_from_file_location("a05_setpriv_source", source)
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        root_dns = [(None,None,None,None,("23.12.156.233",443))]
        uid_dns = json.dumps(["95.100.176.225"]).encode()
        socket_tls = mock.MagicMock()
        tls = mock.MagicMock()
        tls.version.return_value = "TLSv1.3"
        socket_tls.__enter__.return_value = mock.MagicMock()
        tls.__enter__.return_value = tls
        with mock.patch.object(c.socket, "getaddrinfo", return_value=root_dns), \
             mock.patch.object(c, "run", return_value=uid_dns) as call, \
             mock.patch.object(c.socket, "create_connection", return_value=socket_tls), \
             mock.patch.object(c.ssl, "create_default_context") as ssl_context:
            ssl_context.return_value.wrap_socket.return_value = tls
            self.assertEqual(c.production_steam_addresses(),
                             ["23.12.156.233","95.100.176.225"])
        self.assertEqual(call.call_count, 2)
        for entry in call.call_args_list:
            argv = entry.args[0]
            self.assertEqual(argv[:8], [
                "/usr/bin/setpriv", "--reuid", "990",
                "--regid", "984", "--clear-groups", "--no-new-privs", "--"
            ])
            self.assertEqual(argv[8:12], ["/usr/bin/python3", "-I", "-B", "-c"])
            self.assertIn("os.getgroups() == []", argv[12])
        self.assertEqual(ssl_context.return_value.wrap_socket.call_count, 2)

    def test_second_owner_maintenance_pins_failed_transaction_and_unique_journal(self):
        code = (ROOT / "scripts/r25_a05_steam_setpriv_maintenance.py").read_text()
        self.assertIn("FAILED_ENTERED_SHA = '0f700797e3482abd0d6639a193ab45d4d0788d333b5dd041ea5b7942d100d4a6'", code)
        self.assertIn("FAILED_HOLD_SHA = '414741a61bba6abf2f5b31124ebf641ef5a7ad27da7956e876a36f325833f618'", code)
        self.assertIn("HOLD_ORIGINAL_FILES_RESTORED", code)
        self.assertIn("'ONE_USE_REPAIR_JOURNAL_ALREADY_PRESENT'", code)
        self.assertIn("steam-setpriv-repair-20261104-f527a379", code)
        self.assertIn("PASS_STEAM_REFRESH_SERVICE_AND_NATIVE_C_WITNESS", code)
        self.assertIn("f527a3798fc2752fd8925629f4ed1428b2df638cd673e929ae504fbf5bed98f4", code)
        for forbidden in ('"/usr/bin/systemctl", "stop", "aoe2hdbets-web.service"',
                          '"systemctl", "restart", "aoe2hdbets-web-prod.service"',
                          'nft flush ruleset', 'ALTER ROLE', 'NGINX.write_bytes'):
            self.assertNotIn(forbidden, code)

    def test_only_failed_confined_dns_retries_and_remains_tls_validated(self):
        import importlib.util
        import json
        from unittest import mock
        spec = importlib.util.spec_from_file_location(
            "a05_bounded_dns_retry", ROOT / "scripts/r25_c_start_root.py")
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        root_dns = [(None,None,None,None,("23.12.156.233",443))]
        uid_dns = json.dumps(["95.100.176.225"]).encode()
        child = mock.Mock(returncode=0,stdout=uid_dns,stderr=b"")
        raw = mock.MagicMock()
        tls = mock.MagicMock()
        tls.version.return_value = "TLSv1.3"
        tls.__enter__.return_value = tls
        with mock.patch.object(c.socket, "getaddrinfo", return_value=root_dns), \
             mock.patch.object(c, "run", side_effect=[
                 c.Hold("NATIVE_COMMAND_FAILED:setpriv"), uid_dns]) as old, \
             mock.patch.object(c.subprocess, "run", return_value=child) as extra, \
             mock.patch.object(c.socket, "create_connection", return_value=raw), \
             mock.patch.object(c.ssl,"create_default_context") as tlsctx:
            tlsctx.return_value.wrap_socket.return_value = tls
            result = c.production_steam_addresses()
        self.assertEqual(result, ["23.12.156.233", "95.100.176.225"])
        self.assertEqual(old.call_count,2)
        extra.assert_called_once()
        self.assertEqual(tlsctx.return_value.wrap_socket.call_count,2)

    def test_persistent_failed_confined_dns_reports_child_reason(self):
        import importlib.util
        from unittest import mock
        spec = importlib.util.spec_from_file_location(
            "a05_bounded_dns_failure", ROOT / "scripts/r25_c_start_root.py")
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        child = mock.Mock(returncode=1,stdout=b"",stderr=b"socket.gaierror: Temporary failure in name resolution\n")
        with mock.patch.object(c.socket,"getaddrinfo", return_value=[(None,None,None,None,("23.12.156.233",443))]), \
             mock.patch.object(c, "run", side_effect=c.Hold("NATIVE_COMMAND_FAILED:setpriv")), \
             mock.patch.object(c.subprocess, "run", return_value=child) as extra, \
             mock.patch.object(c.time, "sleep"):
            with self.assertRaisesRegex(c.Hold,
                "STEAM_UID_DNS_CHILD_FAILED_AFTER_3_ATTEMPTS:1:socket.gaierror: Temporary failure"):
                c.production_steam_addresses()
            self.assertEqual(extra.call_count,2)

    def test_unrelated_hold_is_not_retried(self):
        import importlib.util
        from unittest import mock
        spec = importlib.util.spec_from_file_location(
            "a05_bounded_dns_unknown_hold", ROOT / "scripts/r25_c_start_root.py")
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        with mock.patch.object(c.socket, "getaddrinfo", return_value=[(None,None,None,None,("23.12.156.233",443))]), \
             mock.patch.object(c, "run", side_effect=c.Hold("AUTHORITY_CHANGED")), \
             mock.patch.object(c.subprocess, "run") as extra:
            with self.assertRaisesRegex(c.Hold,"AUTHORITY_CHANGED"):
                c.production_steam_addresses()
            extra.assert_not_called()

    def test_third_maintenance_requalifies_both_consumed_owner_failures(self):
        source = (ROOT / "scripts/r25_a05_steam_dns_retry_maintenance.py").read_text()
        for pin in (
            "0f700797e3482abd0d6639a193ab45d4d0788d333b5dd041ea5b7942d100d4a6",
            "5ea5f31800bfa138fe16830147cd4f5c0b946ea3701fe22d11551d1fd8ff3ae4",
            "414741a61bba6abf2f5b31124ebf641ef5a7ad27da7956e876a36f325833f618",
            "93bcfe36b1baefadfec3513a803d9f1afeaf31500df4c0ada6b6eb7c2e74f4cb",
            "steam-dns-retry-repair-20261104-93bcfe36",
        ):
            self.assertIn(pin,source)
        self.assertIn("requalify_first_failed_maintenance()",source)
        self.assertIn("requalify_second_failed_maintenance()",source)
        self.assertIn("PASS_STEAM_REFRESH_SERVICE_AND_NATIVE_C_WITNESS",source)
        self.assertIn("PRODUCTION_REFRESH_PROTECTED_DRIFT",
                      (ROOT / "scripts/r25_c_start_root.py").read_text())

    def test_effective_capabilities_verified_not_just_bounding_set(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "a05_effective_caps", ROOT / "scripts/r25_c_start_root.py")
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        service, timer = c.production_refresh_units()
        self.assertNotIn(b"\nUser=root\n",service)
        self.assertIn(b"\nType=oneshot\nExecStart=/usr/bin/python3",service)
        self.assertIn(b"CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID",service)
        self.assertIn(b"NoNewPrivileges=yes",service)
        self.assertIn(b"ProtectSystem=strict",service)
        source=(ROOT / "scripts/r25_c_start_root.py").read_text()
        self.assertIn('value.get("User") == "" and value.get("Group") == ""',source)
        self.assertIn('value.get("DynamicUser") == "no"',source)
        self.assertIn("PRODUCTION_REFRESH_EFFECTIVE_CAPABILITIES_MISSING",source)
        self.assertIn('Path("/proc/self/status").read_text()',source)
        self.assertIn('((1 << 12) | (1 << 7) | (1 << 6))',source)
        self.assertEqual(len(timer),143)

    def test_fourth_repair_requires_all_three_restored_owner_journals(self):
        code=(ROOT / "scripts/r25_a05_steam_systemd_root_maintenance.py").read_text()
        for sha in (
            "0f700797e3482abd0d6639a193ab45d4d0788d333b5dd041ea5b7942d100d4a6",
            "5ea5f31800bfa138fe16830147cd4f5c0b946ea3701fe22d11551d1fd8ff3ae4",
            "3647144109e0197e7755c7737bd6edd60802cb5123ab7ac41d28249af6c9b2f7",
            "414741a61bba6abf2f5b31124ebf641ef5a7ad27da7956e876a36f325833f618",
            "9dfa2e68999948c997238196d37737b93e7ca06eb3dbafd1ea29085cc73076f2",
        ):
            self.assertIn(sha,code)
        self.assertIn("requalify_third_failed_maintenance()",code)
        self.assertIn("steam-systemd-root-repair-20261104-9dfa2e68",code)
        self.assertIn("ONE_USE_REPAIR_JOURNAL_ALREADY_PRESENT",code)
        self.assertIn("PASS_STEAM_REFRESH_SERVICE_AND_NATIVE_C_WITNESS",code)
        self.assertIn("REVIEWED_SERVICE_SHAPE_MISMATCH",code)

    def test_persisted_candidate_heap_memory_bound_has_exact_source(self):
        import hashlib
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "a05_persisted_memory", ROOT / "scripts/r25_a05_steam_systemd_root_maintenance.py")
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        source = ROOT / "ops/systemd/aoe2hdbets-web-prod-memory-2400M.conf"
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), m.PERSISTENT_MEMORY_SHA)
        self.assertEqual(m.EXPECTED_MEMORY_MAX, "2516582400")
        self.assertEqual(m.CANDIDATE_PID, 3377112)
        self.assertEqual(m.PREVIOUS_CANDIDATE_PID, 3248760)

    def test_recovered_candidate_requires_fresh_native_admission(self):
        import importlib.util
        import json
        import tempfile
        from pathlib import Path
        from unittest import mock
        spec = importlib.util.spec_from_file_location(
            "a05_recovered_admission", ROOT / "scripts/r25_a05_steam_systemd_root_maintenance.py")
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        old_catalog = {"read_acl_sha256": "a" * 64,
                       "definer_identity_sha256": "b" * 64,
                       "public_read_model": {"health": True}}
        historical = {"status": "NATIVE_PRODUCTION_ADMISSION_PASS",
                      "source_sha": "source-sha",
                      "candidate_pid": m.PREVIOUS_CANDIDATE_PID,
                      "catalog": old_catalog}
        candidate = {"source_sha": "source-sha", "stage": "/tmp/candidate",
                     "refresh_units": {}, "steam_addresses": ["old"],
                     "journal_path": "/prior"}
        live = mock.Mock()
        live.production_wait.return_value = (m.CANDIDATE_PID, 123456)
        live.production_runtime_environment.return_value = ({}, "readonly-db", "redacted")
        live.production_database_witness.return_value = old_catalog
        live.production_admission_steam_refresh.return_value = ["23.12.156.233"]
        live.production_database_admission.return_value = {"real_db_admission": True}
        live.production_kernel_probe.return_value = {"real_kernel_probe": True}
        live.production_steam_probe.return_value = {"real_steam_probe": True}
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / "new-journal"
            journal.mkdir()
            profile = Path(folder) / "approved-profile.json"
            profile.write_bytes(m.json_bytes(candidate))
            with mock.patch.object(m, "JOURNAL", journal), \
                 mock.patch.object(m, "PROFILE", profile), \
                 mock.patch.object(m, "check_file", return_value=m.json_bytes(historical)):
                answer = m.requalify_current_candidate(live, {
                    "journal_path": "/prior", "admission_sha256": "0" * 64})
                sealed = json.loads((journal / "runtime-admission.json").read_bytes())
                self.assertEqual(sealed["candidate_pid"], m.CANDIDATE_PID)
                self.assertEqual(sealed["candidate_start_ticks"], 123456)
                self.assertFalse(sealed["financial_authorized"])
                self.assertFalse(sealed["public_cutover_authorized"])
                self.assertEqual(answer["journal_path"], str(journal))
                self.assertEqual(answer["admission_sha256"],
                                 m.sha((journal / "runtime-admission.json").read_bytes()))
                self.assertEqual(json.loads(profile.read_bytes()), answer)
                self.assertEqual(answer["steam_addresses"], ["23.12.156.233"])
                live.production_database_admission.assert_called_once()
                live.production_steam_probe.assert_called_once()

    def test_recovered_candidate_refuses_catalog_drift_without_writing_receipt(self):
        import importlib.util
        import json
        import tempfile
        from pathlib import Path
        from unittest import mock
        spec = importlib.util.spec_from_file_location(
            "a05_recovered_catalog_drift", ROOT / "scripts/r25_a05_steam_systemd_root_maintenance.py")
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        historical = {"candidate_pid": m.PREVIOUS_CANDIDATE_PID,
                      "source_sha": "source-sha",
                      "catalog": {"read_acl_sha256": "before",
                                  "definer_identity_sha256": "stable",
                                  "public_read_model": True}}
        live = mock.Mock()
        live.production_wait.return_value = (m.CANDIDATE_PID, 123456)
        live.production_runtime_environment.return_value = ({}, "db", "password")
        live.production_database_witness.return_value = {
            "read_acl_sha256": "changed", "definer_identity_sha256": "stable",
            "public_read_model": True}
        with tempfile.TemporaryDirectory() as folder:
            journal = Path(folder) / "new-journal"
            journal.mkdir()
            profile = Path(folder) / "approved-profile.json"
            profile.write_bytes(m.json_bytes({"source_sha": "source-sha", "stage": folder}))
            with mock.patch.object(m, "JOURNAL", journal), \
                 mock.patch.object(m, "PROFILE", profile), \
                 mock.patch.object(m, "check_file", return_value=m.json_bytes(historical)):
                with self.assertRaisesRegex(RuntimeError, "CURRENT_READONLY_DB_CATALOG_DRIFT"):
                    m.requalify_current_candidate(live, {
                        "journal_path": "/prior", "admission_sha256": "0" * 64})
                self.assertFalse((journal / "runtime-admission.json").exists())
                live.production_database_admission.assert_not_called()

    def test_steam_allowlist_remains_finite(self):
        self.assertIn('"STEAM_DNS_TLS_NO_VERIFIED_ADDRESS"', C)
        self.assertIn('"PRODUCTION_CURRENT_STEAM_SET_EMPTY"', C)
        self.assertIn("timeout 300s", C)
