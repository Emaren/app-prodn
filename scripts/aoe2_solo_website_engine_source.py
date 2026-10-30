#!/usr/bin/env python3
"""Bind external release-controller adapters to an exact clean W1/post-W1 checkout.

The candidate's compiled website source remains byte-for-byte the frozen Git
tree. These checks never reset/fetch/clean or make release authorization.
"""
from __future__ import annotations
import os
from pathlib import Path
import subprocess

W1="b46a51f1592c9f296839924ae55e722618b10d35"
POST="fa5c350b35cba7ace8d4515a7ad52ba4e1534295"
OLD="33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a"

class Hold(RuntimeError):
    pass

def check(ok, message):
    if not ok: raise Hold("SOLO_CANDIDATE_HOLD: " + message)

def command(root, *args, timeout=15):
    p=subprocess.run(["git","-C",str(root),*args],
        capture_output=True,text=True,timeout=timeout,check=False)
    check(p.returncode==0,"candidate Git read failed: "+str(args[0]))
    return p.stdout.strip()

def validate_candidate(value, *, expected=None):
    path=Path(value)
    check(path.is_absolute() and path.is_dir() and not path.is_symlink(),
          "canonical absolute directory only")
    for item in (path, *path.parents):
        check(not item.is_symlink(),"candidate ancestor is symlink")
    resolved=path.resolve(strict=True)
    check(resolved == path,"noncanonical candidate checkout")
    head=command(path,"rev-parse","HEAD")
    check(head in (W1,POST),"not one of the exact approved source SHAs")
    if expected is not None: check(head==expected,"requested source mismatch")
    check(command(path,"rev-parse","--show-toplevel")==str(path),
          "candidate not repository root")
    check(command(path,"status","--porcelain=v1","--untracked-files=all")=="",
          "candidate worktree dirty/untracked")
    for part in ("scripts/aoe2_release.py","scripts/aoe2_release_stage.py",
                 "scripts/aoe2_release_ship.py","scripts/aoe2_release_gate.py"):
        check((path/part).is_file() and not (path/part).is_symlink(),
              "missing or linked frozen release source: "+part)
    return path,head

def exact_candidate_script_dir():
    candidate=os.getenv("AOE2_SOLO_WEBSITE_CANDIDATE_ROOT", "")
    check(candidate != "","missing explicit exact candidate root")
    path,_=validate_candidate(candidate)
    return path/"scripts"
