"""Tests for the exact original WOLO daemon tile's safe public event projection."""
import importlib.util
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts" / "wolo_public_daemon_feed_v1.py"
spec = importlib.util.spec_from_file_location("wolo_public_daemon_feed_v1", MODULE)
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)

ESC = "\x1b"
def genuine(event, fields, time="5:36PM"):
    return (f"{ESC}[90m{time}{ESC}[0m {ESC}[32mINF{ESC}[0m "
            f"{ESC}[1m{event}{ESC}[0m " +
            " ".join(f"{ESC}[36m{k}={ESC}[0m{v}" for k, v in fields))

def plain(line):
    return re.sub(r"\x1b\[[0-9;]*m", "", line)

class TestPublicDaemonProjection(unittest.TestCase):
    def test_original_real_consensus_lines_preserve_text_and_color(self):
        samples = [
            ("received complete proposal block", [("hash", "ABCD" * 16), ("height", "3085439"), ("module", "consensus")]),
            ("finalizing commit of block", [("hash", "ABCD" * 16), ("height", "3085439"), ("module", "consensus"), ("num_txs", "0"), ("root", "EF9E" * 16)]),
            ("finalized block", [("block_app_hash", "1702" * 16), ("height", "3085439"), ("module", "state"), ("num_txs_res", "0"), ("num_val_updates", "0")]),
            ("executed block", [("app_hash", "1702" * 16), ("height", "3085439"), ("module", "state")]),
            ("committed state", [("block_app_hash", "EF9E" * 16), ("height", "3085439"), ("module", "state")]),
            ("indexed block events", [("height", "3085439"), ("module", "txindex")]),
        ]
        for event, fields in samples:
            with self.subTest(event=event):
                original = genuine(event, fields)
                admitted = feed.admit(original)
                self.assertEqual(admitted, original)
                self.assertEqual(plain(admitted), plain(original))
                self.assertIn(f"{ESC}[32mINF", admitted)
                self.assertIn(f"{ESC}[36mmodule=", admitted)

    def test_denies_unreviewed_or_private_lines(self):
        denied = [
            "5:36PM INF wallet password=secret height=3085439 module=state",
            "5:36PM INF committed state height=3085439 module=state token=abc",
            "5:36PM INF committed state height=3085439 module=state secret=abc",
            "5:36PM INF committed state height=0 module=state",
            "5:36PM INF committed state height=3085439 module=consensus",
            "5:36PM INF committed state height=3085439 module=state height=3085439",
            "5:36PM INF committed state height=notint module=state",
            "5:36PM INF committed state height=3085439 module=state extra=<script>",
            "5:36PM INF received proposal height=3085439 module=consensus",
            "5:36PM INF committed state height=3085439 module=state\ninjected",
            "5:36PM INF committed state height=3085439 module=state\x1b]0;bad",
            "5:36PM INF committed state height=3085439 module=state private_key=abc",
        ]
        for line in denied:
            with self.subTest(line=repr(line)):
                self.assertIsNone(feed.admit(line))

    def test_projection_bounded_to_last_40_real_allowed_lines(self):
        raw = "\n".join(
            genuine("indexed block events", [("height", str(3085439 + i)), ("module", "txindex")])
            for i in range(50)
        )
        packet = feed.project(raw)
        self.assertTrue(packet["ok"])
        self.assertEqual(packet["schema"], feed.SCHEMA)
        self.assertEqual(packet["source"], "wolochaind-mainnet.service")
        self.assertEqual(len(packet["lines"]), 40)
        self.assertIn("3085449", packet["lines"][-40])
        self.assertIn("3085488", packet["lines"][-1])

    def test_only_denied_events_do_not_manufacture_live_ok(self):
        packet = feed.project("keychain-password=private\n[daemon] fake block")
        self.assertFalse(packet["ok"])
        self.assertEqual(packet["lines"], [])

    def test_fixed_custody_contract(self):
        source = MODULE.read_text()
        self.assertIn('UNIT = "wolochaind-mainnet.service"', source)
        self.assertIn('/var/lib/aoe2war-wolo-public-daemon-v1', source)
        self.assertNotIn("shell=True", source)
        self.assertIn("os.geteuid() != 0", source)
        self.assertIn("O_NOFOLLOW", source)

if __name__ == "__main__":
    unittest.main()
