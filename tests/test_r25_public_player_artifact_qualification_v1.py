"""Disposable adversarial archive fixtures. Never touches the production filesystem."""
from __future__ import annotations
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
import importlib.util

SRC = Path(__file__).resolve().parents[1] / "scripts/release/r25_public_player_artifact_qualification_v1.py"
spec = importlib.util.spec_from_file_location("r25_public_player_archive_v1", SRC)
v = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(v)

def entry(name="public/pic.webp", data=b"genuine image bytes", target=None, kind="file", mode=0o444):
    return dict(name=name, data=data, target=target, kind=kind, mode=mode)

def fixture(directory: Path, entries=None, source="b"*40, inner_build="fixtureBUILD_01",
            machine="x86_64", engine="v22.22.0", duplicate=False):
    entries = entries if entries is not None else [
        entry(), entry(name="public/link.webp", target="pic.webp", kind="symlink"),
    ]
    rows = []
    for e in entries:
        row = {"path": e["name"], "mode": e["mode"], "type": e["kind"]}
        if e["kind"]=="file":
            row.update(size=len(e["data"]), sha256=v.sha(e["data"]))
        elif e["kind"]=="symlink":
            row["target"]=e["target"]
        elif e["kind"]=="hardlink":
            row["type"]="file"
            row.update(size=0,sha256=v.sha(b""))
        rows.append(row)
    if duplicate: rows.append(rows[0].copy())
    tree_sha = v.sha(v.canonical(rows))
    manifest = {
        "schema":"aoe2war.runtime-artifact.v1","source_sha":source,
        "build_id":inner_build,"build_version":"fixtureVersion_01",
        "tree_sha256":tree_sha,"files":len(rows),"rows":rows,
        "machine":machine,"node_version":engine,
        "readonly_backend_upstream":"http://127.0.0.1:3331",
    }
    m_bytes=v.canonical(manifest)+b"\n"
    path=directory/"runtime.tar.gz"
    with path.open("wb") as f:
        with gzip.GzipFile(filename="", fileobj=f, mode="wb",mtime=0) as z:
            with tarfile.open(fileobj=z,mode="w|") as tf:
                for e in entries + ([entries[0]] if duplicate else []):
                    info=tarfile.TarInfo(e["name"])
                    info.mode=e["mode"];info.uid=0;info.gid=0
                    if e["kind"]=="file":
                        info.size=len(e["data"])
                        tf.addfile(info,io.BytesIO(e["data"]))
                    else:
                        info.type = tarfile.SYMTYPE if e["kind"]=="symlink" else tarfile.LNKTYPE
                        info.linkname=e["target"]
                        tf.addfile(info)
                for name,payload in [
                    (".aoe2war-runtime-manifest.json",m_bytes),
                    (".aoe2war-source-sha",(source+"\n").encode())
                ]:
                    info=tarfile.TarInfo(name);info.mode=0o444
                    info.size=len(payload);info.uid=0;info.gid=0
                    tf.addfile(info,io.BytesIO(payload))
    expected={
        "source_sha":source,"build_id":inner_build,
        "build_version":"fixtureVersion_01","tree_sha256":tree_sha,
        "manifest_sha256":v.sha(m_bytes),
        "archive_sha256":v.digest_file(path),
        "archive_bytes":path.stat().st_size,"files":len(rows),
    }
    receipt={
        "schema":"aoe2war.runtime-artifact.v1",
        "source_sha":source,"build_id":inner_build,
        "build_version":"fixtureVersion_01","tree_sha256":tree_sha,
        "manifest_sha256":v.sha(m_bytes),
        "archive":"runtime.tar.gz","format":"tar.gz",
        "sha256":expected["archive_sha256"],
        "bytes":expected["archive_bytes"],"files":len(rows),
        "machine":machine,"node_version":engine,
        "readonly_backend_upstream":"http://127.0.0.1:3331",
    }
    (directory/"artifact.json").write_bytes(v.canonical(receipt)+b"\n")
    for p in directory.iterdir():p.chmod(0o600)
    return expected

class ArchiveGuards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="r25-player-ci-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def make(self,**kwargs):
        expected=fixture(self.root,**kwargs)
        return expected

    def refused(self, reason,expected):
        with self.assertRaises(v.Hold) as cm:
            v.verify_package(self.root,expected)
        self.assertIn(reason,str(cm.exception))

    def test_valid_verified_content_and_fail_shut_authority(self):
        e=self.make()
        r=v.verify_package(self.root,e)
        self.assertEqual(r["status"],"PASS_SOURCE_ONLY_ARTIFACT_BYTE_AND_ENTRY_ADMISSION")
        self.assertFalse(r["deployment_authorized"])
        self.assertFalse(r["financial_operations_authorized"])
        self.assertFalse(r["same_slot_rollback_qualified"])

    def test_wrong_source_receipt(self):
        e=self.make()
        e["source_sha"]="e"*40
        self.refused("RECEIPT_SOURCE_SHA",e)

    def test_wrong_build(self):
        e=self.make()
        e["build_id"]="other_build"
        self.refused("RECEIPT_BUILD_ID",e)

    def test_corrupt_archive_sha(self):
        e=self.make()
        with (self.root/"runtime.tar.gz").open("ab") as f:f.write(b"wrong")
        e["archive_bytes"]+=5
        self.refused("ARCHIVE_SHA",e)

    def test_archive_size_and_truncated_input(self):
        e=self.make()
        (self.root/"runtime.tar.gz").write_bytes(b"")
        self.refused("ARCHIVE_SIZE",e)

    def test_stage_foreign_file_rejected(self):
        e=self.make()
        (self.root/"unexpected.private").write_text("no")
        self.refused("STAGE_UNEXPECTED_FILES",e)

    def test_symlinked_receipt_rejected(self):
        e=self.make()
        other=self.root/"safe.tmp"
        (self.root/"artifact.json").rename(other)
        (self.root/"artifact.json").symlink_to(other)
        # root has an unexpected sibling; fail even before symlink path check
        self.refused("STAGE_UNEXPECTED_FILES",e)
        other.unlink()
        self.refused("NOT_REGULAR_artifact.json",e)

    def test_hardlink_receipt_rejected(self):
        e=self.make()
        outside=self.root.parent/(self.root.name+"-link")
        os.link(self.root/"artifact.json",outside)
        self.addCleanup(lambda:outside.unlink(missing_ok=True))
        self.refused("HARDLINK_artifact.json",e)

    def test_group_writable_archive_rejected(self):
        e=self.make()
        (self.root/"runtime.tar.gz").chmod(0o664)
        self.refused("WRITABLE_BY_GROUP_OR_OTHER_runtime.tar.gz",e)

    def test_traversal_path_refused(self):
        e=self.make(entries=[entry(name="../../sensitive",data=b"x")])
        self.refused("UNSAFE_PATH",e)

    def test_absolute_path_refused(self):
        e=self.make(entries=[entry(name="/etc/shadow",data=b"x")])
        self.refused("UNSAFE_PATH",e)

    def test_symlink_escape_refused(self):
        e=self.make(entries=[entry(name="assets/evil",target="../../private",kind="symlink")])
        self.refused("SYMLINK_ESCAPES_ARCHIVE",e)

    def test_symlink_parent_refused(self):
        e=self.make(entries=[
            entry(name="docs",target="safe",kind="symlink"),
            entry(name="docs/upload",data=b"bad parent"),
            entry(name="safe",data=b"good"),
        ])
        self.refused("SYMLINK_PARENT_ESCAPE",e)

    def test_missing_symlink_target_refused(self):
        e=self.make(entries=[entry(name="assets/link",target="missing.webp",kind="symlink")])
        self.refused("SYMLINK_TARGET_MISSING",e)

    def test_hardlink_tar_member_refused(self):
        e=self.make(entries=[entry(name="asset",target="other",kind="hardlink")])
        self.refused("SPECIAL_OR_HARDLINK_ENTRY",e)

    def test_duplicate_tar_members_refused(self):
        e=self.make(duplicate=True)
        self.refused("DUPLICATE_ENTRY",e)

    def test_forged_manifest_identity_refused(self):
        e=self.make()
        e["manifest_sha256"]="f"*64
        self.refused("RECEIPT_ARCHIVE_IDENTITY",e)

    def test_unexpected_runtime_node_abi_refused(self):
        e=self.make(machine="aarch64")
        self.refused("CI_RUNTIME_ARCHITECTURE",e)

    def test_world_writable_tar_member_refused(self):
        e=self.make(entries=[entry(mode=0o666)])
        self.refused("ARCHIVE_WRITABLE_BY_GROUP_OR_OTHER",e)

if __name__=="__main__":
    unittest.main(verbosity=2)
