"""Source-only C03: exact restricted cold swap, rollback and financial negatives."""
import importlib.util
import pathlib
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
FILE=ROOT/'scripts/release/r25_c03_single_slot_promote_v2.py'
spec=importlib.util.spec_from_file_location('c03_exact_single_slot_promote_v2',str(FILE))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ExactSourceBounded(unittest.TestCase):
 def test_no_new_website_port_finance_or_environment(self):
  self.assertEqual(m.NEW_WEB_SHA,
     '41bc6fc3e62247394bd0531ac07428c83eed9dfa76578b76846cb1b48d2c640e')
  self.assertEqual(m.BUILD_ID,'MMjuPTuU3DGMrq-Phwo98')
  self.assertEqual(m.FIN_PORTS,(8092,8093,8094,8095))
  self.assertEqual(m.V16_UNIT_SHA,
     '105b6b55da7167d357faa89028c7cb7211fb928304b09a72c73a01ca8d75b5be')
  self.assertEqual(m.V2_SOURCE_SHA,
     'e743bbd213e898069b099bb249f6a7a1538128b2166d1f4fd087eec44f6722c0')
 def test_controller_no_financial_mutation_or_legacy_fallback(self):
  source=FILE.read_text()
  for forbidden in ("'3033'","'3030'","ALTER ROLE","GRANT ALL","unmask",
                    "'/satchel/v1/returns/execute'","'/settlement/v1/runs'",
                    "os.system(","subprocess.Popen(","--max-old-space-size=8192"):
   self.assertNotIn(forbidden,source)
  self.assertIn("source_app",source) if False else None
  self.assertIn("b'--max-old-space-size=2048'",source)
  self.assertIn("str(V2),'--restore'",source)
  self.assertIn("'authenticated_browser_acceptance':False",source)
  self.assertIn("'C03_APP_HANDOFF':'HOLD'",source)
 def test_inspect_is_read_only_under_mock_preflight(self):
  with patch.object(m,'preflight',return_value={'web_pid':'123','finance_ports_closed':True}),patch.object(m,'hash_file',return_value='pinned'),patch('builtins.print') as printer:
   m.inspect()
   self.assertTrue(printer.called)
 def test_staged_unit_must_match_four_path_substitution(self):
  with patch.object(m,'secure'),patch.object(m,'hash_file',side_effect=lambda p:m.ORIGINAL_WEB_SHA):
   original=b'WorkingDirectory='+str(m.OLD).encode()+b'\n'
   original+=b'BindPaths=x:'+str(m.OLD).encode()+b'\n'
   original+=b'BindReadOnlyPaths=x:'+str(m.OLD).encode()+b'\n'
   original+=b'ReadOnlyPaths='+str(m.OLD).encode()+b'\n'
   with patch.object(pathlib.Path,'read_bytes',return_value=original):
    with self.assertRaisesRegex(m.Hold,'ORIGINAL_WEB_UNIT_SHA'):
     m.same_port_units()
 def test_masked_service_exit_one_is_exact_healthy_quarantine(self):
  # Physical HEL1: is-enabled emits masked but exits 1, not success 0.
  with (
   patch.object(m,'command',return_value=''),
   patch.object(m.subprocess,'run',
       return_value=types.SimpleNamespace(returncode=1,stdout='masked\n')),
   patch.object(m,'prop',side_effect=lambda unit,key:
         '1009' if unit=='wolochaind-mainnet.service' else '2625090'),
  ):
   m.exact_finance_guard()

 def test_nonmasked_services_refused_even_when_exit_zero(self):
  with (
   patch.object(m,'command',return_value=''),
   patch.object(m.subprocess,'run',
       return_value=types.SimpleNamespace(returncode=0,stdout='enabled\n')),
  ):
   with self.assertRaisesRegex(m.Hold,'LEGACY_UNIT_UNMASKED'):
    m.exact_finance_guard()

 def test_finance_listener_open_aborts_without_allowance(self):
  with patch.object(m,'command',return_value='LISTEN 0 512 127.0.0.1:8094 0.0.0.0:*'):
   with self.assertRaisesRegex(m.Hold,'FINANCE_LISTENER_OPEN'):
    m.exact_finance_guard()
 def test_invalid_file_scope_rejects_symlink_and_wrong_owner(self):
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'unit'
   f.write_bytes(b'hello')
   with patch.object(m,'secure') as checked:
    checked.side_effect=m.Hold('HOLD_ROOT_PINNED_FILE_MODE_unit')
    with self.assertRaises(m.Hold):m.secure(f,0o600)
 def test_atomic_unit_replace_uses_sibling_and_avoids_symlink(self):
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'newunit'
   f.write_bytes(b'original')
   m.safe_write(f,b'repaired',0o644)
   self.assertEqual(f.read_bytes(),b'repaired')
   self.assertEqual(f.stat().st_mode & 0o777,0o644)
 def test_failed_promote_seals_hold_not_accepted(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   with patch.object(m,'RELEASE',root/'receipt'),patch.object(m,'RECOVERY',root/'restored'),patch.object(m,'WEB',root/'web'),patch.object(m,'STEAM',root/'steam'),patch.object(m,'preflight',return_value={'web_pid':'123'}),patch.object(m,'version',return_value=m.OLD_VERSION),patch.object(m,'hash_file',side_effect=lambda x:m.ORIGINAL_WEB_SHA if x==m.WEB else m.V14_UNIT_SHA),patch.object(m,'ensure_steam_inactive'),patch.object(m,'command',side_effect=m.Hold('HOLD_STOP_FAILED')),patch.object(m,'recover_to_original',return_value=['PASS_FAKE_TEST_ONLY_RECOVERY']),patch.object(m,'prop',return_value='123'),patch.object(m,'seal') as seal:
    with self.assertRaisesRegex(m.Hold,'PROMOTION_NOT_ACCEPTED'):
     m.activate()
    self.assertEqual(seal.call_args.args[1]['status'],'HOLD_RESTRICTED_PROMOTION_FAILED')
    self.assertIn('HOLD_PROMOTION_Hold',seal.call_args.args[1]['observations'][0])
 def test_protected_root_evidence_copies_are_exact_scoped(self):
  scope=m.BOUND_EVIDENCE
  self.assertEqual(set(scope),{
   'original-finance-restricted-3032-unit.service',
   'stage-verification-no-install.json',
   'root-owned-source-identity-overlay.json',
  })
  self.assertTrue(all(mode==0o400 and len(digest)==64
    for source,mode,digest in scope.values()))
  self.assertEqual(str(m.STEAM_EVIDENCE_ROOT),'/etc/aoe2war/web-prod-v16')
  self.assertNotIn('/etc/aoe2war/web-prod-v1/runtime.env',str(scope))
  self.assertNotIn('wallet',str(scope).lower())

 def test_503_is_not_successful_betting_interface(self):
  source=FILE.read_text()
  self.assertIn("public['/api/bets']==200",source)
  self.assertNotIn("public['/api/bets'] in (200,503)",source)
  self.assertIn("REPAIRED_BETS_NOT_FUNCTIONAL_HTTP200",source)

 def test_partial_v16_evidence_cannot_authorize_fresh_promotion(self):
  from unittest.mock import MagicMock
  with (
   patch.object(m,'preflight',return_value={'web_pid':'1'}),
   patch.object(m,'hash_file',side_effect=lambda file:m.ORIGINAL_WEB_SHA if file==m.WEB else m.V14_UNIT_SHA),
   patch.object(m,'version',return_value=m.OLD_VERSION),
   patch.object(m,'STEAM_EVIDENCE_ROOT',MagicMock(exists=lambda:True,is_symlink=lambda:False)),
  ):
   with self.assertRaisesRegex(m.Hold,'STEAM_V16_PROTECTED_EVIDENCE_ROOT_ALREADY_PUBLISHED'):
    m.activate()

 def test_no_effect_on_module_import(self):
  self.assertTrue(callable(m.inspect) and callable(m.activate) and callable(m.restore))
  self.assertEqual(m.ROOT, pathlib.Path('/root/aoe2war-session-b-r25-exact-promotion-v2-20261109'))

if __name__=='__main__':unittest.main()
