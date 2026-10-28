"""Synthetic exact Go module ZIP mirror proofs — never touches real home."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile
from contextlib import redirect_stdout

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"docs/review/fixtures/session_d_phase14_go_module_duplicate_zips.py"
SPEC=importlib.util.spec_from_file_location("phase14_gomod_zips",SOURCE)
assert SPEC and SPEC.loader
MOD=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)

class GoZipDuplicateTests(unittest.TestCase):
    def setup_cache(self, temp):
        base=Path(temp)/"go/pkg/mod"
        downloads=base/"cache/download"
        folder=downloads/"example.com/mod/@v"
        folder.mkdir(parents=True)
        extracted=base/"example.com/mod@v1.2.3"
        extracted.mkdir(parents=True)
        dest=extracted/"main.go"
        dest.write_bytes(b"package main\n")
        zip_path=folder/"v1.2.3.zip"
        with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED) as z:
            z.writestr("example.com/mod@v1.2.3/main.go",b"package main\n")
        return base,downloads,dest,zip_path

    def test_byte_identical_extracted_source_qualifies_single_zip(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                paths=MOD.candidates()
                self.assertEqual(len(paths),1)
                self.assertEqual(MOD.zipped_source_duplicate(*paths[0]),1)
                self.assertTrue(z.exists())
                self.assertTrue(dest.exists())

    def test_changed_source_refuses_zip_as_proven_duplicate(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            dest.write_bytes(b"package main\n// changed\n")
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                with self.assertRaises(MOD.Hold):
                    MOD.zipped_source_duplicate(z,z.lstat())
                self.assertTrue(z.exists())
                self.assertTrue(dest.exists())

    def test_symlink_source_refuses_proof(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            dest.unlink()
            secret=Path(temp)/"protected"
            secret.write_bytes(b"package main\n")
            dest.symlink_to(secret)
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                with self.assertRaises(MOD.Hold):
                    MOD.zipped_source_duplicate(z,z.lstat())
                self.assertTrue(secret.exists())
                self.assertTrue(z.exists())

    def test_zip_member_escapes_expected_module_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            with zipfile.ZipFile(z,"w",zipfile.ZIP_DEFLATED) as f:
                f.writestr("example.com/mod@v1.2.3/../outside.txt",b"oops")
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                with self.assertRaises(MOD.Hold):
                    MOD.zipped_source_duplicate(z,z.lstat())
                self.assertTrue(z.exists())

    def test_symlink_in_download_tree_refuses_all(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            protected=Path(temp)/"protected"
            protected.mkdir()
            (downloads/"alias").symlink_to(protected,target_is_directory=True)
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                with self.assertRaises(MOD.Hold):
                    MOD.candidates()
                self.assertTrue(z.exists())
                self.assertTrue(protected.exists())

    def test_default_is_read_only_and_never_unlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            with mock.patch.object(MOD,"HOME",Path(temp)),mock.patch.object(MOD,"MOD",base),mock.patch.object(
                MOD,"DOWNLOAD",downloads
            ),mock.patch.object(MOD,"validate_paths"),mock.patch.object(
                MOD,"verify_go_env",return_value={"ok":True}
            ),mock.patch.object(MOD,"no_open_archive_readers"),mock.patch.object(
                MOD,"df",return_value={"available_kib":777}
            ),mock.patch("sys.argv",["probe"]),mock.patch.object(
                MOD.os,"unlink"
            ) as delete,redirect_stdout(io.StringIO()):
                self.assertEqual(MOD.main(),0)
                delete.assert_not_called()
                self.assertTrue(z.exists())

    def test_apply_unlinks_only_identical_cached_zip_preserving_source(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            modfile=z.parent/"v1.2.3.mod"
            modfile.write_bytes(b"module example.com/mod\\n")
            writes=[]
            def seal(payload):
                writes.append(payload)
                return str(Path(temp)/("receipt-"+str(len(writes))+".json")), "a"*64
            with mock.patch.object(MOD,"HOME",Path(temp)),mock.patch.object(
                MOD,"MOD",base
            ),mock.patch.object(MOD,"DOWNLOAD",downloads),mock.patch.object(
                MOD,"validate_paths"
            ),mock.patch.object(MOD,"verify_go_env",return_value={"public":True}),mock.patch.object(
                MOD,"no_open_archive_readers"
            ),mock.patch.object(MOD,"df",side_effect=[
                {"device":"/dev/disk3s5","available_kib":10000,"used_kib":10000},
                {"device":"/dev/disk3s5","available_kib":10000,"used_kib":10000},
                {"device":"/dev/disk3s5","available_kib":10500,"used_kib":9500}
            ]),mock.patch.object(MOD,"MIN_RECLAIM_KIB",0),mock.patch.object(
                MOD,"receipt",side_effect=seal
            ),mock.patch("sys.argv",["fixture","--apply"]),redirect_stdout(io.StringIO()):
                self.assertEqual(MOD.main(),0)
            self.assertFalse(z.exists())
            self.assertTrue(dest.is_file())
            self.assertTrue(modfile.is_file())
            self.assertEqual(len(writes),2)
            self.assertEqual(writes[0]["status"],"INTENT_ONLY_NO_DELETION_CLAIM")
            self.assertEqual(writes[1]["net_ordinary_free_delta_kib"],500)
            self.assertEqual(len(writes[1]["removed_files"]),1)

    def test_guard_holds_unknown_nonregular_archive_files(self):
        with tempfile.TemporaryDirectory() as temp:
            base,downloads,dest,z=self.setup_cache(temp)
            (z.parent/"v1.2.3.ziphash").symlink_to(Path(temp)/"protected")
            with mock.patch.object(MOD,"MOD",base),mock.patch.object(MOD,"DOWNLOAD",downloads):
                with self.assertRaises(MOD.Hold):
                    MOD.candidates()
                self.assertTrue(z.exists())

if __name__=="__main__":
    unittest.main()
