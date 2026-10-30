"""Adversarial exact-W1 remote engine parity: no watered-down shell/rollback.

Controller changes may modify only the external phase wrappers. The actual
W1 native remote script generators, validators and rollback logic must retain
the exact frozen source AST. Run against immutable Git object, not PR main.
"""
from __future__ import annotations
import ast, pathlib, subprocess, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
W1="b46a51f1592c9f296839924ae55e722618b10d35"

def functions(raw):
    tree=ast.parse(raw)
    return {v.name:ast.dump(v,include_attributes=False)
            for v in tree.body if isinstance(v,(ast.FunctionDef,ast.AsyncFunctionDef))}
def original(path):
    p=subprocess.run(["git","show",W1+":"+path],cwd=ROOT,
                     capture_output=True,text=True,timeout=20)
    if p.returncode:raise RuntimeError("frozen W1 Git blob unavailable")
    return p.stdout

class EngineParity(unittest.TestCase):
    def compare_native(self,source,dest,names):
        baseline=functions(original(source))
        copy=functions((ROOT/dest).read_text())
        for name in names:
            with self.subTest(name=name,dest=dest):
                self.assertIn(name,baseline)
                self.assertIn(name,copy)
                self.assertEqual(copy[name],baseline[name],
                    "altered frozen W1 remote mutation/rollback algorithm")

    def test_stage_remote_program_and_truth(self):
        self.compare_native("scripts/aoe2_release_stage.py",
            "scripts/aoe2_solo_website_stage_engine.py",
            ("remote_stage_script","validate_stage_result",
             "persist_durable_stage_receipt","write_local_receipt"))

    def test_activation_remote_rollback_and_truth(self):
        self.compare_native("scripts/aoe2_release_ship.py",
            "scripts/aoe2_solo_website_activation_engine.py",
            ("remote_activation_script","validate_activation_result",
             "recover_certified_activation_result","load_stage_receipt",
             "verify_production_migration_receipt"))

    def test_both_external_engines_require_real_root_nonce_capability(self):
        for dest in ("scripts/aoe2_solo_website_stage_engine.py",
                     "scripts/aoe2_solo_website_activation_engine.py"):
            s=(ROOT/dest).read_text()
            self.assertIn("require_phase_capability",s)
            self.assertIn("signed_capability",s)
            self.assertIn("remote_runner",s)
            self.assertNotIn('from aoe2_release_nonfinancial_admission import require_admission',s)

    def test_uid1000_original_lock_without_new_inode_or_recursive_flock(self):
        source=(ROOT/"scripts/aoe2_solo_website_command_channel.py").read_text()
        self.assertIn("st.st_uid!=1000",source)
        self.assertIn("stat.S_IMODE(st.st_mode)!=0o644",source)
        self.assertIn("os.O_NOFOLLOW|os.O_CLOEXEC",source)
        self.assertIn("pass_fds=(200,)",source)
        self.assertIn("run_as",source)
        self.assertIn("def run_tony",source)
        self.assertIn("--reuid=1000",source)
        self.assertIn("fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)",source)
        self.assertNotIn("os.O_CREAT|os.O_NOFOLLOW,0o600)",source)

if __name__=="__main__":
    unittest.main()
