"""R3: long native web-stop window and typed fail-closed old Steam PID."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
CONTROLLER=ROOT/"scripts/release/r25_bets_history_v5z_r3_nonfinancial_cutover.py"
STEAM=ROOT/"scripts/release/r25_steam_refresh_v5z.py"
PREVIOUS=ROOT/"scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py"
OLD_STEAM=ROOT/"scripts/release/r25_steam_refresh_v5x.py"
sp=importlib.util.spec_from_file_location("strict_r25_v5z_r3",CONTROLLER)
assert sp and sp.loader
m=importlib.util.module_from_spec(sp)
sp.loader.exec_module(m)

GOOD_ADMISSION={"schema":"aoe2war.app.steam-runtime-readmission.v5w",
 "current_public_pid":2120006,"finance_authorized":False,
 "approval_scope":"STEAM_ONLY_EXISTING_UID990_NFT_SETS"}
GOOD_JOURNAL=json.dumps({"status":"HOLD_STEAM_REFRESH_V2",
 "reason":"HOLD:R25_PUBLIC_RUNTIME_CHANGED","financial_authorized":False})

class StrictR3R25Release(unittest.TestCase):
 def test_exact_source_and_recovery_root_not_reusable(self):
  m.selftest()
  self.assertEqual(m.OLD_WEB_PID,2188495)
  self.assertEqual(m.STAGE.name,"aoe2war-web-prod-1a380cdf76ff")
  self.assertEqual(m.OLD_STEAM_UNIT_SHA,"6cda0dd112fe6a0d47594220969ff1f806bfadacad7eb4d0150f33c4e7b1529f")
  self.assertEqual(m.OLD_WEB_UNIT_SHA,"9301389aaf545bb9f4273e183d1c0f1ddf6c6589cac84d79873124327f71e1ec")
  self.assertEqual(m.NEW_WEB_UNIT_SHA,"1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3")
  self.assertEqual(m.NEW_V5X_SOURCE_SHA,hashlib.sha256(STEAM.read_bytes()).hexdigest())
  self.assertEqual(m.ROOT.name,"aoe2war-r25-bets-history-v5z-r3-20261107")
  self.assertNotEqual(m.ROOT,Path("/root/aoe2war-r25-bets-history-v5x-r2-20261107"))
  self.assertEqual(m.V5X_DIR.name,"web-prod-v5z")
  self.assertTrue(str(m.NEW_SIGNED_RELEASE).endswith("r25-bets-history-v5z-r3-20261107/COMMIT.json"))
  self.assertNotEqual(m.OLD_WEB_PID,2120006)

 def test_native_stop_respects_90_second_systemd_shutdown(self):
  s=CONTROLLER.read_text()
  self.assertEqual(s.count('exec_ok(["/usr/bin/systemctl", "stop", WEB], timeout=115)'),2)
  self.assertNotIn('exec_ok(["/usr/bin/systemctl", "stop", WEB], timeout=28)',s)
  self.assertNotIn('exec_ok(["/usr/bin/systemctl", "stop", STEAM]',s)
  self.assertIn('quiesce_steam_after_timer_stop()',s)
  self.assertIn('start_new_session=True',s)
  self.assertIn('WATCHDOG_TIMED_OUT_WITHOUT_ROOT_RELEASE_ACCEPTANCE',s)
  self.assertIn('financial_c01_c09_accepted',s)

 def fake_known(self,base=GOOD_ADMISSION,journal=GOOD_JOURNAL,extras=None):
  extras=extras or {}
  properties={"MainPID":"0","ActiveState":"failed",
   "Result":"exit-code","ExecMainStatus":"2"}
  properties.update(extras)
  return (patch.object(m,"state",side_effect=lambda u,k:
             "2188495" if u==m.WEB and k=="MainPID" else properties[k]),
          patch.object(m,"file_sha",side_effect=lambda p:
             (m.OLD_STEAM_UNIT_SHA if p==m.STEAM_UNIT
              else "0713acb23ab1a03b2944f23b64b396b8732f8196bf7b1e3ff55725b2ab00447f")),
          patch.object(m,"immutable",return_value=json.dumps(base).encode()),
          patch.object(m,"exec_ok",return_value=journal))

 def test_exact_failed_old_pid_source_is_accepted_only_as_hold_not_success(self):
  from contextlib import ExitStack
  with ExitStack() as stack:
   for context in self.fake_known():stack.enter_context(context)
   self.assertTrue(m.known_failed_closed_old_steam_pid())
   self.assertTrue(m.valid_old_steam_precondition())
   m.quiesce_steam_after_timer_stop()
  self.assertEqual(m.OLD_WEB_PID,2188495)
  self.assertNotEqual(m.OLD_WEB_PID,GOOD_ADMISSION["current_public_pid"])

 def test_wildcard_or_nonpid_failure_still_hold(self):
  from contextlib import ExitStack
  variations=[
    (GOOD_ADMISSION,json.dumps({"status":"HOLD_STEAM_REFRESH_V2","reason":"HOLD:STEAM_REFRESH_ALTERED_NON_STEAM_STATE","financial_authorized":False}),{}),
    (GOOD_ADMISSION,json.dumps({"status":"PASS_STEAM_ONLY_REFRESH","finance_authorized":False}),{}),
    ({**GOOD_ADMISSION,"current_public_pid":2188495},GOOD_JOURNAL,{}),
    ({**GOOD_ADMISSION,"finance_authorized":True},GOOD_JOURNAL,{}),
    ({**GOOD_ADMISSION,"approval_scope":"FUNDED"},GOOD_JOURNAL,{}),
    (GOOD_ADMISSION,GOOD_JOURNAL,{"Result":"signal"}),
    (GOOD_ADMISSION,GOOD_JOURNAL,{"ActiveState":"active"}),
    (GOOD_ADMISSION,GOOD_JOURNAL,{"MainPID":"345"}),
    (GOOD_ADMISSION,GOOD_JOURNAL,{"ExecMainStatus":"1"}),
    (GOOD_ADMISSION,"",{}),
  ]
  for base,log,props in variations:
   with self.subTest(base=base,log=log,props=props),ExitStack() as stack:
    for context in self.fake_known(base,log,props):stack.enter_context(context)
    with self.assertRaises(m.Hold):
     m.known_failed_closed_old_steam_pid()

 def test_known_old_failure_requires_exact_unchanged_source(self):
  from contextlib import ExitStack
  for changed in ("old_unit","old_source"):
   with self.subTest(changed=changed),ExitStack() as stack:
    contexts=self.fake_known()
    stack.enter_context(contexts[0])
    if changed=="old_unit":
     stack.enter_context(patch.object(m,"file_sha",return_value="0"*64))
    else:
     stack.enter_context(patch.object(m,"file_sha",side_effect=lambda p:
       m.OLD_STEAM_UNIT_SHA if p==m.STEAM_UNIT else "0"*64))
    stack.enter_context(contexts[2]);stack.enter_context(contexts[3])
    with self.assertRaises(m.Hold):m.known_failed_closed_old_steam_pid()

 def test_fresh_v5z_admission_retains_strict_finance_denial(self):
  s=STEAM.read_text()
  for word in ('web-prod-v5z','OLD_LIVE_PID=2188495','financial_authorized',
               'STEAM_ONLY_EXISTING_UID990_NFT_SETS',
               'R25_PUBLIC_RUNTIME_CHANGED',
               'r25-bets-history-v5z-r3-20261107/COMMIT.json',
               'aoe2war.app.steam-runtime-readmission.v5z',
               'reviewed_protected_snapshot_sha256'):
   self.assertIn(word,s)
  for bad in ('IGNORE_FINANCIAL','ALLOW_ANY_PID','reset-failed',
              'ADMIN_PRIVATE_KEY','FUNDING_ENABLED'):
   self.assertNotIn(bad,s)
  self.assertEqual(m.OLD_SIGNED_RELEASE_SHA,"6a20a634aff66d1f60dad3290a18dd237eb5017b8a6017f693da76a4510be4f2")
  self.assertEqual(m.OLD_STEAM_ACCEPT_SHA,"c975c5d442386f3e0b8693d6abe2e8d321c682567dd06e158efa77b98f8ab25a")

 def test_site_contains_verifiable_read_only_history_not_wager_execution(self):
  s=CONTROLLER.read_text()
  self.assertIn("new_history_must_be_genuine()",s)
  self.assertIn('acceptingWagers',s)
  self.assertIn('onchainPaymentFinalityVerified',s)
  self.assertIn('public_http("/bets")',s)
  self.assertIn('get_native_steam_v5x()',s)
  self.assertIn('old_public_release_sha256',s)
  self.assertIn('funded_transfer_authorized',s)
  self.assertIn('inactive_finance()',s)
  self.assertIn('verify_c03()',s)
  self.assertIn('restore_units(',s)
  self.assertIn('nginx_http_ok("/clans/aoe2war")',s)

if __name__=="__main__":
 unittest.main()
