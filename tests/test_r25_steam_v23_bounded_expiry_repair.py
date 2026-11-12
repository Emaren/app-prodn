"""Offline, exact-source Steam V23 expiry race repair: no financial mutation."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/release/r25_steam_refresh_current_product_v23.py"
spec = importlib.util.spec_from_file_location("steam_v23_bounded_expiry", SOURCE)
v23 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v23)

A, B, C, V6 = "23.12.156.233", "23.12.156.234", "23.12.156.235", "2600:1400::1"
SHAPE = "exact-protected-nft-shape"
BEFORE = {"protected": True}
PID = 1198601


class FakeNft:
    def __init__(self, *, protected=BEFORE, shape=SHAPE, commands=None, error=None):
        self.protected = protected
        self.shape = shape
        self.commands = commands
        self.error = error
        self.proposed = []
        self.runs = []

    def production_steam_union_commands(self, fresh, existing):
        self.proposed.append((tuple(fresh), {k: set(v) for k, v in existing.items()}))
        if self.commands is not None:
            return self.commands
        entries = []
        for ip in fresh:
            family = "steam6" if ":" in ip else "steam4"
            if ip not in existing[family]:
                entries.append(f"add element inet aoe2war_web_prod {family} {{ {ip} timeout 300s }}")
        return entries

    def production_protected(self):
        return self.protected

    def production_nft_shape(self):
        return self.shape

    def run(self, argv, *, data, maximum):
        self.runs.append((argv, data, maximum))
        if self.error:
            raise self.error


class FakeObserver:
    def __init__(self, *observations):
        self.remaining = list(observations)
        self.calls = 0

    def observe_strict_steam_set_with_bounded_retry(self, m):
        self.calls += 1
        return self.remaining.pop(0)


def state(*, v4=(), v6=()):
    return {"steam4": set(v4), "steam6": set(v6)}


def invoke(m, observer, validated, after, *, pid=PID):
    with mock.patch.object(v23, "validate_current_web", return_value=(pid, "exact-build")):
        return v23.recover_verified_lease_expiry_once(
            m, observer, validated, after, BEFORE, PID, SHAPE)


class BoundedSteamExpiry(TestCase):
    def test_no_missing_lease_is_read_only(self):
        observed = state(v4=[A])
        m, o = FakeNft(), FakeObserver()
        self.assertIs(invoke(m, o, [A], observed), observed)
        self.assertEqual(m.proposed, [])
        self.assertEqual(m.runs, [])
        self.assertEqual(o.calls, 0)

    def test_post_observation_expired_lease_readded_one_time(self):
        m, o = FakeNft(), FakeObserver(state(v4=[A, B]))
        result = invoke(m, o, [A, B], state(v4=[B]))
        self.assertEqual(result["steam4"], {A, B})
        self.assertEqual(m.proposed[0][0], (A,))
        self.assertEqual(len(m.runs), 1)
        argv, data, limit = m.runs[0]
        self.assertEqual(argv, ["/usr/sbin/nft", "-f", "-"])
        self.assertIn(A.encode(), data)
        self.assertNotIn(B.encode(), data)
        self.assertEqual(limit, 8192)
        self.assertEqual(o.calls, 1)

    def test_ipv4_and_ipv6_only_missing_verified(self):
        m, o = FakeNft(), FakeObserver(state(v4=[A], v6=[V6]))
        final = invoke(m, o, [V6, A], state())
        self.assertEqual(final["steam4"] | final["steam6"], {V6, A})
        self.assertEqual(m.proposed[0][0], (A, V6))
        self.assertEqual(len(m.runs), 1)
        self.assertEqual(m.runs[0][1].count(b"add element"), 2)

    def test_already_present_extra_ips_are_not_renewed(self):
        m, o = FakeNft(), FakeObserver(state(v4=[A, B, C]))
        invoke(m, o, [A, B], state(v4=[B, C]))
        self.assertEqual(m.proposed[0][0], (A,))
        self.assertNotIn(C.encode(), m.runs[0][1])

    def test_second_post_observation_missing_stays_hold(self):
        m, o = FakeNft(), FakeObserver(state())
        with self.assertRaisesRegex(RuntimeError, "STEAM_EGRESS_LEASE_NOT_INSTALLED_AFTER_BOUNDED_RETRY"):
            invoke(m, o, [A], state())
        self.assertEqual(len(m.runs), 1)
        self.assertEqual(o.calls, 1)

    def test_preserved_snapshot_change_blocks_nft(self):
        m, o = FakeNft(protected={"protected": False}), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_PROTECTED_BASELINE_CHANGED"):
            invoke(m, o, [A], state())
        self.assertEqual(m.runs, [])

    def test_nft_rule_shape_change_blocks_nft(self):
        m, o = FakeNft(shape="untrusted"), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_PROTECTED_BASELINE_CHANGED"):
            invoke(m, o, [A], state())
        self.assertEqual(m.runs, [])

    def test_changed_web_pid_blocks_nft(self):
        m, o = FakeNft(), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_WEB_IDENTITY_CHANGED"):
            invoke(m, o, [A], state(), pid=PID + 1)
        self.assertEqual(m.runs, [])

    def test_missing_empty_command_rejected(self):
        m, o = FakeNft(commands=[]), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_COMMAND_SCOPE"):
            invoke(m, o, [A], state())
        self.assertEqual(m.runs, [])

    def test_excessive_nft_commands_rejected(self):
        m, o = FakeNft(commands=["add element"] * 3), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_COMMAND_SCOPE"):
            invoke(m, o, [A], state())
        self.assertEqual(m.runs, [])

    def test_large_payload_rejected(self):
        m, o = FakeNft(commands=["x" * 8192]), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "STEAM_RETRY_COMMAND_SCOPE"):
            invoke(m, o, [A], state())
        self.assertEqual(m.runs, [])

    def test_actual_nft_failure_never_masked(self):
        m, o = FakeNft(error=RuntimeError("NFT_FAIL_CLOSED")), FakeObserver(state(v4=[A]))
        with self.assertRaisesRegex(RuntimeError, "^NFT_FAIL_CLOSED$"):
            invoke(m, o, [A], state())
        self.assertEqual(len(m.runs), 1)

    def test_source_retain_original_protected_boundaries(self):
        text = SOURCE.read_text()
        self.assertIn('original.get_caps_or_hold()', text)
        self.assertIn('v22.native_snapshot()', text)
        self.assertIn('m.production_protected() == before', text)
        self.assertIn('m.production_nft_shape() == v22.NFT_SHAPE', text)
        self.assertIn('v22.v22_timer_exclusive_lock(transaction)', text)
        self.assertIn('validate_current_web()', text)
        self.assertIn('m.production_steam_union_commands(missing, observed)', text)
        self.assertNotIn('flush set inet', text)
        self.assertNotIn('systemctl restart', text)
        self.assertNotIn('chmod 777', text)


if __name__ == "__main__":
    unittest.main()
