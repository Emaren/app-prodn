"""V11 Steam guarded masked topology under original ProtectHome=true (no funds)."""
from pathlib import Path
from unittest.mock import patch
import hashlib, importlib.util, json, unittest

ROOT=Path(__file__).resolve().parents[1]
HELP=ROOT/'scripts/release/r25_c04_masked_listener_guard_v11.py'
MAIN=ROOT/'scripts/release/r25_steam_refresh_traffic_v11.py'
SWITCH=ROOT/'scripts/release/r25_steam_masked_c04_switch_v11.py'
MANIFEST=ROOT/'docs/release/SESSION_B_C04_V11_INERT_MASK_EVIDENCE_MANIFEST.json'
spec=importlib.util.spec_from_file_location('c04_v11',HELP)
c04=importlib.util.module_from_spec(spec);spec.loader.exec_module(c04)

class OriginalModule:
    def need(self,ok,reason):
        if not ok:raise RuntimeError('HOLD:'+reason)

def sample(sockets=None):
    return {'protected_sockets':sockets or {'8092':[],'8093':[],'3030':['1'],'5432':['2']}}

class MaskedSandboxV11(unittest.TestCase):
    def setUp(self):
        self.original=OriginalModule()
        self.ports={3030:['1'],3032:['2'],8092:[],8093:[],8094:[],8095:[],5432:['3']}
    def simulated_original(self,n=2,other=None,sockets=None):
        def work():
            for _ in range(n):self.original.need(False,'PROTECTED_LISTENER_NOT_UNIQUE')
            if other:self.original.need(False,other)
            return sample(sockets)
        return work
    def run_guard(self,work):
        with patch.object(c04,'attest',side_effect=[self.ports,self.ports]):
            return c04.guarded_snapshot(self.original,work)
    def test_exact_two_accepted_with_original_guard_retained(self):
        previous=self.original.need
        self.assertEqual(self.run_guard(self.simulated_original())['protected_sockets']['8093'],[])
        self.assertEqual(previous,self.original.need)
    def test_third_exception_refused(self):
        with self.assertRaisesRegex(c04.C04Hold,'THIRD_LISTENER_EXCEPTION'):
            self.run_guard(self.simulated_original(3))
    def test_one_exception_refused(self):
        with self.assertRaisesRegex(c04.C04Hold,'EXPECTATION_COUNT_DRIFT'):
            self.run_guard(self.simulated_original(1))
    def test_unrelated_changed_c03_unit_refused(self):
        with self.assertRaisesRegex(RuntimeError,'C03_ORIGINAL_UNIT_TAMPER'):
            self.run_guard(self.simulated_original(other='C03_ORIGINAL_UNIT_TAMPER'))
    def test_reopened_8092_refused(self):
        sockets=sample()['protected_sockets'].copy()
        sockets['8092']=['reopened']
        with self.assertRaisesRegex(c04.C04Hold,'MASKED_LISTENER_CONTENT_DRIFT'):
            self.run_guard(self.simulated_original(sockets=sockets))
    def test_3030_removed_refused(self):
        sockets=sample()['protected_sockets'].copy()
        sockets['3030']=[]
        with self.assertRaisesRegex(c04.C04Hold,'MASKED_LISTENER_CONTENT_DRIFT'):
            self.run_guard(self.simulated_original(sockets=sockets))
    def test_socket_toctou_refused(self):
        changed=dict(self.ports)
        changed[8094]=['unauthorized-financial-listener']
        with patch.object(c04,'attest',side_effect=[self.ports,changed]):
            with self.assertRaisesRegex(c04.C04Hold,'TOCTOU'):
                c04.guarded_snapshot(self.original,self.simulated_original())
    def test_original_guard_restored_after_exception(self):
        old=self.original.need
        with self.assertRaisesRegex(RuntimeError,'C03_ORIGINAL_UNIT_TAMPER'):
            self.run_guard(self.simulated_original(other='C03_ORIGINAL_UNIT_TAMPER'))
        self.assertEqual(self.original.need,old)
    def test_manifest_exact_digest_content_immutable_scope(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         '874df3a5164bf1e8299ce6ed261909f3b2a9bfae3ba3a681a48a9255c73fa3df')
        self.assertEqual(c04.MANIFEST_SHA256,hashlib.sha256(raw).hexdigest())
        obj=json.loads(raw)
        self.assertEqual(obj['unit_sha256'],c04.APPROVED_MASKS)
        self.assertFalse(obj['financial_authorized'])
        self.assertEqual(obj['source_file_mode'],0o644)
        self.assertNotIn('ExecStart',raw.decode())
        self.assertNotIn('Environment=',raw.decode())
    def test_production_guard_uses_sandbox_readable_digest_only(self):
        text=HELP.read_text()
        method=text[text.index('def attest():'):text.index('def guarded_snapshot(')]
        self.assertIn('MANIFEST.read_bytes()',method)
        self.assertIn('C04_READONLY_MANIFEST_FILE_ACL',method)
        self.assertIn('C04_ORIGINAL_UNIT_MANIFEST_SHA_DRIFT',method)
        self.assertNotIn('QUARANTINE',method)
        self.assertNotIn("P('/root",method)
        self.assertIn('LoadState',text)
        self.assertEqual(c04.REQUIRED_CLOSED_PORTS,(8092,8093,8094,8095))
    def test_root_only_controller_attests_canonical_original_bytes(self):
        text=SWITCH.read_text()
        self.assertIn("C04_ROOT_ARCHIVE = P('/root/aoe2war-c04-legacy-settlement-quarantine-20261109')",text)
        self.assertIn("sha(file(path,0o644)) == digest",text)
        self.assertIn("stat.S_IMODE(st.st_mode) == 0o700",text)
        self.assertIn("os.chmod(out,0o444)",text)
        self.assertIn("os.chmod(directory,0o500)",text)
        self.assertIn('stage_verified_digest_only_manifest()',text)
        self.assertNotIn('copy_source(C04_ROOT_ARCHIVE',text)
    def test_v11_release_and_exact_unit_source_bound(self):
        text=MAIN.read_text()
        ctl=SWITCH.read_text()
        self.assertIn("'status':'PASS_EXACT_STEAM_V11_ADMISSION'",text)
        self.assertIn('web-prod-v11',text)
        self.assertIn('C04_EXACT_MASK_HELPER_SOURCE_DRIFT',text)
        self.assertIn("07d95f1079d33b18274fafab912d9ab0af9a0ea22d19b8fcecf64c0af589e653",text)
        self.assertIn("MAIN_SHA = '"+hashlib.sha256(MAIN.read_bytes()).hexdigest()+"'",ctl)
        self.assertIn("HELPER_SHA = '"+hashlib.sha256(HELP.read_bytes()).hexdigest()+"'",ctl)
    def test_one_shot_v9_backout_on_any_failure(self):
        text=SWITCH.read_text()
        for k in ('ALREADY_ATTEMPTED','persist_unit(file(BACKUP,0o600))',
                  "run(['systemctl','daemon-reload']", "run(['systemctl','start',STEAM_TIMER_NAME]"):
            self.assertIn(k,text)
        for forbidden in ('ALTER ROLE','GRANT ','REVOKE ','systemctl unmask','http://127.0.0.1:8092'):
            self.assertNotIn(forbidden,text)
    def test_source_inherits_c03_oneshot_exact_guard_without_edit(self):
        v9=(ROOT/'scripts/release/r25_steam_refresh_traffic_v9.py').read_bytes()
        v10=(ROOT/'scripts/release/r25_steam_refresh_traffic_v10.py').read_bytes()
        self.assertEqual(hashlib.sha256(v9).hexdigest(),
            'cb275a8ae8bc62c373ffe73063e60ff8ca7bd93661b899d887432ad6095cb07a')
        self.assertEqual(hashlib.sha256(v10).hexdigest(),
            '19f19b81139a77b8c03c1011efef6d99640d9b133c5c5c630ff9b982f922ce0e')

if __name__=='__main__':unittest.main()
