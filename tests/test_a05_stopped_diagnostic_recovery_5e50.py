"""Exact timeout-only nonfinancial stopped 3032 recovery contracts; no live mutations."""
import importlib.util,json
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase,main,mock

P=Path(__file__).resolve().parents[1]/'scripts/r25_c_stopped_diagnostic_recovery_5e50.py'
spec=importlib.util.spec_from_file_location('a05_stopped_diagnostic',P)
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class Scope(TestCase):
 def test_exact_immutable_old_and_new(self):
  self.assertEqual(r.OLD,'f50f814c065c329b6cb80f6aa45bb239b2528a0e')
  self.assertEqual(r.NEW,'5e50102f5589f2a3a76c7f8add05949d6ce392d0')
  self.assertEqual(r.SCOPE,'RECOVER_STOPPED_NONFINANCIAL_3032_ONLY')
  self.assertEqual(r.CONTROLLER_SHA,r.NEW_CONTROLLER_SHA)
  self.assertEqual(r.FAILED_HOLD_SHA,'0118dbfce760a5cfeef309587c6ff5abae01eb615d1dd7fbe4a96993b02a25a0')
  self.assertIn('cutover-6b31a41c03b59a2d8e76f1a5c449e87d',str(r.ROLLBACK_RECEIPT))
 def test_only_isolated_candidate_actions(self):
  for action,unit in [('restart','nginx'),('stop','aoe2hdbets-web.service'),('stop','wolochain.service')]:
   with self.assertRaisesRegex(r.Hold,'SYSTEMD_ACTION_NOT_ADMITTED'):
    r.candidate_systemd(action,unit)
  with mock.patch.object(r.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as p:
   r.candidate_systemd('stop',r.UNIT.name)
   self.assertEqual(p.call_args.kwargs['timeout'],140)
   self.assertEqual(p.call_args.args[0],['/usr/bin/systemctl','stop',r.UNIT.name])
 def test_stopped_admission_refuses_live_port_or_unrecognized_unit(self):
  entered={'status':'CONSUMED_DO_NOT_REPLAY','plan':{
   'nonce':'9e1d1a0559c6a41fe7b362c8045a3d8f','scope':'REFRESH_EXISTING_NONFINANCIAL_3032_ONLY',
   'old_source':r.OLD,'new_source':r.NEW},'financial_authorized':False,'public_cutover_authorized':False}
  held={'status':'CRITICAL_ROLLBACK_INCOMPLETE','reason_type':'TimeoutExpired',
   'isolated_stop_commands_passed':True,'financial_authorized':False,'public_cutover_authorized':False}
  values={r.FAILED_REFRESH/'entered.json':json.dumps(entered).encode(),
   r.FAILED_REFRESH/'rollback_hold.json':json.dumps(held).encode(),
   r.FAILED_REFRESH/'unit.before':b'unit',
   r.FAILED_REFRESH/'policy.before':b'policy',
   r.FAILED_REFRESH/'controller.before':b'controller'}
  units={r.UNIT.name:{'ActiveState':'failed','Result':'timeout','MainPID':'0'},
   r.TIMER:{'ActiveState':'inactive','Result':'success','MainPID':None},
   r.REFRESH:{'ActiveState':'failed','Result':'signal','MainPID':'0'},
   'aoe2hdbets-web.service':{'ActiveState':'active'}}
  c=SimpleNamespace(unit_state=lambda name:{'properties':units[name]},run=lambda *_args,**_kwargs:b'127.0.0.1:3030\n')
  def checkhash(raw):
   if raw==values[r.FAILED_REFRESH/'entered.json']:return r.FAILED_ENTERED_SHA
   if raw==values[r.FAILED_REFRESH/'rollback_hold.json']:return r.FAILED_HOLD_SHA
   raise AssertionError('unexpected hash')
  with mock.patch.object(r,'read_safe',side_effect=lambda path,mode=None:values[path]),mock.patch.object(r,'sha',side_effect=checkhash):
   self.assertTrue(r.stopped_after_exact_timeout(c,b'unit',b'policy',b'controller')['stopped_preimage_requalified'])
   c.run=lambda *_args,**_kwargs:b'127.0.0.1:3032 '
   with self.assertRaisesRegex(r.Hold,'LISTENER_STILL_PRESENT'):
    r.stopped_after_exact_timeout(c,b'unit',b'policy',b'controller')
   c.run=lambda *_args,**_kwargs:b'127.0.0.1:3030 '
   units[r.REFRESH]['Result']='success'
   with self.assertRaisesRegex(r.Hold,'STOPPED_ISOLATED_SERVICE_NOT_PROVED'):
    r.stopped_after_exact_timeout(c,b'unit',b'policy',b'controller')
 def test_no_financial_or_public_mutation_scope(self):
  data=P.read_text()
  for value in ('CONSUMED_STOP_TIMEOUT_RECEIPT_CHANGED','STOPPED_FAILURE_CONTEXT_NOT_VERIFIED',
   'FAILED_REFRESH_PREIMAGE_NOT_RESTORED','FAILED_3032_PID_NOT_BOUND_TO_ADMISSION',
   'PASS_NEW_3032_ADMITTED_NOT_PUBLIC','PASS_OLD_ISOLATED_3032_RESTORED_NOT_PUBLIC',
   'public_nginx_changes": False','financial_authorized": False'):
   self.assertIn(value,data)
  self.assertNotIn('nft flush ruleset',data)
  self.assertNotIn('systemctl reload nginx',data)

if __name__=='__main__':main()
