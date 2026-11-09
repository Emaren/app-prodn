"""One-use exact CI R25 single-slot TRIAL/mandatory Steam V17 rollback."""
import importlib.util,json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'scripts/release/r25_c03_b1ef_single_slot_trial_v1.py'
spec=importlib.util.spec_from_file_location('b1eftrial',str(SOURCE))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class C03Trial(unittest.TestCase):
 def test_exact_official_ci_runtime_pins_and_finance_denial(self):
  self.assertEqual(m.SOURCE,'b1ef050b954be734c9f34147361e0d02d7c89b19')
  self.assertEqual(m.CI_ZIP_SHA,'e4bb88e2a842f0ee3547a537083d9b32549b9642ac66ec110bd59cae2b782446')
  self.assertEqual(m.OLD_UNIT_SHA,'42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621')
  self.assertEqual(m.STEAM_V17_UNIT_SHA,'94209b3179f264b25d646795042fe037192735b60bb7eee95eedf6b106aa17a4')
  self.assertEqual(m.STEAM_SRC_SHA,'699b16630eb8314e7e8043a91978dec7e3178ccc99360cc9416ea7cdaa47caac')
 def test_exact_four_path_web_unit_only(self):
  raw=(('WorkingDirectory='+str(m.OLD_STAGE)+'\n')+
       ('BindReadOnlyPaths='+str(m.OLD_STAGE)+'\n')*3).encode()
  result=m.new_unit(raw)
  self.assertEqual(result.count(str(m.STAGE).encode()),4)
  self.assertNotIn(str(m.OLD_STAGE).encode(),result)
  with self.assertRaisesRegex(m.Hold,'FOUR_PATH_SCOPE'):
   m.new_unit(raw.replace(str(m.OLD_STAGE).encode(),b'/tmp/fake',1))
 def test_finance_denial_errors_are_never_success(self):
  live={'schema':'aoe2war.app.bets-published-live-preview.v1',
        'status':'PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD',
        'financialExecutionAuthorized':False,'acceptingWagers':False,
        'actualLiquidityProven':False,'onchainPaymentFinalityVerified':False,
        'markets':[],'emptyReason':'NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS'}
  hist={'status':'PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD',
        'financialExecutionAuthorized':False,'markets':[]}
  responses=[(200,json.dumps(live).encode(),{}),(200,json.dumps(hist).encode(),{}),
             (500,b'{"detail":"Bet board unavailable."}',{})]
  with patch.object(m,'api',side_effect=responses):
   with self.assertRaisesRegex(m.Hold,'PRIVATE_FINANCIAL_BET_BOARD_NOT_FAIL_CLOSED_503'):
    m.protected_public_health({})
 def test_missing_public_view_denied_not_empty(self):
  with patch.object(m,'api',return_value=(503,b'{}',{})):
   with self.assertRaisesRegex(m.Hold,'PUBLIC_LIVE_NOT_HTTP200'):
    m.protected_public_health({})
 def test_no_unsafe_or_unbounded_activation_source(self):
  s=SOURCE.read_text()
  for bad in ('systemctl unmask','ALTER ROLE','GRANT ALL','DROP DATABASE',
              'nc -l','port 3033','/satchel/v1/returns/execute',
              '127.0.0.1:8092','127.0.0.1:8093'):
   self.assertNotIn(bad,s)
  self.assertIn('finally:\n  steps=rollback()',s)
  self.assertIn("'--profile','rollback'",s)
  self.assertIn("'--exercise'",s)
  self.assertIn("'C03_APP_HANDOFF':'HOLD'",s)
  self.assertIn("'C02_APP_TRANSPORT':'HOLD'",s)
  self.assertIn("'authenticated_owner_roles_verified':False",s)
  self.assertIn("'production_promotion_authorized':False",s)
 def test_exact_archive_sha_and_tar_traversal_guards(self):
  s=SOURCE.read_text()
  for required in ('CI_ZIP_SHA','TAR_SYMLINK_ESCAPE','TAR_ESCAPE',
                   'TAR_UNEXPECTED_EOF','TAR_ENTRY_COUNT',
                   'GITHUB_ZIP_RECEIPT_NOT_EXACT','STAGE_RUNTIME_MANIFEST'):
   self.assertIn(required,s)
if __name__=='__main__':unittest.main()
