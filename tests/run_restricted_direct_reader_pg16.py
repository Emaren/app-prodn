#!/usr/bin/env python3
"""Disposable AF_UNIX-only PG16 gate for the exact WE1 read contract and WE3 checkout."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PINS = {
    "install.sql": "bb9852b3e25a275c7ae80ca8cc9bb624275bd7a9d74e79b73a5f4c4458a52bfe",
    "fixture.sql": "866c6d54e2a05c9567ff77c8cc3a322a385c1f94571ba8943cd48b3a426c95a8",
}
SOURCES = {
    "lib/socialWriterSession.mjs": "socialWriterSession.mjs",
    "lib/restrictedDirectImageStorage.mjs": "restrictedDirectImageStorage.mjs",
    "lib/socialDirectReaderCore.mjs": "socialDirectReaderCore.mjs",
    "lib/restrictedDirectInboxDto.mjs": "restrictedDirectInboxDto.mjs",
    "lib/restrictedDirectInbox.ts": "restrictedDirectInbox.ts",
    "lib/directMessageAttachmentResponse.ts": "directMessageAttachmentResponse.ts",
    "lib/session.ts": "session.ts",
    "lib/productionAuth.ts": "productionAuth.ts",
    "lib/userDto.ts": "userDto.ts",
    "app/api/contact-emaren/search/route.ts": "search-route.ts",
}

def run(args, cwd, env):
    p = subprocess.run([str(x) for x in args], cwd=cwd, env=env,
                       capture_output=True, text=True, timeout=90)
    if p.stdout:
        print(p.stdout, end="", flush=True)
    if p.returncode:
        raise RuntimeError(p.stderr[-3000:])
    return p.stdout

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--we1-fixture", type=Path, required=True,
                        help="Exact #265 scripts/direct_inbox_reader_v1 directory")
    parser.add_argument("--pg-bin", type=Path, required=True)
    a = parser.parse_args()
    if os.geteuid() == 0:
        raise RuntimeError("FIXTURE_ROOT_FORBIDDEN")
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(("PG", "GIT_", "SOCIAL_", "AOE2WAR_"))
           and k not in ("DATABASE_URL", "DIRECT_URL", "SESSION_SECRET", "NEXTAUTH_SECRET", "NODE_OPTIONS")}
    pg = a.pg_bin.resolve(strict=True)
    if "PostgreSQL) 16." not in run([pg / "postgres", "--version"], ROOT, env):
        raise RuntimeError("PG16_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="direct-reader-e2e-", dir="/tmp") as tmp:
        t = Path(tmp).resolve()
        app = t / "app"
        app.mkdir(mode=0o700)
        for name, digest in PINS.items():
            raw = (a.we1_fixture / name).read_bytes()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise RuntimeError("WE1_FIXTURE_SHA_MISMATCH:" + name)
            (app / name).write_bytes(raw)
        for source, name in SOURCES.items():
            shutil.copyfile(ROOT / source, app / name)
        for source in (ROOT / "tests/restricted-direct-reader-fixture").glob("*.mjs"):
            shutil.copyfile(source, app / source.name)
        (app / "node_modules").symlink_to((ROOT / "node_modules").resolve(strict=True), target_is_directory=True)
        sock = t / "s"
        sock.mkdir(mode=0o700)
        data = t / "data"
        port = 45000 + os.getpid() % 10000
        run([pg / "initdb", "-D", data, "--auth-local=trust", "--auth-host=reject"], app, env)
        started = False
        try:
            run([pg / "pg_ctl", "-D", data, "-o", f"-h '' -k {sock} -p {port}",
                 "-l", t / "log", "-w", "start"], app, env)
            started = True
            for db, name in (("postgres", "fixture.sql"), ("aoe2hd_db", "install.sql")):
                run([pg / "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", sock,
                     "-p", port, "-d", db, "-f", app / name], app, env)
            child_env = {**env, "DIRECT_FIXTURE_SOCKET": str(sock), "DIRECT_FIXTURE_PORT": str(port)}
            run(["node", "real-reader-integration.mjs"], app, child_env)
            shutil.rmtree(t / "images")  # generated fixture only, never a production path
            run(["node", "--experimental-strip-types", "--experimental-loader",
                 "./route-fixture-loader.mjs", "http-reader-integration.mjs"], app, child_env)
        finally:
            if started:
                run([pg / "pg_ctl", "-D", data, "-m", "fast", "-w", "stop"], app, env)
    print("RESTRICTED_DIRECT_READER_PG16_FIXTURE_COMPLETE", flush=True)

if __name__ == "__main__":
    main()
