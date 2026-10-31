"""G R25 P3: source cards != autonomous workers; run-up is an evidence projection."""
import copy, importlib.util, json, pathlib, subprocess, sys, tempfile, unittest
FILE=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_r25_kingdom_runup_read_model.py"
spec=importlib.util.spec_from_file_location("runup_model",FILE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def receipt(id="first",phase="PUBLIC_ROUTED",kind="PUBLIC_HTTP",status="PASS"):
    return {"schema":"aoe2war.kingdom-runup.read-receipt.v1","id":id,
            "phase":phase,"verdict":status,"evidence_kind":kind,
            "source_ref":"https://github.com/Emaren/app-prodn/issues/934#issuecomment-6545637865",
            "source_sha":m.SOURCE,"evidence_sha256":"a"*64,
            "observed_at":"2026-10-31T14:30:00Z",
            "expires_at":"2026-10-31T15:00:00Z",
            "detail":"SOURCE_TEST_ONLY_NOT_ACTUAL_NATIVE_WITNESS",
            "verified_by":"NONE"}
class KingdomRunup(unittest.TestCase):
    def test_registry_ids_and_supervisory_roles_not_os_workers(self):
        r,bindings,by=m.canonical()
        self.assertEqual(len(by),14)
        self.assertEqual(r["umbrella"]["id"],"aoe2war")
        self.assertEqual(len(r["supervisory_roles"]),2)
        self.assertNotIn("system-doctor",by)
        self.assertNotIn("system-shepherd",by)
        self.assertEqual({v["lane"] for v in bindings["bindings"]},set("BCDEFG"))
        self.assertFalse(any(v["independent_live_worker_proven"] for v in by.values()))
    def test_owner_extracted_only_not_built_or_running_or_live(self):
        model=m.project()
        p=model["public"];a=model["admin"]
        self.assertEqual(p["pipeline"][1]["phase"],"SOURCE_EXTRACTED")
        self.assertEqual(p["pipeline"][1]["state"],"OWNER_REPORTED")
        self.assertEqual(p["pipeline"][2]["state"],"UNKNOWN")
        self.assertEqual(p["pipeline"][-1]["state"],"UNKNOWN")
        self.assertFalse(p["release_live_verified"])
        self.assertEqual(a["host_state"],"HOST_NATIVE_UNVERIFIED")
        self.assertEqual(a["live_state"],"LIVE_VERIFIED_NOT_ISSUED")
        self.assertEqual(len(a["os_cards"]),14)
        self.assertEqual(len(a["assigned_lanes"]),6)
        self.assertEqual({r["role_id"] for r in a["roles"]},
                         {"system-doctor","system-shepherd"})
        self.assertTrue(all(c["live_worker_status"]=="UNVERIFIED"
                            and c["live_pid"] is None for c in a["os_cards"]))
        self.assertTrue(all(not x["active_worker_proven"] for x in a["assigned_lanes"]))
        self.assertFalse(a["polling_started"])
        self.assertFalse(a["agent_jobs_started"])
        self.assertFalse(a["deployment_authority_granted"])
        text=json.dumps(p)
        self.assertNotIn("/var/lib",text)
        self.assertNotIn("2625090",text)
    def test_source_vs_host_vs_public_receipts_never_self_certify_live(self):
        with tempfile.TemporaryDirectory() as d:
            file=pathlib.Path(d)/"observations.jsonl"
            rows=[receipt(),receipt("second","LIVE_VERIFIED","ROLLBACK_RECEIPT")]
            file.write_text("".join(json.dumps(r)+"\n" for r in rows))
            read=m.project(receipts=file,at="2026-10-31T14:40:00Z")
            self.assertEqual(read["admin"]["evidence_count"],2)
            self.assertEqual(read["public"]["pipeline"][6]["state"],"REPORTED_PASS")
            self.assertEqual(read["public"]["pipeline"][7]["state"],
                             "AWAITING_INDEPENDENT_RELEASE_CERTIFICATION")
            self.assertFalse(read["public"]["release_live_verified"])
            stale=m.project(receipts=file,at="2026-10-31T15:10:00Z")
            self.assertEqual(stale["public"]["pipeline"][6]["state"],"STALE")
            self.assertEqual(stale["public"]["pipeline"][7]["state"],"STALE")
    def test_forged_or_unbounded_receipts_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            f=pathlib.Path(d)/"observations.jsonl"
            row=receipt()
            for change in [
              lambda x:x.__setitem__("source_sha","0"*40),
              lambda x:x.__setitem__("evidence_sha256","not-sha"),
              lambda x:x.__setitem__("verified_by","ROOT_ARBITRARY"),
              lambda x:x.__setitem__("phase","CERTIFIED_AUTONOMOUS"),
              lambda x:x.__setitem__("source_ref","https://bad.example"),
              lambda x:x.__setitem__("expires_at","2026-10-31T13:00:00Z"),
            ]:
                r=copy.deepcopy(row);change(r);f.write_text(json.dumps(r)+"\n")
                with self.assertRaises(m.ReadModelHold):m.read_observations(f)
            f.write_text(json.dumps(row)+"\n"+json.dumps(row)+"\n")
            with self.assertRaises(m.ReadModelHold):m.read_observations(f)
            f.write_bytes(b'{"a":1,"a":2}\n')
            with self.assertRaises(m.ReadModelHold):m.read_observations(f)
            f.write_bytes(b"X"*(m.RECEIPT_MAX+1))
            with self.assertRaises(m.ReadModelHold):m.read_observations(f)
    def test_unknown_canonical_os_alias_fails_without_inventing_new_os(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"binding.json"
            cross=json.loads(m.BINDINGS.read_text())
            cross["bindings"][0]["os_ids"].append("shepherd-os")
            p.write_text(json.dumps(cross))
            with self.assertRaises(m.ReadModelHold):m.canonical(bindings=p)
            reg=json.loads(m.REGISTRY.read_text())
            reg["subordinate_os"][0]["independent_live_worker_proven"]=True
            rp=pathlib.Path(d)/"registry.json";rp.write_text(json.dumps(reg))
            with self.assertRaises(m.ReadModelHold):m.canonical(registry=rp)
    def test_actual_offline_cli_public_admin_no_poll(self):
        for audience in ("public","admin"):
            p=subprocess.run([sys.executable,str(FILE),"--audience",audience],
                capture_output=True,text=True,timeout=10)
            self.assertEqual(p.returncode,0,p.stderr)
            output=json.loads(p.stdout)
            self.assertEqual(len(output["pipeline"]),8)
            self.assertNotIn("ssh_command",output)
        code=FILE.read_text()
        for forbidden in ("systemctl","ssh -T","git reset --hard","curl -X POST",
                          "setInterval(","fetch("):
            self.assertNotIn(forbidden,code)
if __name__=="__main__":unittest.main()
