"""Negative admission security tests for exact Linux CI runtime staging, no host mutations."""
from __future__ import annotations
import importlib.util
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sb_stage_v8',ROOT/'scripts/release/r25_verified_ci_artifact_stage_v8.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ExactArtifactStaging(unittest.TestCase):
 def test_release_pins_exact_source_and_archives(self):
  self.assertEqual(m.SOURCE,'4ab96cc7c1c0ba43a0403795485d3f410a6ba07f')
  self.assertEqual(m.BUILD,'YF_YxSAxc0izAfRG0ARsc')
  self.assertEqual(m.TAR_SHA,'7be8e6f9401f7d29be176c0704339e9b2a38001ae0122b6353196fc23840f42f')
  self.assertEqual(m.MANIFEST_SHA,'ab1071cd5928591fe11a16eab25d9884d19eaa60ebadd43e23a73918cd86b2d4')
  self.assertEqual(m.ENTRIES,44954)
  self.assertEqual(m.NEW_WEB,'42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621')
 def test_stage_receipt_preimage_is_deterministically_pinned(self):
  receipt={'schema':'aoe2war.app.r25.ci-runtime-exact-staging.v1',
   'status':'PASS_EXACT_RUNTIME_STAGED_NOT_STARTED','source_sha':m.SOURCE,
   'build_id':m.BUILD,'build_version':m.VERSION,'runtime_tar_sha256':m.TAR_SHA,
   'runtime_manifest_sha256':m.MANIFEST_SHA,'runtime_entries':m.ENTRIES,
   'finance_authorized':False,'public_deployed':False}
  raw=(json.dumps(receipt,sort_keys=True,separators=(',',':'))+'\n').encode()
  self.assertEqual(hashlib.sha256(raw).hexdigest(),m.RECEIPT_SHA)
 def test_reject_traversal_and_secret_paths(self):
  for name in ('/etc/passwd','../rollback','a/../../var','a\\b','a/.env.local',
               '.env.production','a/.git/config','foo/'+('../'*40)+'exit'):
   with self.subTest(name=name),self.assertRaises(RuntimeError):m.member_rel(name)
  self.assertEqual(str(m.member_rel('.env.production.example')),'.env.production.example')
  self.assertEqual(str(m.member_rel('node_modules/.bin/next')),'node_modules/.bin/next')
 def test_reject_symlink_escape(self):
  # macOS /var is a symlink to /private/var; use a resolved synthetic base
  # rather than weakening the Linux production stage's exact-path guard.
  stage=Path('/tmp').resolve()/'test-r25-uncreated-stage-v8'
  with patch.object(m,'STAGE',stage):
   for target in ('/etc/passwd','../../../../etc/shadow',''):
    with self.subTest(target=target),self.assertRaises(RuntimeError):
     m.validate_symlink(stage/'node_modules'/'x',target)
   m.validate_symlink(stage/'node_modules'/'x','../lib/a.js')
 def test_not_root_never_stages(self):
  with patch.object(m.os,'geteuid',return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'HOLD_ROOT_REQUIRED'):
    m.stage()
 def test_zip_hash_without_real_bytes_cannot_be_qualified(self):
  # No fake source receives PASS even if a test injects a fake ZIP path.
  with patch.object(m.os,'geteuid',return_value=0), \
       patch.object(m,'ZIP_SHA','NOT_ENROLLED'):
   with self.assertRaisesRegex(RuntimeError,'HOLD_ZIP_SHA_NOT_PHYSICALLY_PINNED'):
    m.stage()
 def test_no_runtime_or_finance_mutation_helpers(self):
  source=(ROOT/'scripts/release/r25_verified_ci_artifact_stage_v8.py').read_text()
  for disallowed in ('systemctl restart','psql ','nft -f','ALTER ROLE','GRANT ', 'DROP TABLE','subprocess.Popen'):
   self.assertNotIn(disallowed,source)
  self.assertIn('candidate-3032-unit-NOT-INSTALLED.service',source)
  self.assertIn('HOLD_NO_WEBSITE_OR_CHAIN_CHANGE',source)
  self.assertIn("'public_deployed':False",source)
 def test_existing_stage_protected(self):
  source=(ROOT/'scripts/release/r25_verified_ci_artifact_stage_v8.py').read_text()
  self.assertIn("'CANDIDATE_STAGE_ALREADY_PRESENT'",source)
  self.assertIn("'EXACT_RELEASE_ROOT_ALREADY_PRESENT'",source)
  self.assertIn("'ROOT_RESERVE_BELOW_7GIB'",source)
  self.assertIn("'POSTSTAGE_ROOT_RESERVE_LOW'",source)

if __name__=='__main__': unittest.main()
