"""Synthetic-only claim collision receipt, strict negatives; no database/network."""
from __future__ import annotations
from copy import deepcopy
from decimal import Decimal
import importlib.util
from pathlib import Path
import tempfile
import unittest

FILE=Path(__file__).resolve().parents[1]/"scripts/financial_claim_collision_audit_readonly.py"
spec=importlib.util.spec_from_file_location("collision_test_only",FILE)
a=importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

# Aggregate numbers reproduce historical *totals only* in DISPOSABLE FIXTURE.
# No synthetic row is a claim-economics or chain-proof statement.
PAIRS=[
  ("777/8082",[777,8082],50000,25000,1),
  ("782/8086",[782,8086],4000,2000,1),
  ("712/7001",[712,7001],4000,2000,1),
  ("2712/2760",[2712,2760],2000,1000,2),
  ("710/6866",[710,6866],1000,500,1)]
def row(num,pair,ids,gross,index,markets=1,kinds=1,groups=1):
    if index==0: cls="LOCAL_INDEX_MISSING"
    elif kinds>1: cls="CROSS_KIND_REVIEW"
    elif markets>1: cls="CROSS_MARKET_REVIEW"
    elif groups>1: cls="CLAIM_GROUP_REVIEW"
    else: cls="REUSED_HASH_REVIEW"
    columns=[
      num,pair,cls,",".join(map(str,sorted(ids))),len(ids),gross,
      0 if index==0 else 1,index,markets,kinds,groups,
      1,0,1,0,len(ids),min(1,len(ids)),0,0,0,0]
    return "|".join(map(str,columns))
def fixture():
    lines=[]
    for pair,ids,gross,index,markets in PAIRS:
        lines.append(row(len(lines)+1,pair,ids,gross,index,markets=markets,groups=2))
    next_id=10000
    # #6: four claims, two kinds, two markets, no indexed event.
    lines.append(row(6,"-",[33,91,94,97],400,0,markets=2,kinds=2,groups=2))
    # Remaining 7 index-missing cases: one 3-claim; six 2-claim groups.
    # Total 8 groups / 19 records / 1,900 synthetic WOLO.
    for count,gross in [(3,300)]+[(2,200)]*6:
        ids=list(range(next_id,next_id+count));next_id+=count
        lines.append(row(len(lines)+1,"-",ids,gross,0))
    for i in range(48):
        count=3 if i<12 else 2
        gross=40 if i<47 else 98
        index=18 if i<47 else 33
        ids=list(range(next_id,next_id+count));next_id+=count
        lines.append(row(len(lines)+1,"-",ids,gross,index))
    return lines

class CollisionReportTests(unittest.TestCase):
    def report(self,lines=None):
        return a.output(a.parse("\n".join(fixture() if lines is None else lines)),True)
    def test_synthetic_61_group_historical_aggregates_and_no_authority(self):
        result,code=self.report()
        self.assertEqual(code,3)
        self.assertEqual(result["counts"]["group_count"],61)
        self.assertEqual(result["counts"]["claim_rows"],137)
        self.assertEqual(result["counts"]["descriptive_gap_wolo"],"33499")
        self.assertFalse(result["financial_release_authorized"])
        self.assertEqual(len(result["all_groups"]),61)
        self.assertTrue(all(r["chain_finality"]=="UNKNOWN" for r in result["all_groups"]))
    def test_five_high_value_pair_differences(self):
        result,_=self.report()
        differences={x["pair"]:x["descriptive_gap_wolo"] for x in result["priority_pairs"]}
        self.assertEqual(differences,{"777/8082":"25000","782/8086":"2000",
                                     "712/7001":"2000","2712/2760":"1000","710/6866":"500"})
    def test_eight_index_absences_have_no_chain_certification(self):
        result,_=self.report()
        self.assertEqual(result["counts"]["unindexed_groups"],8)
        self.assertEqual(result["counts"]["unindexed_claim_rows"],19)
        self.assertEqual(result["counts"]["unindexed_gross_wolo"],"1900")
        self.assertEqual(result["cross_kind_groups"],1)
    def test_missing_record_baseline_refuses(self):
        result,code=self.report(fixture()[:-1])
        self.assertEqual(code,2)
        self.assertEqual(result["status"],"HISTORICAL_BASELINE_DRIFT_HOLD")
    def test_double_claim_across_groups_refuses(self):
        rows=fixture()
        parts=rows[-1].split("|")
        parts[3]="777,"+parts[3]
        parts[4]=str(int(parts[4])+1)
        rows[-1]="|".join(parts)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_wrong_structural_class_refuses(self):
        rows=fixture();p=rows[5].split("|");p[2]="REUSED_HASH_REVIEW";rows[5]="|".join(p)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_missing_priority_label_refuses(self):
        rows=fixture();p=rows[0].split("|");p[1]="-";rows[0]="|".join(p)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_extra_private_column_refuses(self):
        rows=fixture();rows[0]+="|wallet-secret"
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_non_numeric_payload_refuses(self):
        rows=fixture();p=rows[0].split("|");p[5]="50000; DROP TABLE";rows[0]="|".join(p)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_negative_or_fractional_claim_amount_refuses(self):
        for bad in ("-1","0.1234567","NaN"):
            rows=fixture();p=rows[0].split("|");p[5]=bad;rows[0]="|".join(p)
            with self.subTest(bad=bad),self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_duplicate_json_in_claim_ids_refuses(self):
        rows=fixture();p=rows[0].split("|");p[3]="777,777";rows[0]="|".join(p)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_claim_rows_cardinality_refuses(self):
        rows=fixture();p=rows[0].split("|");p[4]="1";rows[0]="|".join(p)
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_unknown_chain_denom_flag_is_nonfinal(self):
        rows=fixture();p=rows[0].split("|");p[20]="1";p[2]="CHAIN_OR_DENOM_REVIEW"
        rows[0]="|".join(p)
        result,_=self.report(rows)
        self.assertEqual(result["all_groups"][0]["chain_finality"],"UNKNOWN")
    def test_replay_record_extra_delimited_field_refuses(self):
        rows=fixture();rows.append(rows[0])
        with self.assertRaises(a.Hold):a.parse("\n".join(rows))
    def test_load_bounded_regular_file_and_reject_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/"manifest.txt";file.write_text("\n".join(fixture()))
            self.assertEqual(len(a.parse(a.load_bounded(file))),61)
            link=Path(tmp)/"link.txt";link.symlink_to(file)
            with self.assertRaises(a.Hold):a.load_bounded(link)
    def test_no_funds_or_identities_in_formatter(self):
        result,_=self.report()
        self.assertTrue(result["no_identity_or_tx_hash_output"])
        self.assertNotIn("wallet_address",str(result))
        self.assertNotIn("tx_hash",str(result))

if __name__=="__main__":unittest.main()
