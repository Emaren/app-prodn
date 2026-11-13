"""Exact W1 adapter for already-live 9f7b V23; no runtime permission."""
import hashlib
import importlib.util
import inspect
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import unittest

ROOT = Path(__file__).resolve().parents[1] / "scripts/release"
CANDIDATE = ROOT / "r25_steam_w1_9f7b_current_v24.py"
ORIGINAL = ROOT / "r25_steam_refresh_current_product_v23.py"


def imported(path, label):
    spec = importlib.util.spec_from_file_location(label, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class SteamW1Admission(unittest.TestCase):
    def setUp(self):
        self.v24 = imported(CANDIDATE, "v24_b_9f7b")
        self.calls = []
        self.m = SimpleNamespace(original_protected="unchanged")
        self.original = SimpleNamespace(load_immutable_original=lambda: self.m)
        self.v22 = SimpleNamespace(
            FIN_SNAPSHOT="3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15",
            PRE_C01_FIN_SNAPSHOT="2dec2527fad7a53730a998898e26bc94b6d2c8c930db80aa7de1b44578a20f42",
            NFT_SHAPE="985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af",
            load_original=lambda: self.original)
        self.w1 = SimpleNamespace(
            RECEIPT_SHA256=self.v24.W1_RECEIPT_SHA,
            UNITS=tuple(sorted((
                "aoe2hdbets-bet-stake-reconcile.timer",
                "aoe2hdbets-bet-stake-reconcile.service",
                "aoe2hdbets-staking-rewards.timer",
                "aoe2hdbets-staking-rewards.service"))),
            attach_to_original_protected_chain=lambda m: self.calls.append(m))

    def load(self):
        def fake_spec(name, path):
            return SimpleNamespace(name=name, loader=SimpleNamespace(exec_module=lambda m: None))
        def fake_module(spec):
            if spec.name == "original_v22_exact_binary":
                return self.v22
            if spec.name == "accepted_w1_four_masks":
                return self.w1
            raise AssertionError("unexpected import: " + spec.name)
        with patch.object(self.v24.importlib.util, "spec_from_file_location", side_effect=fake_spec), \
             patch.object(self.v24.importlib.util, "module_from_spec", side_effect=fake_module), \
             patch.object(self.v24, "pinned_file", side_effect=lambda p, h, mode: self.calls.append((p, h, mode))):
            return self.v24.load_v22()

    def test_exact_source_and_preimage_pins(self):
        self.assertEqual(self.v24.W1_HELPER_SHA,
                         "97b93c24eee5ddd21bc909bb4d7babe3a9986daf93b41df0ee628501b1ad1e23")
        self.assertEqual(self.v24.W1_POST_C01_SHA,
                         "5fdaa394f3a193e056a9a2ec19473502ba250a6532f0c695c43ce804565126a2")
        self.assertEqual(self.v24.W1_PRE_C01_SHA,
                         "3ff109b85184593a6f2e4fe072273410c6c34a49b93c1258b56cb031afa8c496")
        self.assertEqual(self.v24.SOURCE, "9f7b56f536ba51b4678ac43baebfae140ada6479")
        self.assertEqual(self.v24.BUILD, "anGaZQRUjWiDs5PXhJ8cr")
        self.assertEqual(self.v24.BUILD_VERSION, "20261112224108-783d42e05c")
        self.assertEqual(self.v24.UNIT_SHA,
                         "fb68d4f9165208d13586815fa05d73ec0794dbfac072417fa377333b742f74b8")

    def test_only_existing_full_protected_loader_is_extended(self):
        v22 = self.load()
        self.assertEqual(v22.FIN_SNAPSHOT, self.v24.W1_POST_C01_SHA)
        self.assertEqual(v22.PRE_C01_FIN_SNAPSHOT, self.v24.W1_PRE_C01_SHA)
        self.assertEqual(v22.NFT_SHAPE,
                         "985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0],
                         (self.v24.W1_HELPER, self.v24.W1_HELPER_SHA, 0o644))
        loaded = v22.load_original().load_immutable_original()
        self.assertIs(loaded, self.m)
        self.assertIs(self.calls[-1], self.m)
        self.assertEqual(self.m.original_protected, "unchanged")

    def test_unrecognized_receipt_source_and_finance_pin_fail(self):
        self.w1.RECEIPT_SHA256 = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "UNREVIEWED_W1_QUARANTINE_SCOPE"):
            self.load()
        self.w1.RECEIPT_SHA256 = self.v24.W1_RECEIPT_SHA
        self.v22.FIN_SNAPSHOT = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_FIN_SNAPSHOT_DRIFT"):
            self.load()

    def test_existing_steam_nft_and_C03_logic_byte_equal_to_preimage(self):
        old = imported(ORIGINAL, "v23_original_logic")
        for name in ("read_protected_after_c03_observer_completion",
                     "recover_verified_lease_expiry_once",
                     "only_steam_refresh", "validate_current_web"):
            self.assertEqual(inspect.getsource(getattr(self.v24, name)),
                             inspect.getsource(getattr(old, name)), name)


if __name__ == "__main__":
    unittest.main()
