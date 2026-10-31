"""Central Ledger v1 local tests: synthetic events are NOT live agent evidence."""
import copy, importlib.util, json, pathlib, subprocess, sys, tempfile, unittest
FILE=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_central_agent_ledger.py"
spec=importlib.util.spec_from_file_location("ledger_r25",FILE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def event(id="test-1",kind="ASSIGN",key="TEST_DIAGNOSTIC"):
    return {"id":id,"kind":kind,"lane":"G",
            "at":"2026-10-31T15:00:00Z",
            "source":"https://github.com/Emaren/app-prodn/issues/934#issuecomment-6544802773",
            "source_sha":None,"ci":"UNMEASURED","ci_url":None,"evidence_at":None,
            "assignment":"Synthetic test only","priority":"P0","capability":"postflight",
            "dependency":"F real cutover","next_operation":"Do not execute test evidence",
            "deploy_phase":"NOT_DEPLOYED","result":"ASSIGNED_NOT_CONFIRMED_ACTIVE",
            "diagnostic_key":key,"details":"SYNTHETIC_ONLY"}
def success(id="done-1"):
    e=event(id,"COMPLETE")
    e.update(result="PASS",source_sha="a"*40,ci="PASS",
             ci_url="https://github.com/Emaren/app-prodn/actions/runs/41212033277",
             evidence_at="2026-10-31T15:00:00Z")
    return e

class CentralLedger(unittest.TestCase):
    def test_seed_six_lanes_are_assignments_not_fake_active_sessions(self):
        seed=m.seed_load()
        self.assertEqual({x["lane"] for x in seed["assignments"]},set("BCDEFG"))
        self.assertEqual(seed["dispatch"]["candidate_sha"],
          "0cee3c836c4b0760478280c145e02e81e470ce0e")
        state=m.view(seed,[])
        self.assertEqual(state["agent_count"],6)
        self.assertEqual(state["agent_capacity"],1000)
        self.assertFalse(state["agents_confirmed_active"])
        for lane in "BCDEFG":
            self.assertEqual(state["agents"][lane]["result"],
                             "ASSIGNED_NOT_CONFIRMED_ACTIVE")
            self.assertFalse(state["agents"][lane]["active_session_verified"])
        self.assertIn("Do not repeat completed",m.prompt(state,"G"))
        self.assertIn("3030",m.prompt(state,"F"))

    def test_append_hash_chain_history_and_event_ids_durable(self):
        with tempfile.TemporaryDirectory() as d:
            log=pathlib.Path(d)/"events.jsonl"
            a=m.append(event(),log)
            self.assertEqual(a["seq"],1)
            self.assertEqual(a["prev_sha256"],m.ZERO)
            b=m.append(success(),log)
            self.assertEqual(b["seq"],2)
            self.assertEqual(b["prev_sha256"],a["sha256"])
            rows=m.read_events(log)
            self.assertEqual(len(rows),2)
            state=m.view(m.seed_load(),rows)
            self.assertIn("TEST_DIAGNOSTIC",state["completed_diagnostic_keys"])
            self.assertEqual(len(state["history"]["G"]),2)
            with self.assertRaises(m.LedgerHold):m.append(event("test-1"),log)
            with self.assertRaises(m.LedgerHold):
                m.append(event("another-assignment","ASSIGN"),log)
            with self.assertRaises(m.LedgerHold):
                m.append(success("repeat-complete"),log)
            corrupt=log.read_bytes().replace(b"SYNTHETIC_ONLY",b"SYNTHETIC_EDIT")
            log.write_bytes(corrupt)
            with self.assertRaises(m.LedgerHold):m.read_events(log)

    def test_reject_unbound_success_and_fake_live(self):
        bad=success()
        for fn in [
          lambda e:e.__setitem__("source_sha",None),
          lambda e:e.__setitem__("ci","UNMEASURED"),
          lambda e:e.__setitem__("evidence_at",None),
          lambda e:e.__setitem__("ci_url",None),
          lambda e:e.__setitem__("source","https://example.invalid"),
          lambda e:e.__setitem__("at","yesterday"),
          lambda e:e.__setitem__("kind","FAKE"),
          lambda e:e.__setitem__("lane","../../"),
        ]:
            e=copy.deepcopy(bad);fn(e)
            with self.assertRaises(m.LedgerHold):m.check_event(e)
        fake=success()
        fake["kind"]="EVIDENCE";fake["result"]="LIVE_VERIFIED"
        with self.assertRaises(m.LedgerHold):m.check_event(fake)

    def test_unknown_lane_requires_assignment(self):
        with tempfile.TemporaryDirectory() as d:
            log=pathlib.Path(d)/"log"
            other=event();other["lane"]="AGENT_1000";other["kind"]="EVIDENCE"
            with self.assertRaises(m.LedgerHold):m.append(other,log)
            other["kind"]="ASSIGN"
            row=m.append(other,log)
            self.assertEqual(row["seq"],1)
            self.assertEqual(m.view(m.seed_load(),m.read_events(log))["agent_count"],7)

    def test_dry_run_and_source_json_immutability(self):
        with tempfile.TemporaryDirectory() as d:
            log=pathlib.Path(d)/"log"
            result=m.append(event(),log,True)
            self.assertEqual(result["seq"],1)
            self.assertEqual(m.read_events(log),[])
            self.assertFalse(log.stat().st_size)
        with self.assertRaises(m.LedgerHold):
            m.parsed(b'{"a":1,"a":2}')
        with self.assertRaises(m.LedgerHold):
            m.parsed(b'{"a":NaN}')
        code=FILE.read_text()
        for forbidden in ["git reset --hard","git clean","systemctl restart","ssh root@"]:
            self.assertNotIn(forbidden,code)

    def test_cli_status_and_prompt_without_external_actions(self):
        r=subprocess.run([sys.executable,str(FILE),"validate"],capture_output=True,text=True,timeout=8)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(json.loads(r.stdout)["lanes"],6)
        r=subprocess.run([sys.executable,str(FILE),"prompt","--lane","G"],
                         capture_output=True,text=True,timeout=8)
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn("Session activity is NOT confirmed",r.stdout)
        self.assertIn("next operation",r.stdout.lower())
if __name__=="__main__":unittest.main()
