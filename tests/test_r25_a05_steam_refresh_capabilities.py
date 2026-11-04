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

    def test_steam_allowlist_remains_finite(self):
        self.assertIn('"STEAM_DNS_TLS_NO_VERIFIED_ADDRESS"', C)
        self.assertIn('"PRODUCTION_CURRENT_STEAM_SET_EMPTY"', C)
        self.assertIn("timeout 300s", C)
