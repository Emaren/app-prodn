#!/usr/bin/env python3
"""Stop-state A05 one-use production recovery: source and negative contracts."""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase, mock
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/r25_a05_final_3032_recovery.py"
spec = importlib.util.spec_from_file_location("a05_final_3032_source", SOURCE)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
BODY = SOURCE.read_text()


class FinalStopped3032Tests(TestCase):
    def test_exact_immutable_artifact_and_existing_stopped_preimage(self):
        self.assertEqual(r.NEW_SOURCE, "5869b4ab08702be4b33860f7dda7d97b5de79424")
        self.assertEqual(r.CI_RUN, 41874361015)
        self.assertEqual(r.ARTIFACT_ID, 13346996291)
        self.assertEqual(r.BUILD_ID, "gNTYc83_9WWZDZURRW0QP")
        self.assertEqual(r.ARTIFACT_ZIP_SHA,
            "8b2297a46271f75e00a53da7b976ce2aeac7b8685a8c3488fec1e4e608c632e0")
        self.assertEqual(r.STAGE_RECEIPT_SHA,
            "ce7436919837553c1064c83f7421bd26db0f2b0971b30186394fa07a791a43fc")
        self.assertEqual(r.NEW_UNIT_SHA,
            "121f76699b1ceeda728b0e69fd1c2602a60ac1f4bb4f6fc979598d6bb74fa1bc")
        self.assertIn("CRITICAL_RUNTIME_CHANGED", BODY)
        self.assertIn("GITHUB_ARTIFACT_PROVENANCE_CHANGED", BODY)
        self.assertIn('c.production_archive(payload)', BODY)
        self.assertIn("CI_STAGE_RECEIPT_NOT_EXACT", BODY)

    def test_no_public_or_chain_or_financial_mutations(self):
        self.assertEqual(r.SCOPE, "A05_FINAL_STOPPED_NONFINANCIAL_3032_ONLY")
        self.assertIn("r.candidate_systemd(\"start\", UNIT.name)", BODY)
        self.assertNotIn('candidate_systemd("stop", "aoe2hdbets-web.service")', BODY)
        for forbidden in ("nginx -s reload", "systemctl restart nginx",
                          "wolo.service", "wolo-1", "8092", "8093",
                          "INSERT INTO bet_wagers", "UPDATE pending_wolo_claims",
                          "ALTER ROLE", "GRANT ALL ON"):
            self.assertNotIn(forbidden, BODY)
        self.assertIn('"public_cutover_authorized": False', BODY)
        self.assertIn('"financial_authorized": False', BODY)
        self.assertIn('"public_nginx_mutations": False', BODY)

    def test_consumed_rollback_journal_is_nonreplayable(self):
        prior={"status":"CONSUMED_DO_NOT_REPLAY","financial_authorized":False,
               "public_cutover_authorized":False}
        hold={"financial_authorized":False,"isolated_stop_commands_passed":True,
              "public_cutover_authorized":False,"reason_type":"Hold",
              "status":"CRITICAL_ROLLBACK_INCOMPLETE"}
        def read(path, mode):
            return json.dumps(prior if path.name=="entered.json" else hold).encode()
        with mock.patch.object(r,"sealed_bytes",side_effect=read),\
             mock.patch.object(r.Path,"exists",return_value=False):
            self.assertEqual(r.history()[1]["status"],"CRITICAL_ROLLBACK_INCOMPLETE")
            prior["status"]="PASS_MERGED"
            with self.assertRaisesRegex(r.Hold,"FAILED_PREVIOUS_NONCE"):
                r.history()

    def test_plan_refuses_missing_database_view_catalog_before_grant_or_journal(self):
        args=mock.Mock(nonce="c"*32,release_ref="f"*40,ci_run=123)
        c=mock.Mock()
        c.production_runtime_environment.return_value=({"SESSION_SECRET":"sealed"},"testdb","password")
        c.production_database_witness.side_effect=r.Hold("PRODUCTION_ADDITIONAL_PUBLIC_READ_MODELS_CHANGED")
        ready={"entered":{"plan":{"catalog":{"definer_identity_sha256":"a"*64}}}}
        with mock.patch.object(r,"JOURNALS",Path("/tmp/aoe2war-a05-never-created-test-journal-root")):
            with self.assertRaisesRegex(r.Hold,"PRODUCTION_ADDITIONAL_PUBLIC_READ_MODELS_CHANGED"):
                r.plan(args,c,None,ready)
        c.production_database_witness.assert_called_once()

    def test_execution_rejects_wrong_plan_hash_before_authentication(self):
        args=mock.Mock(plan_sha256="a"*64,release_ref="f"*40)
        c=mock.Mock()
        c.canonical.side_effect=r.canonical
        with mock.patch.object(r,"owner_grant") as owner:
            with self.assertRaisesRegex(r.Hold,"OWNER_BOUND_EXACT_PLAN_SHA_REQUIRED"):
                r.execute(args,c,None,{},{"nonce":"b"*32},None,"f"*64)
            owner.assert_not_called()

    def test_owner_grant_requires_committed_script_controller_and_security_scan(self):
        args=mock.Mock(release_ref="f"*40,nonce="a"*32,comment_id=99,
                       comment_sha256="b"*64)
        c=mock.Mock()
        source=b"source"
        first={"type":"file","encoding":"base64","content":"c291cmNl"}
        def get(path):
            if path.startswith("contents/"+r.SOURCE_PATH): return first
            raise AssertionError("Must not fetch controller after wrong source")
        c.production_github.side_effect=get
        with self.assertRaisesRegex(r.Hold,"RECOVERY_SOURCE_NOT_IN_EXACT_GITHUB_HEAD"):
            r.owner_grant(args,c,{},"0"*64)
        c.production_grant.assert_not_called()

    def test_negative_failure_stops_isolated_then_restores_exact_bytes(self):
        self.assertIn("for action, unit in ((\"stop\", r.TIMER), (\"stop\", r.REFRESH)",BODY)
        self.assertIn("r.write_atomic(CONTROLLER, ready[\"controller\"], 0o644)",BODY)
        self.assertIn("r.write_atomic(UNIT, ready[\"unit\"], 0o644)",BODY)
        self.assertIn("r.write_atomic(POLICY, ready[\"policy_raw\"], 0o400)",BODY)
        self.assertIn("STOPPED_NO_PUBLIC_CUTOVER",BODY)
        self.assertIn("CRITICAL_ISOLATED_STOP_INCOMPLETE",BODY)

    def test_readonly_audit_cannot_take_grant_or_start_website(self):
        src=BODY.split('if args.phase == "audit":',1)[1].split('need(NONCE.fullmatch',1)[0]
        self.assertIn("READONLY_AUDIT_CANNOT_TAKE_AUTHORIZATION",src)
        self.assertIn('"database"] = {"status": "HOLD"',src)
        self.assertNotIn("candidate_systemd",src)
        self.assertNotIn("write_atomic",src)

    def test_fresh_plan_exposes_one_use_nonfinancial_authority_only(self):
        self.assertIn("ONE_USE_NONCE_ALREADY_CONSUMED",BODY)
        self.assertIn("ONE_USE_AUTHENTIC_OWNER_GRANT_REQUIRED",BODY)
        self.assertIn("EXACT_ONE_USE_AUTHENTIC_OWNER_GRANT_REQUIRED",BODY)
        self.assertIn("PRODUCTION_THREE_JOB_CI_NOT_PASS", (ROOT/"scripts/r25_c_start_root.py").read_text())
        self.assertIn("sha(c.canonical(plan_data))",BODY)
        self.assertIn("PROTECTED_AUTH_FUNCTION_IDENTITY_CHANGED",BODY)
        self.assertIn("c.production_admission_steam_refresh()",BODY)
        self.assertIn("r.guest_probes()",BODY)
        self.assertIn("HOLD_ISOLATED_CONTENT_NOT_PUBLIC",BODY)


if __name__ == "__main__":
    unittest.main()
