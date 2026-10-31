"""R25 E owner-action integrity: exact immutable worker and strict phase separation."""
import ast
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
COPY=ROOT/'scripts/r25_e_owner_mac_durable_copy.sh'
READBACK=ROOT/'scripts/r25_e_owner_mac_recovery_readback.sh'
PIN='60f8cd06c0e44bb03fbc95c5fc52d07a6922fc743897248f6c00242e8bdf6418'
E_PIN='606b899cf51c0edc9140da727b1623792277d318a83e8f63b899604a3bc68184'

class OwnerMacCommands(unittest.TestCase):
    def read(self,p):
        s=p.read_text()
        self.assertIn("python3 -B - <<'PY'",s)
        self.assertTrue(s.rstrip().endswith('PY'))
        body=s.split("python3 -B - <<'PY'\n",1)[1].rsplit('\nPY',1)[0]
        ast.parse(body)
        return s
    def test_01_both_syntax_compile(self):
        self.read(COPY);self.read(READBACK)
    def test_02_copy_worker_exact_sha_commit_and_size(self):
        s=self.read(COPY)
        self.assertIn(PIN,s)
        self.assertIn('source_size=22986',s)
        self.assertIn('371b88113a0ee82c0bdee181f13c86c51733593d',s)
        self.assertIn('hashlib.sha256(worker).hexdigest()!=source_sha',s)
    def test_03_copy_plan_then_typed_consent_then_copy(self):
        s=self.read(COPY)
        i=s.index("plan=parse_result(remote('--phase','plan')")
        j=s.index("tty.readline().rstrip")
        k=s.index("receipt=parse_result(remote('--phase','copy'")
        self.assertLess(i,j);self.assertLess(j,k)
        self.assertIn('AUTHORIZE R25 E COPY OLD NEXT',s)
        self.assertIn('approved-plan-sha256',s)
    def test_04_copy_no_direct_web_or_finance_mutation(self):
        s=self.read(COPY)
        for forbidden in ('systemctl stop','systemctl restart','systemctl start',
                          'rm -rf','shutil.rmtree','--delete','chmod -R','chown -R'):
            self.assertNotIn(forbidden,s)
        self.assertIn('StrictHostKeyChecking=yes',s)
    def test_05_independent_validator_only_readonly_script(self):
        s=self.read(READBACK)
        self.assertIn(E_PIN,s)
        self.assertIn('size=23108',s)
        self.assertIn('d40ec0a55fda7f1484c4f9fa37f7168d56bb19e2',s)
        self.assertIn("'--durable-next',path,'--require-phase','RECOVERY_READY'",s)
        self.assertNotIn("'--phase','copy'",s)
    def test_06_different_mac_receipts_and_f_ownership(self):
        a=self.read(COPY);b=self.read(READBACK)
        self.assertIn('COPY_VERIFIED_NOT_RECOVERY_READY',a)
        self.assertIn('R25_E_PHYSICAL_RECOVERY_READY_STORAGE_ONLY_NOT_RELEASE_AUTHORIZATION',b)
        self.assertIn('F #1083 must independently review',b)
        self.assertIn('O_EXCL',a);self.assertIn('O_EXCL',b)

if __name__=='__main__': unittest.main()
