import importlib.util
from pathlib import Path
import json
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("compat", ROOT/"scripts/patch_eslintrc_minimatch11.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CompatibilityTests(unittest.TestCase):
    def setup(self, root, source=None, eslintrc="3.3.7", minimatch="11.0.3"):
        es=root/"node_modules/@eslint/eslintrc"
        mm=root/"node_modules/minimatch"
        target=es/"lib/config-array/override-tester.js"
        target.parent.mkdir(parents=True)
        mm.mkdir(parents=True)
        (es/"package.json").write_text(json.dumps({"version":eslintrc}))
        (mm/"package.json").write_text(json.dumps({"version":minimatch}))
        if source is None:
            source=(b'// isolated compatibility fixture, NOT vendor source\n'
                    b'import minimatch from "minimatch";\n'
                    b'const { Minimatch } = minimatch;\n')
        target.write_bytes(source)
        return target
    def test_frozen_devtool_patch_idempotent(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);target=self.setup(root)
            raw=target.read_bytes()
            patched=raw.replace(m.ORIGINAL,m.REPLACEMENT)
            with mock.patch.object(m,"ORIGINAL_SHA256",m.digest(raw)), \
                 mock.patch.object(m,"digest_source_after",return_value=m.digest(patched)):
                self.assertEqual(m.patch(root),"PASS_MINIMATCH11_NAMED_IMPORT_COMPAT")
                self.assertEqual(m.digest(target.read_bytes()),m.digest_source_after())
                self.assertEqual(m.patch(root),"PASS_ALREADY_PATCHED")
    def test_old_or_unknown_versions_rejected(self):
        for mm in ("9.0.7","11.0.0","12.0.0"):
            with tempfile.TemporaryDirectory() as name:
                root=Path(name);self.setup(root,minimatch=mm)
                with self.assertRaisesRegex(RuntimeError,"DEV_TOOL_VERSION_DRIFT"):
                    m.patch(root)
    def test_modified_installed_source_rejected_without_write(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);target=self.setup(root)
            changed=target.read_bytes()+b"unexpected"
            target.write_bytes(changed)
            with mock.patch.object(m,"ORIGINAL_SHA256",m.digest(changed[:-len(b"unexpected")])), \
                 self.assertRaisesRegex(RuntimeError,"DEV_TOOL_EXACT_SOURCE_DRIFT"):
                m.patch(root)
            self.assertEqual(target.read_bytes(),changed)
    def test_exact_installed_vendor_hash_when_available(self):
        # Only a check, never an assumption about the machine's home path.
        real=ROOT/"node_modules/@eslint/eslintrc/lib/config-array/override-tester.js"
        if real.is_file():
            self.assertIn(m.digest(real.read_bytes()),
                {m.ORIGINAL_SHA256,m.digest_source_after()})

    def test_source_only_does_not_waive_financial_holds(self):
        package=json.loads((ROOT/"package.json").read_text())
        self.assertEqual(package["resolutions"]["minimatch"],"11.0.3")
        self.assertEqual(package["resolutions"]["glob"],"14.0.3")
        native=(ROOT/"lib/warSatchelEpochV3NativePgIngest.ts").read_text()
        self.assertIn("EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED = false",native)
if __name__=="__main__": unittest.main()
