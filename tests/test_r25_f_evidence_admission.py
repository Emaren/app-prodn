"""Synthetic admission contract tests; never SSH or claim physical evidence."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]

def load(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class EvidenceAdmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = load(ROOT / "scripts/r25_f_evidence_admission_root.py")
        cls.m = load(ROOT / "scripts/r25_f_evidence_admission_mac.py")
        cls.e = load(ROOT / "scripts/aoe2_r24_f_parallel_nginx_cutover.py")

    def envelope(self, scope=None, **fields):
        record = {"schema": "aoe2war.r25.f.evidence-review.v1", "decision": "ACCEPT",
            "scope": scope or self.r.SOURCE_SCOPE, "independent_review": True,
            "reviewer": "/root/start_fix_review", "publisher_is_reviewer_identity": False, **fields}
        body = "R25_F_INDEPENDENT_REVIEW\n```json\n" + json.dumps(record, sort_keys=True) + "\n```"
        return {"body": body, "body_sha256": self.r.sha(body.encode()), "author": "Emaren",
            "url": "https://github.com/Emaren/app-prodn/pull/1083#issuecomment-123",
            "issue_url": "https://api.github.com/repos/Emaren/app-prodn/issues/1083"}

    def test_actual_review_scope_author_source_and_reviewer_required(self):
        self.r.reviewed(self.envelope(), self.r.SOURCE_SCOPE)
        for key, value in (("decision", "HOLD"), ("scope", self.r.RUNTIME_SCOPE),
                           ("reviewer", "/root/c_start_deadlock"), ("publisher_is_reviewer_identity", True)):
            with self.subTest(key=key):
                with self.assertRaises(self.r.Hold):
                    self.r.reviewed(self.envelope(**{key: value}), self.r.SOURCE_SCOPE)
        for key, value in (("author", "attacker"), ("url", "https://evil.invalid/123"),
                           ("issue_url", "https://api.github.com/repos/Emaren/other/issues/1083")):
            env = self.envelope()
            env[key] = value
            with self.assertRaises(self.r.Hold):
                self.r.reviewed(env, self.r.SOURCE_SCOPE)

    def test_owner_only_nonfinancial_scope_is_transparent_and_fail_closed(self):
        base={"schema":"aoe2war.r25.f.owner-nonfinancial-review.v1",
              "scope":self.r.SOURCE_SCOPE,"decision":"ACCEPT",
              "owner_login":"Emaren","release_authority":"OWNER_ONLY_NONFINANCIAL",
              "owner_accepts_no_independent_review":True,
              "independent_review":False,"financial_authorized":False,
              "public_cutover_authorized":False}
        marker="\n"+chr(96)*3+"json\n"
        suffix="\n"+chr(96)*3
        def envelope(changes=None):
            manifest={**base,**(changes or {})}
            body="R25_F_OWNER_NONFINANCIAL_ACCEPT"+marker+json.dumps(manifest,sort_keys=True)+suffix
            return {"body":body,"body_sha256":self.r.sha(body.encode()),
                    "author":"Emaren",
                    "url":"https://github.com/Emaren/app-prodn/pull/1083#issuecomment-123",
                    "issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1083"}
        good=envelope()
        self.assertEqual(self.r.reviewed(good,self.r.SOURCE_SCOPE),base)
        response={"id":123,"html_url":good["url"],"issue_url":good["issue_url"],
                  "user":{"login":"Emaren"},"body":good["body"]}
        with mock.patch.object(self.m,"github",return_value=response):
            env,manifest=self.m.review("123",good["body_sha256"],self.r.SOURCE_SCOPE)
        self.assertEqual(env,good)
        self.assertEqual(manifest,base)
        for update in ({"decision":"HOLD"},{"owner_login":"different"},
                       {"independent_review":True},{"financial_authorized":True},
                       {"public_cutover_authorized":True},
                       {"owner_accepts_no_independent_review":False},
                       {"release_authority":"INDEPENDENT"}):
            bad=envelope(update)
            with self.subTest(update=update):
                with self.assertRaises(self.r.Hold):
                    self.r.reviewed(bad,self.r.SOURCE_SCOPE)
                forged_response={**response,"body":bad["body"]}
                with mock.patch.object(self.m,"github",return_value=forged_response):
                    with self.assertRaises(RuntimeError):
                        self.m.review("123",bad["body_sha256"],self.r.SOURCE_SCOPE)
        spoof={**good,"author":"someone-else"}
        with self.assertRaises(self.r.Hold):
            self.r.reviewed(spoof,self.r.SOURCE_SCOPE)
        # Arbitrary second human reviewer fields do not elevate owner authority.
        owner_with_fake_peer=envelope({"reviewer":"/root/security_review"})
        with self.assertRaises(self.r.Hold):
            self.r.reviewed(owner_with_fake_peer,self.r.RUNTIME_SCOPE)

    def test_review_body_digest_and_duplicate_fields_fail(self):
        env = self.envelope()
        env["body"] += "altered"
        with self.assertRaisesRegex(self.r.Hold, "REVIEW_BODY_PIN"):
            self.r.reviewed(env, self.r.SOURCE_SCOPE)
        for raw in ('{"a":1,"a":2}', '{"x":NaN}'):
            with self.assertRaises(self.r.Hold):
                self.r.parse(raw)

    def test_mac_authenticates_actual_comment_id_metadata_before_body(self):
        env = self.envelope()
        comment = {"id": 123, "html_url": env["url"], "issue_url": env["issue_url"],
                   "user": {"login": "Emaren"}, "body": env["body"]}
        with mock.patch.object(self.m, "github", return_value=comment):
            actual, _ = self.m.review("123", env["body_sha256"], self.r.SOURCE_SCOPE)
        self.assertEqual(actual, env)
        for key, value in (("id", 124), ("html_url", "https://evil.invalid"), ("user", {"login": "attacker"})):
            bad = dict(comment)
            bad[key] = value
            with mock.patch.object(self.m, "github", return_value=bad):
                with self.assertRaisesRegex(RuntimeError, "REVIEW_ID_REPOSITORY_AUTHOR"):
                    self.m.review("123", env["body_sha256"], self.r.SOURCE_SCOPE)

    def native_b(self):
        b = {"schema": "aoe2war.r25.b.hel1.positive-isolation-witness.v1",
            "status": "POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY",
            "at": "synthetic-time-not-physical", "target_sha": self.r.TARGET,
            "source_sha": self.r.TARGET, "old_web_pid": 2625090, "candidate_uid": 993,
            "candidate_pid": 555, "candidate_start_ticks": 12345, "build_id": "real-build-pin",
            "guard_sha256": self.r.GUARD_SHA, "guard_local_http": True,
            "guard_wargraph_disabled_before_node": True, "no_financial_operation_executed": True,
            "public_cutover_authorized": False,
            "candidate_readonly_pg": {"role": "aoe2war_r25_web_ro", "server_transaction_ro": True}}
        b["report_sha256"] = self.r.sha(self.r.canonical(b))
        return b

    def helper_for_native(self, b):
        helper = mock.Mock()
        helper.BUILD_ID = "real-build-pin"
        helper.root_file.return_value = b"x" * self.r.B_SIZE
        helper.run.return_value = self.r.canonical(b)
        return helper

    def test_native_poststart_uses_exact_installed_source_and_real_phase(self):
        b = self.native_b()
        helper = self.helper_for_native(b)
        real_sha = self.r.sha
        def digest(data):
            return self.r.B_SHA if data == b"x" * self.r.B_SIZE else real_sha(data)
        with mock.patch.object(self.r, "sha", side_effect=digest):
            actual, stable = self.r.native_poststart(helper)
        self.assertEqual(actual, b)
        self.assertEqual(len(stable), 64)
        args = helper.run.call_args.args[0]
        self.assertEqual(args[:3], ["/usr/bin/python3", "-I", "-B"])
        self.assertIn("poststart", args)
        self.assertNotIn("prestart", args)

    def test_native_b_tamper_not_hidden_by_self_hash(self):
        for key, value in (("candidate_uid", 0), ("guard_local_http", False),
                           ("source_sha", "b" * 40), ("public_cutover_authorized", True)):
            b = self.native_b()
            b[key] = value
            b.pop("report_sha256")
            b["report_sha256"] = self.r.sha(self.r.canonical(b))
            helper = self.helper_for_native(b)
            real_sha = self.r.sha
            with mock.patch.object(self.r, "sha", side_effect=lambda data: self.r.B_SHA if data == b"x" * self.r.B_SIZE else real_sha(data)):
                with self.assertRaisesRegex(self.r.Hold, "GENUINE_NATIVE_B_POSTSTART"):
                    self.r.native_poststart(helper)

    def test_v8_requires_exact_success_and_all_seven_failed_no_replay_journals(self):
        c="c078f3041acab718e1d42d400c2534e4f0297457"
        helper=types.SimpleNamespace()
        helper.BUILD_ID="-dJl5VyecHu5BKNvfErJe"
        helper.JOURNAL=self.r.C_START
        records={}
        values={}
        for v in range(1,8):
            journal=Path("/var/lib/aoe2war-r25-c-additive/start-3031-v"+str(v))
            setattr(helper,("PREV_JOURNAL" if v==7 else "V"+str(v)+"_JOURNAL"),journal)
            for name in (("started","hold") if v==1 else ("started","staged","hold")):
                key=(journal.name,name+".json")
                obj={"status":"START_ENTERED_DO_NOT_RETRY" if name=="started"
                    else "HOLD_NO_REPLAY" if name=="hold" else "REVIEWED_STAGED_NOT_RUNNING",
                    "synthetic_version":v,"synthetic_name":name,
                    "public_cutover_authorized":False}
                raw=self.r.canonical(obj)
                digest=self.r.sha(raw)
                if v==1 and name=="started":digest="cbb0e36523991cf39a8b7562268141ed8fbde5109d60d59abdcf16923e783a53"
                if v==7 and name=="hold":digest="5fc2d25827fc281b2a9623dcf838c3de96f2630dc47b3b9ba7a94f31d768bd72"
                setattr(helper,"V"+str(v)+"_"+name.upper()+"_SHA",digest)
                records[key]=raw
                values[key]=digest
        hist={journal+"_"+name:digest for (journal,name),digest in values.items()}
        plan={"schema":"aoe2war.r25.c.start-plan.v8","source_sha":c,
              "historical_receipts":hist,"financial_authorized":False,
              "public_cutover_authorized":False}
        started={"status":"START_ENTERED_DO_NOT_RETRY","plan":plan,
                 "plan_sha256":"a"*64,"nonce":"b"*32}
        running={"schema":"aoe2war.r25.c.started-3031.v8",
                 "status":"STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT",
                 "candidate_sha":self.r.TARGET,"candidate_uid":993,"candidate_pid":1118556,
                 "old_web_pid":2625090,"candidate_start_ticks":12345,
                 "build_id":helper.BUILD_ID,"public_cutover_authorized":False,
                 "financial_authorized":False,"plan_sha256":"a"*64,"nonce":"b"*32}
        records[("start-3031-v8","started.json")]=self.r.canonical(started)
        records[("start-3031-v8","running.json")]=self.r.canonical(running)
        def read(path,*_):return records[(path.parent.name,path.name)]
        helper.root_file=read
        original_hash=self.r.sha
        by_raw={records[k]:v for k,v in values.items()}
        by_raw[records[("start-3031-v8","started.json")]]="909bcd14f4b69c623a411ffef60422b6ba9f87be3fde9d931178ab50183d70fe"
        by_raw[records[("start-3031-v8","running.json")]]="2917699b248708582dc7ffc75c4309f5fe2802366608e751a1cf75566d263032"
        digest=lambda raw:by_raw.get(raw,original_hash(raw))
        with mock.patch.object(self.r,"sha",side_effect=digest):
            raw,parsed,receipts=self.r.authenticated_v8_start_journals(
                helper,{"lane_sources":{"C":c}})
        self.assertEqual(parsed,running)
        self.assertEqual(raw,records[("start-3031-v8","running.json")])
        self.assertEqual(len(receipts),22)
        self.assertEqual(receipts["C_v7_hold_file_sha256"],helper.V7_HOLD_SHA)
        # Changed bytes, new PID or unqualified financial authority fail closed.
        for key,mutation in [
            (("start-3031-v6","hold.json"),{"status":"FORGED_SUCCESS"}),
            (("start-3031-v8","running.json"),{**running,"candidate_pid":0}),
            (("start-3031-v8","running.json"),{**running,"financial_authorized":True}),
            (("start-3031-v8","started.json"),{**started,"plan":{**plan,"source_sha":"0"*40}})]:
            previous=records[key]
            records[key]=self.r.canonical(mutation)
            with mock.patch.object(self.r,"sha",side_effect=digest):
                with self.assertRaises(self.r.Hold):
                    self.r.authenticated_v8_start_journals(helper,{"lane_sources":{"C":c}})
            records[key]=previous

    def test_capture_stability_ignores_only_native_timestamp_not_security(self):
        a = {"B_native": {"at": "old"}, "B_stable_sha256": "proof", "candidate_pid": 555, "capture_sha256": "old"}
        b = {**a, "B_native": {"at": "new"}, "capture_sha256": "new"}
        self.assertEqual(self.r.stable_capture(a), self.r.stable_capture(b))
        b["B_stable_sha256"] = "changed-security-proof"
        self.assertNotEqual(self.r.stable_capture(a), self.r.stable_capture(b))

    def writer_fixture(self, root):
        base = root / "protected"
        base.mkdir(mode=0o700)
        journal = root / "journal"
        helper = mock.Mock()
        helper.root_file.side_effect = lambda p, *a: Path(p).read_bytes()
        helper.fsync_directory.side_effect = lambda p: None
        engine = mock.Mock()
        engine.SCHEMA = self.e.SCHEMA
        engine.E_ROOT_RECOVERY = base / "e-recovery-ready.json"
        engine.AUDIT_BASE = root / "cutover-audit"
        engine.listener_lines.return_value = {"8092": "A", "8093": "B"}
        fresh = {"B_native": self.native_b(), "B_stable_sha256": "a" * 64,
            "candidate_pid": 555, "candidate_start_ticks": 12345, "source_sha": "b" * 40,
            "old_source_sha": "c" * 40, "old_build_id": "old-build", "candidate_build_id": "new-build",
            "candidate_build_version": "new-version", "nginx_config": "/etc/nginx/sites-available/aoe2war.com",
            "nginx_before_sha256": "d" * 64, "finance_units": ["wolo-%d.service" % n for n in range(25)],
            "snapshot": {"original_web": "old", "candidate_web": "new", "finance": {}, "wolo": "sockets", "native_protected": {}},
            "C_receipt_hashes": dict.fromkeys(("C_source_staged_sha256", "C_build_staged_sha256", "C_source_files_sha256", "C_build_files_sha256"), "e" * 64)}
        fresh["capture_sha256"] = self.r.sha(self.r.canonical(fresh))
        source = {"lane_sources": dict.fromkeys("BCDEFG", "b" * 40)}
        nonce = "f" * 32
        payload = {"capture": copy.deepcopy(fresh), "nonce": nonce,
            "owner_consent": "ADMIT-R25-EVIDENCE-ONLY " + nonce + " " + fresh["capture_sha256"],
            "e_certificate": {"fixture": "not-physical"}, "source_review": self.envelope(),
            "runtime_review": self.envelope(self.r.RUNTIME_SCOPE, capture_sha256=fresh["capture_sha256"],
                B_stable_sha256=fresh["B_stable_sha256"], candidate_pid=555, candidate_start_ticks=12345, source_sha="b" * 40)}
        return base, journal, helper, engine, fresh, source, payload

    def test_writer_success_is_exclusive_durable_and_approval_is_last(self):
        with tempfile.TemporaryDirectory() as d:
            base, journal, helper, engine, fresh, source, payload = self.writer_fixture(Path(d))
            names = []
            original_seal = self.r.seal
            def tracked(h, p, raw):
                names.append(p.name)
                return original_seal(h, p, raw)
            with mock.patch.object(self.r, "BASE", base), mock.patch.object(self.r, "JOURNAL", journal), mock.patch.object(self.r, "capture", return_value=(fresh, {"c_helper": b"reviewed-reader", "engine": b"reviewed-engine"}, helper, engine, source)), mock.patch.object(self.r, "seal", side_effect=tracked):
                result = self.r.admit(payload)
            self.assertEqual(names[-1], "approved.json")
            self.assertLess(names.index("complete.json"), names.index("approved.json"))
            self.assertFalse(result["public_cutover_authorized"])
            self.assertNotIn("nonce", result)
            self.assertNotIn("owner_consent", result)
            self.assertTrue((journal / "started.json").is_file())
            self.assertTrue((journal / "complete.json").is_file())
            self.assertEqual((base / "approved.json").stat().st_mode & 0o777, 0o600)

    def test_writer_failure_preserves_hold_without_publishing_approval(self):
        with tempfile.TemporaryDirectory() as d:
            base, journal, helper, engine, fresh, source, payload = self.writer_fixture(Path(d))
            engine.verified_b_poststart.side_effect = RuntimeError("synthetic-native-proof-failure")
            with mock.patch.object(self.r, "BASE", base), mock.patch.object(self.r, "JOURNAL", journal), mock.patch.object(self.r, "capture", return_value=(fresh, {"c_helper": b"reader", "engine": b"engine"}, helper, engine, source)):
                with self.assertRaisesRegex(RuntimeError, "native-proof"):
                    self.r.admit(payload)
            self.assertTrue((journal / "hold.json").is_file())
            self.assertFalse((base / "approved.json").exists())

    def test_replay_and_symlink_journal_refuse_before_native_probe(self):
        for symlink in (False, True):
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / "journal"
                if symlink:
                    path.symlink_to(Path(d) / "absent")
                else:
                    path.mkdir()
                with mock.patch.object(self.r, "JOURNAL", path), mock.patch.object(self.r, "capture") as capture:
                    with self.assertRaisesRegex(self.r.Hold, "ALREADY_ATTEMPTED"):
                        self.r.admit({})
                capture.assert_not_called()

    def test_wrong_owner_authority_or_runtime_review_never_creates_journal(self):
        for change in ("consent", "runtime", "capture"):
            with tempfile.TemporaryDirectory() as d:
                base, journal, helper, engine, fresh, source, payload = self.writer_fixture(Path(d))
                if change == "consent":
                    payload["owner_consent"] = "approved"
                elif change == "runtime":
                    payload["runtime_review"] = self.envelope(self.r.RUNTIME_SCOPE, capture_sha256="wrong")
                else:
                    payload["capture"]["candidate_pid"] = 999
                with mock.patch.object(self.r, "BASE", base), mock.patch.object(self.r, "JOURNAL", journal), mock.patch.object(self.r, "capture", return_value=(fresh, {}, helper, engine, source)):
                    with self.assertRaises(self.r.Hold):
                        self.r.admit(payload)
                self.assertFalse(journal.exists())

    def test_mac_cancel_does_not_invoke_ssh_or_disclose_phrase(self):
        with mock.patch.object(self.m.subprocess, "run", return_value=types.SimpleNamespace(returncode=1, stdout="")) as run:
            with self.assertRaisesRegex(RuntimeError, "NATIVE_GUI_EVIDENCE_AUTHORIZATION"):
                self.m.owner_gui("fixture-private-phrase")
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][0], "/usr/bin/osascript")

    def test_snapshot_listener_comparison_ignores_only_queue_counters(self):
        a = "LISTEN 0 128 127.0.0.1:8092 0.0.0.0:* users:((wolo,pid=1010,fd=3)) ino:1\nLISTEN 0 128 127.0.0.1:8093 0.0.0.0:* users:((wolo,pid=1012,fd=3)) ino:2"
        b = a.replace("LISTEN 0 128", "LISTEN 4 256")
        self.assertEqual(self.e.listener_lines(a), self.e.listener_lines(b))
        self.assertNotEqual(self.e.listener_lines(a), self.e.listener_lines(b.replace("pid=1010", "pid=2020")))

    def test_no_new_keys_or_service_or_database_or_nginx_mutation_in_writer(self):
        src = (ROOT / "scripts/r25_f_evidence_admission_root.py").read_text()
        for forbidden in ("ssh-keygen", '"systemctl", "start"', '"systemctl", "reload"', "CREATE ROLE", "ALTER ROLE", "prisma migrate"):
            self.assertNotIn(forbidden, src)

if __name__ == "__main__":
    unittest.main()
