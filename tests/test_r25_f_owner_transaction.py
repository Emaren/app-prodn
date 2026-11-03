"""Real owner-record verification contracts; fixtures confer no production authority."""
import base64
import contextlib
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("f_owner_transaction", ROOT / "scripts/aoe2_r24_f_parallel_nginx_mac.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


class OwnerGrant(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 2, 4, 0, 0, tzinfo=timezone.utc)
        self.plan = {
            "schema": "aoe2war.r25.f.cutover-plan.v1", "source_sha": "a" * 40,
            "nonce": "b" * 32, "base_approved_sha256": "c" * 64,
            "before_witness_sha256": m.BEFORE_WITNESS_SHA256,
            "candidate_sha": m.TARGET, "candidate_build_id": "-dJl5VyecHu5BKNvfErJe",
            "candidate_build_version": "20261031171526-148d3df911",
            "nginx_before_sha256": "d" * 64, "nginx_after_sha256": "e" * 64,
            "engine_source_sha256": "1" * 64, "g_source_sha256": "2" * 64,
            "owner_source_sha256": "3" * 64, "old_web_pid": 2625090,
            "candidate_pid": 1118556, "old_web_start_ticks": 123,
            "candidate_start_ticks": 456, "protected_snapshot_sha256": "4" * 64,
            "public_cutover_authorized": False, "financial_authorized": False,
            "consumed_previous_transaction": {"nonce": m.CONSUMED_NONCE,
                "no_commit": True, "current_exact_original_config": True,
                "intent_sha256": "5" * 64, "before_nginx_sha256": "d" * 64},
        }
        self.envelope = {"schema": "aoe2war.r25.f.cutover-plan-envelope.v1",
            "status": "PASS_READ_ONLY_CUTOVER_PLAN_NOT_AUTHORITY", "plan": self.plan,
            "plan_sha256": digest(m.canonical(self.plan))}
        self.grant = {k: self.plan[k] for k in (
            "source_sha", "nonce", "base_approved_sha256", "before_witness_sha256",
            "candidate_sha", "candidate_build_id", "candidate_build_version",
            "nginx_before_sha256", "nginx_after_sha256", "engine_source_sha256",
            "owner_source_sha256", "g_source_sha256")}
        self.grant.update({"schema": m.OWNER_GRANT_SCHEMA, "scope": m.OWNER_GRANT_SCOPE,
            "decision": "AUTHORIZE", "owner_login": "Emaren",
            "release_authority": "OWNER_ONLY_NONFINANCIAL", "owner_delegated_decisions": True,
            "delegated_ai_authorship_disclosed": True, "independent_review": False,
            "financial_authorized": False, "public_cutover_authorized": True,
            "rollback_authorized": True, "max_uses": 1,
            "issued_at": "2026-11-02T03:59:00Z", "expires_at": "2026-11-02T04:09:00Z",
            "plan_sha256": self.envelope["plan_sha256"],
            "exact_head_ci": {"run_id": 123, "head_sha": self.plan["source_sha"],
                "conclusion": "success", "all_three_jobs_success": True}})
        self.comment = {"id": 321, "html_url": "https://github.com/Emaren/app-prodn/issues/1108#issuecomment-321",
            "issue_url": "https://api.github.com/repos/Emaren/app-prodn/issues/1108",
            "user": {"login": "Emaren", "id": 15059910},
            "created_at": "2026-11-02T03:59:02Z", "updated_at": "2026-11-02T03:59:02Z"}
        self.rebody()

    def rebody(self):
        self.comment["body"] = m.OWNER_GRANT_PREFIX + "\n```json\n" + json.dumps(self.grant, sort_keys=True) + "\n```\n"
        self.body_sha = digest(self.comment["body"].encode())

    def authorize(self):
        with mock.patch.object(m, "github_read", return_value=self.comment):
            return m.owner_grant("321", self.body_sha, self.envelope, "1" * 64, "2" * 64,
                                 "3" * 64, now=self.now)

    def test_actual_exact_unmodified_owner_record_is_accepted(self):
        comment, grant = self.authorize()
        self.assertEqual(comment["id"], 321)
        self.assertEqual(grant["nonce"], self.plan["nonce"])
        self.assertIs(grant["independent_review"], False)

    def test_wrong_identity_or_other_issue_cannot_delegate(self):
        for field, value in (("user", {"login": "Emaren", "id": 123}),
                             ("user", {"login": "other", "id": 15059910}),
                             ("issue_url", "https://api.github.com/repos/Emaren/app-prodn/issues/934"),
                             ("html_url", "https://github.com/Emaren/app-prodn/issues/934#issuecomment-321")):
            with self.subTest(field=field, value=value):
                old = self.comment[field]
                self.comment[field] = value
                with self.assertRaisesRegex(m.Hold, "ACCOUNT_DRIFT"):
                    self.authorize()
                self.comment[field] = old

    def test_edited_deleted_or_replaced_owner_record_is_rejected(self):
        self.comment["updated_at"] = "2026-11-02T03:59:03Z"
        with self.assertRaisesRegex(m.Hold, "UNMODIFIED"):
            self.authorize()
        self.comment["updated_at"] = self.comment["created_at"]
        self.comment["body"] += " "
        with self.assertRaisesRegex(m.Hold, "BODY_CHANGED"):
            self.authorize()
        with mock.patch.object(m, "github_read", side_effect=m.Hold("UNAVAILABLE")):
            with self.assertRaisesRegex(m.Hold, "UNAVAILABLE"):
                m.owner_grant("321", self.body_sha, self.envelope, "1" * 64, "2" * 64, "3" * 64, now=self.now)

    def test_expired_future_and_overlong_grants_are_rejected(self):
        for key, value in (("expires_at", "2026-11-02T03:59:59Z"),
                           ("issued_at", "2026-11-02T04:00:01Z"),
                           ("expires_at", "2026-11-02T04:09:01Z")):
            with self.subTest(key=key, value=value):
                old = self.grant[key]
                self.grant[key] = value
                self.rebody()
                with self.assertRaisesRegex(m.Hold, "EXPIRED_FUTURE_OR_TTL"):
                    self.authorize()
                self.grant[key] = old

    def test_replay_scope_financial_or_false_independence_rejected(self):
        for key, value in (("max_uses", 2), ("max_uses", True), ("financial_authorized", True),
                           ("rollback_authorized", False), ("independent_review", True),
                           ("delegated_ai_authorship_disclosed", False), ("scope", "A01_START")):
            with self.subTest(key=key):
                old = self.grant[key]
                self.grant[key] = value
                self.rebody()
                with self.assertRaisesRegex(m.Hold, "EXACT_OWNER_DELEGATED"):
                    self.authorize()
                self.grant[key] = old

    def test_plan_nonce_source_or_bytes_drift_rejected(self):
        for key in ("nonce", "source_sha", "plan_sha256", "base_approved_sha256",
                    "before_witness_sha256", "engine_source_sha256", "owner_source_sha256",
                    "g_source_sha256", "candidate_build_id", "nginx_after_sha256"):
            with self.subTest(key=key):
                old = self.grant[key]
                self.grant[key] = "f" * len(old)
                self.rebody()
                with self.assertRaisesRegex(m.Hold, "DRIFT"):
                    self.authorize()
                self.grant[key] = old

    def test_strict_json_rejects_duplicate_and_nonfinite_fields(self):
        for raw in ('{"nonce":1,"nonce":2}', '{"nonce":NaN}'):
            with self.assertRaises(m.Hold):
                m.strict_json(raw)

    def test_private_native_plan_pins_consumed_journal_without_reusing_it(self):
        with tempfile.TemporaryDirectory() as temp:
            planfile = pathlib.Path(temp) / "plan.json"
            planfile.write_bytes(m.canonical(self.envelope))
            planfile.chmod(0o600)
            self.assertEqual(m.cutover_plan(planfile, "1" * 64, "2" * 64, "3" * 64), self.envelope)
            self.plan["nonce"] = m.CONSUMED_NONCE
            self.envelope["plan_sha256"] = digest(m.canonical(self.plan))
            planfile.write_bytes(m.canonical(self.envelope))
            with self.assertRaisesRegex(m.Hold, "PLAN_SCOPE_DRIFT"):
                m.cutover_plan(planfile, "1" * 64, "2" * 64, "3" * 64)

    def test_native_plan_hash_and_private_file_guards(self):
        with tempfile.TemporaryDirectory() as temp:
            planfile = pathlib.Path(temp) / "plan.json"
            self.envelope["plan_sha256"] = "0" * 64
            planfile.write_bytes(m.canonical(self.envelope))
            planfile.chmod(0o600)
            with self.assertRaisesRegex(m.Hold, "DIGEST_MISMATCH"):
                m.cutover_plan(planfile, "1" * 64, "2" * 64, "3" * 64)
            planfile.chmod(0o644)
            with self.assertRaisesRegex(m.Hold, "PRIVATE_OWNER_EVIDENCE"):
                m.private_bytes(planfile)
            link = pathlib.Path(temp) / "link"
            link.symlink_to(planfile)
            with self.assertRaisesRegex(m.Hold, "PRIVATE_OWNER_EVIDENCE"):
                m.private_bytes(link)

    def test_actual_ci_must_be_exact_three_successful_jobs(self):
        run = {"head_sha": self.plan["source_sha"], "name": "AoE2WAR CI",
               "status": "completed", "conclusion": "success"}
        jobs = {"total_count": 3, "jobs": [{"name": name, "status": "completed", "conclusion": "success"}
            for name in ("Release and documentation control plane", "Type, contract, and production build",
                         "Isolated Steam-rating PostgreSQL chronology")]}
        with mock.patch.object(m, "github_read", side_effect=[run, jobs]):
            m.qualified_ci(self.grant)
        for changed in (dict(run, head_sha="f" * 40), dict(run, conclusion="failure")):
            with mock.patch.object(m, "github_read", side_effect=[changed, jobs]):
                with self.assertRaisesRegex(m.Hold, "THREE_JOB_CI_NOT_PASS"):
                    m.qualified_ci(self.grant)
        jobs["jobs"][0]["conclusion"] = "skipped"
        with mock.patch.object(m, "github_read", side_effect=[run, jobs]):
            with self.assertRaisesRegex(m.Hold, "THREE_JOB_CI_NOT_PASS"):
                m.qualified_ci(self.grant)

    def test_every_source_is_authenticated_exact_commit_bytes_and_sha(self):
        files = {"engine": b"root-engine", "owner": b"owner-mac", "g": b"g-observer"}
        records = [{"type": "file", "encoding": "base64", "path": path, "size": len(files[name]),
                    "content": base64.b64encode(files[name]).decode()}
                   for name, path in m.SOURCE_PATHS.items()]
        self.grant.update({name + "_source_sha256": digest(raw) for name, raw in files.items()})
        with mock.patch.object(m, "github_read", side_effect=records) as api:
            m.qualified_sources(self.grant, files)
        self.assertTrue(all("?ref=" + self.plan["source_sha"] in call.args[0] for call in api.call_args_list))
        records[1] = dict(records[1], content=base64.b64encode(b"different").decode())
        with mock.patch.object(m, "github_read", side_effect=records):
            with self.assertRaisesRegex(m.Hold, "SOURCE_COMMIT_BYTES_MISMATCH:owner"):
                m.qualified_sources(self.grant, files)

    def test_local_receipt_is_durable_private_and_nonreplayable(self):
        with tempfile.TemporaryDirectory() as temp:
            receipt = pathlib.Path(temp) / "new" / "submitted.json"
            m.owner_receipt(receipt, {"status": "SUBMITTED_NOT_PROOF_OF_ROOT_EXECUTION"})
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                m.owner_receipt(receipt, {"status": "second-use"})

    def apply_fixture(self, after_failure=False, revoked=False):
        before = m.canonical({"schema": "aoe2war.g.r25.parallel-host.v1", "phase": "before",
                              "candidate": {"next_build_id": self.plan["candidate_build_id"]}})
        before_sha = digest(before)
        opts = types.SimpleNamespace(rollback=False, owner_grant_comment="321",
            owner_grant_sha256=self.body_sha, owner_grant_plan="private-native-plan.json",
            existing_before="accepted-before.json", existing_before_sha256=before_sha,
            root_source_sha256="1" * 64, g_source_sha256="2" * 64, owner_source_sha256="3" * 64)
        results = [types.SimpleNamespace(returncode=0, stdout=m.canonical(self.envelope), stderr=b""),
                   types.SimpleNamespace(returncode=0, stdout=b"PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER", stderr=b""),
                   types.SimpleNamespace(returncode=0, stdout=b"PASS:R24_OLD_WEB_PROXY_RESTORED", stderr=b"")]
        grants = [(self.comment, self.grant),
                  m.Hold("OWNER_GRANT_EXPIRED_FUTURE_OR_TTL_TOO_LONG") if revoked else (self.comment, self.grant)]
        after = m.canonical({"next_build_id_measured_on_HOST_not_public": self.plan["candidate_build_id"]})
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.multiple(m, BEFORE_WITNESS_SHA256=before_sha), \
                 mock.patch.object(m, "cutover_plan", return_value=self.envelope), \
                 mock.patch.object(m, "private_bytes", return_value=(pathlib.Path(temp) / "before.json", before)), \
                 mock.patch.object(m, "pinned_file", return_value=(pathlib.Path("g.py"), b"source")), \
                 mock.patch.object(m, "owner_grant", side_effect=grants) as owner, \
                 mock.patch.object(m, "qualified_ci"), mock.patch.object(m, "qualified_sources"), \
                 mock.patch.object(m, "owner_consent", side_effect=AssertionError("GUI consent must not be spoofed")), \
                 mock.patch.object(m, "ssh_source", side_effect=results) as ssh, \
                 mock.patch.object(m, "g_witness", side_effect=m.Hold("G_FAILED") if after_failure else None,
                                   return_value=after) as witness, \
                 mock.patch.object(m.pathlib.Path, "home", return_value=pathlib.Path(temp)), \
                 contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                if after_failure or revoked:
                    with self.assertRaisesRegex(m.Hold, "G_FAILED|EXPIRED"):
                        m.apply_owner_grant(opts, b"source", pathlib.Path("g.py"), b"source")
                else:
                    m.apply_owner_grant(opts, b"source", pathlib.Path("g.py"), b"source")
                return owner.call_count, ssh.call_args_list, witness.call_args_list

    def test_grant_reuses_before_and_runs_exactly_one_g_after_without_gui(self):
        count, ssh, witness = self.apply_fixture()
        self.assertEqual(count, 2)
        self.assertEqual(len(ssh), 2)
        self.assertIn("--source-sha " + self.plan["source_sha"], ssh[0].args[1])
        self.assertIn("--owner-source-sha256 " + "3" * 64, ssh[1].args[1])
        self.assertEqual(len(witness), 1)
        self.assertEqual(witness[0].args[1], "after")
        self.assertEqual(witness[0].kwargs["transaction_nonce"], self.plan["nonce"])

    def test_expiry_after_public_activation_never_blocks_protective_rollback(self):
        count, ssh, witness = self.apply_fixture(after_failure=True)
        self.assertEqual(count, 2)  # No forward authorization recheck during rollback.
        self.assertEqual(len(witness), 1)
        self.assertEqual(ssh[2].args[1], "--root-rollback-transaction --nonce " + self.plan["nonce"])

    def test_latest_revocation_blocks_submission_after_read_only_plan(self):
        count, ssh, witness = self.apply_fixture(revoked=True)
        self.assertEqual(count, 2)
        self.assertEqual(len(ssh), 1)
        self.assertEqual(witness, [])


if __name__ == "__main__":
    unittest.main()
