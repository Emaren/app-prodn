"""Physical Steam DNS rotation/TTL witness contracts; no external network calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock


SOURCE = Path(__file__).resolve().parents[1] / "scripts/r25_c_start_root.py"
spec = importlib.util.spec_from_file_location("a05_steam_cdn_source", SOURCE)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class SteamCdnTtlTests(unittest.TestCase):
    def test_no_flush_and_keep_only_new_verified_destinations(self):
        original = {"steam4": {"23.12.156.233"}, "steam6": set()}
        fresh = ["23.12.156.233", "2.23.245.19", "95.100.176.225"]
        command = c.production_steam_union_commands(fresh, original)
        self.assertEqual(len(command), 1)
        self.assertIn("2.23.245.19 timeout 300s", command[0])
        self.assertIn("95.100.176.225 timeout 300s", command[0])
        self.assertNotIn("23.12.156.233 timeout", command[0])
        self.assertNotIn("flush", " ".join(command))
        self.assertEqual(original["steam4"], {"23.12.156.233"})

    def test_no_new_ip_does_not_extend_existing_ttl(self):
        self.assertEqual(
            c.production_steam_union_commands(["23.12.156.233"],
                                             {"steam4": {"23.12.156.233"}, "steam6": set()}),
            [])

    def test_no_wildcard_private_or_unbounded_set(self):
        old = {"steam4": {"23.12.156.233"}, "steam6": set()}
        for fresh in (["127.0.0.1"], ["0.0.0.0"], ["192.168.2.3"],
                      ["23.12.156.233", "23.12.156.233"]):
            with self.subTest(fresh=fresh), self.assertRaises(c.Hold):
                c.production_steam_union_commands(fresh, old)
        with self.assertRaisesRegex(c.Hold, "STEAM_SET_CAP_EXCEEDED"):
            c.production_steam_union_commands(
                ["95.100.176.225"],
                {"steam4": {"23.12.156.233"} | {
                    f"23.12.156.{i}" for i in range(15, 30)}, "steam6": set()})

    def test_actual_nft_entries_require_expiry_and_correct_family(self):
        nft = {"nftables": [
            {"set": {"name": "steam4", "elem": [
                {"elem": {"val": "23.12.156.233", "expires": 211}}]}},
            {"set": {"name": "steam6", "elem": None}},
        ]}
        with mock.patch.object(c, "run", return_value=c.canonical(nft)):
            self.assertEqual(c.production_live_steam_entries(),
                             {"steam4": {"23.12.156.233"}, "steam6": set()})
        nft["nftables"][0]["set"]["elem"][0]["elem"]["expires"] = 0
        with mock.patch.object(c, "run", return_value=c.canonical(nft)):
            with self.assertRaisesRegex(c.Hold, "STEAM_SET_UNBOUNDED_OR_EXPIRED"):
                c.production_live_steam_entries()
        nft["nftables"][0]["set"]["elem"][0]["elem"]["expires"] = 211
        nft["nftables"][0]["set"]["elem"][0]["elem"]["val"] = "10.1.2.3"
        with mock.patch.object(c, "run", return_value=c.canonical(nft)):
            with self.assertRaisesRegex(c.Hold, "STEAM_SET_ADDRESS_SCOPE_CHANGED"):
                c.production_live_steam_entries()

    def test_diverse_dns_never_admits_ip_without_verified_ca_sni(self):
        base = ["23.12.156.233"]
        calls = []
        def fake_dig(command, **kwargs):
            calls.append(command)
            if "@8.8.8.8" in command and "A" in command:
                return mock.Mock(returncode=0, stdout=b"2.23.245.19\nCNAME.invalid\n")
            if "@9.9.9.9" in command and "A" in command:
                return mock.Mock(returncode=0, stdout=b"95.100.176.225\n10.1.2.3\n")
            return mock.Mock(returncode=0, stdout=b"23.12.156.233\n")
        fake_socket = mock.MagicMock()
        fake_tls = mock.MagicMock()
        fake_tls.version.return_value = "TLSv1.3"
        fake_tls.__enter__.return_value = fake_tls
        with mock.patch.object(c.subprocess, "run", side_effect=fake_dig), \
             mock.patch.object(c.socket, "create_connection", return_value=fake_socket) as connected, \
             mock.patch.object(c.ssl, "create_default_context") as tlsctx:
            tlsctx.return_value.wrap_socket.return_value = fake_tls
            result = c.production_steam_dns_diversity(base)
        self.assertEqual(result, ["2.23.245.19", "23.12.156.233", "95.100.176.225"])
        self.assertEqual(connected.call_count, 2)
        self.assertEqual(len(calls), 6)
        self.assertEqual(tlsctx.return_value.wrap_socket.call_count, 2)
        for call in tlsctx.return_value.wrap_socket.call_args_list:
            self.assertEqual(call.kwargs["server_hostname"], "steamcommunity.com")

    def test_witness_accepts_tls_valid_approved_ip_when_dns_rotates(self):
        # Production C's proof asserts TLS and exact approved count, not a
        # coincidental one-shot DNS/allowlist intersection.
        nft = {"nftables": [{"set": {"name": "steam4", "elem": [
            {"elem": {"val": "23.12.156.233", "expires": 211}}]}},
            {"set": {"name": "steam6", "elem": []}}]}
        proof = {"current_uid_tls_sni_verified": True,
                 "active_dns_set_intersection": 0, "approved_tls_candidates": 1,
                 "http_post_sent": False, "completed_user_sign_in": False}
        def native(args, **kwargs):
            return c.canonical(nft if args[0] == "/usr/sbin/nft" else proof)
        with mock.patch.object(c, "run", side_effect=native):
            self.assertEqual(c.production_current_steam_tls()["active_dns_set_intersection"], 0)
        proof["current_uid_tls_sni_verified"] = False
        with mock.patch.object(c, "run", side_effect=native):
            with self.assertRaisesRegex(c.Hold, "PRODUCTION_CURRENT_STEAM_TLS_NOT_REACHABLE"):
                c.production_current_steam_tls()

    def test_source_cannot_modify_public_nginx_or_financial_services(self):
        source = SOURCE.read_text()
        a = source.index("def production_steam_union_commands(")
        b = source.index("def production_admission_steam_refresh():")
        scope = source[a:b]
        self.assertNotIn("systemctl", scope)
        self.assertNotIn("nginx", scope.lower())
        self.assertNotIn("8092", scope)
        self.assertNotIn("8093", scope)
        self.assertNotIn("flush set inet", scope)
        self.assertIn("production_protected() == before", scope)
        self.assertIn('production_nft_shape() == policy["nft_shape_sha256"]', scope)


    def test_refresh_keeps_previous_ttl_and_isolated_firewall(self):
        policy = {
            "schema": "aoe2war.app.approved-production-profile.v1",
            "profile": c.PROD_PROFILE,
            "controller_sha256": c.sha(b"dummy controller"),
            "nft_shape_sha256": "shape",
            "protected_snapshot_sha256": c.sha(c.canonical({"same": True})),
        }
        original = {"steam4": {"23.12.156.233"}, "steam6": set()}
        after = {"steam4": {"23.12.156.233", "2.23.245.19"}, "steam6": set()}
        updates = []
        def nft_command(argv, **kwargs):
            updates.append((argv, kwargs))
            return b""
        with mock.patch.object(c.sys, "platform", "linux"), \
             mock.patch.object(c.os, "geteuid", return_value=0), \
             mock.patch.object(c.socket, "gethostname", return_value="ubuntu-4gb-hel1-11"), \
             mock.patch.object(c, "root_file", side_effect=[
                 c.canonical(policy), b"dummy controller"]), \
             mock.patch.object(c.Path, "read_text",
                               return_value="CapEff:\t00000000000010c0\nNoNewPrivs:\t1\n"), \
             mock.patch.object(c, "production_nft_shape", return_value="shape"), \
             mock.patch.object(c, "production_protected", return_value={"same": True}), \
             mock.patch.object(c, "production_steam_addresses",
                               return_value=["23.12.156.233"]), \
             mock.patch.object(c, "production_steam_dns_diversity",
                               return_value=["23.12.156.233", "2.23.245.19"]), \
             mock.patch.object(c, "production_live_steam_entries",
                               side_effect=[original, after]), \
             mock.patch.object(c, "run", side_effect=nft_command):
            record = c.production_refresh()
        self.assertEqual(record["addresses"], 2)
        self.assertFalse(record["financial_authorized"])
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0][0], ["/usr/sbin/nft", "-f", "-"])
        batch = updates[0][1]["data"].decode()
        self.assertIn("2.23.245.19 timeout 300s", batch)
        self.assertNotIn("flush", batch)
        self.assertNotIn("8092", batch)
        self.assertNotIn("3030", batch)


if __name__ == "__main__":
    unittest.main()
