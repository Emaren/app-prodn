"""V22 lock-only systemd confinement repair — source-only, NEVER host admission."""
from __future__ import annotations
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
DROP = ROOT / "scripts/release/r25_steam_refresh_two_web_builds_v22-lock-only.conf"
UNIT = ROOT / "scripts/release/r25_steam_refresh_two_web_builds_v22.service"
SRC = ROOT / "scripts/release/r25_steam_refresh_two_web_builds_v22.py"
CUTOVER = ROOT / "scripts/release/r25_public_player_one_use_cutover_v1.py"
LOCK = "/etc/aoe2war/web-prod-v22/steam-refresh-v22.lock"
EXPECTED = "[Service]\nReadWritePaths=" + LOCK + "\n"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def is_exact_single_lock_exception(raw: str) -> bool:
    """Reject blanket /etc writes, capabilities, address or sandbox changes."""
    if raw != EXPECTED:
        return False
    lines = raw.splitlines()
    return lines == ["[Service]", "ReadWritePaths=" + LOCK] and len(lines) == 2

class LockOnlyConfinement(unittest.TestCase):
    def test_exact_one_file_scoped_exception(self):
        self.assertTrue(is_exact_single_lock_exception(DROP.read_text()))
        self.assertEqual(DROP.read_bytes(), EXPECTED.encode())
        self.assertEqual(DROP.read_text().count("ReadWritePaths="), 1)
    def test_original_source_and_base_unit_remain_exact_sha(self):
        self.assertEqual(sha(UNIT), "44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a")
        self.assertEqual(sha(SRC), "c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc")
        self.assertIn("STEAM_V22_UNIT_SHA256 = '44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a'", SRC.read_text())
    def test_service_security_sandbox_not_replaced(self):
        text = UNIT.read_text()
        self.assertEqual(text.count("ProtectSystem=strict"), 1)
        self.assertEqual(text.count("NoNewPrivileges=yes"), 1)
        self.assertEqual(text.count("PrivateTmp=yes"), 1)
        self.assertEqual(text.count("ProtectHome=yes"), 1)
        self.assertEqual(text.count("CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID"), 1)
        self.assertEqual(text.count("RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX"), 1)
        self.assertNotIn("ReadWritePaths=", text)
        self.assertNotIn("ProtectSystem=", DROP.read_text())
        self.assertNotIn("ExecStart=", DROP.read_text())
    def test_exact_existing_root_lock_used_by_v22(self):
        source = SRC.read_text()
        self.assertIn("LOCK = ROOT/'steam-refresh-v22.lock'", source)
        self.assertIn("fd=os.open(LOCK,os.O_RDWR|os.O_CLOEXEC|os.O_NOFOLLOW)", source)
        self.assertIn("stat.S_IMODE(LOCK.stat().st_mode)==0o600", source)
    def test_previous_immutable_player_controller_does_not_change(self):
        source = CUTOVER.read_text()
        self.assertIn('V22_TIMER_UNIT_SHA="44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"', source)
        self.assertNotIn("ReadWritePaths=", source)
    def test_broad_and_changed_dropins_are_rejected(self):
        for candidate in (
            "[Service]\nReadWritePaths=/etc\n",
            "[Service]\nReadWritePaths=/etc/aoe2war\n",
            "[Service]\nReadWritePaths=/etc/aoe2war/web-prod-v22\n",
            "[Service]\nReadWritePaths=/etc/systemd/system\n",
            "[Service]\nReadWritePaths=/root\n",
            "[Service]\nReadWritePaths=/var/lib\n",
            "[Service]\nReadWritePaths=/tmp\n",
            EXPECTED + "ReadWritePaths=/etc\n",
            EXPECTED + "ProtectSystem=off\n",
            EXPECTED + "CapabilityBoundingSet=\n",
            EXPECTED + "ExecStart=/bin/true\n",
            EXPECTED + "Environment=EXEMPT=1\n",
            EXPECTED.replace(".lock", ""),
            EXPECTED.replace("ReadWritePaths=", "ReadOnlyPaths="),
            EXPECTED.replace("/etc/aoe2war/", "/var/"),
            EXPECTED.replace("[Service]", "[Unit]"),
            EXPECTED + "\n",
            "",
        ):
            with self.subTest(candidate=candidate):
                self.assertFalse(is_exact_single_lock_exception(candidate))

if __name__ == "__main__":
    unittest.main()
