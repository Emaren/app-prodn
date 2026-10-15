#!/usr/bin/env python3
"""Read-only source/camera binding and lossless local camera preservation.

These helpers do not capture context, update Git, or mutate production. The
caller must hold the maintenance lock throughout snapshot, capture and verify.
"""
from __future__ import annotations

import hashlib
import gzip
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path, PurePosixPath
from typing import Any


class ContextError(RuntimeError):
    pass


CANONICAL_BRANCHES = {
    "app-prodn": "main", "api-prodn": "main", "aoe2-watcher": "main",
    "vpssentry": "main", "wolochain": "wolo-1-mainnet-prep",
    "AoE2WAR-docs": "main",
}
CANONICAL_ORIGINS = {
    "app-prodn": "github.com/Emaren/app-prodn",
    "api-prodn": "github.com/Emaren/api-prodn",
    "aoe2-watcher": "github.com/Emaren/aoe2-watcher",
    "vpssentry": "github.com/Emaren/VPSSentry",
    "wolochain": "github.com/Emaren/wolochain",
    "AoE2WAR-docs": "github.com/Emaren/AoE2WAR-docs",
}
CAMERA_SOURCES = {
    "app-prodn": ("AoE2HDBets", "AoE2HDBets/app-prodn"),
    "api-prodn": ("AoE2HDBets", "AoE2HDBets/api-prodn"),
    "aoe2-watcher": ("aoe2-watcher", "aoe2-watcher"),
    "vpssentry": ("VPSSentry", "VPSSentry"),
    "wolochain": ("WoloChain-wolo-1", "WoloChain-wolo-1"),
    "AoE2WAR-docs": ("AoE2WAR-docs", "AoE2WAR-docs"),
}
CODE_SENTINELS = {
    "app-prodn": "scripts/aoe2_update.py", "api-prodn": "app.py",
    "aoe2-watcher": "watcher.js", "vpssentry": "bin/full-context-all",
    "wolochain": "app/app.go", "AoE2WAR-docs": "scripts/sync_workspace.py",
}
REGISTRY = "docs/document-registry.json"
SHA_RE = re.compile(r"[0-9a-f]{40}")
MANIFEST_RE = re.compile(r"([0-9a-fA-F]{64})  ([^\r\n/\\]+)\n?")


def _git(repo: Path, *args: str) -> str:
    try:
        p = subprocess.run(["git", "-C", str(repo), *args], check=False,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ContextError(f"source Git probe failed: {repo.name}") from exc
    if p.returncode:
        raise ContextError(f"source Git probe failed: {repo.name}: {args[0]}")
    return p.stdout.rstrip("\n")


def _origin_identity(origin: str) -> str:
    # Accept the repository's SSH and HTTPS transports, never URL credentials,
    # query parameters, local file remotes, or an unrelated similarly named repo.
    match = re.fullmatch(r"(?:git@github\.com:|https://github\.com/|ssh://git@github\.com/)(Emaren/[A-Za-z0-9._-]+?)(?:\.git)?", origin)
    return "github.com/" + match.group(1) if match else ""


def _identity(repo_id: str, repo: Path, *, expected_remote: str | None = None) -> dict[str, str]:
    if not repo.is_dir() or repo.is_symlink():
        raise ContextError(f"source is missing or symlinked: {repo_id}")
    if Path(_git(repo, "rev-parse", "--show-toplevel")).resolve() != repo.resolve():
        raise ContextError(f"{repo_id}: source path is not the Git repository root")
    branch = _git(repo, "branch", "--show-current")
    if branch != CANONICAL_BRANCHES[repo_id]:
        raise ContextError(f"{repo_id}: expected canonical branch {CANONICAL_BRANCHES[repo_id]}, found {branch or 'detached'}")
    origin = _origin_identity(_git(repo, "remote", "get-url", "origin"))
    if origin != CANONICAL_ORIGINS[repo_id]:
        raise ContextError(f"{repo_id}: origin is not the canonical repository")
    if _git(repo, "status", "--porcelain=v1", "--untracked-files=all"):
        raise ContextError(f"{repo_id}: source worktree is dirty")
    head = _git(repo, "rev-parse", "HEAD")
    if not SHA_RE.fullmatch(head):
        raise ContextError(f"{repo_id}: invalid source HEAD")
    if expected_remote is not None:
        if repo_id != "AoE2WAR-docs" or not SHA_RE.fullmatch(expected_remote):
            raise ContextError("remote override is limited to an exact central documentation recovery SHA")
        # The caller independently validates the durable recovery receipt. This
        # helper still requires a clean canonical source and a forward-only
        # candidate already present in its object store.
        _git(repo, "merge-base", "--is-ancestor", head, expected_remote)
    remote_head = expected_remote or head
    remote = _git(repo, "ls-remote", "--exit-code", "origin", f"refs/heads/{branch}")
    if remote.splitlines() != [f"{remote_head}\trefs/heads/{branch}"]:
        raise ContextError(f"{repo_id}: source HEAD differs from canonical origin/{branch}")
    return {"repo": str(repo.resolve()), "branch": branch, "head": head,
            "tree": _git(repo, "rev-parse", "HEAD^{tree}"), "origin": origin,
            "remote_head": remote_head}


def _regular(path: Path) -> None:
    if not path.is_file() or path.is_symlink() or any(p.is_symlink() for p in path.parents):
        raise ContextError(f"expected regular non-symlink file: {path}")


def _digest(path: Path) -> str:
    _regular(path)
    h = hashlib.sha256()
    with path.open("rb") as source:
        for data in iter(lambda: source.read(1024 * 1024), b""):
            h.update(data)
    return h.hexdigest()


def _relative(name: str) -> str:
    parts = PurePosixPath(name).parts
    if not name or name.startswith("/") or "\\" in name or any(p in (".", "..") for p in name.split("/")):
        raise ContextError(f"unsafe source/archive path: {name!r}")
    if not parts:
        raise ContextError("empty source/archive path")
    return "/".join(parts)


def source_snapshot(sources: dict[str, Path], docs: Path, *, docs_remote: str | None = None) -> dict[str, dict[str, Any]]:
    """Bind clean canonical remote-exact Git states and selected source bytes.

    Includes every registry document, exact registry bytes, and real code from
    every repository. Git tree identity covers the broader committed source.
    Central catalog bytes are recorded independently; central synchronization
    may deliberately change only that repository between separate snapshots.
    """
    if set(sources) != set(CANONICAL_BRANCHES) - {"AoE2WAR-docs"}:
        raise ContextError("source authority membership differs from the five canonical repositories")
    repos = {**sources, "AoE2WAR-docs": docs}
    def identity_for(repo_id: str, repo: Path) -> dict[str, str]:
        if repo_id == "AoE2WAR-docs" and docs_remote is not None:
            return _identity(repo_id, repo, expected_remote=docs_remote)
        return _identity(repo_id, repo)
    result: dict[str, dict[str, Any]] = {}
    for repo_id, repo_value in sorted(repos.items()):
        repo = Path(repo_value)
        identity = identity_for(repo_id, repo)
        tracked = set(_git(repo, "ls-files", "-z").split("\0"))
        selected = {CODE_SENTINELS[repo_id]}
        if repo_id == "AoE2WAR-docs":
            selected |= {"catalog/document-taxonomy.json", "catalog/runtime/repository-state.json"}
            selected |= {f"catalog/registries/{key}.json" for key in sources}
        else:
            _regular(repo / REGISTRY)
            try:
                registry = json.loads((repo / REGISTRY).read_text(encoding="utf-8"))
                if registry["repo"] != repo_id or not isinstance(registry["documents"], list):
                    raise ValueError("registry membership")
                document_paths = [item["path"] for item in registry["documents"]]
                if len(document_paths) != len(set(document_paths)):
                    raise ValueError("duplicate document path")
                selected |= {_relative(name) for name in document_paths}
            except (ValueError, TypeError, KeyError, OSError) as exc:
                raise ContextError(f"{repo_id}: invalid documentation registry") from exc
            selected.add(REGISTRY)
        for name in selected:
            if name not in tracked:
                raise ContextError(f"{repo_id}: selected source is not tracked: {name}")
        files = {name: _digest(repo / name) for name in sorted(selected)}
        project, prefix = CAMERA_SOURCES[repo_id]
        proof_group = "AoE2HDBets" if repo_id in {"app-prodn", "api-prodn"} else repo.name
        result[repo_id] = {**identity, "files": files, "archive_project": project,
                           "archive_prefix": prefix,
                           "archive_proof": f"__proof__/{proof_group}/repos/{repo.name}/git-info.txt",
                           "registry_sha256": files.get(REGISTRY)}
    # Reject changes to an earlier source while later repositories were read.
    for repo_id, repo in repos.items():
        observed = identity_for(repo_id, Path(repo))
        if observed != {k: result[repo_id][k] for k in observed}:
            raise ContextError(f"{repo_id}: source changed during snapshot")
    return result


def verify_source_snapshot(expected: dict[str, Any], sources: dict[str, Path], docs: Path, *, docs_remote: str | None = None) -> dict[str, Any]:
    actual = source_snapshot(sources, docs, docs_remote=docs_remote)
    if actual != expected:
        changed = sorted(key for key in set(actual) | set(expected) if actual.get(key) != expected.get(key))
        raise ContextError(f"source authority changed during maintenance: {', '.join(changed)}")
    return actual


def _verify_manifest(path: Path, manifest: Path) -> str:
    _regular(manifest)
    try:
        match = MANIFEST_RE.fullmatch(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise ContextError(f"unreadable checksum manifest: {manifest}") from exc
    if not match or match.group(2) != path.name:
        raise ContextError(f"malformed or non-portable checksum manifest: {manifest}")
    digest = _digest(path)
    if match.group(1).lower() != digest:
        raise ContextError(f"checksum mismatch: {path}")
    return digest


def _verify_pair(entry: dict[str, Any]) -> dict[str, str]:
    paths = {key: Path(entry[key]) for key in ("archive", "manifest", "markdown", "markdown_manifest")}
    archive_sha = _verify_manifest(paths["archive"], paths["manifest"])
    markdown_sha = _verify_manifest(paths["markdown"], paths["markdown_manifest"])
    if entry.get("sha256") != archive_sha or entry.get("markdown_sha256") != markdown_sha:
        raise ContextError("camera entry hash differs from the verified files")
    text = paths["markdown"].read_text(encoding="utf-8")
    if (re.findall(r"^- source_archive: `([^`]+)`$", text, re.M) != [paths["archive"].name]
            or re.findall(r"^- source_sha256: `([0-9a-f]{64})`$", text, re.M) != [archive_sha]):
        raise ContextError("Markdown camera companion has a different source binding")
    return {"sha256": archive_sha, "markdown_sha256": markdown_sha}


def latest_context_archives(context_root: Path, snapshot: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Resolve the latest complete canonical camera per required source series.

    Ordering uses the camera timestamp, never a mutable file mtime. The caller
    must validate actual archive source bindings before declaring these current.
    """
    context_root = Path(context_root)
    result: dict[str, dict[str, Any]] = {}
    for project in sorted({row["archive_project"] for row in snapshot.values()}):
        candidates: list[tuple[str, Path]] = []
        pattern = re.compile(re.escape(project) + r"-context-[A-Za-z0-9_.-]+-(\d{8}-\d{6})\.tgz")
        for path in (context_root / "tgz").glob(f"{project}-context-*.tgz"):
            match = pattern.fullmatch(path.name)
            if not match:
                raise ContextError(f"unrecognized camera generation: {path.name}")
            candidates.append((match.group(1), path))
        if not candidates:
            raise ContextError(f"missing source context archive: {project}")
        latest = max(stamp for stamp, _path in candidates)
        selected = [path for stamp, path in candidates if stamp == latest]
        if len(selected) != 1:
            raise ContextError(f"ambiguous latest camera generation: {project}")
        archive = selected[0]
        markdown = context_root / "md" / (archive.stem + ".md")
        entry = {"archive": str(archive),
                 "manifest": str(context_root / "sha256" / (archive.name + ".sha256")),
                 "markdown": str(markdown),
                 "markdown_manifest": str(context_root / "sha256" / (markdown.name + ".sha256")),
                 "sha256": _digest(archive), "markdown_sha256": _digest(markdown),
                 "bytes": archive.stat().st_size, "markdown_bytes": markdown.stat().st_size}
        _verify_pair(entry)
        result[project] = entry
    return result


def verify_context_sources(archives: dict[str, dict[str, Any]], snapshot: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Read actual TGZ bytes without extracting, and bind to captured sources.

    A valid checksum for an empty, malformed, stale, or unrelated archive is
    insufficient. Reject unsafe members, links, duplicates and missing source.
    Source stability must also be revalidated by the caller after this returns.
    """
    required_projects = {row["archive_project"] for row in snapshot.values()}
    if not required_projects <= set(archives):
        raise ContextError(f"missing source context archives: {sorted(required_projects - set(archives))}")
    bindings: dict[str, Any] = {}
    for project, entry in sorted(archives.items()):
        hashes = _verify_pair(entry)
        archive = Path(entry["archive"])
        root = archive.stem
        expected: dict[str, tuple[str, str, str]] = {}
        proofs: dict[str, dict[str, Any]] = {}
        for repo_id, row in snapshot.items():
            if row["archive_project"] != project:
                continue
            for path, digest in row["files"].items():
                if path.startswith("context/"):
                    # The camera deliberately relocates curated context.
                    relative = f"__context__/{Path(row['repo']).name}/{path[len('context/'):]}"
                else:
                    relative = f"{row['archive_prefix']}/{path}"
                expected[f"{root}/{relative}"] = (repo_id, path, digest)
            if row.get("archive_proof"):
                proofs[f"{root}/{row['archive_proof']}"] = row
        found: set[str] = set()
        found_proofs: set[str] = set()
        members: set[str] = set()
        file_count = 0
        try:
            with gzip.open(archive, "rb") as compressed, tarfile.open(fileobj=compressed, mode="r|") as tgz:
                for member in tgz:
                    name = _relative(member.name.rstrip("/"))
                    if name != root and not name.startswith(root + "/"):
                        raise ContextError(f"{project}: archive member has an unexpected root")
                    if name in members:
                        raise ContextError(f"{project}: duplicate archive member: {name}")
                    members.add(name)
                    if not (member.isfile() or member.isdir()):
                        raise ContextError(f"{project}: unsafe archive member type: {name}")
                    if not member.isfile():
                        continue
                    file_count += 1
                    stream = tgz.extractfile(member)
                    if stream is None:
                        raise ContextError(f"{project}: unreadable archive member")
                    h = hashlib.sha256()
                    proof_data = bytearray()
                    if name in proofs and member.size > 65536:
                        raise ContextError(f"{project}: oversized Git proof")
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        h.update(chunk)
                        if name in proofs:
                            proof_data.extend(chunk)
                    if name in expected:
                        repo_id, path, digest = expected[name]
                        if h.hexdigest() != digest:
                            raise ContextError(f"{project}: archived source bytes differ: {repo_id}/{path}")
                        found.add(name)
                    if name in proofs:
                        row = proofs[name]
                        try:
                            pairs = [line.split(": ", 1) for line in proof_data.decode("utf-8").splitlines() if ": " in line]
                            info = dict(pairs)
                        except (UnicodeDecodeError, ValueError) as exc:
                            raise ContextError(f"{project}: malformed source Git proof") from exc
                        if (len(info) != len(pairs) or info.get("head") != row["head"]
                                or info.get("branch") != row["branch"]
                                or info.get("repo") != row["repo"] or info.get("dirty_files") != "0"):
                            raise ContextError(f"{project}: archived source Git proof differs from stable source identity")
                        found_proofs.add(name)
                # tar readers stop at end-of-archive blocks. Consume the gzip
                # footer too so truncation/CRC corruption cannot go unnoticed.
                while compressed.read(1024 * 1024):
                    pass
        except (tarfile.TarError, OSError, EOFError) as exc:
            raise ContextError(f"{project}: unreadable or malformed context TGZ") from exc
        if not file_count:
            raise ContextError(f"{project}: empty context archive")
        missing = sorted(set(expected) - found)
        if missing:
            raise ContextError(f"{project}: context archive missing bound source: {missing[0]}")
        if set(proofs) != found_proofs:
            raise ContextError(f"{project}: context archive missing source Git proof")
        if _verify_pair(entry) != hashes:
            raise ContextError(f"{project}: context archive changed during verification")
        bindings[project] = {**hashes, "archive": str(archive), "regular_files": file_count,
                              "bound_files": len(found), "source_proofs": len(found_proofs),
                              "sources": sorted({v[0] for v in expected.values()})}
    return bindings


def _write_immutable(path: Path, data: bytes) -> None:
    try:
        with path.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except FileExistsError:
        _regular(path)
        if path.read_bytes() != data:
            raise ContextError(f"history preservation receipt conflict: {path}")


def _fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def preserve_previous_context(archives: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Move only verified older generated camera pairs to ignored history.

    The receipt is written before any move. Interrupted moves are resumable;
    existing destinations must have the original hash. No archive is deleted.
    Never relocate a tracked file or follow a symlink. Fresh cameras must have
    passed verify_context_sources before calling this helper.
    """
    results: list[dict[str, Any]] = []
    for project, current in sorted(archives.items()):
        _verify_pair(current)
        active = Path(current["archive"])
        context = active.parent.parent
        if active.parent.name != "tgz" or context.name != "context":
            raise ContextError("history preservation is limited to the local camera context/tgz namespace")
        repo = context.parent
        history = context / "repo-parity-backups" / "context-history"
        if any(p.is_symlink() for p in [context, active.parent, history, history.parent]):
            raise ContextError("symlinked camera history namespace")
        # Union includes partially moved generations from a previous attempt.
        candidates = {p.name for p in (context / "tgz").glob(f"{project}-context-*.tgz")}
        candidates |= {p.stem + ".tgz" for p in (context / "md").glob(f"{project}-context-*.md")}
        if history.is_dir():
            candidates |= {p.name for p in history.glob(f"{project}-context-*") if p.is_dir()}
        candidates.discard(active.name)
        for basename in sorted(candidates):
            if not re.fullmatch(re.escape(project) + r"-context-[A-Za-z0-9_.-]+-\d{8}-\d{6}\.tgz", basename):
                raise ContextError(f"unrecognized camera generation: {basename}")
            if basename[-19:-4] >= active.name[-19:-4]:
                raise ContextError(f"camera history candidate is not older than the verified camera: {basename}")
            generation = history / basename
            if generation.is_symlink():
                raise ContextError("symlinked camera history generation")
            markdown_name = basename[:-4] + ".md"
            originals = [context / "tgz" / basename, context / "sha256" / (basename + ".sha256"),
                         context / "md" / markdown_name, context / "sha256" / (markdown_name + ".sha256")]
            targets = [generation / p.name for p in originals]
            effective = [src if src.exists() else dst for src, dst in zip(originals, targets)]
            for src, dst in zip(originals, targets):
                relative = str(src.relative_to(repo))
                if _git(repo, "ls-files", "--", relative):
                    raise ContextError(f"refusing to relocate tracked camera file: {relative}")
                if src.is_symlink() or dst.is_symlink():
                    raise ContextError("symlinked camera file")
            entry = dict(zip(("archive", "manifest", "markdown", "markdown_manifest"), map(str, effective)))
            entry["sha256"] = _digest(effective[0])
            entry["markdown_sha256"] = _digest(effective[2])
            _verify_pair(entry)
            verify_context_sources({project: entry}, {})
            file_rows = [{"source": str(src.relative_to(context)), "destination": dst.name,
                          "sha256": _digest(path)} for src, dst, path in zip(originals, targets, effective)]
            receipt = {"schema": 1, "operation": "lossless-local-context-history", "project": project,
                       "generation": basename, "files": file_rows}
            data = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode()
            generation.mkdir(parents=True, exist_ok=True)
            _write_immutable(generation / "preservation.json", data)
            _write_immutable(generation / "preservation.json.sha256", (hashlib.sha256(data).hexdigest() + "  preservation.json\n").encode())
            for directory in (generation, history, history.parent, context):
                _fsync_directory(directory)
            # All checks finish before touching any original. Existing duplicate
            # destinations fail closed; neither copy is silently discarded.
            for src, dst, row in zip(originals, targets, file_rows):
                if src.exists() and dst.exists():
                    raise ContextError(f"camera history destination already exists; both originals preserved: {dst}")
                if _digest(src if src.exists() else dst) != row["sha256"]:
                    raise ContextError("camera generation changed before preservation")
            for src, dst in zip(originals, targets):
                if src.exists():
                    os.rename(src, dst)
                    _fsync_directory(src.parent)
                    _fsync_directory(dst.parent)
            for dst, row in zip(targets, file_rows):
                if _digest(dst) != row["sha256"]:
                    raise ContextError("preserved camera hash mismatch")
            results.append({"project": project, "generation": basename,
                            "receipt": str(generation / "preservation.json"), "files": file_rows})
    return results
