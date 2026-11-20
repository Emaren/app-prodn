"""Factory V1 reconciliation negative contracts. All fixtures synthetic/offline.

Production truth requires separate live HEL1 observations and actual Chrome sessions.
"""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parents[1]/"scripts/aoe2_production_reconciliation_gate_v1.py"
spec=importlib.util.spec_from_file_location("aoe2_prod_reconcile",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SRC="5339a981acbf15ea8d3c4393cb1fc75bc300ea45"
BUILD="sn6eybJdBu7mluOQByc4M"

def fixture():
    http={
        "root":{"http":200,"buildHeader":BUILD},
        "lobby":{"http":200,
          "criticalImage":{"http":200,"contentType":"image/webp","bytesSampled":4096},
          "portraitSamples":[{"http":200,"contentType":"image/webp"}]},
        "archive":{"http":200,"listCount":3,"reportedTotal":6917,"sampleBattleId":64362},
        "lobbyRecent":{"http":200,"listCount":12,"truthFlag":True,"sampleBattleId":64362},
        "lobbySnapshot":{"http":200,"listCount":12,"truthFlag":"snapshot","sampleBattleId":64362},
        "lobbyChat":{"http":200,"listCount":0},
        "libraryGames":{"http":200,"listCount":48,"reportedTotal":7153},
        "traffic":{"http":200,"listCount":131,"latestDate":"2026-10-19",
                   "coverageEndedAt":"2026-10-19"},
        "anonymousSession":{"http":401},
        "socialChat":{"http":401}
    }
    ports={str(p):p in (3030,3032,3033,9447) for p in
           (3030,3032,3033,9447,8092,8093,8094,8095)}
    return {"workingDirectory":"/var/lib/aoe2war-web-prod-"+SRC[:12],
            "http":http,"ports":ports,
            "units":{"aoe2hdbets-web-prod":"active","aoe2war-social-writer":"inactive",
                     "traffic-v2-forward-ledger-aoe2hdbets.timer":"active",
                     "traffic-public-audience-aoe2hdbets.timer":"inactive"},
            "rootAvailableBytes":15*1024**3,
            "dataAvailableBytes":30*1024**3}

def checked(observation,profile="lobby",phase="activate",source=SRC,build=BUILD,
            proof=None,candidate_source=None,candidate_build=None):
    with tempfile.TemporaryDirectory() as td:
        arguments=["reconcile","--expect-source",source,"--expect-build",build,
                   "--phase",phase,"--profile",profile,"--out-dir",td]
        if candidate_source is not None:
            arguments.extend(["--candidate-source",candidate_source])
        if candidate_build is not None:
            arguments.extend(["--candidate-build",candidate_build])
        if proof is not None:
            proof_file=Path(td)/"private-proof"
            raw=json.dumps(proof,sort_keys=True).encode()
            proof_file.write_bytes(raw)
            proof_file.chmod(0o600)
            arguments.extend(["--verified-runtime-proof",str(proof_file),
                              "--runtime-proof-sha256",__import__("hashlib").sha256(raw).hexdigest()])
        completed=SimpleNamespace(returncode=0,stdout=json.dumps(observation),stderr="")
        output=io.StringIO()
        with patch.object(m.subprocess,"run",return_value=completed), \
             patch.object(sys,"argv",arguments), contextlib.redirect_stdout(output):
            code=m.main()
        reports=list(Path(td).glob("*.json"))
        assert len(reports)==1
        raw=reports[0].read_bytes()
        assert reports[0].stat().st_mode&0o777==0o600
        report=json.loads(raw)
        assert report["scope"].startswith("M1 nonroot")
        assert len(list(Path(td).glob("*.md")))==1
        return code,report,json.loads(output.getvalue())

class FactoryReconciliationTests(unittest.TestCase):
    @staticmethod
    def runtime_proof(source=SRC,build=BUILD,runtime_bytes=618531105):
        return {"status":"PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER",
                "source_commit":source,"build_id":build,
                "runtime_archive_bytes":runtime_bytes}

    def test_pre_stage_exact_factory_budget_can_pass_under_12gib(self):
        f=fixture()
        f["rootAvailableBytes"]=6*1024**3+618531105+25000000
        code,body,summary=checked(f,phase="pre",proof=self.runtime_proof())
        self.assertEqual(code,0)
        self.assertEqual(body["lobbyAcceptance"],"PASS")
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="root_headroom_for_phase")["detail"]["minimumBytes"],
            6*1024**3+618531105)

    def test_pre_stage_existing_library_plus_distinct_candidate_proof(self):
        f=fixture()
        candidate_source="da0bee282e525243ab6d307c0afd7ec0283b9b9d"
        candidate_build="3IEUWQ_eUijufJlmrv10_"
        proof=self.runtime_proof(candidate_source,candidate_build)
        f["http"]["lobbyChat"]["http"]=500 # old Library known bug
        f["http"]["lobbyRecent"]["listCount"]=0
        f["http"]["lobbySnapshot"]["listCount"]=0
        f["rootAvailableBytes"]=6*1024**3+618531105+25000000
        code,body,_=checked(f,profile="baseline",phase="pre",proof=proof,
                            candidate_source=candidate_source,candidate_build=candidate_build)
        self.assertEqual(code,0)
        self.assertEqual(body["acceptance"],"PASS")
        self.assertEqual(body["expected"]["sourceSha"],SRC)
        self.assertEqual(body["expected"]["candidateSourceSha"],candidate_source)
        self.assertEqual(body["expected"]["candidateBuildId"],candidate_build)
        self.assertEqual(body["lobbyAcceptance"],"HOLD")

    def test_pre_stage_rejects_candidate_proof_substituted_from_live(self):
        f=fixture()
        candidate_source="da0bee282e525243ab6d307c0afd7ec0283b9b9d"
        candidate_build="3IEUWQ_eUijufJlmrv10_"
        code,body,_=checked(f,profile="baseline",phase="pre",
                            candidate_source=candidate_source,candidate_build=candidate_build,
                            proof=self.runtime_proof())
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"] if
            x["name"]=="exact_factory_runtime_proof_required")["state"],"HOLD")
        self.assertEqual(body["acceptance"],"HOLD")

    def test_pre_stage_one_byte_below_factory_budget_holds(self):
        f=fixture()
        f["rootAvailableBytes"]=6*1024**3+618531105-1
        code,body,_=checked(f,phase="pre",proof=self.runtime_proof())
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="root_headroom_for_phase")["state"],"HOLD")

    def test_pre_stage_missing_or_wrong_proof_holds(self):
        f=fixture()
        code,body,_=checked(f,phase="pre")
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="exact_factory_runtime_proof_required")["state"],"HOLD")
        code,body,_=checked(f,phase="pre",proof=self.runtime_proof(source="0"*40))
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="exact_factory_runtime_proof_required")["state"],"HOLD")

    def test_real_data_lobby_can_pass_even_if_traffic_publication_stale(self):
        code,body,summary=checked(fixture())
        self.assertEqual(code,0)
        self.assertEqual(summary["status"],"PASS")
        self.assertEqual(body["lobbyAcceptance"],"PASS")
        self.assertEqual(body["playerAcceptance"],"HOLD")
        self.assertEqual({x["state"] for x in body["checks"]
            if x["name"]=="traffic_current_certified_publication"},{"HOLD"})

    def test_true_archive_but_empty_recent_tiles_hard_fail(self):
        f=fixture()
        f["http"]["lobbyRecent"]["listCount"]=0
        f["http"]["lobbySnapshot"]["listCount"]=0
        code,body,_=checked(f)
        self.assertEqual(code,2)
        rejects={x["name"] for x in body["checks"] if x["state"]=="HOLD"}
        self.assertIn("lobby_recent_matches_not_false_empty",rejects)
        self.assertIn("lobby_snapshot_recent_matches_not_false_empty",rejects)
        self.assertNotIn("real_nonempty_archive",rejects)

    def test_wrong_build_and_source_fail(self):
        code,body,_=checked(fixture(),source="0"*40,build="wrongBuild123")
        self.assertEqual(code,2)
        problems={x["name"] for x in body["checks"] if x["state"]=="HOLD"}
        self.assertIn("deployed_build",problems)
        self.assertIn("deployed_source",problems)

    def test_broken_portrait_fails(self):
        f=fixture()
        f["http"]["lobby"]["portraitSamples"][0]["http"]=400
        code,body,_=checked(f)
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="critical_lobby_image_http")["state"],"HOLD")

    def test_rollback_checks_previous_source_without_inheriting_known_lobby_failure(self):
        f=fixture()
        f["http"]["lobbyChat"]["http"]=500
        f["http"]["lobbyRecent"]["listCount"]=0
        f["http"]["lobbySnapshot"]["listCount"]=0
        f["rootAvailableBytes"]=3*1024**3
        code,body,_=checked(f,profile="rollback",phase="rollback")
        self.assertEqual(code,0)
        self.assertEqual(body["acceptance"],"PASS")
        self.assertEqual(body["lobbyAcceptance"],"HOLD")
        code,_,_=checked(f,profile="baseline",phase="pre")
        self.assertEqual(code,2)  # No exact runtime proof; never pass the baseline.

    def test_player_never_self_certifies_browser_messages(self):
        f=fixture()
        f["units"]["aoe2war-social-writer"]="active"
        f["units"]["traffic-public-audience-aoe2hdbets.timer"]="active"
        f["http"]["traffic"]["coverageEndedAt"]="2026-11-20"
        code,body,_=checked(f,profile="player",phase="reactivate")
        self.assertEqual(code,2)
        self.assertEqual(body["playerAcceptance"],"HOLD")
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="real_Emaren_Scribe_persisted_messages_not_yet_supplied")["state"],"HOLD")

    def test_financial_listener_always_refuses(self):
        f=fixture();f["ports"]["8092"]=True
        code,body,_=checked(f)
        self.assertEqual(code,2)
        self.assertEqual(next(x for x in body["checks"]
            if x["name"]=="runtime_ports_and_finance_isolation")["state"],"HOLD")

    def test_null_payload_fails_closed(self):
        code,body,_=checked({})
        self.assertEqual(code,2)
        self.assertEqual(body["lobbyAcceptance"],"HOLD")

if __name__=="__main__":
    unittest.main()
