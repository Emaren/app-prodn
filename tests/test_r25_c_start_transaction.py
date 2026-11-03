"""R25 START admission/replay/rollback/auth tests; no production access."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class StartTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = load("r25_c_start_root")
        cls.m = load("r25_c_start_owner_mac")

    def payload(self):
        s = self.s
        root = (ROOT / "scripts/r25_c_start_root.py").read_bytes()
        mac = (ROOT / "scripts/r25_c_start_owner_mac.py").read_bytes()
        record = {"schema": "aoe2war.r25.c.start-source-review.v1", "decision": "ACCEPT",
            "scope": "START_3031_ONLY", "independent_review": True,
            "reviewer": "/root/security_review", "publisher_is_reviewer_identity": False,
            "source_sha": "a" * 40, "operator_size": len(root), "operator_sha256": s.sha(root),
            "operator_blob": self.m.blob(root), "mac_size": len(mac), "mac_sha256": s.sha(mac),
            "mac_blob": self.m.blob(mac), "exact_head_ci": {"run_id": 12345, "head_sha": "a" * 40,
                "conclusion": "success", "all_three_jobs_success": True}}
        body = "R25_START_INDEPENDENT_REVIEW\n```json\n" + json.dumps(record, sort_keys=True) + "\n```"
        return {"source_sha": "a" * 40, "operator_size": len(root), "operator_sha256": s.sha(root),
            "operator_blob": self.m.blob(root), "review_body": body, "review_body_sha256": s.sha(body.encode()),
            "review_url": "https://github.com/Emaren/app-prodn/pull/1084#issuecomment-123",
            "review_author": "Emaren", "review_issue_url": "https://api.github.com/repos/Emaren/app-prodn/issues/1084"}

    def comment(self, payload=None):
        p = payload or self.payload()
        return {"id": 123, "html_url": p["review_url"], "issue_url": p["review_issue_url"],
                "user": {"login": "Emaren"}, "body": p["review_body"]}

    def test_review_admits_exact_source_and_provenance(self):
        self.s.reviewed(self.payload())

    def test_review_rejects_changed_source_scope_publisher_and_reviewer(self):
        for key, value in (("source_sha", "b" * 40), ("scope", "CUTOVER"),
                           ("decision", "HOLD"), ("reviewer", "/root/c_start_deadlock"),
                           ("publisher_is_reviewer_identity", True), ("independent_review", False)):
            with self.subTest(key=key):
                p = self.payload()
                record = json.loads(p["review_body"].split("```json\n")[1].split("\n```")[0])
                record[key] = value
                p["review_body"] = "R25_START_INDEPENDENT_REVIEW\n```json\n" + json.dumps(record) + "\n```"
                p["review_body_sha256"] = self.s.sha(p["review_body"].encode())
                with self.assertRaises(self.s.Hold):
                    self.s.reviewed(p)

    def test_only_actual_named_independent_reviewers_are_admitted(self):
        self.assertEqual(set(self.s.INDEPENDENT_REVIEWERS),set(self.m.REVIEWERS))
        for reviewer in ("/root/start_fix_review","/root","/root/arbitrary"):
            p=self.payload()
            record=json.loads(p["review_body"].split("```json\n")[1].split("\n```")[0])
            record["reviewer"]=reviewer
            p["review_body"]="R25_START_INDEPENDENT_REVIEW\n```json\n"+json.dumps(record)+"\n```"
            p["review_body_sha256"]=self.s.sha(p["review_body"].encode())
            if reviewer=="/root/start_fix_review":
                self.s.reviewed(p)
            else:
                with self.assertRaisesRegex(self.s.Hold,"INDEPENDENT_SOURCE_REVIEW_REQUIRED"):
                    self.s.reviewed(p)
                with mock.patch.object(self.m.Path,"is_file",return_value=True),mock.patch.object(
                        self.m.subprocess,"run",return_value=types.SimpleNamespace(returncode=0,stdout=json.dumps(self.comment(p)).encode())):
                    with self.assertRaisesRegex(RuntimeError,"GENUINE_INDEPENDENT_REVIEW_REQUIRED"):
                        self.m.review_comment("123",p["review_body_sha256"],"a"*40,b"root",b"mac")

    def test_review_rejects_duplicate_json_and_nonfinite(self):
        for raw in ('{"a":1,"a":2}', '{"a":NaN}'):
            with self.assertRaises(self.s.Hold):
                self.s.parse(raw)

    def test_authenticated_comment_rejects_author_id_url_and_repo(self):
        for field, value in (("id", 124), ("html_url", "https://evil.example/"),
                             ("issue_url", "https://api.github.com/repos/Emaren/other/issues/1084"),
                             ("user", {"login": "attacker"})):
            comment = self.comment()
            comment[field] = value
            with mock.patch.object(self.m.Path, "is_file", return_value=True), mock.patch.object(
                    self.m.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps(comment).encode())):
                with self.assertRaisesRegex(RuntimeError, "AUTHOR_REPOSITORY_OR_COMMENT"):
                    self.m.review_comment("123", self.payload()["review_body_sha256"], "a" * 40, b"root", b"mac")

    def test_authenticated_comment_rejects_changed_root_or_mac_bytes(self):
        p = self.payload()
        root = (ROOT / "scripts/r25_c_start_root.py").read_bytes()
        mac = (ROOT / "scripts/r25_c_start_owner_mac.py").read_bytes()
        for r, m in ((root + b"#", mac), (root, mac + b"#")):
            with mock.patch.object(self.m.Path, "is_file", return_value=True), mock.patch.object(
                    self.m.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps(self.comment(p)).encode())):
                with self.assertRaisesRegex(RuntimeError, "SOURCE_BYTES_MISMATCH"):
                    self.m.review_comment("123", p["review_body_sha256"], "a" * 40, r, m)

    def test_authenticated_comment_positive(self):
        p = self.payload()
        root = (ROOT / "scripts/r25_c_start_root.py").read_bytes()
        mac = (ROOT / "scripts/r25_c_start_owner_mac.py").read_bytes()
        actual = {"head_sha": "a" * 40, "status": "completed", "conclusion": "success", "name": "AoE2WAR CI"}
        jobs = {"total_count": 3, "jobs": [{"name": name, "status": "completed", "conclusion": "success"} for name in
            ("Release and documentation control plane", "Type, contract, and production build", "Isolated Steam-rating PostgreSQL chronology")]}
        replies = [types.SimpleNamespace(returncode=0, stdout=json.dumps(o).encode()) for o in (self.comment(p), actual, jobs)]
        with mock.patch.object(self.m.Path, "is_file", return_value=True), mock.patch.object(
                self.m.subprocess, "run", side_effect=replies):
            body, url = self.m.review_comment("123", p["review_body_sha256"], "a" * 40, root, mac)
        self.assertEqual(body, p["review_body"])
        self.assertEqual(url, p["review_url"])

    def test_exact_immutable_fetch_rejects_hash_size_blob(self):
        data = b"pinned source"
        cm = mock.MagicMock()
        cm.__enter__.return_value.read.return_value = data
        with mock.patch.object(self.m.urllib.request, "urlopen", return_value=cm):
            for size, digest, blob in ((len(data)+1, self.s.sha(data), self.m.blob(data)),
                (len(data), "a" * 64, self.m.blob(data)), (len(data), self.s.sha(data), "a" * 40)):
                with self.assertRaisesRegex(RuntimeError, "SOURCE_SIZE_SHA256_BLOB"):
                    self.m.fetch("a" * 40, "file", size, digest, blob)

    def test_gui_rejection_has_no_remote_action(self):
        with mock.patch.object(self.m.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout="wrong")) as run:
            with self.assertRaisesRegex(RuntimeError, "START_ONLY_GUI_CONSENT"):
                self.m.owner_approval("START-R25-3031-ONLY actual")
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][0], "/usr/bin/osascript")

    def test_no_b_poststart_or_positive_runtime_receipt_in_admission(self):
        source = (ROOT / "scripts/r25_c_start_root.py").read_text()
        self.assertNotIn("b-positive-runtime.json", source)
        self.assertNotIn("release_authorized\") is True", source)
        self.assertNotIn('"daemon-reload"', source.split("PROD_PROFILE =", 1)[0])

    def test_e_accepted_certificate_canonical_hash_not_merely_field(self):
        obj = {"a": 1}
        obj["digest"] = self.s.sha(self.s.canonical(obj))
        self.s.canonical_receipt(obj, "digest", obj["digest"])
        obj["a"] = 2
        with self.assertRaisesRegex(self.s.Hold, "CANONICAL_RECEIPT_CHANGED"):
            self.s.canonical_receipt(obj, "digest", obj["digest"])

    def test_timer_state_has_no_invented_mainpid(self):
        unit = "wolo-example.timer"
        raw = b"Id=wolo-example.timer\nActiveState=active\nExecStart=\n"
        with mock.patch.object(self.s, "run", side_effect=[raw, b"unit config"]), mock.patch.object(self.s, "ticks") as ticks:
            result = self.s.unit_state(unit)
        ticks.assert_not_called()
        self.assertIsNone(result["start_ticks"])
        self.assertNotIn("MainPID", result["properties"])

    def test_exact_monitored_oneshot_timer_runtime_churn_is_stable(self):
        # Compare the saved first plan with a later genuine read-only plan;
        # this is not a reconstruction of the unrecorded rejected second plan.
        for unit, timer in self.s.MONITOR_ONESHOT_TIMERS.items():
            def sample(ticks, command="/usr/bin/monitor", config=b"same-reviewed-config", result="success", reload="no"):
                raw = ("Id=" + unit + "\nType=oneshot\nTriggeredBy=" + timer +
                       "\nActiveState=inactive\nMainPID=0\nNeedDaemonReload="+reload+"\nResult="+result+"\n" +
                       "ExecMainStartTimestampMonotonic=" + str(ticks) + "\n" +
                       "ExecStart={ path="+command+" ; argv[]="+command+" ; ignore_errors=no ; " +
                       "start_time=["+str(ticks)+"] ; stop_time=[] ; pid="+str(ticks)+" ; code=exited ; status=0 }\n").encode()
                with mock.patch.object(self.s, "run", side_effect=[raw, config]):
                    return self.s.unit_state(unit)
            first = sample(100)
            later = sample(200)
            self.assertEqual(first, later, unit)
            self.assertNotIn("ExecStart", first["properties"])
            self.assertNotIn("ExecMainStartTimestampMonotonic", first["properties"])
            self.assertIn("ExecStart_command_sha256",first["properties"])
            self.assertNotEqual(first, sample(300, config=b"changed-config"))
            self.assertNotEqual(first, sample(300, command="/usr/bin/changed"))
            self.assertNotEqual(first, sample(300, result="exit-code"))
            with self.assertRaisesRegex(self.s.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                sample(100,reload="yes")
            active = ("Id=" + unit + "\nType=oneshot\nTriggeredBy=" + timer +
                      "\nActiveState=activating\nMainPID=0\nExecStart=foo\n").encode()
            with mock.patch.object(self.s, "run", side_effect=[active, b"same-reviewed-config"]):
                with self.assertRaisesRegex(self.s.Hold, "MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                    self.s.unit_state(unit)
            wrong_timer = active.replace(b"ActiveState=activating", b"ActiveState=inactive").replace(
                timer.encode(), b"unexpected.timer")
            with mock.patch.object(self.s, "run", side_effect=[wrong_timer, b"same-reviewed-config"]):
                with self.assertRaisesRegex(self.s.Hold, "MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                    self.s.unit_state(unit)

    def test_unknown_effective_oneshot_command_shape_is_not_normalized(self):
        unit="traffic-watchdog.service"
        raw=("Id="+unit+"\nType=oneshot\nTriggeredBy=traffic-watchdog.timer\n"
             "ActiveState=inactive\nMainPID=0\nNeedDaemonReload=no\nResult=success\nExecStart=unexpected\n").encode()
        with mock.patch.object(self.s,"run",side_effect=[raw,b"config"]):
            with self.assertRaisesRegex(self.s.Hold,"MONITOR_EFFECTIVE_COMMAND_UNRECOGNIZED"):
                self.s.unit_state(unit)

    def test_shell_argv_marker_cannot_hide_a_changed_command_tail(self):
        def sample(tail,stamp):
            raw=("Id=traffic-watchdog.service\nType=oneshot\nTriggeredBy=traffic-watchdog.timer\n"
                 "ActiveState=inactive\nMainPID=0\nNeedDaemonReload=no\nResult=success\n"
                 "ExecStart={ path=/bin/sh ; argv[]=/bin/sh -c echo ; ignore_errors=no ; "+tail+
                 " ; ignore_errors=no ; start_time=["+str(stamp)+"] ; stop_time=[] ; pid=0 ; code=exited ; status=0 }\n").encode()
            with mock.patch.object(self.s,"run",side_effect=[raw,b"same config"]):
                return self.s.unit_state("traffic-watchdog.service")
        self.assertEqual(sample("safe",100),sample("safe",200))
        self.assertNotEqual(sample("safe",100),sample("changed",100))
    def test_unlisted_oneshot_keeps_strict_runtime_binding(self):
        def sample(n):
            raw = ("Id=wolo-example.service\nType=oneshot\nMainPID=0\n" +
                   "ExecMainStartTimestampMonotonic=" + str(n) +
                   "\nExecStart=last-run-" + str(n) + "\n").encode()
            with mock.patch.object(self.s, "run", side_effect=[raw, b"unit config"]):
                return self.s.unit_state("wolo-example.service")
        self.assertNotEqual(sample(100), sample(200))

    def test_finance_argv_redacted_to_digest(self):
        raw = b"Id=wolo-example.service\nMainPID=0\nExecStart=secret-in-argv\n"
        with mock.patch.object(self.s, "run", side_effect=[raw, b"unit config"]):
            result = self.s.unit_state("wolo-example.service")
        self.assertNotIn("secret-in-argv", json.dumps(result))

    def test_root_file_rejects_symlink_even_when_target_safe(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "target"
            target.write_text("data")
            link = Path(d) / "link"
            link.symlink_to(target)
            with mock.patch.object(self.s, "directory"):
                with self.assertRaisesRegex(self.s.Hold, "ROOT_FILE_UNTRUSTED"):
                    self.s.root_file(link)

    def test_seal_is_exclusive_and_durable(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "receipt.json"
            self.s.seal(target, {"state": "attempted"})
            with self.assertRaises(FileExistsError):
                self.s.seal(target, {"state": "overwritten"})
            self.assertEqual(json.loads(target.read_bytes()), {"state": "attempted"})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def plan_payload(self):
        plan = {"protected_before": {"identity": "before"}}
        digest = self.s.sha(self.s.canonical(plan))
        nonce = "a" * 32
        payload = self.payload()
        payload.update({"plan_sha256": digest, "nonce": nonce,
                        "owner_consent": "START-R25-3031-ONLY " + nonce + " " + digest})
        return plan, payload

    def test_wrong_plan_or_consent_rejected_before_journal_or_start(self):
        for field, value in (("plan_sha256", "b" * 64), ("nonce", "bad"), ("owner_consent", "approved")):
            plan, payload = self.plan_payload()
            payload[field] = value
            with mock.patch.object(self.s, "admit", return_value=(mock.Mock(), plan)), mock.patch.object(self.s.os, "mkdir") as mkdir, mock.patch.object(self.s, "run") as run:
                with self.assertRaises(self.s.Hold):
                    self.s.start(payload)
            mkdir.assert_not_called()
            run.assert_not_called()

    def test_start_timeout_stops_only_new_service_and_keeps_journal(self):
        plan, payload = self.plan_payload()
        witness = mock.Mock()
        witness.systemd.return_value = {"ActiveState": "inactive", "MainPID": "0"}
        with tempfile.TemporaryDirectory() as d:
            audit = Path(d)
            journal = audit / "start-3031-v1"
            with mock.patch.object(self.s, "C_AUDIT", audit), mock.patch.object(self.s, "JOURNAL", journal), mock.patch.object(self.s, "admit", return_value=(witness, plan)), mock.patch.object(self.s, "protected_snapshot", return_value=plan["protected_before"]), mock.patch.object(self.s, "run", side_effect=[subprocess.TimeoutExpired("start", 95), b""]) as run:
                with self.assertRaises(subprocess.TimeoutExpired):
                    self.s.start(payload)
            self.assertTrue((journal / "started.json").is_file())
            hold = json.loads((journal / "hold.json").read_bytes())
            self.assertTrue(hold["new_service_stop_proven"])
            self.assertEqual(run.call_args_list[0].args[0], ["/usr/bin/systemctl", "start", self.s.NEW_UNIT])
            self.assertEqual(run.call_args_list[1].args[0], ["/usr/bin/systemctl", "stop", self.s.NEW_UNIT])

    def test_preimage_failure_before_start_never_stops_any_service(self):
        plan, payload = self.plan_payload()
        with tempfile.TemporaryDirectory() as d:
            audit = Path(d)
            with mock.patch.object(self.s, "C_AUDIT", audit), mock.patch.object(self.s, "JOURNAL", audit / "once"), mock.patch.object(self.s, "admit", return_value=(mock.Mock(), plan)), mock.patch.object(self.s, "protected_snapshot", return_value={"changed": True}), mock.patch.object(self.s, "run") as run:
                with self.assertRaisesRegex(self.s.Hold, "PREIMAGE_CHANGED"):
                    self.s.start(payload)
            run.assert_not_called()

    def test_partial_or_symlink_journal_prevents_admission_before_b(self):
        for symlink in (False, True):
            with tempfile.TemporaryDirectory() as d:
                p = Path(d) / "once"
                if symlink:
                    p.symlink_to(Path(d) / "missing")
                else:
                    p.mkdir()
                with mock.patch.object(self.s, "JOURNAL", p), mock.patch.object(self.s.sys, "platform", "linux"), mock.patch.object(self.s.os, "geteuid", return_value=0), mock.patch.object(self.s.socket, "gethostname", return_value=self.s.HOST), mock.patch.object(self.s, "b_prestart") as b:
                    with self.assertRaisesRegex(self.s.Hold, "START_ALREADY_ATTEMPTED"):
                        self.s.admit(self.payload())
                b.assert_not_called()

    def test_shell_ssh_pins_strict_host_and_python_isolation(self):
        reply = {"status": "PASS"}
        with mock.patch.object(self.m.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps(reply).encode())) as run:
            self.m.root_call(b"print('test')", {}, "plan")
        args = run.call_args.args[0]
        self.assertIn("root@hel1", args)
        self.assertIn("StrictHostKeyChecking=yes", args)
        self.assertIn("BatchMode=yes", args)
        self.assertIn("/usr/bin/python3 -I -B", args[-1])

    def test_effective_unit_refuses_stale_daemon_config(self):
        witness = mock.Mock()
        witness.systemd.return_value = {"ProtectSystem": "strict", "ProtectHome": "yes",
            "NoNewPrivileges": "yes", "PrivateTmp": "yes", "CapabilityBoundingSet": ""}
        with mock.patch.object(self.s, "run", return_value=b"NeedDaemonReload=yes\n"):
            with self.assertRaisesRegex(self.s.Hold, "NOT_LOADED"):
                self.s.effective_unit(witness)

    def test_effective_unit_refuses_weakened_sandbox(self):
        witness = mock.Mock()
        witness.systemd.return_value = {"ProtectSystem": "no"}
        with self.assertRaisesRegex(self.s.Hold, "SANDBOX_DRIFT"):
            self.s.effective_unit(witness)

    def test_effective_exact_commands_positive_and_extra_command_negative(self):
        witness = mock.Mock()
        witness.systemd.return_value = {"ProtectSystem": "strict", "ProtectHome": "yes",
            "NoNewPrivileges": "yes", "PrivateTmp": "yes", "CapabilityBoundingSet": ""}
        start = "{ path=/usr/bin/node ; argv[]=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031 ; ignore_errors=no ; }"
        pre = "{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 -I -B /etc/aoe2war/r24-parallel-web/approved-runtime-prestart.py --phase prestart --expected-guard-sha256 " + self.s.B_GUARD_SHA + " ; ignore_errors=no ; }"
        def raw(a, b):
            return ("NeedDaemonReload=no\nUser=" + self.s.USER + "\nGroup=" + self.s.USER
                + "\nWorkingDirectory=" + str(self.s.STAGE) + "\nExecStart=" + a + "\nExecStartPre=" + b + "\n").encode()
        with mock.patch.object(self.s, "run", return_value=raw(start, pre)):
            self.assertEqual(len(self.s.effective_unit(witness)), 64)
        for a, b in ((start + start, pre), (start, pre + pre),
                     (start.replace("--port 3031", "--port 3030"), pre)):
            with mock.patch.object(self.s, "run", return_value=raw(a, b)):
                with self.assertRaises(self.s.Hold):
                    self.s.effective_unit(witness)

    def test_review_cannot_replace_ci_with_pending_or_other_head(self):
        for field, value in (("head_sha", "b" * 40), ("conclusion", "pending"),
                             ("all_three_jobs_success", False), ("run_id", 0)):
            p = self.payload()
            record = json.loads(p["review_body"].split("```json\n")[1].split("\n```")[0])
            record["exact_head_ci"][field] = value
            p["review_body"] = "R25_START_INDEPENDENT_REVIEW\n```json\n" + json.dumps(record) + "\n```"
            p["review_body_sha256"] = self.s.sha(p["review_body"].encode())
            with self.assertRaisesRegex(self.s.Hold, "EXACT_HEAD_FULL_CI"):
                self.s.reviewed(p)

    def readiness_fixture(self):
        witness = mock.Mock()
        witness.systemd.return_value = {"ActiveState": "active", "MainPID": "555",
            "ControlGroup": "/system.slice/" + self.s.NEW_UNIT}
        witness.proc.return_value = {"start_ticks": 123, "uid": 993, "cwd": str(self.s.STAGE), "exe": "/usr/bin/node"}
        witness.tcp3031.return_value = "a" * 64
        response = mock.MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = json.dumps({"buildVersion": self.s.VERSION}).encode()
        opener = mock.Mock()
        opener.open.return_value = response
        return witness, opener

    def test_active_pid_before_socket_then_real_readiness_succeeds(self):
        witness, opener = self.readiness_fixture()
        with mock.patch.object(self.s, "candidate_port_present", side_effect=[False, True]), mock.patch.object(self.s.time, "monotonic", return_value=0), mock.patch.object(self.s.time, "sleep") as sleep, mock.patch.object(self.s.Path, "read_text", return_value="0::/system.slice/" + self.s.NEW_UNIT + "\n"), mock.patch.object(self.s.urllib.request, "build_opener", return_value=opener):
            actual = self.s.ready_http(witness, 555, 123, 30)
        self.assertEqual(actual, "a" * 64)
        self.assertEqual(sleep.call_count, 1)
        witness.tcp3031.assert_called_once_with(555)

    def test_readiness_deadline_and_conflicting_listener_fail_closed(self):
        witness, opener = self.readiness_fixture()
        with mock.patch.object(self.s, "candidate_port_present", return_value=False), mock.patch.object(self.s.time, "monotonic", return_value=31), mock.patch.object(self.s.Path, "read_text", return_value="0::/system.slice/" + self.s.NEW_UNIT + "\n"):
            with self.assertRaisesRegex(self.s.Hold, "READINESS_DEADLINE"):
                self.s.ready_http(witness, 555, 123, 30)
        witness.tcp3031.side_effect = RuntimeError("R25_B_HOST_HOLD:3031_LISTENER_NOT_OWNED_BY_NEW_MAINPID")
        with mock.patch.object(self.s, "candidate_port_present", return_value=True), mock.patch.object(self.s.Path, "read_text", return_value="0::/system.slice/" + self.s.NEW_UNIT + "\n"):
            with self.assertRaisesRegex(RuntimeError, "NOT_OWNED"):
                self.s.ready_http(witness, 555, 123, 30)

    def test_readiness_connection_refused_is_retried_but_http_error_is_not(self):
        witness, opener = self.readiness_fixture()
        response = opener.open.return_value
        opener.open.side_effect = [self.s.urllib.error.URLError(ConnectionRefusedError(61, "refused")), response]
        # errno is the platform's ECONNREFUSED; do not assume a Linux literal on Mac.
        opener.open.side_effect = [self.s.urllib.error.URLError(ConnectionRefusedError(self.s.errno.ECONNREFUSED, "refused")), response]
        with mock.patch.object(self.s, "candidate_port_present", return_value=True), mock.patch.object(self.s.time, "monotonic", return_value=0), mock.patch.object(self.s.time, "sleep"), mock.patch.object(self.s.Path, "read_text", return_value="0::/system.slice/" + self.s.NEW_UNIT + "\n"), mock.patch.object(self.s.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(self.s.ready_http(witness, 555, 123, 30), "a" * 64)
        self.assertEqual(opener.open.call_count, 2)

    def test_finance_census_includes_loaded_postgres_instance_and_template_without_show(self):
        names = [self.s.OLD_UNIT, self.s.NEW_UNIT, "postgresql.service", "postgresql@.service"]
        names += ["wolo-test-%d.timer" % n for n in range(22)]
        installed = ("\n".join(name + " enabled" for name in names)).encode()
        loaded = b"postgresql@16-main.service loaded active running PostgreSQL\n"
        sockets = "\n".join("LISTEN 0 128 127.0.0.1:%d 0.0.0.0:*" % port for port in (3030, 8092, 8093, 5432)).encode()
        def native(argv, **kwargs):
            if "list-unit-files" in argv:
                return installed
            if "list-units" in argv:
                return loaded
            if "cat" in argv:
                return b"template config"
            return sockets
        def state(name):
            self.assertNotEqual(name, "postgresql@.service")
            return {"properties": {"ActiveState": "active", "MainPID": str(self.s.OLD_PID if name == self.s.OLD_UNIT else 100)},
                    "start_ticks": self.s.OLD_TICKS if name == self.s.OLD_UNIT else 200}
        with mock.patch.object(self.s, "run", side_effect=native), mock.patch.object(self.s, "unit_state", side_effect=state):
            snapshot = self.s.protected_snapshot()
        self.assertIn("postgresql@.service", snapshot["template_config_sha256"])
        self.assertIn("postgresql@16-main.service", snapshot["units"])
        self.assertIn("5432", snapshot["protected_sockets"])

    def simulated_start(self, change=None):
        plan, payload = self.plan_payload()
        witness = mock.Mock()
        state = {"ActiveState": "active", "MainPID": "555", "User": self.s.USER,
            "WorkingDirectory": str(self.s.STAGE), "ProtectSystem": "strict", "ProtectHome": "yes",
            "NoNewPrivileges": "yes", "PrivateTmp": "yes", "CapabilityBoundingSet": "",
            "ControlGroup": "/system.slice/" + self.s.NEW_UNIT}
        witness.systemd.return_value = state
        witness.ENV_ALLOW = {"safe"}
        witness.EXPECTED = {"safe": "true"}
        proc = {"uid": 993, "cwd": str(self.s.STAGE), "exe": "/usr/bin/node", "env": {"safe": "true"},
                "start_ticks": 12345, "cgroup_sha256": "a" * 64}
        if change:
            change(state, proc)
        witness.proc.return_value = proc
        witness.tcp3031.return_value = "b" * 64
        witness.nft_policy.return_value = "c" * 64
        response = mock.MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = json.dumps({"buildVersion": self.s.VERSION}).encode()
        opener = mock.Mock()
        opener.open.return_value = response
        def read(path, *a, **kw):
            if str(path).endswith("/status"):
                return "Uid:\t993\t993\t993\t993\n"
            return "0::/system.slice/" + self.s.NEW_UNIT + "\n"
        with tempfile.TemporaryDirectory() as d:
            audit = Path(d)
            journal = audit / "once"
            with mock.patch.object(self.s, "C_AUDIT", audit), mock.patch.object(self.s, "JOURNAL", journal), mock.patch.object(self.s, "admit", return_value=(witness, plan)), mock.patch.object(self.s, "protected_snapshot", return_value=plan["protected_before"]), mock.patch.object(self.s, "effective_unit"), mock.patch.object(self.s, "candidate_port_present", return_value=True), mock.patch.object(self.s, "run") as run, mock.patch.object(self.s.Path, "read_text", read), mock.patch.object(self.s, "root_file", return_value=self.s.BUILD_ID.encode()), mock.patch.object(self.s.urllib.request, "build_opener", return_value=opener):
                try:
                    result = self.s.start(payload)
                    return result, run.call_args_list
                except self.s.Hold:
                    return json.loads((journal / "hold.json").read_bytes()), run.call_args_list

    def test_success_receipt_still_requires_b_poststart_and_c_runtime(self):
        result, calls = self.simulated_start()
        self.assertEqual(result["status"], "STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT")
        self.assertFalse(result["B_poststart_proven"])
        self.assertFalse(result["C_independent_runtime_accept"])
        self.assertFalse(result["public_cutover_authorized"])
        self.assertEqual(len(calls), 1)

    def test_uid_and_cgroup_lookalikes_fail_and_stop_only_new(self):
        for change in (lambda state, proc: proc.update(uid=0),
                       lambda state, proc: state.update(ControlGroup="/system.slice/" + self.s.NEW_UNIT + "-lookalike")):
            result, calls = self.simulated_start(change)
            self.assertEqual(result["status"], "HOLD_NO_REPLAY")
            self.assertEqual(calls[-1].args[0], ["/usr/bin/systemctl", "stop", self.s.NEW_UNIT])

if __name__ == "__main__":
    unittest.main()
