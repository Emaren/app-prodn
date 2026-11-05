"""Nonfinancial source-pinned 3032 admission with bounded stop tests; no host changes."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main, mock

P=Path(__file__).resolve().parents[1]/'scripts/r25_c_contained_runtime_refresh_bdb1.py'
spec=importlib.util.spec_from_file_location('a05_bdb1_refresh',P)
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)


class TestBoundedIsolatedRefresh(TestCase):
 def test_source_and_scope_pins(self):
  self.assertEqual(r.OLD,'5e50102f5589f2a3a76c7f8add05949d6ce392d0')
  self.assertEqual(r.NEW,'bdb134fe4013c9b26f382b55e232638b1d1f5874')
  self.assertEqual(r.SCOPE,'REFRESH_EXISTING_NONFINANCIAL_3032_ONLY')
  self.assertEqual(r.ARTIFACT_SHA,'ff3149267f5afdc66714b2ae1f509f1459143e3a81b56acbef3d052caf9e167d')
  self.assertEqual(r.CONTROLLER_SHA,r.NEW_CONTROLLER_SHA)
  self.assertEqual(r.PUBLIC_VERSION,'20261028134227-6c0f6d7531')
  self.assertIn('cutover-a3ebd2518f5a94c082e7136d4b907ac1',str(r.ROLLBACK_RECEIPT))
 def test_unit_only_exact_3032_stage_changes(self):
  base=('User=aoe2war-web-prod\nGroup=aoe2war-web-prod\nRestart=on-failure\nNoNewPrivileges=yes\n'
        'ProtectSystem=strict\nCapabilityBoundingSet=\n'
        'ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n'
        'WARGRAPH_RUNTIME_DISABLED=true AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1\n'
        +(f'Environment=STAGE={r.OLD_STAGE}\n')*4).encode()
  changed=r.render_unit(base)
  self.assertEqual(changed.count(r.NEW_STAGE.encode()),4)
  self.assertNotIn(r.OLD_STAGE.encode(),changed)
  with self.assertRaisesRegex(r.Hold,'UNIT_STAGE_IDENTITY_DRIFT'):
   r.render_unit(base.replace(r.OLD_STAGE.encode(),b'/tmp/not-sealed'))
 def test_candidate_service_actions_never_public_or_wolo(self):
  for action,unit in [('restart','nginx'),('stop','aoe2hdbets-web.service'),('stop','wolochain.service')]:
   with self.assertRaisesRegex(r.Hold,'SYSTEMD_ACTION_NOT_ADMITTED'):
    r.candidate_systemd(action,unit)
 def test_exact_stopped_service_allows_systemd_timeout_only_after_proof(self):
  current={'ActiveState':'active','MainPID':'4174529','Result':'success'}
  public={'ActiveState':'active','MainPID':'2625090'}
  def state(name):
   if name==r.UNIT.name:return {'properties':current.copy()}
   if name=='aoe2hdbets-web.service':return {'properties':public.copy()}
   raise AssertionError('unexpected scope')
  c=SimpleNamespace(unit_state=state, OLD_PID=2625090,
    run=lambda *_args,**_kwargs:b'127.0.0.1:3030 LISTEN\n')
  def systemd(*args,**kwargs):
   self.assertEqual(args[0],['/usr/bin/systemctl','stop',r.UNIT.name])
   self.assertEqual(kwargs['timeout'],140)
   current.update({'ActiveState':'failed','MainPID':'0','Result':'timeout'})
   return SimpleNamespace(returncode=1)
  with self.assertRaisesRegex(r.Hold,'OLD_CANDIDATE_PID_OR_STATE_CHANGED'):
   r.stopped_isolated_candidate(c,4174528)
  with mock.patch.object(r.subprocess,'run',side_effect=systemd) as runner:
   proof=r.stopped_isolated_candidate(c,4174529)
   self.assertEqual(runner.call_count,1)
  self.assertEqual(proof['systemctl_exit'],1)
  self.assertTrue(proof['candidate_3032_port_absent'])
  self.assertEqual(proof['result'],'timeout')
  c.run=lambda *_args,**_kwargs:b'127.0.0.1:3032 LISTEN\n'
  with self.assertRaisesRegex(r.Hold,'CANDIDATE_LISTENER_SURVIVED_STOP'):
   r.stopped_isolated_candidate(c)
  c.run=lambda *_args,**_kwargs:b'127.0.0.1:3030 LISTEN\n'
  public['MainPID']='999'
  with self.assertRaisesRegex(r.Hold,'OLD_PUBLIC_SERVICE_CHANGED_DURING_STOP'):
   r.stopped_isolated_candidate(c)
 def test_failure_closed_protection(self):
  s=P.read_text()
  for token in ('EXACT_OWNER_GRANT_FIELDS_REQUIRED','NONCE_ALREADY_CONSUMED',
      'NEW_STAGE_RECEIPT_EXTRACTED_CONTENT_DRIFT','EXISTING_3032_PID_ADMISSION_CHANGED',
      'CANDIDATE_LISTENER_SURVIVED_STOP','OLD_PUBLIC_SERVICE_CHANGED_DURING_STOP',
      'PASS_NEW_3032_ADMITTED_NOT_PUBLIC','PASS_OLD_ISOLATED_3032_RESTORED_NOT_PUBLIC',
      'financial_authorized": False','public_cutover_authorized": False'):
   # The live equivalent historic PID guard is a stronger SHA-backed check.
   if token=='EXISTING_3032_PID_ADMISSION_CHANGED':
    self.assertIn('EXISTING_3032_PID_ADMISSION_CHANGED',s)
   else:self.assertIn(token,s)
  self.assertNotIn('nft flush ruleset',s)
  self.assertNotIn('ALTER ROLE',s)

if __name__=='__main__':main()
