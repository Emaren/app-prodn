"""F4 deterministic baseline metrics and F5 frozen session envelopes."""
from __future__ import annotations
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import Rejected, SCHEMA
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher
from foundry_checkpoint import FrozenAgentCheckpoints
from nightforge_benchmark import (
    CASES, evaluate_codes, run_deterministic_baseline, render_benchmark_json,
)

REPO=Path(__file__).resolve().parents[3]
HEAD=subprocess.check_output(["git","-C",str(REPO),"rev-parse","HEAD"],
                             text=True).strip()
ORIGIN=subprocess.check_output(
    ["git","-C",str(REPO),"remote","get-url","origin"],text=True).strip()
EV=json.dumps({"schema":"kingdom.foundry.evidence.v1",
               "source":"source-tests","status":"FAILED"},
              sort_keys=True,separators=(",",":")).encode()


class BenchmarkAndFrozenAgentTests(unittest.TestCase):
    def test_deterministic_12_known_answers_and_actual_m1_profiling(self):
        report=run_deterministic_baseline(loops=3)
        self.assertEqual(report["cases"],12)
        self.assertEqual(report["correct"],12)
        self.assertEqual(report["accuracy"],1)
        self.assertEqual(report["falsePositiveRate"],0)
        self.assertEqual(report["falseNegativeRate"],0)
        self.assertEqual(report["evaluatedObservations"],36)
        self.assertGreater(report["medianLatencyMs"],0)
        self.assertGreater(report["peakPythonTracedMemoryBytes"],0)
        self.assertEqual(report["llmCalls"],0)
        self.assertFalse(report["productionInferenceAdmitted"])
        self.assertEqual(report["hel1ResidentInference"],"HOLD")
        self.assertEqual(json.loads(render_benchmark_json(report))["cases"],12)

    def test_model_code_comparison_detects_false_positive_and_false_negative(self):
        expected={case.id:case.expected_code for case in CASES}
        first=evaluate_codes(expected)
        self.assertEqual(first["correct"],12)
        expected["ci_passed"]="GITHUB_CHECK_FAILED"
        expected["storage_low"]="STORAGE_CAPACITY_VISUAL_ONLY"
        changed=evaluate_codes(expected)
        self.assertEqual(changed["fp"],1)
        self.assertEqual(changed["fn"],1)
        self.assertEqual(changed["correct"],10)

    def test_invalid_model_outputs_cases_and_unbounded_loops_denied(self):
        codes={case.id:case.expected_code for case in CASES}
        with self.assertRaises(Rejected):
            evaluate_codes({**codes,"FINANCIAL_APPROVE":"GO"})
        with self.assertRaises(Rejected):
            evaluate_codes({**codes,"ci_passed":"EXECUTE_WITHOUT_REVIEW"})
        for loops in (0,101,"100",True):
            with self.subTest(loops=loops),self.assertRaises(Rejected):
                run_deterministic_baseline(loops=loops)

    def test_no_weight_loader_network_or_resident_inference_code(self):
        source=(REPO/"tools/kingdom-foundry/nightforge_benchmark.py").read_text()
        for bad in ("torch.load(","transformers.","requests.",
                    "subprocess.","curl ","Popen(","os.system","openai."):
            self.assertNotIn(bad,source)

    def _setup_checkpoint(self):
        tmp=TemporaryDirectory(prefix="f5-sealed-",dir=REPO)
        self.addCleanup(tmp.cleanup)
        folder=Path(tmp.name)
        folder.chmod(0o700)
        path=folder/"journal.sqlite"
        roster={("PRODUCT_C","source-tests"):TrustedRepo("app-prodn",
            REPO,HEAD,ORIGIN)}
        journal=SecureJournal(path,REPO,roster)
        self.addCleanup(journal.close)
        event={"schema_version":SCHEMA,
            "event_id":"foundry-checkpoint-000001",
            "observed_utc":"2026-11-10T05:30:00Z",
            "source":"source-tests","lane":"PRODUCT_C","kind":"test_failure",
            "severity":"warning","source_sha":HEAD,
            "summary":"Source qualified nonfinancial test observation",
            "evidence_ref":"receipt://event/"+sha256(EV).hexdigest()}
        recorded=journal.ingest(json.dumps(event).encode(),EV)
        self.assertEqual(recorded["status"],"RECORDED")
        dispatcher=DurableDispatcher(journal,daily_cap_cents=100)
        job=dispatcher.enqueue(recorded["sequence"],
            "app-prodn:foundry/checkpoint",estimated_cost_cents=50,
            now_ms=1_800_000_000_000)
        return path,roster,journal,job["job_id"]

    def test_f5_sealed_future_session_hash_only_persists_without_execution(self):
        path,roster,journal,job_id=self._setup_checkpoint()
        future=FrozenAgentCheckpoints(journal)
        args={"source_sha":HEAD,"provider":"CODEX_SDK_FUTURE",
              "remote_session_digest":"a"*64,"proof_digest":"b"*64,
              "max_cents":40,"max_turns":2}
        first=future.seal(job_id,**args)
        self.assertEqual(first["status"],"SEALED_HOLD_NO_AGENT_ADMISSION")
        self.assertFalse(first["executionEnabled"])
        duplicate=future.seal(job_id,**args)
        self.assertEqual(duplicate["status"],"DUPLICATE_FROZEN_CHECKPOINT")
        other=SecureJournal(path,REPO,roster)
        self.addCleanup(other.close)
        DurableDispatcher(other)
        view=FrozenAgentCheckpoints(other).inspect(job_id)
        self.assertFalse(view["executionEnabled"])
        self.assertFalse(view["humanApprovalVerified"])
        self.assertEqual(view["currentAgentSessionId"],None)
        self.assertEqual(view["apiCredential"],None)
        self.assertNotIn("a"*64,json.dumps(view))
        self.assertNotIn("b"*64,json.dumps(view))
        self.assertEqual(view["nextStep"],
            "PENDING_EXPLICIT_SOURCE_AND_OWNER_ADMISSION")

    def test_f5_wrong_provider_budget_source_and_raw_session_denied(self):
        _,_,journal,job_id=self._setup_checkpoint()
        f5=FrozenAgentCheckpoints(journal)
        base={"source_sha":HEAD,"provider":"CODEX_SDK_FUTURE",
              "remote_session_digest":"a"*64,"proof_digest":"b"*64,
              "max_cents":50,"max_turns":1}
        for update in (
            {"provider":"CHATGPT_WEB_SCRAPER"},
            {"source_sha":"0"*40},
            {"remote_session_digest":"real-private-session-id"},
            {"proof_digest":"no-signature"},
            {"max_cents":51},
            {"max_turns":11},
            {"max_turns":0},
            {"max_cents":True},
        ):
            with self.subTest(update=update),self.assertRaises(Rejected):
                f5.seal(job_id,**{**base,**update})
        self.assertEqual(f5.db.execute(
            "SELECT count(*) FROM f5_checkpoints").fetchone()[0],0)

    def test_f5_replayed_checkpoint_changed_scope_denied(self):
        _,_,journal,job_id=self._setup_checkpoint()
        f5=FrozenAgentCheckpoints(journal)
        base={"source_sha":HEAD,"provider":"OPENAI_API_FUTURE",
              "remote_session_digest":"a"*64,"proof_digest":"b"*64,
              "max_cents":30,"max_turns":2}
        f5.seal(job_id,**base)
        with self.assertRaisesRegex(Rejected,"REPLAY_COLLISION"):
            f5.seal(job_id,**{**base,"max_cents":31})

    def test_f5_never_contains_an_executor_or_financial_credentials(self):
        source=(REPO/"tools/kingdom-foundry/foundry_checkpoint.py").read_text()
        for bad in ("subprocess","requests.","os.system","eval(","exec(",
                    "client.responses.create","client.sessions.resume",
                    "openai.OpenAI(", "selenium", "playwright"):
            self.assertNotIn(bad,source)
        self.assertIn("HOLD_NO_AGENT_ADMISSION",source)


if __name__=="__main__":
    unittest.main()
