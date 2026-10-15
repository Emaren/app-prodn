from __future__ import annotations

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_update_context.py"
SPEC = importlib.util.spec_from_file_location("aoe2_update_context", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ContextBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def sources(self):
        repos = {key: self.root / key for key in MODULE.CANONICAL_BRANCHES}
        identities = {}
        for index, (key, repo) in enumerate(repos.items(), 1):
            repo.mkdir()
            files = {MODULE.CODE_SENTINELS[key]: b"real source code\n"}
            if key == "AoE2WAR-docs":
                files.update({"catalog/document-taxonomy.json": b"{}\n",
                              "catalog/runtime/repository-state.json": b"{}\n"})
                files.update({f"catalog/registries/{source}.json": b"{}\n"
                              for source in repos if source != key})
            else:
                files["README.md"] = (key + " documentation\n").encode()
                files[MODULE.REGISTRY] = json.dumps({
                    "repo": key, "documents": [{"path": "README.md", "sha256": digest(files["README.md"])}]
                }).encode()
            for path, data in files.items():
                target = repo / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            identities[key] = {"repo": str(repo), "head": f"{index:040x}",
                               "tree": f"{index + 10:040x}",
                               "branch": MODULE.CANONICAL_BRANCHES[key],
                               "origin": MODULE.CANONICAL_ORIGINS[key]}
        return {k: v for k, v in repos.items() if k != "AoE2WAR-docs"}, repos["AoE2WAR-docs"], identities

    def snapshot(self, sources, docs, identities):
        def git(repo, *args):
            self.assertEqual(args, ("ls-files", "-z"))
            return "\0".join(str(p.relative_to(repo)) for p in Path(repo).rglob("*") if p.is_file()) + "\0"
        with mock.patch.object(MODULE, "_identity", side_effect=lambda key, _repo: dict(identities[key])), \
                mock.patch.object(MODULE, "_git", side_effect=git):
            return MODULE.source_snapshot(sources, docs)

    def camera(self, project, payloads, stamp="20261015-190000"):
        context = self.root / "VPSSentry" / "context"
        for name in ("tgz", "md", "sha256"):
            (context / name).mkdir(parents=True, exist_ok=True)
        archive = context / "tgz" / f"{project}-context-Test_Host-{stamp}.tgz"
        with tarfile.open(archive, "w:gz") as tgz:
            for path, data in payloads:
                member = tarfile.TarInfo(f"{archive.stem}/{path}")
                if isinstance(data, tarfile.TarInfo):
                    member.type = data.type
                    member.linkname = data.linkname
                    tgz.addfile(member)
                else:
                    member.size = len(data)
                    tgz.addfile(member, io.BytesIO(data))
        return self.seal(archive)

    def seal(self, archive):
        context = archive.parent.parent
        archive_sha = digest(archive.read_bytes())
        manifest = context / "sha256" / (archive.name + ".sha256")
        manifest.write_text(archive_sha + "  " + archive.name + "\n")
        markdown = context / "md" / (archive.stem + ".md")
        markdown.write_text(f"# Camera\n\n- source_archive: `{archive.name}`\n- source_sha256: `{archive_sha}`\n")
        markdown_sha = digest(markdown.read_bytes())
        markdown_manifest = context / "sha256" / (markdown.name + ".sha256")
        markdown_manifest.write_text(markdown_sha + "  " + markdown.name + "\n")
        return {"archive": str(archive), "manifest": str(manifest), "sha256": archive_sha,
                "markdown": str(markdown), "markdown_manifest": str(markdown_manifest),
                "markdown_sha256": markdown_sha}

    def cameras(self, snapshot):
        payloads = {}
        for row in snapshot.values():
            project = row["archive_project"]
            for path in row["files"]:
                if path.startswith("context/"):
                    location = f"__context__/{Path(row['repo']).name}/{path[8:]}"
                else:
                    location = f"{row['archive_prefix']}/{path}"
                payloads.setdefault(project, []).append((location, (Path(row["repo"]) / path).read_bytes()))
            if row.get("archive_proof"):
                proof = "".join(f"{key}: {value}\n" for key, value in {
                    "repo": row["repo"], "head": row["head"], "branch": row["branch"], "dirty_files": 0}.items()).encode()
                payloads.setdefault(project, []).append((row["archive_proof"], proof))
        return {key: self.camera(key, value) for key, value in payloads.items()}

    def test_snapshot_and_real_tar_bind_all_sources_and_registered_documents(self):
        sources, docs, identities = self.sources()
        snapshot = self.snapshot(sources, docs, identities)
        cameras = self.cameras(snapshot)
        bindings = MODULE.verify_context_sources(cameras, snapshot)
        self.assertEqual(set(bindings), {row["archive_project"] for row in snapshot.values()})
        self.assertEqual(bindings["AoE2HDBets"]["sources"], ["api-prodn", "app-prodn"])
        self.assertEqual(bindings["AoE2HDBets"]["bound_files"], 6)

    def test_source_selected_bytes_change_fails_revalidation_even_with_same_git_identity(self):
        sources, docs, identities = self.sources()
        expected = self.snapshot(sources, docs, identities)
        (sources["app-prodn"] / "README.md").write_text("changed bytes")
        actual = self.snapshot(sources, docs, identities)
        with mock.patch.object(MODULE, "source_snapshot", return_value=actual):
            with self.assertRaisesRegex(MODULE.ContextError, "source authority changed.*app-prodn"):
                MODULE.verify_source_snapshot(expected, sources, docs)

    def test_source_changed_while_other_repositories_snapshotted_fails(self):
        sources, docs, identities = self.sources()
        count = 0
        def identity(key, _repo):
            nonlocal count
            count += 1
            value = dict(identities[key])
            if count > 6:
                value["head"] = "f" * 40
            return value
        with mock.patch.object(MODULE, "_identity", side_effect=identity), \
                mock.patch.object(MODULE, "_git", side_effect=lambda repo, *_args: "\0".join(str(p.relative_to(repo)) for p in repo.rglob("*") if p.is_file()) + "\0"):
            with self.assertRaisesRegex(MODULE.ContextError, "source changed during snapshot"):
                MODULE.source_snapshot(sources, docs)

    def test_archive_head_proof_catches_other_source_changes_even_when_selected_bytes_match(self):
        sources, docs, identities = self.sources()
        snapshot = self.snapshot(sources, docs, identities)
        cameras = self.cameras(snapshot)
        snapshot["app-prodn"]["head"] = "f" * 40
        with self.assertRaisesRegex(MODULE.ContextError, "source Git proof differs"):
            MODULE.verify_context_sources(cameras, snapshot)

    def test_archive_missing_git_proof_fails(self):
        sources, docs, identities = self.sources()
        snapshot = self.snapshot(sources, docs, identities)
        row = snapshot["aoe2-watcher"]
        entry = self.camera("aoe2-watcher", [(f"{row['archive_prefix']}/{path}", (Path(row['repo']) / path).read_bytes())
                                             for path in row["files"]])
        with self.assertRaisesRegex(MODULE.ContextError, "missing source Git proof"):
            MODULE.verify_context_sources({"aoe2-watcher": entry}, {"aoe2-watcher": row})

    def test_latest_camera_uses_timestamp_and_fails_on_incomplete_or_ambiguous_latest(self):
        old = self.camera("VPSSentry", [("VPSSentry/README.md", b"old")], "20261014-190000")
        current = self.camera("VPSSentry", [("VPSSentry/README.md", b"current")])
        snapshot = {"vpssentry": {"archive_project": "VPSSentry"}}
        context = Path(current["archive"]).parent.parent
        result = MODULE.latest_context_archives(context, snapshot)
        self.assertEqual(result["VPSSentry"]["archive"], current["archive"])
        Path(current["markdown_manifest"]).unlink()
        with self.assertRaises(MODULE.ContextError):
            MODULE.latest_context_archives(context, snapshot)
        self.seal(Path(current["archive"]))
        duplicate = Path(current["archive"]).with_name(Path(current["archive"]).name.replace("Test_Host", "Other_Host"))
        duplicate.write_bytes(Path(current["archive"]).read_bytes())
        with self.assertRaisesRegex(MODULE.ContextError, "ambiguous latest"):
            MODULE.latest_context_archives(context, snapshot)
        self.assertTrue(Path(old["archive"]).exists())

    def test_registered_context_document_uses_camera_curated_location(self):
        sources, docs, identities = self.sources()
        repo = sources["vpssentry"]
        (repo / "context").mkdir()
        (repo / "context/SYSTEM_MAP.md").write_text("canonical map\n")
        registry = json.loads((repo / MODULE.REGISTRY).read_text())
        registry["documents"].append({"path": "context/SYSTEM_MAP.md"})
        (repo / MODULE.REGISTRY).write_text(json.dumps(registry))
        snapshot = self.snapshot(sources, docs, identities)
        bindings = MODULE.verify_context_sources(self.cameras(snapshot), snapshot)
        self.assertEqual(bindings["VPSSentry"]["bound_files"], 4)

    def test_checksum_matched_but_wrong_source_bytes_fail(self):
        row = {"repo": str(self.root / "app-prodn"), "archive_project": "AoE2HDBets",
               "archive_prefix": "AoE2HDBets/app-prodn", "files": {MODULE.REGISTRY: digest(b"expected registry")}}
        cameras = {"AoE2HDBets": self.camera("AoE2HDBets", [("AoE2HDBets/app-prodn/" + MODULE.REGISTRY, b"stale registry")])}
        with self.assertRaisesRegex(MODULE.ContextError, "archived source bytes differ"):
            MODULE.verify_context_sources(cameras, {"app-prodn": row})

    def test_valid_tar_missing_bound_source_fails(self):
        row = {"repo": "app-prodn", "archive_project": "AoE2HDBets", "archive_prefix": "AoE2HDBets/app-prodn",
               "files": {"app/page.tsx": digest(b"code")}}
        entry = self.camera("AoE2HDBets", [("AoE2HDBets/README.md", b"readme")])
        with self.assertRaisesRegex(MODULE.ContextError, "missing bound source"):
            MODULE.verify_context_sources({"AoE2HDBets": entry}, {"app-prodn": row})

    def test_missing_required_source_archive_fails(self):
        with self.assertRaisesRegex(MODULE.ContextError, "missing source context archives"):
            MODULE.verify_context_sources({}, {"app-prodn": {"archive_project": "AoE2HDBets"}})

    def test_not_a_tgz_with_valid_checksums_and_companion_fails(self):
        entry = self.camera("VPSSentry", [("VPSSentry/README.md", b"docs")])
        archive = Path(entry["archive"])
        archive.write_bytes(b"not a gzip tar")
        entry = self.seal(archive)
        with self.assertRaisesRegex(MODULE.ContextError, "malformed context TGZ"):
            MODULE.verify_context_sources({"VPSSentry": entry}, {})

    def test_empty_tar_with_valid_checksums_fails(self):
        entry = self.camera("VPSSentry", [])
        with self.assertRaisesRegex(MODULE.ContextError, "empty context archive"):
            MODULE.verify_context_sources({"VPSSentry": entry}, {})

    def test_corrupted_gzip_footer_fails_despite_tar_members_being_readable(self):
        entry = self.camera("VPSSentry", [("VPSSentry/README.md", b"docs")])
        archive = Path(entry["archive"])
        data = bytearray(archive.read_bytes())
        data[-8] ^= 1
        archive.write_bytes(data)
        entry = self.seal(archive)
        with self.assertRaisesRegex(MODULE.ContextError, "malformed context TGZ"):
            MODULE.verify_context_sources({"VPSSentry": entry}, {})

    def test_unsafe_tar_paths_links_and_duplicates_fail_without_extraction(self):
        symlink = tarfile.TarInfo("link")
        symlink.type = tarfile.SYMTYPE
        symlink.linkname = "/etc/passwd"
        cases = [[("../outside", b"bad")], [("VPSSentry/link", symlink)],
                 [("VPSSentry/dup", b"a"), ("VPSSentry/dup", b"b")]]
        for payloads in cases:
            with self.subTest(payloads=payloads):
                entry = self.camera("VPSSentry", payloads)
                with self.assertRaises(MODULE.ContextError):
                    MODULE.verify_context_sources({"VPSSentry": entry}, {})
        self.assertFalse((self.root / "outside").exists())

    def test_wrong_checksum_and_path_bearing_manifest_fail(self):
        for manifest in ["0" * 64 + "  VPSSentry-context-Test_Host-20261015-190000.tgz\n",
                         "0" * 64 + "  /tmp/archive.tgz\n"]:
            entry = self.camera("VPSSentry", [("VPSSentry/README.md", b"docs")])
            Path(entry["manifest"]).write_text(manifest)
            with self.assertRaises(MODULE.ContextError):
                MODULE.verify_context_sources({"VPSSentry": entry}, {})

    def test_identity_rejects_noncanonical_branch_origin_dirty_and_remote_drift(self):
        repo = self.root / "app-prodn"
        repo.mkdir()
        def git_with(overrides):
            answers = {("branch", "--show-current"): "main",
                       ("rev-parse", "--show-toplevel"): str(repo),
                       ("remote", "get-url", "origin"): "git@github.com:Emaren/app-prodn.git",
                       ("status", "--porcelain=v1", "--untracked-files=all"): "",
                       ("rev-parse", "HEAD"): "a" * 40,
                       ("rev-parse", "HEAD^{tree}"): "b" * 40,
                       ("ls-remote", "--exit-code", "origin", "refs/heads/main"): "a" * 40 + "\trefs/heads/main"}
            answers.update(overrides)
            return lambda _repo, *args: answers[args]
        with mock.patch.object(MODULE, "_git", side_effect=git_with({})):
            self.assertEqual(MODULE._identity("app-prodn", repo)["head"], "a" * 40)
        for overrides in [{("branch", "--show-current"): "feature/wrong"},
                          {("remote", "get-url", "origin"): "git@github.com:Other/app-prodn.git"},
                          {("status", "--porcelain=v1", "--untracked-files=all"): "?? new-file"},
                          {("ls-remote", "--exit-code", "origin", "refs/heads/main"): "c" * 40 + "\trefs/heads/main"}]:
            with mock.patch.object(MODULE, "_git", side_effect=git_with(overrides)):
                with self.assertRaises(MODULE.ContextError):
                    MODULE._identity("app-prodn", repo)

    def test_origin_normalizes_only_accepted_repository_transports(self):
        for origin in ["git@github.com:Emaren/app-prodn.git", "https://github.com/Emaren/app-prodn.git",
                       "ssh://git@github.com/Emaren/app-prodn"]:
            self.assertEqual(MODULE._origin_identity(origin), "github.com/Emaren/app-prodn")
        for origin in ["https://github.com/Emaren/app-prodn.git?ref=main", "/tmp/app-prodn",
                       "https://token@github.com/Emaren/app-prodn.git"]:
            self.assertEqual(MODULE._origin_identity(origin), "")

    def test_exact_recovery_remote_is_central_docs_only_and_requires_forward_ancestry(self):
        repo = self.root / "AoE2WAR-docs"
        repo.mkdir()
        head, candidate = "a" * 40, "c" * 40
        answers = {("rev-parse", "--show-toplevel"): str(repo),
                   ("branch", "--show-current"): "main",
                   ("remote", "get-url", "origin"): "https://github.com/Emaren/AoE2WAR-docs.git",
                   ("status", "--porcelain=v1", "--untracked-files=all"): "",
                   ("rev-parse", "HEAD"): head,
                   ("rev-parse", "HEAD^{tree}"): "b" * 40,
                   ("merge-base", "--is-ancestor", head, candidate): "",
                   ("ls-remote", "--exit-code", "origin", "refs/heads/main"): candidate + "\trefs/heads/main"}
        with mock.patch.object(MODULE, "_git", side_effect=lambda _repo, *args: answers[args]) as git:
            with self.assertRaisesRegex(MODULE.ContextError, "source HEAD differs"):
                MODULE._identity("AoE2WAR-docs", repo)
            value = MODULE._identity("AoE2WAR-docs", repo, expected_remote=candidate)
            self.assertEqual(value["head"], head)
            self.assertEqual(value["remote_head"], candidate)
            self.assertIn(mock.call(repo, "merge-base", "--is-ancestor", head, candidate), git.call_args_list)
        answers[("ls-remote", "--exit-code", "origin", "refs/heads/main")] = "d" * 40 + "\trefs/heads/main"
        with mock.patch.object(MODULE, "_git", side_effect=lambda _repo, *args: answers[args]):
            with self.assertRaisesRegex(MODULE.ContextError, "source HEAD differs"):
                MODULE._identity("AoE2WAR-docs", repo, expected_remote=candidate)

    def test_history_preserves_every_byte_and_is_idempotent(self):
        old = self.camera("VPSSentry", [("VPSSentry/README.md", b"old")], "20261014-190000")
        before = {Path(old[key]): Path(old[key]).read_bytes() for key in ("archive", "manifest", "markdown", "markdown_manifest")}
        current = self.camera("VPSSentry", [("VPSSentry/README.md", b"current")])
        with mock.patch.object(MODULE, "_git", return_value=""):
            receipts = MODULE.preserve_previous_context({"VPSSentry": current})
            again = MODULE.preserve_previous_context({"VPSSentry": current})
        self.assertEqual(receipts, again)
        self.assertEqual(len(receipts), 1)
        generation = Path(receipts[0]["receipt"]).parent
        for old_path, data in before.items():
            self.assertFalse(old_path.exists())
            self.assertEqual((generation / old_path.name).read_bytes(), data)
        self.assertTrue(Path(current["archive"]).exists())
        receipt_bytes = (generation / "preservation.json").read_bytes()
        self.assertEqual((generation / "preservation.json.sha256").read_text(), digest(receipt_bytes) + "  preservation.json\n")

    def test_history_interrupted_move_resumes_with_immutable_receipt(self):
        old = self.camera("VPSSentry", [("VPSSentry/README.md", b"old")], "20261014-190000")
        current = self.camera("VPSSentry", [("VPSSentry/README.md", b"current")])
        real_rename = MODULE.os.rename
        count = 0
        def interrupted(src, dst):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("interrupted")
            real_rename(src, dst)
        with mock.patch.object(MODULE, "_git", return_value=""), mock.patch.object(MODULE.os, "rename", side_effect=interrupted):
            with self.assertRaises(OSError):
                MODULE.preserve_previous_context({"VPSSentry": current})
        with mock.patch.object(MODULE, "_git", return_value=""):
            result = MODULE.preserve_previous_context({"VPSSentry": current})
        self.assertEqual(len(result), 1)
        self.assertFalse(Path(old["archive"]).exists())
        self.assertTrue(Path(result[0]["receipt"]).is_file())

    def test_history_modified_receipt_fails_without_reusing_or_overwriting_it(self):
        self.camera("VPSSentry", [("VPSSentry/README.md", b"old")], "20261014-190000")
        current = self.camera("VPSSentry", [("VPSSentry/README.md", b"current")])
        with mock.patch.object(MODULE, "_git", return_value=""):
            result = MODULE.preserve_previous_context({"VPSSentry": current})
            receipt = Path(result[0]["receipt"])
            receipt.write_text("tampered receipt")
            with self.assertRaisesRegex(MODULE.ContextError, "receipt conflict"):
                MODULE.preserve_previous_context({"VPSSentry": current})
        self.assertEqual(receipt.read_text(), "tampered receipt")
        self.assertTrue(Path(current["archive"]).exists())

    def test_history_tracked_unpaired_symlinked_or_modified_camera_is_never_moved(self):
        for condition in ("tracked", "unpaired", "symlink", "changed"):
            with self.subTest(condition=condition):
                old = self.camera("VPSSentry", [("VPSSentry/README.md", b"old")], "20261014-190000")
                current = self.camera("VPSSentry", [("VPSSentry/README.md", b"current")])
                old_archive = Path(old["archive"])
                if condition == "unpaired":
                    Path(old["markdown_manifest"]).unlink()
                elif condition == "symlink":
                    target = self.root / "link-target"
                    target.write_bytes(old_archive.read_bytes())
                    old_archive.unlink()
                    old_archive.symlink_to(target)
                elif condition == "changed":
                    old_archive.write_bytes(b"changed")
                with mock.patch.object(MODULE, "_git", return_value="tracked" if condition == "tracked" else ""):
                    with self.assertRaises(MODULE.ContextError):
                        MODULE.preserve_previous_context({"VPSSentry": current})
                self.assertTrue(old_archive.exists())
                # Reset only the fixture files between subtests.
                if old_archive.is_symlink():
                    old_archive.unlink()


if __name__ == "__main__":
    unittest.main()
