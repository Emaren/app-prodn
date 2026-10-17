"""Offline adversarial contracts for the operator-only Satchel schema rehearsal."""
import hashlib
import importlib.util
import io
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_satchel_schema_shadow_rehearsal.py"
SPEC = importlib.util.spec_from_file_location("aoe2_satchel_schema_shadow_rehearsal", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ShadowSafetyTests(unittest.TestCase):
    def test_source_identity_requires_exact_40_hex(self):
        for sha in ("main", "a" * 39, "A" * 40, "a" * 41):
            with self.subTest(sha=sha), self.assertRaises(MODULE.RehearsalStop):
                MODULE.source_evidence(sha)

    def test_refuse_non_shadow_sql(self):
        for db in ("aoe2hd_db", "postgres", "satchel_history_ci",
                   "aoe2war_satchel_shadow_;DROP DATABASE postgres",
                   "aoe2war_satchel_shadow_foo-bar"):
            with self.subTest(db=db):
                with self.assertRaises(MODULE.RehearsalStop):
                    MODULE.apply_to_shadow(db, b"SELECT 1;")

    def test_refuse_unsafe_database_name_even_for_readonly(self):
        with self.assertRaises(MODULE.RehearsalStop):
            MODULE.psql("postgres; DROP DATABASE aoe2hd_db", "SELECT 1")

    def test_cohort_sql_has_transaction_rollback_and_no_existing_data_backfill(self):
        sql = MODULE.cohort_sql().decode("utf-8")
        self.assertTrue(sql.startswith("BEGIN;"))
        self.assertTrue(sql.rstrip().endswith("ROLLBACK;"))
        self.assertEqual(sql.count("CREATE OR REPLACE FUNCTION"), 6)
        self.assertIn("owner_count", sql)
        self.assertIn("seven funded table identities missing", sql)
        self.assertIn("signed funded-spend-consent table missing", sql)
        self.assertNotIn("DROP DATABASE", sql)
        self.assertNotIn("UPDATE users", sql)

    def test_never_include_postgres_stderr_in_exception(self):
        p = subprocess.CompletedProcess(
            args=["pg_dump"], returncode=1, stdout=b"", stderr=b"secret-token"
        )
        with mock.patch.object(MODULE.subprocess, "run", return_value=p):
            with self.assertRaises(MODULE.RehearsalStop) as caught:
                MODULE.invoke(["pg_dump"])
        self.assertNotIn("secret-token", str(caught.exception))

    def test_schema_dump_is_schema_only(self):
        with mock.patch.object(MODULE, "postgres", return_value=b"x" * 1200) as pg:
            MODULE.schema_bytes("aoe2hd_db")
        self.assertIn("--schema-only", pg.call_args.args)
        self.assertIn("--no-owner", pg.call_args.args)
        self.assertIn("--no-acl", pg.call_args.args)
        self.assertIn("--lock-wait-timeout=5s", pg.call_args.args)
        self.assertNotIn("--data-only", pg.call_args.args)

    def test_schema_dump_rejects_oversized_output(self):
        with mock.patch.object(MODULE, "postgres", return_value=b"x" * 32_000_001):
            with self.assertRaises(MODULE.RehearsalStop):
                MODULE.schema_bytes("aoe2hd_db")

    def test_exact_source_inventory_expected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            folder = root / "prisma" / "migrations"
            expected = [f"historic_{i:03d}" for i in range(112)] + list(MODULE.SATCHEL)
            for name in expected:
                target = folder / name / "migration.sql"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("SELECT 1;\n")
            with (
                mock.patch.object(MODULE, "ROOT", root),
                mock.patch.object(MODULE, "invoke", side_effect=[
                    b"a" * 40 + b"\n", b""
                ]),
            ):
                sources = MODULE.source_evidence("a" * 40)
            self.assertEqual(len(sources), 119)
            self.assertEqual(
                sources["historic_000"],
                hashlib.sha256(b"SELECT 1;\n").hexdigest(),
            )

    def test_production_frontier_five_prior_plus_sixth(self):
        sources = {f"historic_{i:03d}": "a" * 64 for i in range(112)}
        sources.update({name: "b" * 64 for name in MODULE.SATCHEL})
        history = "\n".join(f"historic_{i:03d}|{'a'*64}|A" for i in range(112))
        history += "\nlegacy_apr_1|" + "c"*64 + "|R"
        history += "\nlegacy_apr_2|" + "d"*64 + "|R"
        with mock.patch.object(MODULE, "psql", side_effect=[
            "aoe2hd_db|5432|/var/lib/postgresql/16/main|160015",
            history, "0",
        ]):
            result = MODULE.production_frontier(sources)
        self.assertEqual(result["completed"], 112)
        self.assertEqual(result["rolled_back"], 2)
        self.assertEqual(tuple(result["pending"]), MODULE.SATCHEL)

    def test_production_frontier_fails_checksum_drift(self):
        sources = {f"historic_{i:03d}": "a" * 64 for i in range(112)}
        sources.update({name: "b" * 64 for name in MODULE.SATCHEL})
        history = "\n".join(
            f"historic_{i:03d}|{('f' if i==7 else 'a')*64}|A"
            for i in range(112)
        )
        history += "\nlegacy_apr_1|" + "c"*64 + "|R"
        history += "\nlegacy_apr_2|" + "d"*64 + "|R"
        with mock.patch.object(MODULE, "psql", side_effect=[
            "aoe2hd_db|5432|/var/lib/postgresql/16/main|160015", history,
        ]):
            with self.assertRaisesRegex(MODULE.RehearsalStop, "checksum"):
                MODULE.production_frontier(sources)

    def test_rehearsal_success_removes_only_shadow(self):
        with (
            mock.patch.object(MODULE, "postgres", return_value=b"") as pg,
            mock.patch.object(MODULE, "schema_bytes", return_value=b"same-schema"),
            mock.patch.object(MODULE, "apply_to_shadow") as apply,
            mock.patch.object(MODULE, "cohort_sql", return_value=b"BEGIN; ROLLBACK;"),
        ):
            result = MODULE.rehearse()
        statements = [c.args[1] for c in apply.call_args_list]
        self.assertEqual(statements, [b"same-schema", b"BEGIN; ROLLBACK;"])
        sql_cmds = [" ".join(c.args) for c in pg.call_args_list]
        self.assertEqual(sum("CREATE DATABASE" in c for c in sql_cmds), 1)
        self.assertEqual(sum("DROP DATABASE" in c for c in sql_cmds), 1)
        self.assertNotIn('DROP DATABASE "aoe2hd_db"', " ".join(sql_cmds))
        self.assertTrue(result["disposable_database_removed"])
        self.assertEqual(result["pending_migration_count"], 7)
        self.assertTrue(result["pending_migrations_exercised"])
        self.assertFalse(result["production_mutated"])
        self.assertFalse(result["production_data_copied"])

    def test_explicit_mismatch_diagnostic_exercises_sql_but_never_certifies(self):
        # Source/restore textual divergence is real: only the disposable
        # shadow may run the migration cohort; this is NEVER a release PASS.
        with (
            mock.patch.object(MODULE, "postgres", return_value=b"") as pg,
            mock.patch.object(MODULE, "schema_bytes",
                              side_effect=[b"source ddl", b"restored ddl", b"restored ddl"]),
            mock.patch.object(MODULE, "apply_to_shadow") as apply,
            mock.patch.object(MODULE, "cohort_sql", return_value=b"BEGIN; ROLLBACK;"),
        ):
            result = MODULE.rehearse(diagnostic_only_on_schema_mismatch=True)
        self.assertEqual(result["status"], "DIAGNOSTIC_ONLY_SCHEMA_MISMATCH")
        self.assertFalse(result["schema_equivalent"])
        self.assertTrue(result["pending_migrations_exercised"])
        self.assertFalse(result["production_mutated"])
        self.assertFalse(result["custody_authorized"])
        self.assertTrue(result["disposable_database_removed"])
        self.assertEqual([x.args[1] for x in apply.call_args_list],
                         [b"source ddl", b"BEGIN; ROLLBACK;"])
        self.assertEqual(sum("DROP DATABASE" in " ".join(c.args)
                             for c in pg.call_args_list), 1)

    def test_mismatch_diagnostic_refuses_rollback_schema_drift(self):
        with (
            mock.patch.object(MODULE, "postgres", return_value=b"") as pg,
            mock.patch.object(MODULE, "schema_bytes",
                              side_effect=[b"source", b"restored", b"drifted"]),
            mock.patch.object(MODULE, "apply_to_shadow"),
            mock.patch.object(MODULE, "cohort_sql", return_value=b"BEGIN; ROLLBACK;"),
        ):
            with self.assertRaisesRegex(MODULE.RehearsalStop, "schema changed"):
                MODULE.rehearse(diagnostic_only_on_schema_mismatch=True)
        self.assertEqual(sum("DROP DATABASE" in " ".join(c.args)
                             for c in pg.call_args_list), 1)

    def test_diagnostic_flag_requires_explicit_shadow_authorization(self):
        with mock.patch.object(sys, "argv", [
            "rehearsal", "--source-sha", "a" * 40,
            "--diagnose-migrations-on-mismatch",
        ]):
            with self.assertRaises(SystemExit):
                MODULE.main()

    def test_diagnostic_result_exits_nonzero_and_cannot_be_release_pass(self):
        with (
            mock.patch.object(sys, "argv", [
                "rehearsal", "--source-sha", "a" * 40,
                "--rehearse", "--authorize-shadow-database",
                "--diagnose-migrations-on-mismatch",
            ]),
            mock.patch.object(MODULE, "invoke", return_value=b""),
            mock.patch.object(MODULE, "source_evidence", return_value={"x": "y"}),
            mock.patch.object(MODULE, "production_frontier",
                              return_value={"completed": 112, "rolled_back": 2,
                                            "pending": list(MODULE.SATCHEL)}),
            mock.patch.object(MODULE, "rehearse",
                              return_value={"status": "DIAGNOSTIC_ONLY_SCHEMA_MISMATCH",
                                            "production_mutated": False}) as rehearse,
            redirect_stdout(io.StringIO()) as output,
        ):
            code = MODULE.main()
        self.assertEqual(code, 2)
        self.assertIn("DIAGNOSTIC_ONLY_SCHEMA_MISMATCH", output.getvalue())
        rehearse.assert_called_once_with(
            explain_schema_mismatch=False,
            diagnostic_only_on_schema_mismatch=True,
        )

    def test_rehearsal_error_still_drops_shadow(self):
        with (
            mock.patch.object(MODULE, "postgres", return_value=b"") as pg,
            mock.patch.object(MODULE, "schema_bytes", return_value=b"same-schema"),
            mock.patch.object(MODULE, "apply_to_shadow",
                side_effect=MODULE.RehearsalStop("synthetic SQL failed")),
        ):
            with self.assertRaisesRegex(MODULE.RehearsalStop, "synthetic SQL failed"):
                MODULE.rehearse()
        self.assertTrue(any("DROP DATABASE" in " ".join(c.args)
                            for c in pg.call_args_list))

    def test_cleanup_failure_never_claims_success(self):
        def pg(*args, **kwargs):
            if any("DROP DATABASE" in a for a in args):
                raise MODULE.RehearsalStop("cleanup refused")
            return b""
        with (
            mock.patch.object(MODULE, "postgres", side_effect=pg),
            mock.patch.object(MODULE, "schema_bytes", return_value=b"same-schema"),
            mock.patch.object(MODULE, "apply_to_shadow"),
            mock.patch.object(MODULE, "cohort_sql", return_value=b"BEGIN; ROLLBACK;"),
        ):
            with self.assertRaisesRegex(MODULE.RehearsalStop, "cleanup failed"):
                MODULE.rehearse()

    def test_default_cli_mode_does_not_rehearse(self):
        with (
            mock.patch.object(sys, "argv", ["rehearsal", "--source-sha", "a" * 40]),
            mock.patch.object(MODULE, "invoke", return_value=b""),
            mock.patch.object(MODULE, "source_evidence", return_value={"a": "b"}),
            mock.patch.object(MODULE, "production_frontier",
                return_value={"completed": 112, "rolled_back": 2,
                              "pending": list(MODULE.SATCHEL)}),
            mock.patch.object(MODULE, "rehearse") as rehearse,
            redirect_stdout(io.StringIO()) as output,
        ):
            code = MODULE.main()
        self.assertEqual(code, 0)
        rehearse.assert_not_called()
        self.assertIn("READ-ONLY", output.getvalue())

    def test_cli_rejects_rehearse_without_explicit_authorization(self):
        with mock.patch.object(sys, "argv", [
            "rehearsal", "--source-sha", "a"*40, "--rehearse",
        ]):
            with self.assertRaises(SystemExit):
                MODULE.main()


    def test_schema_fingerprint_ignores_only_verified_pg_dump_nonce(self):
        def dump(token, ddl="CREATE TABLE public.users(id integer);"):
            return (
                "-- PostgreSQL database dump\n"
                + "\\restrict " + token + "\n"
                + ddl + "\n"
                + "\\unrestrict " + token + "\n"
                + "-- PostgreSQL database dump complete\n"
            ).encode()
        a, b = "a" * 64, "b" * 64
        self.assertEqual(
            MODULE.schema_fingerprint(dump(a)),
            MODULE.schema_fingerprint(dump(b)),
        )
        self.assertNotEqual(
            MODULE.schema_fingerprint(dump(a)),
            MODULE.schema_fingerprint(dump(a, "CREATE TABLE public.users(id bigint);")),
        )
        self.assertEqual(
            MODULE.schema_fingerprint(b"CREATE TABLE users(id INTEGER);\n"),
            hashlib.sha256(b"CREATE TABLE users(id INTEGER);\n").hexdigest(),
        )

    def test_schema_fingerprint_rejects_mismatched_or_duplicated_nonce(self):
        a, b = "a" * 64, "b" * 64
        malformed = [
            ("\\restrict " + a + "\n\\unrestrict " + b + "\n").encode(),
            ("\\restrict " + a + "\n").encode(),
            ("\\unrestrict " + a + "\n").encode(),
            ("\\restrict " + a + "\n\\restrict " + a
             + "\n\\unrestrict " + a + "\n").encode(),
            ("SELECT 1;\n" * 20 + "\\restrict " + a + "\n"
             + "\\unrestrict " + a + "\n").encode(),
        ]
        for payload in malformed:
            with self.subTest(payload=payload[:20]), self.assertRaises(
                MODULE.RehearsalStop
            ):
                MODULE.schema_fingerprint(payload)


    def test_schema_delta_is_bounded_and_does_not_echo_source_sql(self):
        private_source = (
            b"-- PostgreSQL database dump\n"
            b"CREATE TABLE public.internal_secret(credential text DEFAULT 'TOP_PRIVATE_A');\n"
            b"COMMENT ON TABLE public.internal_secret IS 'HIDDEN_HOLDING_B';\n"
        )
        shadow = (
            b"-- PostgreSQL database dump\n"
            b"CREATE TABLE public.internal_secret(credential text);\n"
            b"COMMENT ON TABLE public.internal_secret IS 'DIFFERENT_C';\n"
        )
        result = MODULE.describe_schema_delta(private_source, shadow)
        self.assertIn("source_lines=3", result)
        self.assertIn("source_kind=CREATE", result)
        self.assertIn("shadow_kind=CREATE", result)
        self.assertIn("source_line_sha12=", result)
        for secret in ("TOP_PRIVATE_A", "HIDDEN_HOLDING_B", "DIFFERENT_C",
                       "internal_secret", "credential"):
            self.assertNotIn(secret, result)

    def test_schema_delta_identifies_function_section_without_disclosing_sql(self):
        source = (
            "-- Name: secret_settlement; Type: FUNCTION; Schema: public; Owner: private_user\n"
            "CREATE FUNCTION public.secret_settlement() RETURNS text AS $\n"
            "    SELECT 'owner-signer-secret-123'::regclass, 'aoe2hd_db';\n"
            "$ LANGUAGE sql;\n"
        ).encode()
        shadow = (
            "-- Name: secret_settlement; Type: FUNCTION; Schema: public; Owner: private_user\n"
            "CREATE FUNCTION public.secret_settlement() RETURNS text AS $\n"
            "    SELECT 'other-private-secret-456'::regclass, 'aoe2war_satchel_shadow_test';\n"
            "$ LANGUAGE sql;\n"
        ).encode()
        out = MODULE.describe_schema_delta(source, shadow)
        self.assertIn("source_section=FUNCTION", out)
        self.assertIn("shadow_section=FUNCTION", out)
        self.assertIn("source_clues=LIVE_DATABASE_LITERAL,REGCLASS_CAST,CAST_EXPRESSION", out)
        self.assertIn("shadow_clues=SHADOW_DATABASE_LITERAL,REGCLASS_CAST,CAST_EXPRESSION", out)
        for private in (
            "secret_settlement", "private_user", "owner-signer-secret-123",
            "other-private-secret-456", "aoe2hd_db",
            "aoe2war_satchel_shadow_test",
        ):
            self.assertNotIn(private, out)

    def test_schema_delta_rejects_unrecognized_dump_section_type(self):
        source = (
            "-- Name: a_secret; Type: PRIVATE SECRET; Schema: public; Owner: nobody\n"
            "    source-123\n"
        ).encode()
        shadow = (
            "-- Name: a_secret; Type: PRIVATE SECRET; Schema: public; Owner: nobody\n"
            "    shadow-456\n"
        ).encode()
        out = MODULE.describe_schema_delta(source, shadow)
        self.assertIn("source_section=OTHER", out)
        self.assertIn("shadow_section=OTHER", out)
        self.assertNotIn("PRIVATE SECRET", out)
        self.assertNotIn("a_secret", out)

    def test_schema_delta_ignores_validated_pg_dump_nonce(self):
        prefix = "-- PostgreSQL database dump\n"
        suffix = "-- PostgreSQL database dump complete\n"
        def dump(nonce):
            return (
                prefix + "\\restrict " + nonce + "\n"
                + "CREATE TABLE public.test(id bigint);\n"
                + "\\unrestrict " + nonce + "\n" + suffix
            ).encode("utf-8")
        a, b = dump("a" * 64), dump("b" * 64)
        self.assertEqual(MODULE.schema_fingerprint(a),
                         MODULE.schema_fingerprint(b))
        self.assertIn("difference not localized",
                      MODULE.describe_schema_delta(a, b))

    def test_schema_delta_large_input_stays_bounded(self):
        massive = b"SELECT 1;\n" * 30_001
        out = MODULE.describe_schema_delta(massive, massive + b"SELECT 2;\n")
        self.assertIn("too large", out)
        self.assertNotIn("SELECT", out)

    def test_shadow_mismatch_diagnostics_fail_closed_and_cleanup(self):
        source = b"CREATE TABLE public.private_src(id int);\n"
        shadow = b"CREATE TABLE public.private_src(id bigint);\n"
        with (
            mock.patch.object(MODULE, "postgres", return_value=b"") as pg,
            mock.patch.object(MODULE, "schema_bytes", side_effect=[source, shadow]),
            mock.patch.object(MODULE, "apply_to_shadow") as apply,
            mock.patch.object(MODULE, "cohort_sql") as cohort,
        ):
            with self.assertRaises(MODULE.RehearsalStop) as caught:
                MODULE.rehearse(explain_schema_mismatch=True)
        self.assertIn("shadow schema not equal", str(caught.exception))
        self.assertIn("source_kind=CREATE", str(caught.exception))
        self.assertNotIn("private_src", str(caught.exception))
        self.assertEqual(apply.call_count, 1)
        cohort.assert_not_called()
        statements = [" ".join(c.args) for c in pg.call_args_list]
        self.assertEqual(sum("CREATE DATABASE" in s for s in statements), 1)
        self.assertEqual(sum("DROP DATABASE" in s for s in statements), 1)

    def test_schema_delta_flag_denied_outside_authorized_rehearsal(self):
        with mock.patch.object(sys, "argv", [
            "rehearsal", "--source-sha", "a" * 40, "--explain-schema-mismatch",
        ]):
            with self.assertRaises(SystemExit):
                MODULE.main()


if __name__ == "__main__":
    unittest.main()
