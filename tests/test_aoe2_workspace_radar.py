import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

SOURCE=pathlib.Path(__file__).resolve().parents[1]/'scripts/aoe2_workspace_radar.py'
spec=importlib.util.spec_from_file_location('aoe2_workspace_radar', SOURCE)
radar=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=radar
spec.loader.exec_module(radar)


def cmd(repo, *args):
    p=subprocess.run(['git','-C',str(repo),*args],capture_output=True,text=True)
    if p.returncode:
        raise AssertionError(p.stderr)
    return p.stdout


def repository(root):
    root.mkdir(parents=True)
    cmd(root,'init','-q')
    cmd(root,'config','user.name','Test')
    cmd(root,'config','user.email','test@example.invalid')
    (root/'tracked.txt').write_text('a')
    cmd(root,'add','tracked.txt')
    cmd(root,'commit','-qm','initial')
    return root


class WorktreeRadarTests(unittest.TestCase):
    def test_clean_repo_counts_no_content(self):
        with tempfile.TemporaryDirectory() as d:
            repo=repository(pathlib.Path(d)/'project')
            out=radar.inspect([pathlib.Path(d)])
            self.assertEqual(out['status'],'OBSERVED_CLEAN')
            self.assertEqual(out['repos_inspected'],1)
            self.assertEqual(out['repos'][0]['changed_entries'],0)
            self.assertFalse(out['safe_to_clean_or_prune'])

    def test_dirty_and_untracked_names_not_recorded(self):
        with tempfile.TemporaryDirectory() as d:
            repo=repository(pathlib.Path(d)/'project')
            (repo/'tracked.txt').write_text('edited')
            (repo/'super_secret_token.env').write_text('DO_NOT_PRINT')
            out=radar.inspect([pathlib.Path(d)])
            self.assertEqual(out['status'],'DIRTY_PRESENT')
            self.assertEqual(out['repos'][0]['changed_entries'],2)
            self.assertEqual(out['repos'][0]['untracked_entries'],1)
            self.assertNotIn('super_secret_token.env',str(out))
            self.assertNotIn('DO_NOT_PRINT',str(out))

    def test_linked_worktree_and_detached_head(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            repo=repository(root/'project')
            linked=root/'new-worktree'
            cmd(repo,'worktree','add','--detach',str(linked),'HEAD')
            out=radar.inspect([root])
            self.assertEqual(out['repos_inspected'],2)
            self.assertEqual(out['detached_heads'],1)
            self.assertTrue(any(str(linked) in x['linked_worktrees'] for x in out['repos']))

    def test_symlink_not_followed(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            inside=root/'within'
            inside.mkdir()
            outside=repository(root/'external')
            (inside/'shortcut').symlink_to(outside, target_is_directory=True)
            out=radar.inspect([inside])
            self.assertEqual(out['repos_inspected'],0)
            self.assertNotIn(str(outside),str(out))

    def test_budget_is_incomplete_not_clean(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            (root/'a').mkdir()
            (root/'b').mkdir()
            out=radar.inspect([root],budget=1)
            self.assertEqual(out['status'],'INCOMPLETE')
            self.assertTrue(out['scan_truncated'])


if __name__=='__main__':
    unittest.main()
