#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
OPERATIONS = ROOT / "config" / "aoe2war-operations.json"
BUILD_NODE_ENV = "AOE2WAR_BUILD_NODE"

_VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")


class BuildNodeError(RuntimeError):
    pass


@dataclass(frozen=True)
class NodeRuntime:
    node: Path
    version: tuple[int, int, int]

    @property
    def version_text(self) -> str:
        return ".".join(str(part) for part in self.version)

    @property
    def bin_dir(self) -> Path:
        return self.node.parent


def parse_node_version(value: str) -> tuple[int, int, int] | None:
    match = _VERSION.fullmatch(value.strip())
    if not match:
        return None
    return tuple(int(match.group(index)) for index in range(1, 4))


def build_node_contract() -> tuple[int, tuple[int, int, int]]:
    payload = json.loads(OPERATIONS.read_text(encoding="utf-8"))
    toolchain = payload.get("toolchain") or {}
    major = int(toolchain.get("node_major") or 0)
    minimum_text = str(toolchain.get("build_node_min_version") or "").strip()
    minimum = parse_node_version(minimum_text)
    if major <= 0 or minimum is None:
        raise BuildNodeError(
            "operations contract must define node_major and build_node_min_version"
        )
    if minimum[0] != major:
        raise BuildNodeError(
            "build_node_min_version major must match canonical node_major"
        )
    return major, minimum


def _node_version(path: Path) -> tuple[int, int, int] | None:
    try:
        result = subprocess.run(
            [str(path), "--version"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return parse_node_version(result.stdout)


def _candidate_paths() -> Iterable[Path]:
    explicit = os.getenv(BUILD_NODE_ENV, "").strip()
    if explicit:
        yield Path(explicit).expanduser()

    current = shutil.which("node")
    if current:
        yield Path(current)

    home = Path.home()
    nvm = home / ".nvm" / "versions" / "node"
    if nvm.is_dir():
        yield from sorted(
            nvm.glob("v22.*/bin/node"),
            reverse=True,
        )

    for path in (
        Path("/opt/homebrew/opt/node@22/bin/node"),
        Path("/usr/local/opt/node@22/bin/node"),
        Path("/opt/homebrew/bin/node"),
        Path("/usr/local/bin/node"),
    ):
        yield path


def _complete_runtime(path: Path) -> NodeRuntime | None:
    try:
        resolved = path.resolve(strict=True)
    except OSError:
        return None

    version = _node_version(resolved)
    if version is None:
        return None

    for sibling in ("npm", "npx"):
        if not (resolved.parent / sibling).is_file():
            return None

    return NodeRuntime(node=resolved, version=version)


def select_build_node_runtime() -> NodeRuntime:
    major, minimum = build_node_contract()
    explicit = os.getenv(BUILD_NODE_ENV, "").strip()

    seen: set[Path] = set()
    accepted: list[NodeRuntime] = []

    for path in _candidate_paths():
        expanded = path.expanduser()
        try:
            key = expanded.resolve()
        except OSError:
            key = expanded
        if key in seen:
            continue
        seen.add(key)

        runtime = _complete_runtime(expanded)
        if runtime is None:
            if explicit and expanded == Path(explicit).expanduser():
                raise BuildNodeError(
                    f"{BUILD_NODE_ENV} does not name a complete node/npm/npx runtime: "
                    f"{expanded}"
                )
            continue

        if runtime.version[0] != major or runtime.version < minimum:
            if explicit and expanded == Path(explicit).expanduser():
                raise BuildNodeError(
                    f"{BUILD_NODE_ENV}={runtime.node} is Node {runtime.version_text}; "
                    f"release/build requires Node {major} >= "
                    f"{'.'.join(map(str, minimum))}"
                )
            continue

        if explicit and expanded == Path(explicit).expanduser():
            return runtime
        accepted.append(runtime)

    if not accepted:
        raise BuildNodeError(
            "no compatible Node build runtime found; "
            f"release/build requires Node {major} >= {'.'.join(map(str, minimum))}. "
            f"Install a compatible Node {major} runtime or set {BUILD_NODE_ENV}."
        )

    return max(accepted, key=lambda item: item.version)


def ensure_build_node_runtime() -> NodeRuntime:
    runtime = select_build_node_runtime()
    current_path = os.environ.get("PATH", "")
    parts = [
        part for part in current_path.split(os.pathsep)
        if part and Path(part) != runtime.bin_dir
    ]
    os.environ["PATH"] = os.pathsep.join([str(runtime.bin_dir), *parts])
    os.environ[BUILD_NODE_ENV] = str(runtime.node)
    os.environ["AOE2WAR_BUILD_NODE_VERSION"] = runtime.version_text
    return runtime
