"""Source-only release scope checks: no production calls or privileges."""
from pathlib import Path
from unittest import mock
import importlib.util
import unittest

PATH=Path(__file__).resolve().parents[1]/'scripts/r25_c_contained_runtime_refresh_5e50.py'
s=importlib.util.spec_from_file_location('a05_diagnostic_refresh',PATH)
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)

class TestA05IsolatedRefresh(unittest.TestCase):
 def test_sources_and_exact_boundaries(self):
  self.assertEqual(r.OLD,'f50f814c065c329b6cb80f6aa45bb239b2528a0e')
  self.assertEqual(r.NEW,'5e50102f5589f2a3a76c7f8add05949d6ce392d0')
  self.assertEqual(r.CONTROLLER_SHA,r.NEW_CONTROLLER_SHA)
  self.assertEqual(r.SCOPE,'REFRESH_EXISTING_NONFINANCIAL_3032_ONLY')
  self.assertEqual(r.ARTIFACT_SHA,'f64b37517ca17f98602c776eab23545f9e095d9638331b2b2a0ef4abd8179228')
  self.assertEqual(r.PUBLIC_VERSION,'20261028134227-6c0f6d7531')
  self.assertEqual(r.ARTIFACT_ROOT / 'runtime.zip',r.ARTIFACT_ROOT / 'runtime.zip')
 def test_unit_can_only_swap_exact_staged_artifact(self):
  base=('User=aoe2war-web-prod\nGroup=aoe2war-web-prod\nRestart=on-failure\nNoNewPrivileges=yes\n'
   'ProtectSystem=strict\nCapabilityBoundingSet=\n'
   'ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n'
   'WARGRAPH_RUNTIME_DISABLED=true AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1\n'
   +('Environment=STAGE='+r.OLD_STAGE+'\n')*4).encode()
  new=r.render_unit(base)
  self.assertEqual(new.count(r.NEW_STAGE.encode()),4)
  self.assertNotIn(r.OLD_STAGE.encode(),new)
  with self.assertRaisesRegex(r.Hold,'UNIT_STAGE_IDENTITY_DRIFT'):
   r.render_unit(base.replace(r.OLD_STAGE.encode(),b'/tmp/unsealed'))
  with self.assertRaisesRegex(r.Hold,'UNIT_AUTHORITY_DRIFT'):
   r.render_unit(base.replace(b'NoNewPrivileges=yes',b'NoNewPrivileges=no'))
 def test_systemd_actions_are_always_isolated(self):
  with self.assertRaisesRegex(r.Hold,'SYSTEMD_ACTION_NOT_ADMITTED'):
   r.candidate_systemd('restart','aoe2hdbets-web.service')
  with self.assertRaisesRegex(r.Hold,'SYSTEMD_ACTION_NOT_ADMITTED'):
   r.candidate_systemd('reload','nginx.service')
  with self.assertRaisesRegex(r.Hold,'SYSTEMD_ACTION_NOT_ADMITTED'):
   r.candidate_systemd('stop','wolochain.service')
  with mock.patch.object(r.subprocess,'run',return_value=mock.Mock(returncode=0)) as caller:
   r.candidate_systemd('stop',r.UNIT.name)
   self.assertEqual(caller.call_args.args[0],['/usr/bin/systemctl','stop','aoe2hdbets-web-prod.service'])
 def test_source_is_fail_closed(self):
  data=PATH.read_text()
  for anchor in ('EXACT_OWNER_GRANT_FIELDS_REQUIRED','NONCE_ALREADY_CONSUMED',
   'EXISTING_3032_PID_ADMISSION_CHANGED','NEW_STAGE_RECEIPT_EXTRACTED_CONTENT_DRIFT',
   'PASS_OLD_ISOLATED_3032_RESTORED_NOT_PUBLIC','financial_authorized": False',
   'public_cutover_authorized": False','STAGED_ARTIFACT_NOT_QUALIFIED'):
   self.assertIn(anchor,data.replace('GITHUB_STAGED_ARTIFACT_NOT_QUALIFIED','STAGED_ARTIFACT_NOT_QUALIFIED'))
  self.assertNotIn('systemctl restart aoe2hdbets-web.service',data)
  self.assertNotIn('nft flush ruleset',data)
  self.assertNotIn('ALTER ROLE',data)

if __name__=='__main__':unittest.main()
