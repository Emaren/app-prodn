"""Cross-runner signed Storage Atlas Node contract: preserve diagnostic output.

The general Node launcher aggregates 3000+ contracts and often hides the
individual stack trace. This independent Python contract guarantees that the
actual signed Go/OS-to-public Ed25519 protocol test ran and prints its error.
"""
from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class StorageAtlasSignedNodeContract(unittest.TestCase):
    def test_signed_three_drive_authentication_contract(self):
        p = subprocess.run(
            ["node", "--experimental-strip-types",
             "--experimental-loader", "./scripts/aoe2-alias-loader.mjs",
             "--test", "tests/storage-atlas-authenticated.test.mts"],
            cwd=ROOT, check=False, capture_output=True, text=True, timeout=45,
        )
        self.assertEqual(p.returncode, 0,
            "Signed Storage Atlas Node tests failed:\n" + p.stdout[-13000:] +
            "\nSTDERR:\n" + p.stderr[-5000:])

if __name__ == "__main__":
    unittest.main()
