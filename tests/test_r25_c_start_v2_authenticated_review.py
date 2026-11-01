"""Exact-head A01 reviewer provenance; all GitHub traffic mocked."""
import copy
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest import mock

BASE=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,BASE/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

mac=module("r25_c_provenance_mac","scripts/r25_c_start_recovery_v2_mac.py")
root=module("r25_c_provenance_root","scripts/r25_c_start_recovery_v2_root.py")
FENCE=chr(96)*3

class A01ReviewProvenance(unittest.TestCase):
    def facts(self):
        source="a"*40
        operator,launcher=b"root-bytes"*220,b"mac-bytes"*30
        verdict={"schema":mac.REVIEW_VERDICT_SCHEMA,"decision":"ACCEPT",
                 "scope":"RECOVERY_START_3031_V2_ONLY","source_sha":source}
        for label,data in (("operator",operator),("mac",launcher)):
            verdict.update({label+"_size":len(data),label+"_sha256":mac.sha(data),
                            label+"_blob":mac.blob(data)})
        review_body="R25_START_V2_SOURCE_REVIEW_ACCEPT\n"+FENCE+"json\n"+json.dumps(verdict)+"\n"+FENCE
        review={"id":17,"state":"APPROVED","commit_id":source,"user":{"login":"Timed-AutoMaton"},
                "author_association":"COLLABORATOR","submitted_at":"2026-11-01T18:20:00Z",
                "html_url":"https://github.com/Emaren/app-prodn/pull/1110#pullrequestreview-17",
                "body":review_body}
        manifest={"schema":"aoe2war.r25.c.start-source-review.v2","decision":"ACCEPT",
                  "scope":"RECOVERY_START_3031_V2_ONLY","independent_review":True,
                  "reviewer":"/root/security_review","publisher_is_reviewer_identity":False,
                  "source_sha":source,"github_review_provenance":{
                    "review_id":17,"reviewer_login":"Timed-AutoMaton",
                    "review_body_sha256":mac.sha(review_body.encode())},
                  "exact_head_ci":{"run_id":41321783192,"head_sha":source,
                                   "conclusion":"success","all_three_jobs_success":True}}
        for label,data in (("operator",operator),("mac",launcher)):
            manifest.update({label+"_size":len(data),label+"_sha256":mac.sha(data),
                             label+"_blob":mac.blob(data)})
        owner_body="R25_START_V2_INDEPENDENT_REVIEW\n"+FENCE+"json\n"+json.dumps(manifest)+"\n"+FENCE
        comment={"id":44,"html_url":"https://github.com/Emaren/app-prodn/pull/1110#issuecomment-44",
                 "issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1110",
                 "user":{"login":"Emaren"},"created_at":"2026-11-01T18:21:00Z","body":owner_body}
        ci={"head_sha":source,"status":"completed","conclusion":"success","name":"AoE2WAR CI"}
        jobs={"total_count":3,"jobs":[{"name":n,"status":"completed","conclusion":"success"}
              for n in ("Release and documentation control plane","Type, contract, and production build",
                        "Isolated Steam-rating PostgreSQL chronology")]}
        return [source,operator,launcher,comment,review,ci,jobs]

    def verify(self,data):
        source,operator,launcher,comment,review,ci,jobs=data
        counter=[]
        def gh(args,**kwargs):
            counter.append(args)
            return types.SimpleNamespace(returncode=0,
                stdout=json.dumps([comment,review,ci,jobs][len(counter)-1]).encode())
        with mock.patch.object(mac.Path,"is_file",return_value=True), \
             mock.patch.object(mac.subprocess,"run",side_effect=gh):
            out=mac.review_comment("44",mac.sha(comment["body"].encode()),source,operator,launcher)
        return out,counter

    def test_authentic_independent_exact_head_review_then_owner_manifest(self):
        data=self.facts()
        (body,url,proof),calls=self.verify(data)
        self.assertEqual(len(calls),4)
        self.assertEqual(calls[1][-1],"repos/Emaren/app-prodn/pulls/1110/reviews/17")
        payload={"review_body":body,"review_body_sha256":root.sha(body.encode()),
                 "source_sha":data[0],"operator_sha256":mac.sha(data[1]),
                 "operator_size":len(data[1]),"operator_blob":mac.blob(data[1]),
                 "review_url":url,"review_author":"Emaren",
                 "review_issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1110",
                 "github_review_proof":proof}
        self.assertEqual(root.reviewed(payload)["source_sha"],data[0])
        payload["github_review_proof"]={**proof,"reviewer_login":"Emaren"}
        with self.assertRaisesRegex(root.Hold,"AUTHENTIC_OPTIONAL_INDEPENDENT_GITHUB_REVIEW_PROOF_REQUIRED"):
            root.reviewed(payload)

    def test_owner_only_claim_without_independent_review_never_suffices(self):
        data=self.facts()
        manifest=json.loads(data[3]["body"].split(FENCE+"json\n")[1].split("\n"+FENCE)[0])
        del manifest["github_review_provenance"]
        data[3]["body"]="R25_START_V2_INDEPENDENT_REVIEW\n"+FENCE+"json\n"+json.dumps(manifest)+"\n"+FENCE
        with self.assertRaisesRegex(RuntimeError,"REAL_APPOINTED_INDEPENDENT_REVIEW_REFERENCE_REQUIRED"):
            self.verify(data)

    def test_wrong_author_dismissed_wrong_sha_unbound_body_late_review_fail(self):
        mutations={
            "owner":lambda d:d[4]["user"].update(login="Emaren"),
            "dismissed":lambda d:d[4].update(state="DISMISSED"),
            "not approved":lambda d:d[4].update(state="COMMENTED"),
            "wrong commit":lambda d:d[4].update(commit_id="b"*40),
            "late":lambda d:d[4].update(submitted_at="2026-11-01T19:20:00Z"),
            "wrong URL":lambda d:d[4].update(html_url="https://github.com/other/pull/1110#pullrequestreview-17"),
            "unbound body":lambda d:d[4].update(body=d[4]["body"]+"changed"),
            "unknown authority":lambda d:d[4].update(author_association="NONE"),
        }
        for name,fn in mutations.items():
            with self.subTest(name=name):
                d=copy.deepcopy(self.facts());fn(d)
                with self.assertRaises(RuntimeError):
                    self.verify(d)

    def test_reviewer_approval_of_wrong_bytes_rejected_even_with_owner_hash(self):
        data=self.facts()
        verdict=json.loads(data[4]["body"].split(FENCE+"json\n")[1].split("\n"+FENCE)[0])
        verdict["operator_sha256"]="f"*64
        data[4]["body"]="R25_START_V2_SOURCE_REVIEW_ACCEPT\n"+FENCE+"json\n"+json.dumps(verdict)+"\n"+FENCE
        manifest=json.loads(data[3]["body"].split(FENCE+"json\n")[1].split("\n"+FENCE)[0])
        manifest["github_review_provenance"]["review_body_sha256"]=mac.sha(data[4]["body"].encode())
        data[3]["body"]="R25_START_V2_INDEPENDENT_REVIEW\n"+FENCE+"json\n"+json.dumps(manifest)+"\n"+FENCE
        with self.assertRaisesRegex(RuntimeError,"INDEPENDENT_VERDICT_SOURCE_BYTES_DRIFT"):
            self.verify(data)

if __name__=="__main__":
    unittest.main()
