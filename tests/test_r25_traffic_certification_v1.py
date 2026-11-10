"""Do not invent public human classifications from recent visitor/event counts."""
import copy
from datetime import date,datetime,timedelta,timezone
import importlib.util
from pathlib import Path
import unittest

SOURCE=Path(__file__).resolve().parents[1]/"scripts/release/r25_traffic_certification_v1.py"
spec=importlib.util.spec_from_file_location("traffic_cert_gate",SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

TODAY=date(2026,11,10)
def fixture(last=date(2026,10,19)):
    points=[]
    day=m.FIRST_DAY
    while day<=last:
        points.append({"date":day.isoformat(),"calculatedAt":
                      (datetime.combine(day,datetime.min.time(),timezone.utc)+timedelta(days=1)).isoformat(),
                       "values":{"totalTraffic":10,"suspectedHuman":6,"confirmedHuman":3}})
        day+=timedelta(days=1)
    return {"ok":True,"project_slug":m.PROJECT,
            "coverage_started_at":m.FIRST_DAY.isoformat(),
            "coverage_ended_at":last.isoformat(),
            "points":points}
def receipt(history):
    names=history["missing_closed_days"]
    return {"schema":"aoe2war.traffic.canonical-day-certification.v1",
            "project":m.PROJECT,
            "classified_days":[{
                "date":x,"values":{"totalTraffic":3,"suspectedHuman":2,"confirmedHuman":1},
                "classification_sha256":"a"*64,"source_receipt_sha256":"b"*64,
                "finalized_at_utc":(datetime.fromisoformat(x).replace(tzinfo=timezone.utc)+timedelta(days=1)).isoformat()
                } for x in names],
            "classifier_sha256":"c"*64,"canonical_source_root_sha256":"d"*64,
            "owner_signature_sha256":"e"*64,
            "scope":"CLASSIFIED_CANONICAL_HISTORY_ONLY",
            "all_history_immutable":True}
class CanonicalTraffic(unittest.TestCase):
    def test_real_historical_span_131_and_exact_21_missing_closed_days(self):
        h=m.verify_public_history(fixture(),TODAY)
        self.assertEqual(h["certified_day_count"],131)
        self.assertEqual(h["missing_count"],21)
        self.assertEqual(h["missing_closed_days"][0],"2026-10-20")
        self.assertEqual(h["missing_closed_days"][-1],"2026-11-09")
        self.assertNotIn("2026-11-10",h["missing_closed_days"])

    def test_raw_visitors_cannot_substitute_classified_humans(self):
        wrong=fixture();wrong["points"][-1]["values"]={"visitors":427,"events":1285}
        with self.assertRaisesRegex(m.Hold,"AUDIENCE_SERIES_EXACT_SHAPE"):
            m.verify_public_history(wrong,TODAY)

    def test_zero_count_is_legitimate_only_in_actual_canonical_row(self):
        f=fixture()
        f["points"][-1]["values"]={"totalTraffic":0,"suspectedHuman":0,"confirmedHuman":0}
        self.assertEqual(m.verify_public_history(f,TODAY)["missing_count"],21)

    def test_cannot_append_missing_or_fabricated_zero_days(self):
        f=fixture()
        f["points"].append({"date":"2026-10-21","values":{"totalTraffic":0,
                              "suspectedHuman":0,"confirmedHuman":0},
                            "calculatedAt":"2026-10-22T01:00:00+00:00"})
        f["coverage_ended_at"]="2026-10-21"
        with self.assertRaisesRegex(m.Hold,"CANONICAL_GAP_OR_DUPLICATE"):
            m.verify_public_history(f,TODAY)

    def test_reject_duplicate_days(self):
        f=fixture();f["points"][-1]=copy.deepcopy(f["points"][-2])
        with self.assertRaisesRegex(m.Hold,"CANONICAL_GAP_OR_DUPLICATE"):
            m.verify_public_history(f,TODAY)

    def test_reject_count_inversion_and_negative_or_float(self):
        for values in [
          {"totalTraffic":1,"suspectedHuman":2,"confirmedHuman":0},
          {"totalTraffic":2,"suspectedHuman":1,"confirmedHuman":2},
          {"totalTraffic":-1,"suspectedHuman":0,"confirmedHuman":0},
          {"totalTraffic":1.5,"suspectedHuman":1,"confirmedHuman":0},
        ]:
            f=fixture();f["points"][0]["values"]=values
            with self.assertRaisesRegex(m.Hold,"CLASSIFIED_AUDIENCE_HIERARCHY"):
                m.verify_public_history(f,TODAY)

    def test_incomplete_todays_data_unpublishable(self):
        f=fixture(TODAY)
        with self.assertRaisesRegex(m.Hold,"INCOMPLETE_TODAY_OR_FUTURE"):
            m.verify_public_history(f,TODAY)

    def test_premature_timestamp_rejected(self):
        f=fixture()
        f["points"][-1]["calculatedAt"]="2026-10-19T15:00:00+00:00"
        with self.assertRaisesRegex(m.Hold,"PREMATURE_OR_NAIVE"):
            m.verify_public_history(f,TODAY)

    def test_missing_independent_verifier_is_absolute_hold(self):
        h=m.verify_public_history(fixture(),TODAY)
        with self.assertRaisesRegex(m.Hold,"INDEPENDENT_CLASSIFIER_AND_OWNER"):
            m.qualify_external_daily_receipt(h,receipt(h),None)

    def test_claimed_signed_receipt_without_valid_authority_fails(self):
        h=m.verify_public_history(fixture(),TODAY)
        with self.assertRaisesRegex(m.Hold,"INDEPENDENT_VERIFIER_REJECTED"):
            m.qualify_external_daily_receipt(h,receipt(h),lambda a:False)

    def test_day_receipt_hole_rejected_even_with_approver_function(self):
        h=m.verify_public_history(fixture(),TODAY)
        r=receipt(h);r["classified_days"].pop(4)
        with self.assertRaisesRegex(m.Hold,"BACKFILL_DAY_COUNT"):
            m.qualify_external_daily_receipt(h,r,lambda a:True)

    def test_day_receipt_misorder_rejected_even_with_approver_function(self):
        h=m.verify_public_history(fixture(),TODAY)
        r=receipt(h);r["classified_days"][0],r["classified_days"][1]=r["classified_days"][1],r["classified_days"][0]
        with self.assertRaisesRegex(m.Hold,"DAY_NOT_EXACT_CONTINUATION"):
            m.qualify_external_daily_receipt(h,r,lambda a:True)

    def test_raw_unclassified_receipt_payload_rejected(self):
        h=m.verify_public_history(fixture(),TODAY)
        r=receipt(h);r["classified_days"][0]["values"]={"visitors":298,"events":899}
        with self.assertRaisesRegex(m.Hold,"AUDIENCE_SERIES_EXACT_SHAPE"):
            m.qualify_external_daily_receipt(h,r,lambda a:True)

    def test_qualified_synthetic_still_not_publication_authority(self):
        h=m.verify_public_history(fixture(),TODAY)
        r=receipt(h)
        v=m.qualify_external_daily_receipt(h,r,lambda a:True)
        self.assertEqual(v["status"],"SOURCE_CONTRACT_ELIGIBLE_PENDING_PUBLISHER_AND_CENTRAL")
        self.assertFalse(v["publish_authorized"])
        self.assertEqual(v["candidate_count"],21)

    def test_no_private_ledger_or_writes_used(self):
        text=SOURCE.read_text()
        for forbidden in ("sqlite3.connect", "INSERT INTO", "UPDATE ","os.unlink(","shutil.copy",
                          "subprocess.run(", "nft", "systemctl", "finance_owner",
                          "candidate_publish=True"):
            self.assertNotIn(forbidden,text)
        self.assertIn('PUBLIC_ORIGIN="http://127.0.0.1:3345"',text)
        self.assertIn('publish_authorized":False',text)

if __name__=="__main__":unittest.main()
