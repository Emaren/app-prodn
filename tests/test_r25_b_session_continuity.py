"""Session continuity is root-measured configuration, never live browser proof."""
import hashlib
import importlib.util
import json
import pathlib
import stat
import types
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("b_session_continuity", ROOT / "scripts/r25_b_session_continuity_witness_v1.py")
w = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(w)


class SessionContinuity(unittest.TestCase):
    def setUp(self):
        self.secret = "fixture-only-symmetric-key-abcdefghijklmnopqrstuvwxyz0123456789"
        self.db = "postgres://aoe2war_r25_web_ro:fixture-only@127.0.0.1:5432/app"
        self.journal = w.JOURNAL_ROOT / ("session-repair-" + "a" * 32)
        self.wrapper = b"reviewed-wrapper-test-fixture-not-authority"
        self.record = {
            "schema": "aoe2war.r25.c.session-continuity.v1", "status": "SESSION_AUTH_STAGED_NOT_STARTED",
            "nonce": "a" * 32, "original_pid": w.OLD_PID, "original_start_ticks": w.OLD_TICKS,
            "session_env_path": str(w.SESSION_ENV), "readonly_db_env_path": str(w.DB_ENV),
            "only_session_secret": True, "financial_authorized": False,
            "witness_sha256": hashlib.sha256(self.wrapper).hexdigest(),
        }
        self.contents = {self.journal / "staged.json": json.dumps(self.record).encode(),
                         w.WITNESS: self.wrapper,
                         w.SESSION_ENV: ("SESSION_SECRET=" + self.secret + "\n").encode()}
        self.old = {"pid": w.OLD_PID, "start_ticks": w.OLD_TICKS,
                    "env": {"SESSION_SECRET": self.secret}}
        self.candidate = {"pid": 1234, "start_ticks": 456,
                          "env": {"DATABASE_URL": self.db, "SESSION_SECRET": self.secret}}
        self.base = types.SimpleNamespace(OLD_UNIT="old.service", UNIT="new.service", ENV_ALLOW={"DATABASE_URL"},
            systemd=mock.Mock(side_effect=lambda unit: {"ActiveState": "active", "MainPID": str(w.OLD_PID if unit == "old.service" else 1234)}),
            proc=mock.Mock(side_effect=lambda pid: self.old if pid == w.OLD_PID else self.candidate),
            run=mock.Mock(return_value=(str(w.DB_ENV) + " (ignore_errors=no)" + chr(10) + str(w.DB_ENV) + " (ignore_errors=no)" + chr(10) + str(w.SESSION_ENV) + " (ignore_errors=no)" + chr(10)).encode()),
            root_db_envfile=mock.Mock(return_value=self.db),
            prestart=mock.Mock(return_value={"status": "NATIVE_B_PRESTART"}),
            observe=mock.Mock(side_effect=lambda _: {"candidate_pid": 1234, "candidate_start_ticks": 456,
                                                     "status": "NATIVE_B_POSTSTART", "report_sha256": "old"}))

    def refresh_record(self):
        self.contents[self.journal / "staged.json"] = json.dumps(self.record).encode()

    def proof(self, candidate=True):
        with mock.patch.object(w, "sealed_bytes", side_effect=lambda path, *_args: self.contents[path]):
            return w.proof(self.base, self.journal, self.candidate if candidate else None)

    def test_exact_session_continuity_reports_only_booleans_not_key_or_digest(self):
        result = self.proof()
        self.assertIs(result["candidate_secret_matches_original"], True)
        self.assertIs(result["session_key_is_symmetric_signing_capability"], True)
        self.assertIs(result["authenticated_browser_roles_verified"], False)
        self.assertIs(result["financial_authorized"], False)
        self.assertEqual(self.base.ENV_ALLOW, {"DATABASE_URL"})
        output = json.dumps(result)
        self.assertNotIn(self.secret, output)
        self.assertNotIn(hashlib.sha256(self.secret.encode()).hexdigest(), output)
        self.assertNotIn(self.db, output)

    def test_missing_or_mismatched_candidate_key_fails_closed_without_leaking_it(self):
        for value in (None, "fixture-other-key-abcdefghijklmnopqrstuvwxyz0123456789"):
            if value is None:
                self.candidate["env"].pop("SESSION_SECRET", None)
            else:
                self.candidate["env"]["SESSION_SECRET"] = value
            with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, "CANDIDATE.*SESSION_SECRET") as caught:
                self.proof()
            self.assertNotIn(self.secret, str(caught.exception))
            if value:
                self.assertNotIn(value, str(caught.exception))

    def test_env_file_never_accepts_extra_keys_quotes_trim_or_ambiguous_encoding(self):
        for raw in (
            "NEXTAUTH_SECRET=" + self.secret + "\n",
            "SESSION_SECRET=" + self.secret + "\nEXTRA=value\n",
            "SESSION_SECRET='" + self.secret + "'\n",
            "SESSION_SECRET=" + self.secret + " \n",
            "SESSION_SECRET=" + self.secret + "\r\n",
            "SESSION_SECRET=" + self.secret + "\x00\n",
            "SESSION_SECRET=" + self.secret,
        ):
            self.contents[w.SESSION_ENV] = raw.encode()
            with self.subTest(raw=repr(raw[:20])), self.assertRaisesRegex(RuntimeError, "EXACTLY_ONE_SAFE_UNQUOTED_KEY"):
                self.proof()

    def test_effective_original_fallback_and_precedence_match_frozen_session_source(self):
        self.old["env"] = {"SESSION_SECRET": "", "NEXTAUTH_SECRET": self.secret}
        self.assertTrue(self.proof()["session_file_matches_original"])
        self.old["env"] = {"SESSION_SECRET": self.secret, "NEXTAUTH_SECRET": "other-fallback-key-abcdefghijklmnopqrstuvwxyz0123456789"}
        self.assertTrue(self.proof()["session_file_matches_original"])
        self.old["env"] = {"SESSION_SECRET": self.secret + " "}
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_EFFECTIVE_SESSION_SECRET_UNAVAILABLE"):
            self.proof()
        self.old["env"] = {}
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_EFFECTIVE_SESSION_SECRET_UNAVAILABLE"):
            self.proof()

    def test_original_pid_ticks_and_secret_mismatch_cannot_be_accepted(self):
        self.old["start_ticks"] += 1
        with self.assertRaisesRegex(RuntimeError, "START_IDENTITY_CHANGED"):
            self.proof()
        self.old["start_ticks"] = w.OLD_TICKS
        self.contents[w.SESSION_ENV] = b"SESSION_SECRET=fixture-other-key-abcdefghijklmnopqrstuvwxyz0123456789\n"
        with self.assertRaisesRegex(RuntimeError, "DOES_NOT_MATCH_ORIGINAL_EFFECTIVE_SECRET"):
            self.proof()
        self.base.systemd.return_value = {"ActiveState": "active", "MainPID": "99"}
        self.base.systemd.side_effect = None
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_WEB_PROCESS_CHANGED"):
            self.proof()

    def test_original_secret_is_rechecked_after_candidate_comparison(self):
        changed = {**self.old, "env": {"SESSION_SECRET": "fixture-changed-key-abcdefghijklmnopqrstuvwxyz0123456789"}}
        self.base.proc.side_effect = [self.old, changed]
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_SESSION_SECRET_CHANGED_DURING_WITNESS"):
            self.proof()

    def test_nextauth_preview_or_other_secret_is_not_added_to_allowlist(self):
        for key in ("NEXTAUTH_SECRET", "AOE2WAR_PREVIEW_USER_UID", "SIGNING_KEY"):
            self.candidate["env"][key] = "not-permitted"
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, "OUTSIDE_ORIGINAL_WALL"):
                self.proof()
            self.candidate["env"].pop(key)

    def test_database_env_file_remains_separate_and_exactly_preserved(self):
        self.candidate["env"]["DATABASE_URL"] = "postgres://other-role@127.0.0.1/app"
        with self.assertRaisesRegex(RuntimeError, "DEDICATED_DB_ENV_CHANGED"):
            self.proof()
        self.base.run.return_value = (str(w.SESSION_ENV) + " (ignore_errors=no)\n").encode()
        with self.assertRaisesRegex(RuntimeError, "EXACT_TWO_DATABASE_AND_ONE_SESSION_ENVFILES"):
            self.proof()

    def test_session_journal_and_installed_witness_are_exact_pinned_scope(self):
        for key, value in (("nonce", "b" * 32), ("financial_authorized", True),
                           ("only_session_secret", False), ("original_start_ticks", 1),
                           ("session_env_path", "/tmp/session.env"), ("witness_sha256", "0" * 64)):
            previous = self.record[key]
            self.record[key] = value
            self.refresh_record()
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                self.proof()
            self.record[key] = previous
        self.refresh_record()
        with self.assertRaisesRegex(RuntimeError, "EXACT_SESSION_JOURNAL_REQUIRED"):
            w.session_journal("/tmp/session-repair-" + "a" * 32)

    def test_superseding_wrapper_loads_exact_immutable_original_b_source(self):
        raw = (ROOT / "scripts/r25_b_namespace_recovery_witness.py").read_bytes()
        with mock.patch.object(w, "sealed_bytes", return_value=raw):
            original = w.load_base()
            self.assertNotIn("SESSION_SECRET", original.ENV_ALLOW)
        with mock.patch.object(w, "sealed_bytes", return_value=raw + b" "):
            with self.assertRaisesRegex(RuntimeError, "IMMUTABLE_INSTALLED_B_V2_SOURCE_CHANGED"):
                w.load_base()
        published_v4 = (ROOT / "scripts/r25_b_namespace_recovery_witness_v4.py").read_bytes()
        self.assertEqual(hashlib.sha256(published_v4).hexdigest(), w.RECOVERED_BASE_SHA256)
        self.assertEqual(len(published_v4), w.RECOVERED_BASE_SIZE)

    def test_native_prestart_and_complete_original_poststart_guard_are_retained(self):
        with mock.patch.object(w, "require_host"), mock.patch.object(w, "load_base", return_value=self.base), \
             mock.patch.object(w, "sealed_bytes", side_effect=lambda path, *_args: self.contents[path]):
            pre = w.prestart("a" * 64, self.journal)
            self.assertFalse(pre["session_auth_continuity"]["candidate_runtime_observed"])
            post = w.observe("a" * 64, self.journal)
        self.base.prestart.assert_called_once_with("a" * 64)
        self.base.observe.assert_called_once_with("a" * 64)
        self.assertEqual(self.base.ENV_ALLOW, {"DATABASE_URL", "SESSION_SECRET"})
        self.assertTrue(post["session_auth_continuity"]["candidate_secret_matches_original"])
        digest = post.pop("report_sha256")
        self.assertEqual(digest, hashlib.sha256(json.dumps(post, sort_keys=True, separators=(",", ":")).encode()).hexdigest())

    def test_candidate_pid_change_cannot_pass_by_reusing_auth_comparison(self):
        self.base.observe.side_effect = lambda _: {"candidate_pid": 9999, "candidate_start_ticks": 456}
        with mock.patch.object(w, "require_host"), mock.patch.object(w, "load_base", return_value=self.base), \
             mock.patch.object(w, "sealed_bytes", side_effect=lambda path, *_args: self.contents[path]):
            with self.assertRaisesRegex(RuntimeError, "CANDIDATE_PROCESS_CHANGED"):
                w.observe("a" * 64, self.journal)

    def test_secret_file_requires_exact_root_0600_no_links_and_stable_opened_inode(self):
        state = dict(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=3,
                     st_dev=1, st_ino=2, st_mtime_ns=3)
        path = mock.Mock()
        path.is_absolute.return_value = True
        parent = mock.Mock()
        parent.lstat.return_value = types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        path.parents = [parent]
        good = types.SimpleNamespace(**state)
        path.lstat.return_value = good
        with mock.patch.object(w.os, "open", return_value=99), mock.patch.object(w.os, "close"), \
             mock.patch.object(w.os, "read", return_value=b"abc"), \
             mock.patch.object(w.os, "fstat", return_value=good):
            self.assertEqual(w.sealed_bytes(path, 0o600), b"abc")
            for changed in ({"st_uid": 1000}, {"st_mode": stat.S_IFREG | 0o644},
                            {"st_mode": stat.S_IFLNK | 0o600}, {"st_nlink": 2}):
                path.lstat.return_value = types.SimpleNamespace(**{**state, **changed})
                with self.subTest(changed=changed), self.assertRaisesRegex(RuntimeError, "ROOT_FILE_MODE_TYPE_OR_SIZE"):
                    w.sealed_bytes(path, 0o600)
            path.lstat.return_value = good
            with mock.patch.object(w.os, "fstat", side_effect=[good, types.SimpleNamespace(**{**state, "st_ino": 9})]):
                with self.assertRaisesRegex(RuntimeError, "ROOT_FILE_CHANGED_DURING_READ"):
                    w.sealed_bytes(path, 0o600)

    def test_wrong_host_is_rejected_before_sensitive_root_reads(self):
        with mock.patch.object(w.sys, "platform", "linux"), mock.patch.object(w.os, "geteuid", return_value=0), \
             mock.patch.object(w.socket, "gethostname", return_value="other-host"), \
             mock.patch.object(w, "load_base") as loaded:
            with self.assertRaisesRegex(RuntimeError, "EXACT_HEL1_ROOT_REQUIRED"):
                w.prestart("a" * 64, self.journal)
            loaded.assert_not_called()


if __name__ == "__main__":
    unittest.main()
