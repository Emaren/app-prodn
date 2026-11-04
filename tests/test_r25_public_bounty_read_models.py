"""Bounty public display-only read models: source and privacy contract."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/"lib/bounties.ts").read_text()
SQL=(ROOT/"config/nonfinancial-public-bounties-v4.sql").read_text()
ISSUERS=(ROOT/"lib/bountyHall.ts").read_text()

class BountyPublicProjectionTests(unittest.TestCase):
    def test_exact_frozen_public_issuer_addresses(self):
        clause=ISSUERS.split("OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES = [",1)[1].split("] as const",1)[0]
        addresses=re.findall(r'"(wolo1[a-z0-9]+)"',clause)
        self.assertEqual(len(addresses),2)
        for address in addresses:
            self.assertEqual(SQL.count("'"+address+"'"),1)
        self.assertIn("memo ILIKE '%bounty%'",SQL)
    def test_three_public_views_and_no_direct_private_grant(self):
        names=re.findall(r'CREATE OR REPLACE VIEW (aoe2war_public_v4\.[a-z_]+)',SQL)
        self.assertEqual(names,[
          "aoe2war_public_v4.bounty_display_opportunities",
          "aoe2war_public_v4.bounty_locked_claim_summary",
          "aoe2war_public_v4.bounty_numbered_transfers",
        ])
        grants=re.findall(r'^GRANT SELECT ON (\S+) TO aoe2war_web_prod;$',SQL,re.M)
        self.assertEqual(grants,names)
        self.assertNotRegex(SQL,r'GRANT SELECT ON public\.')
        self.assertNotRegex(SQL,r'GRANT (?:ALL|INSERT|UPDATE|DELETE)')
        self.assertIn("PUBLIC_BOUNTY_RAW_FINANCIAL_AUTHORITY_DRIFT",SQL)
    def test_locked_claim_summary_has_no_private_records_or_address_join(self):
        claim=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v4.bounty_locked_claim_summary",1)[1].split("REVOKE ALL ON aoe2war_public_v4.bounty_locked_claim_summary",1)[0]
        self.assertRegex(claim,r'COUNT\(\*\) FILTER')
        self.assertNotIn('jsonb_build_object',claim)
        self.assertNotIn('recipient_address',claim)
        self.assertNotIn('idempotency_key',claim)
        self.assertNotIn('error_detail',claim)
        self.assertNotIn('evidence',claim)
        self.assertIn("IF has_table_privilege('aoe2war_web_prod','public.bounty_claims','SELECT')",SQL)
    def test_legacy_unchanged_and_new_public_branch_isolation(self):
        self.assertIn('const restricted = isNonfinancialPublicReadProfile()',SOURCE)
        for view in ["bounty_display_opportunities","bounty_locked_claim_summary","bounty_numbered_transfers"]:
            self.assertIn("aoe2war_public_v4."+view, SOURCE)
        self.assertIn("!restricted && recipientAddresses.length",SOURCE)
        self.assertIn("lockedCanonicalCount",SOURCE)
        self.assertIn("prisma.bountyOpportunity.findMany",SOURCE)
        self.assertIn("prisma.woloIndexedTransfer.findMany",SOURCE)
        self.assertIn("prisma.bountyClaim.findMany",SOURCE)
        self.assertIn("BOUNTY_LOCKED_COUNT_INVALID",SOURCE)

if __name__=="__main__":
    unittest.main()
