#!/usr/bin/env python3
"""Scorecard and Historical OS source-only adversarial tests."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import kingdom_scorecard_os as score
import historical_os as history
from scan_os import load_catalog
from organization_os import load_links,graph


class ScorecardStandardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s=score.read_source(score.STANDARDS)
        cls.h=score.read_source(score.HISTORY)

    def test_nine_directional_grades_are_explicit(self):
        s=score.validate_standard(self.s)
        self.assertEqual(len(s["dimensions"]),9)
        self.assertEqual(sum(len(d["gates"]) for d in s["dimensions"]),45)
        self.assertEqual([d["id"] for d in s["dimensions"]],list(score.NAMES))
        self.assertEqual(s["composite"],
                         "DISABLED_DIRECTIONAL_AND_NECESSITY_FACETS_NOT_INTERCHANGEABLE")
        for d in s["dimensions"]:
            self.assertEqual(len(d["gates"]),5)
            self.assertGreaterEqual(len(d["meaning_of_100"]),35)
            self.assertEqual(d["effective_at_utc"],s["effective_at_utc"])

    def test_higher_redundancy_and_cost_means_worse(self):
        for d in self.s["dimensions"]:
            if d["id"] in score.RISK:
                self.assertEqual(d["direction"],"higher_is_worse")
            elif d["id"]=="necessity":
                self.assertEqual(d["direction"],"higher_means_more_necessary")
            else:
                self.assertNotEqual(d["direction"],"higher_is_worse")

    def test_all_registered_objects_have_nine_unknown_scores(self):
        out=score.render(self.s,self.h)
        allids={n["id"] for n in graph(load_links(),load_catalog())["objects"]}
        self.assertEqual(len(out["current_scores"]),len(allids)*9)
        self.assertEqual({x["feature_id"] for x in out["current_scores"]},allids)
        self.assertTrue(all(x["score"] is None and x["grade_status"]=="UNKNOWN"
                            and x["unmeasured_weight"]==100 and x["as_of_utc"]
                            and x["missing_points_reason"] and
                            x["primary_issue"] and
                            x["meaning_of_100"] for x in out["current_scores"]))
        self.assertIsNone(out["composite_score"])
        self.assertFalse(out["retire_authorized"])

    def test_observed_booleans_without_independent_verifier_stay_unknown(self):
        d=self.s["dimensions"][0]
        fake={g["gate_id"]:{"gate_id":g["gate_id"],"observed":True,
                            "original_evidence_ref":"FAKE_LOCALLY_SET_TRUE"}
              for g in d["gates"]}
        grade=score.grade_dimension("SCAN_OS",d,claims=fake)
        self.assertIsNone(grade["score"])
        self.assertEqual(grade["supported_lower_bound"],0)
        self.assertEqual(grade["possible_upper_bound"],100)
        self.assertFalse(grade["mutations_authorized"])

    def test_independent_test_callback_proves_local_scoring_math(self):
        d=self.s["dimensions"][0]
        items={g["gate_id"]:{"gate_id":g["gate_id"],"observed":True,
                             "original_evidence_ref":"SYNTHETIC_VERIFIER_TEST"}
               for g in d["gates"]}
        verifier=lambda feature,gate,ref,as_of: (feature=="SCAN_OS"
                                                  and ref=="SYNTHETIC_VERIFIER_TEST")
        result=score.grade_dimension("SCAN_OS",d,items,verifier)
        self.assertEqual(result["score"],100)
        self.assertEqual(result["grade_status"],"SOURCE_LOCAL_ONLY")
        self.assertFalse(result["production_certified"])
        self.assertFalse(result["mutations_authorized"])

    def test_false_and_unknown_do_not_blindly_average(self):
        d=self.s["dimensions"][0]
        g1,g2=d["gates"][:2]
        items={g1["gate_id"]:{"gate_id":g1["gate_id"],"observed":True,
                               "original_evidence_ref":"TEST"},
               g2["gate_id"]:{"gate_id":g2["gate_id"],"observed":False,
                               "original_evidence_ref":"TEST"}}
        v=lambda *_:True
        r=score.grade_dimension("SCAN_OS",d,items,v)
        self.assertIsNone(r["score"])
        self.assertEqual((r["supported_lower_bound"],r["possible_upper_bound"]),(20,80))
        self.assertEqual(r["unmeasured_weight"],60)

    def test_bad_verifier_return_does_not_count(self):
        d=self.s["dimensions"][0];g=d["gates"][0]
        items={g["gate_id"]:{"gate_id":g["gate_id"],"observed":True,
                             "original_evidence_ref":"FRAUD"}}
        r=score.grade_dimension("SCAN_OS",d,items,lambda *_:"true")
        self.assertEqual(r["supported_lower_bound"],0)
        self.assertEqual(r["grade_status"],"UNKNOWN")

    def test_tampered_boolean_instead_of_object_denied(self):
        d=self.s["dimensions"][0]
        with self.assertRaisesRegex(score.ScorecardHold,"CLAIM_SHAPE"):
            score.grade_dimension("SCAN_OS",d,
                {d["gates"][0]["gate_id"]:True},lambda *_:True)

    def test_mutated_same_version_100_rejected(self):
        changed=copy.deepcopy(self.s)
        changed["dimensions"][0]["meaning_of_100"]="An entirely different 100 percent standard"
        with self.assertRaisesRegex(score.ScorecardHold,"CHANGED_100_WITHOUT"):
            score.verify_standards_transition(self.s,changed)

    def test_standards_snapshot_hash_and_no_rewrite(self):
        result=score.verify_standards_transition(self.s,self.s)
        self.assertFalse(result["standards_changed"])
        self.assertEqual(result["old_sha256"],score.fingerprint(self.s))

    def test_previous_grades_are_immutable_prefix(self):
        prior={"snapshots":[{"snapshot_id":"old","value":20}]}
        next_ok={"snapshots":[{"snapshot_id":"old","value":20},
                               {"snapshot_id":"next","value":40}]}
        self.assertTrue(score.verify_grade_history_append(prior,next_ok)
                        ["prior_history_unchanged"])
        next_fraud={"snapshots":[{"snapshot_id":"old","value":100},
                                 {"snapshot_id":"next","value":40}]}
        with self.assertRaisesRegex(score.ScorecardHold,"HISTORY_REWRITE"):
            score.verify_grade_history_append(prior,next_fraud)

    def test_legacy_54_is_not_certified(self):
        self.assertEqual(self.h["historical_subjective"]["value"],54)
        self.assertFalse(self.h["historical_subjective"]["production_certified"])
        self.assertEqual(self.h["snapshots"],[])
        score.validate_grade_history(self.h,self.s)

    def test_unknown_feature_is_hold(self):
        with self.assertRaisesRegex(score.ScorecardHold,"NO_SUCH_REGISTERED"):
            score.render(self.s,self.h,only_id="NONEXISTENT")

    def test_missing_dimension_and_wrong_direction_hold(self):
        s=copy.deepcopy(self.s);s["dimensions"].pop()
        with self.assertRaisesRegex(score.ScorecardHold,"DIMENSION_COUNT"):
            score.validate_standard(s)
        s=copy.deepcopy(self.s);s["dimensions"][3]["direction"]="higher_is_better"
        with self.assertRaisesRegex(score.ScorecardHold,"DIRECTION"):
            score.validate_standard(s)

    def test_duplicate_json_source_keys_denied(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/"bad.json"
            f.write_text('{"foo":1,"foo":2}')
            with self.assertRaisesRegex(score.ScorecardHold,"DUPLICATE_JSON"):
                score.read_source(f)

    def test_symlinked_source_input_denied(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/"real.json";f.write_text("{}")
            link=Path(td)/"link.json";link.symlink_to(f)
            with self.assertRaisesRegex(score.ScorecardHold,"NOT_REGULAR_SOURCE"):
                score.read_source(link)


class HistoricalModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classes=score.read_source(history.CLASSES)
        cls.cohorts=score.read_source(history.COHORTS)
        cls.original=graph(load_links(),load_catalog())
        cls.ids={o["id"] for o in cls.original["objects"]}

    def test_seventeen_original_history_classes(self):
        m=history.validate_classes(self.classes)
        self.assertEqual(len(m["object_types"]),17)
        self.assertIn("NO_SOURCE_ONLY_MODEL_CAN_GRANT_RETIRE_READY",
                      m["legal_retirement_rule"])
        self.assertIn("COPY_NEVER_RETIRE",m["safety"])
        self.assertIn("L4_HUMAN_ONLY",m["safety"])
        self.assertIn("L5_ALWAYS_DENY",m["safety"])

    def test_four_surfaces_and_github_source_independent(self):
        a=history.build(self.classes,self.cohorts)
        self.assertEqual(a["source_record_count"],14)
        self.assertEqual({x["surface"] for x in a["objects"]},
                         {"HEL1_ROOT","HEL1_DATA","M1_DEV","INTEL_COLD","GITHUB_SOURCE"})
        self.assertIsNone(a["verified_total_unique_reclaim_bytes"])
        self.assertIsNone(a["native_net_reclaim_bytes"])
        self.assertFalse(a["root_mutation_authorized"])
        self.assertFalse(a["historical_ui_live"])

    def test_essential_history_is_held(self):
        out=history.build(self.classes,self.cohorts)
        by={x["id"]:x for x in out["objects"]}
        for k in ("BAE_CURRENT_890D","BAE_HOT1_9CF","BAE_HOT2_50B",
                  "PG_LIVE_WAL_BACKUPS","TRAFFIC_SQLITE_SOURCE",
                  "GITHUB_WEBSITE_SOURCE","WOL0_CHAIN_STATE","M1_USER_PERSONAL"):
            self.assertEqual(by[k]["posture"],"KEEP_PROTECTED")
            self.assertFalse(by[k]["retire_ready"])

    def test_l4_requires_human_not_auto_reclaim(self):
        out=history.build(self.classes,self.cohorts)
        by={x["id"]:x for x in out["objects"]}
        self.assertEqual(by["ROOT_4C14_GENERATION"]["posture"],
                         "COLD_COPY_REVIEW_HUMAN_HOLD")
        self.assertIsNone(by["ROOT_4C14_GENERATION"]["physical_unique_bytes"])

    def test_dbceb_t8_predecessor_has_no_auto_retirement(self):
        obj=history.build(self.classes,self.cohorts,only_id="DBCEB_T5_T8_PREDECESSOR")
        a=obj["objects"][0]
        self.assertEqual(a["reported_gross_bytes"],618553344)
        self.assertIsNone(a["physical_reclaimed_bytes"])
        self.assertFalse(a["retire_authorized"])
        self.assertEqual(a["copies"],"UNKNOWN_NOT_ZERO")

    def test_intel_copies_do_not_equal_restoration(self):
        a=history.build(self.classes,self.cohorts,only_id="INTEL_COLD_ARCHIVES")["objects"][0]
        self.assertEqual(a["isolated_restoration"],"UNKNOWN_NOT_ATTESTED")
        self.assertEqual(a["signed_copy"],"UNKNOWN_NOT_ENROLLED")
        self.assertFalse(a["retire_ready"])

    def test_no_fake_unique_bytes_accepted(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][0]["verified_unique_bytes"]=9999999
        with self.assertRaisesRegex(history.HistoricalHold,"FORGED_SIGNED_OR_UNIQUE"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_no_self_asserted_copy_grant(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][3]["signed_copy_capability"]=True
        with self.assertRaisesRegex(history.HistoricalHold,"FORGED_SIGNED_OR_UNIQUE"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_no_self_asserted_independent_restore(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][3]["independent_restore_sha256"]="0"*64
        with self.assertRaisesRegex(history.HistoricalHold,"FORGED_SIGNED_OR_UNIQUE"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_no_forged_current_inode(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][3]["inode"]=259509
        with self.assertRaisesRegex(history.HistoricalHold,"FORGED_CURRENT_HOST_ID"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_source_graph_no_stale_identity(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][0]["organization_ref"]="MADE_UP_SOURCE"
        with self.assertRaisesRegex(history.HistoricalHold,"UNKNOWN_SHARED_ORGANIZATION_ID"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_protected_type_never_l1(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][8]["level"]="L1"
        with self.assertRaisesRegex(history.HistoricalHold,"HARD_PROTECTED_TYPE"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_live_hot_recovery_cannot_downgrade_to_l4(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][0]["level"]="L4"
        with self.assertRaisesRegex(history.HistoricalHold,"L4_CANNOT_OVERRIDE"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_no_archive_copies_inferred_from_absent_proofs(self):
        x=copy.deepcopy(self.cohorts)
        x["objects"][3]["copies"]=[]
        with self.assertRaisesRegex(history.HistoricalHold,"NO_INVENTED_COPIES"):
            history.validate_cohorts(x,self.classes,self.ids)

    def test_no_aggregate_gross_to_unique(self):
        out=history.build(self.classes,self.cohorts)
        gross=[x["reported_gross_bytes"] for x in out["objects"]
               if x["reported_gross_bytes"] is not None]
        self.assertGreater(len(gross),1)
        self.assertIsNone(out["native_net_reclaim_bytes"])
        self.assertFalse(out["source_copy_equals_restoration"])

    def test_unknown_query_denied(self):
        with self.assertRaisesRegex(history.HistoricalHold,"OBJECT_NOT_IN_ORIGINAL"):
            history.build(self.classes,self.cohorts,only_id="UNKNOWN_ORIGINAL")

    def test_history_and_grading_share_original_graph_ids(self):
        out=history.build(self.classes,self.cohorts)
        scorecard=score.render(score.read_source(score.STANDARDS),
                               score.read_source(score.HISTORY))
        ids={x["feature_id"] for x in scorecard["current_scores"]}
        self.assertTrue({x["organization_ref"] for x in out["objects"]}<=ids)
        self.assertEqual(out["shared_organization_graph_schema"],
                         self.original["schema"])


if __name__=="__main__":
    unittest.main()
