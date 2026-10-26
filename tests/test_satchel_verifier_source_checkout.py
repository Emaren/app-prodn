"""Real Git metadata regression; never import/run the SDK build driver."""
import ast
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/check-satchel-authenticated-credit.py'


class ExactVerifierCheckoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.origin = self.root / 'origin'
        self.origin.mkdir()
        self.git('init', '--quiet')
        self.commit('tagged')
        self.git('tag', 'v1.0.0')
        self.pinned = self.commit('pinned')
        self.commit('later-do-not-build')
        module = ast.parse(SCRIPT.read_text())
        functions = [n for n in module.body if isinstance(n, ast.FunctionDef)
                     and n.name in ('run', 'checkout_exact_source')]
        self.assertEqual(len(functions), 2)
        self.ns = {'subprocess': subprocess, 'SOURCE': self.pinned}
        # Only the actual checkout functions execute. The module's outer SDK
        # build block MUST NOT run or access a signer/database in this test.
        exec(compile(ast.fix_missing_locations(ast.Module(body=functions, type_ignores=[])),
                     str(SCRIPT), 'exec'), self.ns)

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', '-c', 'user.name=Fixture',
            '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
            '-c', 'core.hooksPath=/dev/null', *args], cwd=cwd or self.origin,
            stderr=subprocess.PIPE, text=True).strip()

    def commit(self, text):
        (self.origin / 'source').write_text(text)
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', text)
        return self.git('rev-parse', 'HEAD')

    def test_exact_shallow_tag_free_tree_matches_artifact_checkout(self):
        destination = self.root / 'verifier'
        self.ns['checkout_exact_source'](str(self.origin), destination)
        self.assertEqual(self.git('rev-parse', 'HEAD', cwd=destination), self.pinned)
        self.assertEqual(self.git('rev-parse', 'HEAD^{tree}', cwd=destination),
                         self.git('rev-parse', self.pinned + '^{tree}'))
        self.assertEqual(self.git('rev-parse', '--is-shallow-repository', cwd=destination), 'true')
        self.assertEqual(self.git('tag', '--list', cwd=destination), '')
        self.assertEqual(self.git('status', '--porcelain', '--ignored=matching', cwd=destination), '')
        self.assertEqual((destination / 'source').read_text(), 'pinned')
        result = subprocess.run(['git', 'symbolic-ref', '--quiet', 'HEAD'], cwd=destination,
                                capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    def test_unknown_source_never_falls_back_to_origin_head(self):
        self.ns['SOURCE'] = 'f' * 40
        with self.assertRaises(subprocess.CalledProcessError):
            self.ns['checkout_exact_source'](str(self.origin), self.root / 'refused')
        self.assertFalse((self.root / 'refused' / 'source').exists())


if __name__ == '__main__':
    unittest.main()
