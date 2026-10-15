from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_update_hold.py"
SPEC = importlib.util.spec_from_file_location("aoe2_update_hold", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

HEAD = "a" * 40
REVIEWED = "3" * 40
DEPLOYED = "7" * 40
NOW = datetime(2026, 10, 15, 18, 0, tzinfo=timezone.utc)


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW


def audit_payload():
    return {
        "p0": 0, "p1": 10,
        "findings": [
            {"severity": "P1", "area": "WoloChain", "key": "vps-source-drift",
             "detail": f"VPS={DEPLOYED} implementation_baseline={REVIEWED}"},
            *[{"severity": "P1", "area": "Documentation", "key": "central-source-snapshot-stale", "detail": str(i)}
              for i in range(4)],
            *[{"severity": "P1", "area": "Context Durability", "key": "archive-stale", "detail": str(i)}
              for i in range(5)],
        ],
        "info": {"wolo_vps": {"head": DEPLOYED, "expected_implementation_baseline": REVIEWED}},
    }


def runtime_observation():
    services = {}
    for index, (key, unit) in enumerate(MODULE.UNITS.items(), 1):
        consensus = key == "consensus"
        services[key] = {
            "unit": unit, "active": "active", "pid": index * 100,
            "restarts": 0, "started_monotonic": str(index * 1000),
            "executable": "/usr/local/bin/wolochaind-mainnet" + ("-node-prewartrophy" if consensus else ""),
            "sha256": ("b" if consensus else "c") * 64,
            "revision": "d" * 40 if consensus else DEPLOYED, "modified": consensus,
        }
    return {
        "observed_at": NOW.isoformat(),
        "boot_id": "01234567-89ab-cdef-0123-456789abcdef",
        "source": {"root": MODULE.WOLO_VPS_REPO, "branch": MODULE.WOLO_BRANCH,
                   "head": DEPLOYED, "origin": "https://github.com/Emaren/wolochain.git", "dirty": False},
        "services": services,
        "listeners": {"8092": [{"address": "127.0.0.1:8092", "pids": [200]}],
                      "8093": [{"address": "127.0.0.1:8093", "pids": [300]}]},
    }


class HoldProofTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = pathlib.Path(self.temp.name).resolve()
        (self.repo / "docs").mkdir()
        (self.repo / "scripts").mkdir()
        (self.repo / "scripts/docs_v2_check.py").write_text("# canonical checker\n")
        self.registry = self.repo / "docs/document-registry.json"
        self.registry.write_text(json.dumps({"repo": "wolochain", "implementation_baseline":
                                            {"branch": MODULE.WOLO_BRANCH, "commit": REVIEWED}}))
        self.runtime = runtime_observation()
        self.payload = audit_payload()
        self.commands = []
        self.overrides = {}
        self.head_reads = 0
        self.change_after_observation = False
        self.clock = mock.patch.object(MODULE, "datetime", FrozenDatetime)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def fake_run(self, args, *, cwd, timeout):
        self.commands.append(args)
        key = tuple(args)
        if key in self.overrides:
            return self.overrides[key]
        if args[0] == "ssh":
            return getattr(self, "ssh_result", (0, json.dumps(self.runtime)))
        if args[0] == "python3":
            return 0, "PASS: source metadata, review and registry hashes"
        if args[0] != "git":
            self.fail(f"unexpected command: {args}")
        if args[1:] == ["rev-parse", "--show-toplevel"]:
            return 0, str(self.repo)
        if args[1:] == ["branch", "--show-current"]:
            return 0, MODULE.WOLO_BRANCH
        if args[1:] == ["rev-parse", "HEAD"]:
            self.head_reads += 1
            return 0, ("f" * 40 if self.change_after_observation and self.head_reads > 1 else HEAD)
        if args[1] == "status":
            return 0, ""
        if args[1:4] == ["remote", "get-url", "origin"]:
            return 0, "https://github.com/Emaren/wolochain.git"
        if args[1] == "ls-remote":
            value = "f" * 40 if self.change_after_observation and self.head_reads > 1 else HEAD
            return 0, value + "\trefs/heads/" + MODULE.WOLO_BRANCH
        if args[1:3] == ["merge-base", "--is-ancestor"]:
            return 0, ""
        self.fail(f"unexpected command: {args}")

    def collect(self):
        return MODULE.collect_wolo_hold(self.payload, wolo_repo=self.repo, run=self.fake_run)

    def test_exact_october_15_ten_findings_remain_unmodified(self):
        original = copy.deepcopy(self.payload)
        proof = self.collect()
        self.assertEqual(self.payload, original)
        self.assertEqual(proof["status"], "UNRESOLVED")
        self.assertEqual(proof["reviewed_baseline"], REVIEWED)
        self.assertEqual(proof["vps_source"], DEPLOYED)
        self.assertFalse(proof["wolo_mutated"])
        self.assertEqual(self.payload["p1"], 10)
        self.assertEqual(proof["source"]["head"], HEAD)
        self.assertEqual(len(proof["source"]["registry_sha256"]), 64)
        ssh = [args for args in self.commands if args[0] == "ssh"]
        self.assertEqual(len(ssh), 1)
        self.assertIn("root@hel1", ssh[0])

    def test_unavailable_evidence_fails_without_exposing_diagnostics(self):
        with mock.patch.object(MODULE, "_local_source", return_value={"reviewed_baseline": REVIEWED}):
            with mock.patch.object(MODULE, "_checked", side_effect=MODULE.HoldError("unavailable")):
                with self.assertRaises(MODULE.HoldError):
                    self.collect()
        self.overrides[("python3", str(self.repo / "scripts/docs_v2_check.py"))] = (1, "SECRET")
        with self.assertRaises(MODULE.HoldError) as caught:
            self.collect()
        self.assertNotIn("SECRET", str(caught.exception))

    def test_ssh_failure_and_malformed_missing_runtime_proof_fail(self):
        for result in ((255, "private diagnostic"), (0, "not json"), (0, "[]"), (0, "{}")):
            self.ssh_result = result
            with self.subTest(result=result):
                with self.assertRaises(MODULE.HoldError) as caught:
                    self.collect()
                self.assertNotIn("private diagnostic", str(caught.exception))

    def test_rejects_dirty_diverged_wrong_branch_or_origin_source(self):
        cases = [
            (("git", "status", "--porcelain=v1", "--untracked-files=all"), "?? private.txt"),
            (("git", "branch", "--show-current"), "unreviewed"),
            (("git", "remote", "get-url", "origin"), "https://example.com/clone.git"),
            (("git", "ls-remote", "--exit-code", "origin", "refs/heads/" + MODULE.WOLO_BRANCH),
             "f" * 40 + "\trefs/heads/" + MODULE.WOLO_BRANCH),
        ]
        for command, value in cases:
            with self.subTest(command=command):
                self.overrides = {command: (0, value)}
                with self.assertRaises(MODULE.HoldError):
                    self.collect()

    def test_historical_implementation_branch_is_preserved(self):
        registry = json.loads(self.registry.read_text())
        registry["implementation_baseline"]["branch"] = "forensics/reviewed-before-merge"
        self.registry.write_text(json.dumps(registry))
        proof = self.collect()
        self.assertEqual(proof["source"]["branch"], MODULE.WOLO_BRANCH)
        self.assertEqual(proof["source"]["reviewed_baseline_branch"], "forensics/reviewed-before-merge")
        self.assertTrue(proof["runtime"]["services"]["consensus"]["modified"])

    def test_stale_central_baseline_is_bound_and_must_be_an_ancestor(self):
        stale = "2" * 40
        self.payload["info"]["wolo_vps"]["expected_implementation_baseline"] = stale
        self.payload["findings"][0]["detail"] = f"VPS={DEPLOYED} implementation_baseline={stale}"
        proof = self.collect()
        self.assertEqual(proof["central_baseline"], stale)
        self.assertEqual(proof["reviewed_baseline"], REVIEWED)
        self.overrides[("git", "merge-base", "--is-ancestor", stale, HEAD)] = (1, "unrelated")
        with self.assertRaises(MODULE.HoldError):
            self.collect()

    def test_only_successful_federation_may_advance_exact_central_baseline(self):
        stale = "2" * 40
        self.payload["info"]["wolo_vps"]["expected_implementation_baseline"] = stale
        self.payload["findings"][0]["detail"] = f"VPS={DEPLOYED} implementation_baseline={stale}"
        before = self.collect()
        self.payload = audit_payload()
        after = self.collect()
        with self.assertRaisesRegex(MODULE.HoldError, "changed"):
            MODULE.verify_wolo_hold(before, after)
        MODULE.verify_wolo_hold(before, after, allow_federated_baseline=True)
        changed = copy.deepcopy(after)
        changed["central_baseline"] = "f" * 40
        with self.assertRaisesRegex(MODULE.HoldError, "outside"):
            MODULE.verify_wolo_hold(before, changed, allow_federated_baseline=True)
        changed = copy.deepcopy(after)
        changed["source"]["head"] = "f" * 40
        with self.assertRaisesRegex(MODULE.HoldError, "changed"):
            MODULE.verify_wolo_hold(before, changed, allow_federated_baseline=True)
        changed = copy.deepcopy(after)
        changed["finding"]["key"] = "different-hold"
        with self.assertRaisesRegex(MODULE.HoldError, "changed"):
            MODULE.verify_wolo_hold(before, changed, allow_federated_baseline=True)

    def test_expired_review_and_registry_hash_failure_block_before_ssh(self):
        checker = ("python3", str(self.repo / "scripts/docs_v2_check.py"))
        for error in ("documentation review expired", "documentation registry drift"):
            self.commands = []
            self.overrides[checker] = (1, error)
            with self.assertRaises(MODULE.HoldError):
                self.collect()
            self.assertFalse(any(args[0] == "ssh" for args in self.commands))

    def test_missing_malformed_and_symlink_registry_fail(self):
        for value in ("not json", "[]", json.dumps({"repo": "other"})):
            with self.subTest(value=value):
                self.registry.write_text(value)
                with self.assertRaises(MODULE.HoldError):
                    self.collect()
        self.registry.unlink()
        target = self.repo / "elsewhere.json"
        target.write_text("{}")
        self.registry.symlink_to(target)
        with self.assertRaisesRegex(MODULE.HoldError, "symlink"):
            self.collect()

    def test_real_hold_is_exact_not_a_general_waiver(self):
        mutations = [
            lambda p: p["findings"].append({"severity": "P1", "area": "WoloChain", "key": "other"}),
            lambda p: p["findings"][0].update(severity="P0"),
            lambda p: p["findings"][0].update(detail="unbound"),
            lambda p: p["info"]["wolo_vps"].update(head=REVIEWED),
            lambda p: p["info"]["wolo_vps"].update(expected_implementation_baseline=DEPLOYED),
            lambda p: p["info"]["wolo_vps"].update(expected_implementation_baseline="f" * 40),
            lambda p: p.pop("info"),
        ]
        for mutate in mutations:
            self.payload = audit_payload()
            mutate(self.payload)
            with self.subTest(payload=self.payload):
                with self.assertRaises(MODULE.HoldError):
                    self.collect()

    def test_runtime_missing_dirty_and_changed_identity_fail(self):
        mutations = [
            lambda r: r.pop("services"),
            lambda r: r.pop("boot_id"),
            lambda r: r["source"].update(dirty=True),
            lambda r: r["source"].update(head="f" * 40),
            lambda r: r["services"]["consensus"].update(active="inactive"),
            lambda r: r["services"]["settlement"].update(sha256=""),
            lambda r: r["services"]["founder"].update(modified=True),
            lambda r: r["services"]["founder"].update(pid=200),
            lambda r: r["services"]["settlement"].update(revision="d" * 40),
            lambda r: r["services"]["settlement"].update(revision="f" * 40),
            lambda r: r["services"]["consensus"].update(executable="/tmp/wolochaind"),
            lambda r: r["listeners"]["8092"][0].update(address="0.0.0.0:8092"),
            lambda r: r["listeners"]["8093"][0].update(pids=[]),
            lambda r: r["listeners"]["8093"].append(copy.deepcopy(r["listeners"]["8093"][0])),
            lambda r: r.update(observed_at=(NOW - timedelta(minutes=3)).isoformat()),
            lambda r: r.update(observed_at=(NOW + timedelta(minutes=1)).isoformat()),
        ]
        for mutate in mutations:
            self.runtime = runtime_observation()
            mutate(self.runtime)
            with self.subTest(runtime=self.runtime):
                with self.assertRaises(MODULE.HoldError):
                    self.collect()

    def test_changed_source_during_collection_fails(self):
        self.change_after_observation = True
        with self.assertRaisesRegex(MODULE.HoldError, "changed during observation"):
            self.collect()

    def test_unknown_executable_revision_fails_ancestry(self):
        command = ("git", "merge-base", "--is-ancestor", "d" * 40, REVIEWED)
        self.overrides[command] = (1, "not an ancestor")
        with self.assertRaises(MODULE.HoldError):
            self.collect()

    def test_only_observation_time_can_change(self):
        proof = self.collect()
        current = copy.deepcopy(proof)
        current["runtime"]["observed_at"] = (NOW + timedelta(minutes=5)).isoformat()
        MODULE.verify_wolo_hold(proof, current)
        for path, value in [(('source', 'head'), "f" * 40),
                            (('runtime', 'boot_id'), "fedcba98-7654-3210-fedc-ba9876543210")]:
            changed = copy.deepcopy(current)
            changed[path[0]][path[1]] = value
            with self.subTest(path=path):
                with self.assertRaisesRegex(MODULE.HoldError, "changed"):
                    MODULE.verify_wolo_hold(proof, changed)
        changed = copy.deepcopy(current)
        changed["runtime"]["services"]["settlement"]["restarts"] = 1
        with self.assertRaisesRegex(MODULE.HoldError, "changed"):
            MODULE.verify_wolo_hold(proof, changed)
        with self.assertRaisesRegex(MODULE.HoldError, "incomplete"):
            MODULE.verify_wolo_hold({}, {})


if __name__ == "__main__":
    unittest.main()
