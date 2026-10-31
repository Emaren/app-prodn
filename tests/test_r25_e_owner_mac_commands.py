"""R25 E owner-action integrity: exact immutable worker and strict phase separation."""
import ast
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
COPY=ROOT/'scripts/r25_e_owner_mac_durable_copy.sh'
READBACK=ROOT/'scripts/r25_e_owner_mac_recovery_readback.sh'
PIN='55ce776c75734121b4ba3f14a7f5edfbae10d9321d5cd6ac45cf1e568412bc87'
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
        self.assertIn('source_size=23254',s)
        self.assertIn('e217b99c830ebc01aa46c4a4b60b3a6cd14a218f',s)
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
    def test_06_plan_hash_and_reserve_checks_use_separate_capacity_maps(self):
        """Regression: plan SHA normalization must not zero the reserve checks."""
        import hashlib
        import json
        import re

        source=self.read(COPY)
        body=source.split("python3 -B - <<'PY'\n",1)[1].rsplit('\nPY',1)[0]
        start=body.index("plan=parse_result(remote('--phase','plan'),'PLAN')")
        end=body.index("\ncampaign=(",start)
        plan_guard=body[start:end]
        self.assertIn("hash_cap=dict(cap)",plan_guard)
        self.assertIn("stable['capacity']=hash_cap",plan_guard)
        self.assertIn("cap.get('attached_free_before_bytes'",plan_guard)
        self.assertIn("cap.get('root_free_before_bytes'",plan_guard)

        raw={
            "schema":"aoe2war.r25.e.old-next-copy-plan.v1",
            "mutations_authorized":False,
            "host":"ubuntu-4gb-hel1-11",
            "original_pid":2625090,
            "old_build_id":"DQ2jMprNQ_Njq6QM8GHju",
            "c_build_id":"-dJl5VyecHu5BKNvfErJe",
            "c_tree_sha256":"5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d",
            "source":"/var/www/AoE2HDBets/app-prodn/.next",
            "destination_root":"/mnt/HC_Volume_105319120/aoe2war/rollbacks",
            "root_device":1,
            "volume_device":2,
            "source_entries":10,
            "source_logical_bytes":114055915,
            "capacity":{
                "old_next_allocated_bytes":128811008,
                "old_next_apparent_bytes":114055915,
                "copy_budget_bytes":678563020,
                "attached_free_before_bytes":21765390336,
                "root_free_before_bytes":59376979968,
                "reserve_bytes":4*1024**3
            }
        }
        stable=dict(raw)
        cap=dict(raw['capacity'])
        cap.pop('attached_free_before_bytes')
        cap.pop('root_free_before_bytes')
        stable['capacity']=cap
        raw['plan_sha256']=hashlib.sha256(
            json.dumps(stable,sort_keys=True,separators=(',',':')).encode()
        ).hexdigest()

        def execute(plan):
            def bad(reason):
                raise RuntimeError(reason)
            globals_={
                "hashlib":hashlib,"json":json,"re":re,
                "remote":lambda *a:None,
                "parse_result":lambda *a:plan,
                "hold":bad,
                "canonical":lambda v:json.dumps(
                    v,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False
                ).encode(),
            }
            exec(compile(plan_guard,"pinned-mac-plan-only","exec"),globals_)
            return globals_
        verified=execute(raw)
        self.assertEqual(verified['plan_hash'],raw['plan_sha256'])
        self.assertEqual(verified['cap']['attached_free_before_bytes'],21765390336)
        self.assertEqual(verified['cap']['root_free_before_bytes'],59376979968)
        self.assertNotIn('attached_free_before_bytes',verified['hash_cap'])
        self.assertNotIn('root_free_before_bytes',verified['hash_cap'])

        low=json.loads(json.dumps(raw))
        low['capacity']['attached_free_before_bytes']=low['capacity']['copy_budget_bytes']
        with self.assertRaisesRegex(RuntimeError,"READONLY_PLAN_PROVENANCE_OR_BUDGET_MISMATCH"):
            execute(low)
        bad_sha=json.loads(json.dumps(raw))
        bad_sha['plan_sha256']='0'*64
        with self.assertRaisesRegex(RuntimeError,"READONLY_PLAN_PROVENANCE_OR_BUDGET_MISMATCH"):
            execute(bad_sha)

    def test_07_readback_campaign_uses_operator_tty_not_consumed_heredoc_stdin(self):
        """Exercise the actual campaign prompt with a controlled operator terminal."""
        import io
        import re

        s=self.read(READBACK)
        self.assertNotIn("campaign=input(",s)
        self.assertIn("open('/dev/tty','r+')",s)
        self.assertIn("tty.readline(160).strip()",s)
        body=s.split("python3 -B - <<'PY'\\n",1)[1].rsplit('\\nPY',1)[0]
        start=body.index("# The Python program itself arrives via a heredoc:")
        stop=body.index("\\npath='/mnt/HC_Volume_105319120",start)
        prompt=body[start:stop]
        campaign="r25-e-20261031T204421Z-276babc395a0a07a32c3"

        class FakeTTY(io.StringIO):
            def __init__(self, value):
                super().__init__(value+"\\n")
                self.prompts=[]
            def write(self, value):
                self.prompts.append(value)
                return len(value)

        def check(value):
            tty=FakeTTY(value)
            def fail(msg):
                raise RuntimeError(msg)
            g={"open":lambda path,mode: tty,
               "hold":fail, "re":re}
            exec(compile(prompt,"e-readback-tty","exec"),g)
            return g,tty

        good,tty=check(campaign)
        self.assertEqual(good["campaign"],campaign)
        self.assertIn("Paste exact NEW campaign",''.join(tty.prompts))
        with self.assertRaisesRegex(RuntimeError,"NEW_CAMPAIGN_ID_REQUIRED"):
            check("../r25-e-20261031T204421Z-276babc395a0a07a32c3")
        with self.assertRaisesRegex(RuntimeError,"NEW_CAMPAIGN_ID_REQUIRED"):
            check("invalid")
        self.assertNotIn("'--phase','copy'",prompt)

    def test_06_different_mac_receipts_and_f_ownership(self):
        a=self.read(COPY);b=self.read(READBACK)
        self.assertIn('COPY_VERIFIED_NOT_RECOVERY_READY',a)
        self.assertIn('R25_E_PHYSICAL_RECOVERY_READY_STORAGE_ONLY_NOT_RELEASE_AUTHORIZATION',b)
        self.assertIn('F #1083 must independently review',b)
        self.assertIn('O_EXCL',a);self.assertIn('O_EXCL',b)

if __name__=='__main__': unittest.main()
