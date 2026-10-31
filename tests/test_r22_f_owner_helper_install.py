import ast
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parents[1] / 'deploy' / 'solo-native-audit'
S = HERE/'r22_f_owner_sign_install_permit.py'
R = HERE/'r22_f_hel1_install_verify.py'

def module(path):
    import importlib.util
    spec=importlib.util.spec_from_file_location(path.stem,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

class R22Tests(unittest.TestCase):
    def test_compile(self):
        compile(S.read_bytes(),str(S),'exec')
        compile(R.read_bytes(),str(R),'exec')
    def test_owner_false_path_holds(self):
        r=subprocess.run([sys.executable,str(S),'--owner-rsa-private-key','/definitely/absent/r22.pem'],capture_output=True,text=True)
        self.assertEqual(r.returncode,2)
        self.assertIn('OWNER_PRIVATE_KEY_PATH_MISSING',r.stderr)
    def test_hel1_wrong_host_holds_before_sudo_or_reading_permit(self):
        r=subprocess.run([sys.executable,str(R)],capture_output=True,text=True)
        self.assertEqual(r.returncode,2)
        self.assertIn('EXACT_ORIGINAL_HEL1_TONY_REQUIRED',r.stderr)
        self.assertNotIn('Authenticating',r.stdout)
    def test_owner_signer_uses_real_tty_for_encrypted_key(self):
        x=S.read_text()
        self.assertEqual(x.count('with open("/dev/tty", "rb", buffering=0)'),2)
        self.assertEqual(x.count('stdin=owner_tty'),2)
        self.assertIn('OWNER_RSA_SPKI_SHA256_NOT_PINNED_OWNER',x)
    def test_original_source_and_candidate_pin(self):
        x=module(R)
        self.assertEqual(x.INSTALLER,'9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040')
        self.assertEqual(x.MANIFEST,'874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc')
        self.assertEqual(x.BUNDLE,'dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74')
        self.assertEqual(x.CONTROLLER,'18052e01a191b15525664c1a058de80d7a8bc150')
    def test_root_memory_loader_plan_never_invoked_tty_and_cleanup(self):
        x=module(R)
        compile(x.ROOT,'<r22-root>','exec')
        self.assertIn('("install","verify")',x.ROOT)
        self.assertNotIn('"plan","install"',x.ROOT)
        self.assertIn('os.O_NOFOLLOW',x.ROOT)
        self.assertIn('OWNER_SIGNATURE_NOT_VALID',x.ROOT)
        self.assertIn('ROOT_APPROVAL_ALREADY_EXISTS_NEEDS_DISTINCT_REVIEW',x.ROOT)
        self.assertIn('with open("/dev/tty"',R.read_text())
        self.assertIn('"/usr/bin/sudo","-k"',R.read_text())
    def test_original_rsa_domain_and_canonical_signed_intent_roundtrip_synthetic_key(self):
        x=module(S)
        with tempfile.TemporaryDirectory() as temp:
            key=Path(temp)/'synthetic.pem';msg=Path(temp)/'message';pub=Path(temp)/'pub.pem';sig=Path(temp)/'sig'
            subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(key)],stderr=subprocess.DEVNULL,check=True)
            subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-out',str(pub)],check=True)
            t=datetime.now(timezone.utc)
            body={'operation':'install','manifest_sha256':x.MANIFEST,'controller_commit':x.CTRL,
                  'issued_at':t.isoformat(timespec='seconds').replace('+00:00','Z'),
                  'expires_at':(t+timedelta(minutes=10)).isoformat(timespec='seconds').replace('+00:00','Z')}
            raw=x.DOM+x.canon(body)
            msg.write_bytes(raw)
            subprocess.run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(sig),str(msg)],check=True)
            self.assertEqual(subprocess.run(['openssl','dgst','-sha256','-verify',str(pub),'-signature',str(sig),str(msg)],capture_output=True).returncode,0)
            self.assertEqual(raw[:len(x.DOM)],b'AOE2WAR.SOLO_OWNER.ROOT_HELPER_INSTALL.V2\n')
            bad=x.DOM+x.canon({**body,'operation':'rollback'});msg.write_bytes(bad)
            self.assertNotEqual(subprocess.run(['openssl','dgst','-sha256','-verify',str(pub),'-signature',str(sig),str(msg)],capture_output=True).returncode,0)
    def test_synthetic_private_key_fails_original_spki(self):
        with tempfile.TemporaryDirectory() as temp:
            key=Path(temp)/'synthetic.pem'
            subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(key)],stderr=subprocess.DEVNULL,check=True)
            os.chmod(key,0o600)
            # GitHub CI has no controlling /dev/tty. Mock only this test's
            # terminal handle: synthetic key is intentionally UNENCRYPTED,
            # so OpenSSL does not need a passphrase and the real SPKI test
            # must be reached. Production signer still requires /dev/tty.
            from unittest import mock
            original_open = open
            def local_tty(path,*args,**kwargs):
                return original_open(os.devnull if path=="/dev/tty" else path,*args,**kwargs)
            x=module(S)
            with mock.patch("builtins.open",side_effect=local_tty):
                with mock.patch.object(sys,"argv",["<synthetic_signer>","--owner-rsa-private-key",str(key)]):
                    with self.assertRaisesRegex(ValueError,'OWNER_RSA_SPKI_SHA256_NOT_PINNED_OWNER'):
                        x.main()
if __name__=='__main__':unittest.main()
