"""Disposable Git fixtures cannot inherit the real source repository authority."""
import contextlib
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "production_browser",ROOT/"scripts/aoe2_r25_g_browser_acceptance.py"
)
browser=importlib.util.module_from_spec(spec);spec.loader.exec_module(browser)


def isolated_git_environment(environ=None):
    source=os.environ if environ is None else environ
    clean={key:value for key,value in source.items()
           if not key.upper().startswith("GIT_")}
    clean.update({
        "GIT_CONFIG_NOSYSTEM":"1",
        "GIT_CONFIG_GLOBAL":os.devnull,
        "GIT_ATTR_NOSYSTEM":"1",
        "GIT_TERMINAL_PROMPT":"0",
    })
    return clean


@contextlib.contextmanager
def isolated_git_fixture(root):
    supplied=Path(root)
    if supplied.is_symlink():
        raise ValueError("Disposable fixture symlink forbidden")
    root=supplied.resolve(strict=True)
    if root == ROOT.resolve():
        raise ValueError("Source checkout cannot be a disposable fixture")
    if (root/".git").exists():
        raise ValueError("Disposable fixture must start without Git metadata")
    metadata=root/".git"
    template=root/".empty-git-template";template.mkdir()
    hooks=root/".empty-git-hooks";hooks.mkdir()
    env=isolated_git_environment()
    prefix=[
        "git","--git-dir",str(metadata),"--work-tree",str(root),
        "-c","core.hooksPath="+str(hooks),"-c","commit.gpgSign=false",
    ]
    def git(*arguments):
        if arguments[0] != "init":
            if (not metadata.is_dir() or metadata.is_symlink()
                    or metadata.stat().st_uid != os.getuid()):
                raise ValueError("Fixture Git metadata authority changed")
        return subprocess.check_output(
            [*prefix,*arguments],cwd=root,env=env,
            stderr=subprocess.DEVNULL,text=True,
        ).strip()
    # Browser helper read-only Git calls also need this isolated ambient scope.
    # Restore the caller's complete environment even when a fixture fails.
    with mock.patch.dict(os.environ,env,clear=True):
        git("init","-q","--template="+str(template))
        if Path(git("rev-parse","--absolute-git-dir")).resolve() != metadata:
            raise ValueError("Fixture Git directory escaped")
        if Path(git("rev-parse","--show-toplevel")).resolve() != root:
            raise ValueError("Fixture worktree escaped")
        git("config","--local","user.name","Fixture")
        git("config","--local","user.email","fixture@example.invalid")
        yield root,git


def source_git_context():
    """Locate actual source metadata read-only; UID650 may use external metadata."""
    worktree=os.environ.get("GIT_WORK_TREE")
    metadata=os.environ.get("GIT_DIR")
    if worktree and metadata and Path(worktree).resolve() == ROOT.resolve():
        return ROOT.resolve(),Path(metadata).resolve()
    if (ROOT/".git").exists():
        env=isolated_git_environment()
        result=subprocess.check_output(
            ["git","-C",str(ROOT),"rev-parse","--absolute-git-dir"],
            env=env,stderr=subprocess.DEVNULL,text=True,
        ).strip()
        return ROOT.resolve(),Path(result).resolve()
    return None


def git_fingerprint(context, include_objects=False):
    """Compare hashes only; never expose author configuration or credential values."""
    if context is None:
        return None
    worktree,metadata=context
    env=isolated_git_environment()
    env["GIT_OPTIONAL_LOCKS"]="0"
    prefix=[
        "git","--no-optional-locks","--git-dir",str(metadata),
        "--work-tree",str(worktree),"-c","core.fsmonitor=false",
        "-c","core.hooksPath="+os.devnull,
    ]
    def query(*args):
        return subprocess.check_output(
            [*prefix,*args],cwd=worktree,env=env,stderr=subprocess.DEVNULL
        )
    common=Path(query("rev-parse","--git-common-dir").decode().strip())
    if not common.is_absolute():
        common=(worktree/common).resolve()
    def file_hash(path):
        return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    result={
        "configSha256":file_hash(common/"config"),
        "worktreeConfigSha256":file_hash(metadata/"config.worktree"),
        "indexSha256":file_hash(metadata/"index"),
        "headSha256":hashlib.sha256(query("rev-parse","HEAD")).hexdigest(),
        "statusSha256":hashlib.sha256(query(
            "status","--porcelain=v1","--untracked-files=normal"
        )).hexdigest(),
    }
    if include_objects:
        rows=sorted(
            (str(path.relative_to(common/"objects")),file_hash(path))
            for path in (common/"objects").rglob("*") if path.is_file()
        )
        result["objectsSha256"]=hashlib.sha256(repr(rows).encode()).hexdigest()
    return result


def exercise_application_fixture(test, root):
    with isolated_git_fixture(root) as (root,git):
        (root/"app").mkdir()
        (root/"app/page.tsx").write_text("original application\n")
        git("add",".");git("commit","-qm","candidate")
        candidate=git("rev-parse","HEAD")
        (root/"scripts").mkdir()
        (root/"scripts/controller.py").write_text("reviewed control repair\n")
        git("add",".");git("commit","-qm","controller")
        controller=git("rev-parse","HEAD")
        test.assertTrue(browser.application_source_equivalent(root,candidate,controller))
        (root/"app/page.tsx").write_text("different application\n")
        git("add",".");git("commit","-qm","application changed")
        with test.assertRaisesRegex(ValueError,"Installed application differs"):
            browser.application_source_equivalent(root,candidate,git("rev-parse","HEAD"))
        (root/"app/page.tsx").write_text("original application\n")
        git("mv","app/page.tsx","scripts/renamed-application.tsx")
        git("add",".");git("commit","-qm","application renamed into tooling")
        with test.assertRaisesRegex(ValueError,"Installed application differs"):
            browser.application_source_equivalent(root,candidate,git("rev-parse","HEAD"))


def hostile_git_environment(source):
    metadata=source/".git"
    return {
        "GIT_DIR":str(metadata),"GIT_WORK_TREE":str(source),
        "GIT_COMMON_DIR":str(metadata),"GIT_INDEX_FILE":str(metadata/"index"),
        "GIT_OBJECT_DIRECTORY":str(metadata/"objects"),
        "GIT_ALTERNATE_OBJECT_DIRECTORIES":str(metadata/"objects"),
        "GIT_CONFIG_GLOBAL":str(metadata/"config"),
        "GIT_CONFIG_SYSTEM":str(metadata/"config"),
        "GIT_CONFIG_COUNT":"2","GIT_CONFIG_KEY_0":"user.name",
        "GIT_CONFIG_VALUE_0":"Hostile inherited author",
        "GIT_CONFIG_KEY_1":"user.email",
        "GIT_CONFIG_VALUE_1":"hostile@example.invalid",
        "GIT_NAMESPACE":"hostile-fixture-namespace",
        "GIT_AUTHOR_NAME":"Hostile author","GIT_COMMITTER_NAME":"Hostile committer",
    }


class ProductionBrowserSource(unittest.TestCase):
    def test_real_git_accepts_controller_descendant_and_refuses_changed_application(self):
        with tempfile.TemporaryDirectory() as temp:
            exercise_application_fixture(self,Path(temp))

    def test_hostile_inherited_git_cannot_change_source_config_index_status_or_head(self):
        actual_context=source_git_context()
        actual_before=git_fingerprint(actual_context)
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)
            canary=base/"protected-source";canary.mkdir()
            with isolated_git_fixture(canary) as (canary,git):
                git("config","--local","user.name","Protected source identity")
                (canary/"sentinel").write_text("committed source\n")
                git("add",".");git("commit","-qm","protected source")
            (canary/"sentinel").write_text("uncommitted source must remain uncommitted\n")
            (canary/"not-staged").write_text("must never enter fixture commit\n")
            context=(canary,canary/".git")
            before=git_fingerprint(context,include_objects=True)
            fixture=base/"fixture";fixture.mkdir()
            incoming=dict(os.environ)
            with mock.patch.dict(os.environ,hostile_git_environment(canary)):
                exercise_application_fixture(self,fixture)
            self.assertEqual(
                hashlib.sha256(repr(sorted(os.environ.items())).encode()).hexdigest(),
                hashlib.sha256(repr(sorted(incoming.items())).encode()).hexdigest(),
            )
            self.assertEqual(git_fingerprint(context,include_objects=True),before)
        self.assertEqual(git_fingerprint(actual_context),actual_before)

    def test_source_checkout_without_inline_git_metadata_is_never_a_fixture(self):
        context=source_git_context()
        before=git_fingerprint(context)
        with self.assertRaisesRegex(ValueError,"Source checkout"):
            with isolated_git_fixture(ROOT):
                self.fail("Actual source fixture was entered")
        self.assertEqual(git_fingerprint(context),before)

    def test_fixture_symlink_cannot_retarget_mutation_into_source(self):
        context=source_git_context()
        before=git_fingerprint(context)
        with tempfile.TemporaryDirectory() as temp:
            alias=Path(temp)/"source-alias"
            alias.symlink_to(ROOT,target_is_directory=True)
            with self.assertRaisesRegex(ValueError,"symlink forbidden"):
                with isolated_git_fixture(alias):
                    self.fail("Source symlink fixture was entered")
        self.assertEqual(git_fingerprint(context),before)

    def test_actual_census_preserves_historical_88_and_separate_b4_route(self):
        public,protected=browser.production_routes(ROOT)
        self.assertEqual(len(public),89)
        self.assertEqual(public[-1],"/kingdom-construction")
        self.assertEqual(len(protected),38)
        self.assertIn("/admin/aoe2war-os/umbrella-tree",protected)
        self.assertNotIn("/admin/aoe2war-os/umbrella-tree",public)
        self.assertEqual(len(set(public)),89)


if __name__=="__main__":
    unittest.main()
