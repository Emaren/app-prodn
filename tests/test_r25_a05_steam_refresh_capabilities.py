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

    def test_steam_allowlist_remains_finite(self):
        self.assertIn('"STEAM_DNS_TLS_NO_VERIFIED_ADDRESS"', C)
        self.assertIn('"PRODUCTION_CURRENT_STEAM_SET_EMPTY"', C)
        self.assertIn("timeout 300s", C)
