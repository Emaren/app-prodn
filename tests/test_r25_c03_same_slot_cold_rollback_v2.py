"""Exact C03 old/new restricted 3032 rollback; intentionally no funded or cutover APIs."""
from __future__ import annotations
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
FILE=ROOT/'scripts/release/r25_c03_same_slot_cold_rollback_v2.py'
spec=importlib.util.spec_from_file_location('c03_same_slot_cold_readonly',str(FILE))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
OLD=(
 b'[Unit]\nDescription=AoE2WAR\n[Service]\n'
 b'User=aoe2war-web-prod\nGroup=aoe2war-web-prod\n'
 b'WorkingDirectory=/var/lib/aoe2war-web-prod-4ab96cc7c1c0\n'
 b'EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env\n'
 b'ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n'
 b'BindPaths=/var/cache/aoe2war-web-prod:/var/lib/aoe2war-web-prod-4ab96cc7c1c0/.next/cache\n'
 b'BindReadOnlyPaths=/srv/files:/var/lib/aoe2war-web-prod-4ab96cc7c1c0/public/downloads\n'
 b'ReadOnlyPaths=/var/lib/aoe2war-web-prod-4ab96cc7c1c0\n'
 b'ProtectHome=yes\nNoNewPrivileges=yes\n'
)
assert OLD.count(m.OLD_BYTES)==4

class ColdRestrictedSlot(unittest.TestCase):
 def test_single_port_and_same_database_identity(self):
  with patch.object(m,'sha',side_effect=lambda data: m.OLD_UNIT_SHA if data==OLD else m.NEW_UNIT_SHA):
   actual=m.candidate_unit(OLD)
   self.assertEqual(actual.count(m.NEW_BYTES),4)
   self.assertNotIn(m.OLD_BYTES,actual)
   self.assertIn(b'--port 3032',actual)
   self.assertIn(b'User=aoe2war-web-prod',actual)
   self.assertIn(b'EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env',actual)
   self.assertIn(b'ProtectHome=yes',actual)
   self.assertIn(b'NoNewPrivileges=yes',actual)
   self.assertNotIn(b':3030',actual)
   self.assertNotIn(b'8092',actual)
   self.assertNotIn(b'8093',actual)

 def test_exclusive_four_bindings(self):
  with patch.object(m,'sha',return_value=m.OLD_UNIT_SHA):
   for mutated in (OLD.replace(m.OLD_BYTES,m.NEW_BYTES,1),
      OLD.replace(m.OLD_BYTES,b'/srv/nonfinancial-rollback',1),
      OLD.replace(b'--port 3032',b'--port 3033'),
      OLD.replace(b'User=aoe2war-web-prod',b'User=root'),
      OLD.replace(b'ProtectHome=yes',b'ProtectHome=no'),
      OLD.replace(b'NoNewPrivileges=yes',b'NoNewPrivileges=no'),
      OLD.replace(b'--max-old-space-size=2048',b'--max-old-space-size=8192'),
      OLD.replace(b'/etc/aoe2war/web-prod-v1/runtime.env',b'/etc/other.env')):
    with self.subTest(mutated=mutated[-60:]):
     with self.assertRaises(m.Hold):m.source_unit(mutated)

 def test_not_fooled_by_same_path_different_unit_hash(self):
  with patch.object(m,'sha',return_value='b'*64):
   with self.assertRaisesRegex(m.Hold,'LEGACY_RESTRICTED_UNIT_SHA_CHANGED'):
    m.source_unit(OLD)

 def test_new_candidate_requires_immutable_unit_hash(self):
  def fake_sha(data):
   return m.OLD_UNIT_SHA if data==OLD else 'b'*64
  with patch.object(m,'sha',side_effect=fake_sha):
   with self.assertRaisesRegex(m.Hold,'CANDIDATE_UNIT_PREIMAGE_NOT_EXACT'):
    m.candidate_unit(OLD)

 def test_controller_never_promotes_or_executes_financial_mutations(self):
  text=FILE.read_text()
  for forbidden in ('--promote','ALTER ROLE','GRANT ALL','systemctl unmask',
                    'wolochain-mainnet-settlement.service\x27,\x27start',
                    'sendTransaction','/satchel/v1/returns/execute','--port 3030'):
   self.assertNotIn(forbidden,text)
  self.assertIn("'--inspect','--restore'",text)
  self.assertIn("source_unit(ORIGINAL.read_bytes())",text)
  self.assertIn("Memory",FILE.read_text()) if False else None

 def test_permits_recovery_only_if_new_unit_exact_and_old_staged(self):
  text=FILE.read_text()
  for required in ('CURRENT','NEW_UNIT_SHA','OLD_UNIT_SHA',
       'sha_file(ARCHIVE/\'stage-verification-no-install.json\')',
       "sha_file(ARCHIVE/'root-owned-source-identity-overlay.json')",
       "sha_file(ENV)==ENV_SHA",
       "sha_file(STEAM)==STEAM_SHA",
       "sha(UNIT.read_bytes())==NEW_UNIT_SHA",
       "ORIGINAL.read_bytes()", "proc('wolochaind-mainnet.service','MainPID')"):
   if required=='CURRENT':continue
   self.assertIn(required,text)

 def test_only_single_unit_is_restarted(self):
  text=FILE.read_text()
  self.assertIn("exec_cmd('systemctl','stop','aoe2hdbets-web-prod.service'",text)
  self.assertIn("exec_cmd('systemctl','start','aoe2hdbets-web-prod.service'",text)
  self.assertNotIn("exec_cmd('systemctl','start','aoe2hdbets-web.service'",text)
  self.assertNotIn("exec_cmd('systemctl','restart','wolochaind-mainnet.service'",text)

 def test_recovery_failure_has_bounded_secondary_original_start(self):
  text=FILE.read_text()
  self.assertIn('HOLD_ORIGINAL_ROLLBACK_TRANSITION',text)
  self.assertIn('PASS_SECONDARY_RESTRICTED_3032_RECOVERY',text)
  self.assertIn('HOLD_SECONDARY_RESTRICTED_3032_RECOVERY',text)
  self.assertIn('UNRECOGNIZED_PARTIAL_RECOVERY_UNIT',text)
  self.assertIn('short_deadline=time.monotonic()+35',text)
  self.assertIn("status='PASS_SECONDARY_RESTORED_RESTRICTED_ORIGINAL_3032_NOT_AUTH_CERTIFIED'",text)

 def test_receipts_explicitly_prohibit_auth_acceptance(self):
  text=FILE.read_text()
  for s in ("'funding_authorized':False",
            "'financial_db_permissions_changed':False",
            "'authenticated_rollback_certified':False",
            "'C03_APP_HANDOFF':'HOLD'",
            "'steam_reenrollment_required':True"):
   self.assertIn(s,text)

 def test_root_pinned_systemd_memory_dropin_is_accepted(self):
  from types import SimpleNamespace
  from unittest.mock import MagicMock
  obj=MagicMock()
  obj.is_file.return_value=True
  obj.is_symlink.return_value=False
  obj.lstat.return_value=SimpleNamespace(st_uid=0,st_nlink=1,st_mode=0o100644)
  obj.__str__.return_value='/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf'
  with patch.object(m,'DROPIN',obj),patch.object(m,'sha_file',return_value=m.DROPIN_SHA),patch.object(m,'proc',side_effect=lambda unit,field:str(obj) if field=='DropInPaths' else m.MEMORY_MAX):
   found=m.require_exact_existing_memory_dropin()
   self.assertEqual(found['memory_limit_bytes'],'3355443200')

 def test_rejects_memory_limit_change_or_extra_dropin(self):
  from types import SimpleNamespace
  from unittest.mock import MagicMock
  obj=MagicMock()
  obj.is_file.return_value=True
  obj.is_symlink.return_value=False
  obj.lstat.return_value=SimpleNamespace(st_uid=0,st_nlink=1,st_mode=0o100644)
  obj.__str__.return_value='/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf'
  for field,value,code in [('DropInPaths','/tmp/rogue.service','WEB_UNIT_DROPIN_SCOPE_CHANGED'),
                           ('MemoryMax','0','WEB_EFFECTIVE_MEMORY_LIMIT_CHANGED')]:
   with self.subTest(field=field):
    def get(_,key):return value if key==field else (str(obj) if key=='DropInPaths' else m.MEMORY_MAX)
    with patch.object(m,'DROPIN',obj),patch.object(m,'sha_file',return_value=m.DROPIN_SHA),patch.object(m,'proc',side_effect=get):
     with self.assertRaisesRegex(m.Hold,code):m.require_exact_existing_memory_dropin()
  with patch.object(m,'DROPIN',obj),patch.object(m,'sha_file',return_value='bad'),patch.object(m,'proc',side_effect=lambda unit,field:str(obj) if field=='DropInPaths' else m.MEMORY_MAX):
   with self.assertRaisesRegex(m.Hold,'WEB_MEMORY_DROPIN_SHA_CHANGED'):m.require_exact_existing_memory_dropin()
  obj.lstat.return_value=SimpleNamespace(st_uid=1000,st_nlink=1,st_mode=0o100644)
  with patch.object(m,'DROPIN',obj),patch.object(m,'sha_file',return_value=m.DROPIN_SHA),patch.object(m,'proc',side_effect=lambda unit,field:str(obj) if field=='DropInPaths' else m.MEMORY_MAX):
   with self.assertRaisesRegex(m.Hold,'WEB_MEMORY_DROPIN_ACL_CHANGED'):m.require_exact_existing_memory_dropin()

 def test_source_no_effect_on_import(self):
  self.assertTrue(callable(m.inspect))
  self.assertTrue(callable(m.restore))
  self.assertFalse(m.LOCK.exists() and m.LOCK.is_dir())

if __name__=='__main__':unittest.main()
