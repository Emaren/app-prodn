"""Real child Git mutations are confined despite hostile inherited Git authority."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


fixture=load("contract_git_fixture",ROOT/"tests/test_production_browser_source_binding.py")
python_runner=load("python_contract_environment",ROOT/"scripts/run_python_contract.py")
node_runner=load("node_contract_environment",ROOT/"scripts/run_test_contract.py")

PYTHON_PROBE=r"""
import json,os,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);root.mkdir()
hooks=root/"empty-hooks";hooks.mkdir()
template=root/"empty-template";template.mkdir()
def git(*args):
 return subprocess.check_output(
  ["git","-c","core.hooksPath="+str(hooks),"-c","commit.gpgSign=false",
   "-C",str(root),*args],stderr=subprocess.DEVNULL,text=True).strip()
git("init","-q","--template="+str(template))
git("config","--local","user.name","Child fixture")
git("config","--local","user.email","child@example.invalid")
(root/"fixture-only").write_text("only disposable fixture\n")
git("add",".");git("commit","-qm","disposable child")
print(json.dumps({"worktree":git("rev-parse","--show-toplevel"),
                  "metadata":git("rev-parse","--absolute-git-dir")}))
"""

NODE_PROBE=r"""
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=process.argv[1];fs.mkdirSync(root);
const hooks=path.join(root,"empty-hooks");fs.mkdirSync(hooks);
const template=path.join(root,"empty-template");fs.mkdirSync(template);
const git=(...args)=>cp.execFileSync("git",[
 "-c","core.hooksPath="+hooks,"-c","commit.gpgSign=false","-C",root,...args
],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
git("init","-q","--template="+template);
git("config","--local","user.name","Node child fixture");
git("config","--local","user.email","node-child@example.invalid");
fs.writeFileSync(path.join(root,"fixture-only"),"only disposable fixture\n");
git("add",".");git("commit","-qm","disposable node child");
process.stdout.write(JSON.stringify({
 worktree:git("rev-parse","--show-toplevel"),
 metadata:git("rev-parse","--absolute-git-dir")
}));
"""


class ContractGitEnvironmentTests(unittest.TestCase):
    def test_filters_all_git_authority_without_mutating_parent_or_product_flags(self):
        parent={
            "GIT_DIR":"protected","GIT_WORK_TREE":"protected",
            "GIT_CONFIG_COUNT":"1","GIT_CONFIG_VALUE_0":"private",
            "GIT_INDEX_FILE":"protected-index","git_directory_future":"protected",
            "GITHUB_ACTIONS":"true","GITHUB_SHA":"a"*40,"CI":"true",
            "NODE_OPTIONS":"--max-old-space-size=4096",
            "AOE2WAR_ARTIFACT_SOURCE_SHA":"b"*40,"PATH":os.environ.get("PATH",""),
        }
        original=dict(parent)
        for runner in (python_runner,node_runner):
            result=runner.contract_environment(parent)
            self.assertFalse(any(key.upper().startswith("GIT_") for key in result))
            self.assertEqual(result["GITHUB_ACTIONS"],"true")
            self.assertEqual(result["NODE_OPTIONS"],parent["NODE_OPTIONS"])
            self.assertEqual(result["AOE2WAR_ARTIFACT_SOURCE_SHA"],"b"*40)
            self.assertEqual(parent,original)

    def exercise_runner(self,runner,node=False):
        actual_context=fixture.source_git_context()
        actual_before=fixture.git_fingerprint(actual_context)
        original_run=subprocess.run
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)
            canary=base/"protected-source";canary.mkdir()
            with fixture.isolated_git_fixture(canary) as (canary,git):
                git("config","--local","user.name","Protected source identity")
                (canary/"sentinel").write_text("committed source\n")
                git("add",".");git("commit","-qm","protected source")
            (canary/"sentinel").write_text("must remain unstaged\n")
            (canary/"new-source").write_text("must not enter fixture commit\n")
            context=(canary,canary/".git")
            before=fixture.git_fingerprint(context,include_objects=True)
            child=base/"child-fixture"
            calls=[]
            def launch(arguments,**kwargs):
                calls.append((arguments,kwargs))
                environment=kwargs.get("env")
                self.assertIsInstance(environment,dict)
                self.assertFalse(any(key.upper().startswith("GIT_") for key in environment))
                self.assertEqual(kwargs["cwd"],base)
                probe=([shutil.which("node"),"-e",NODE_PROBE,str(child)] if node else
                       [sys.executable,"-c",PYTHON_PROBE,str(child)])
                result=original_run(probe,cwd=base,env=environment,
                                    capture_output=True,text=True,timeout=30)
                self.assertEqual(result.returncode,0,
                                 "Disposable child failed; raw output intentionally omitted")
                import json
                identity=json.loads(result.stdout)
                self.assertEqual(Path(identity["worktree"]).resolve(),child.resolve())
                self.assertEqual(Path(identity["metadata"]).resolve(),(child/".git").resolve())
                return result
            arguments=types.SimpleNamespace(list=False,json=False)
            incoming_hash=hashlib.sha256(repr(sorted(os.environ.items())).encode()).hexdigest()
            with mock.patch.dict(os.environ,fixture.hostile_git_environment(canary)), \
                 mock.patch.object(runner,"ROOT",base), \
                 mock.patch.object(runner.argparse.ArgumentParser,"parse_args",
                                   return_value=arguments), \
                 mock.patch.object(runner.subprocess,"run",side_effect=launch):
                if node:
                    plan={"active":["tests/disposable.test.mts"],"quarantine":[],
                          "node_flags":["--test"],"discovered":["tests/disposable.test.mts"]}
                    with mock.patch.object(runner,"load_contract",return_value={}), \
                         mock.patch.object(runner,"resolve_plan",return_value=plan):
                        self.assertEqual(runner.main(),0)
                else:
                    with mock.patch.object(runner,"discover_tests",
                                           return_value=["tests/disposable.py"]):
                        self.assertEqual(runner.main(),0)
            self.assertEqual(len(calls),1)
            self.assertEqual(hashlib.sha256(repr(sorted(os.environ.items())).encode()).hexdigest(),
                             incoming_hash)
            self.assertEqual(fixture.git_fingerprint(context,include_objects=True),before)
        self.assertEqual(fixture.git_fingerprint(actual_context),actual_before)

    def test_python_runner_real_git_child_cannot_stage_or_commit_ambient_source(self):
        self.exercise_runner(python_runner)

    @unittest.skipUnless(shutil.which("node"),"Node contract runtime required")
    def test_node_runner_real_git_child_cannot_stage_or_commit_ambient_source(self):
        self.exercise_runner(node_runner,node=True)


if __name__=="__main__":
    unittest.main()
