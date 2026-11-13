#!/usr/bin/env python3
"""B-owner artifact delivery. gh retains OAuth locally; URLs are never logged."""
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import select
import stat
import subprocess
import time
import zipfile

GH = "/opt/homebrew/bin/gh"


def need(ok, reason):
    if not ok:
        raise RuntimeError("HOLD_PRODUCT_TRANSPORT_" + reason)


def sha(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(part)
    return value.hexdigest()


def emit(state, count, total, expected, started, resumed=0, retry=0,
         verification="pending"):
    elapsed = time.monotonic() - started
    print(json.dumps({
        "phase": "artifact-download", "state": state, "bytes": count,
        "totalBytes": total,
        "throughputBps": round(max(0, count - resumed) / max(elapsed, .001)),
        "elapsedMs": round(elapsed * 1000), "expectedSha256": expected,
        "verification": verification, "retryCount": retry, "resumedBytes": resumed,
    }), flush=True)


def private_dir(path):
    path = Path(path)
    if not path.exists():
        path.mkdir(mode=0o700, parents=False)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
         stat.S_IMODE(info.st_mode) == 0o700 and not path.is_symlink(),
         "CACHE_DIRECTORY_AUTHORITY")
    return path


def checked_file(path):
    info = Path(path).lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
         info.st_nlink == 1 and not Path(path).is_symlink() and
         not stat.S_IMODE(info.st_mode) & 0o077, "CACHE_FILE_AUTHORITY")
    return info


def stop(process):
    if process is not None:
        if process.poll() is None:
            process.kill()
        process.wait()


def gh_stream(artifact_id, offset):
    command = [GH, "api", "--include", "-H", "Accept: application/vnd.github+json"]
    if offset:
        command += ["-H", "Range: bytes=" + str(offset) + "-"]
    command += [
        "repos/Emaren/app-prodn/actions/artifacts/" + str(artifact_id) + "/zip"
    ]
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
    )
    try:
        header = bytearray()
        deadline = time.monotonic() + 45
        while not header.endswith(b"\r\n\r\n") and not header.endswith(b"\n\n"):
            need(time.monotonic() < deadline, "HTTP_HEADER_TIMEOUT_RESUME_AVAILABLE")
            ready, _, _ = select.select([process.stdout], [], [], 1)
            if not ready:
                continue
            piece = os.read(process.stdout.fileno(), 1)
            need(piece and len(header) < 65536, "HTTP_HEADERS_GH_AUTH_OR_NETWORK")
            header.extend(piece)
        lines = header.decode("iso-8859-1").splitlines()
        match = re.fullmatch(r"HTTP/[^ ]+ (\d{3})(?: .*)?", lines[0])
        need(match is not None, "HTTP_STATUS")
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.lower()] = value.strip()
        return int(match.group(1)), headers, process.stdout, process
    except BaseException:
        stop(process)
        raise


def download(cache, artifact_id, total, expected_sha, fetch=gh_stream, retries=2):
    need(
        type(artifact_id) is int and artifact_id > 0 and type(total) is int
        and 0 < total < 2_000_000_000 and type(expected_sha) is str
        and re.fullmatch("[0-9a-f]{64}", expected_sha)
        and expected_sha != "0" * 64, "ARTIFACT_IDENTITY",
    )
    cache = private_dir(cache)
    final = cache / (expected_sha + ".zip")
    part = cache / (expected_sha + ".part")
    need(not final.is_symlink() and not part.is_symlink(), "CACHE_FILE_AUTHORITY")
    lock = cache / (expected_sha + ".lock")
    lockfd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        checked_file(lock)
        started = time.monotonic()
        if final.exists():
            need(checked_file(final).st_size == total and sha(final) == expected_sha,
                 "CACHE_DIGEST")
            emit("cached", total, total, expected_sha, started, total,
                 verification="pass")
            return final
        for retry in range(retries + 1):
            resumed = checked_file(part).st_size if part.exists() else 0
            need(resumed <= total, "PARTIAL_OVERSIZE")
            emit("resuming" if resumed else "running", resumed, total, expected_sha,
                 started, resumed, retry)
            if resumed == total:
                break
            process = None
            out = None
            try:
                code, headers, stream, process = fetch(artifact_id, resumed)
                if resumed and code == 200:
                    # Ignored Range: restart, never append the full response.
                    resumed = 0
                    emit("restart-range-ignored", 0, total, expected_sha,
                         started, 0, retry)
                else:
                    need(code == (206 if resumed else 200), "HTTP_STATUS_" + str(code))
                if code == 206:
                    need(
                        headers.get("content-range") ==
                        "bytes " + str(resumed) + "-" + str(total - 1) + "/" + str(total),
                        "RANGE_IDENTITY",
                    )
                if "content-length" in headers:
                    need(headers["content-length"].isdigit() and
                         int(headers["content-length"]) == total - resumed,
                         "CONTENT_LENGTH")
                out = os.open(
                    part, os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW |
                    (os.O_APPEND if resumed else os.O_TRUNC), 0o600
                )
                checked_file(part)
                count = resumed
                last_progress = last_data = time.monotonic()
                while True:
                    if process is not None:
                        ready, _, _ = select.select([stream], [], [], 5)
                        now = time.monotonic()
                        if not ready:
                            os.fsync(out)
                            emit("waiting", count, total, expected_sha, started,
                                 resumed, retry)
                            need(now - last_data < 90, "STALLED_RESUME_AVAILABLE")
                            continue
                        chunk = os.read(stream.fileno(), 1024 * 1024)
                    else:
                        chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    need(count + len(chunk) <= total, "DOWNLOAD_OVERSIZE")
                    need(os.write(out, chunk) == len(chunk), "SHORT_WRITE")
                    count += len(chunk)
                    last_data = time.monotonic()
                    if last_data - last_progress >= 1:
                        emit("running", count, total, expected_sha, started,
                             resumed, retry)
                        last_progress = last_data
                os.fsync(out)
                if process is not None:
                    need(process.wait(timeout=15) == 0, "GH_AUTH_OR_NETWORK")
                if count == total:
                    break
                need(retry < retries, "INTERRUPTED_RESUME_AVAILABLE")
            except (OSError, RuntimeError, subprocess.TimeoutExpired):
                emit("retry" if retry < retries else "hold",
                     part.stat().st_size if part.exists() else 0,
                     total, expected_sha, started, resumed, retry)
                if retry == retries:
                    raise
            finally:
                if out is not None:
                    try:
                        os.fsync(out)
                    finally:
                        os.close(out)
                # Also executes for KeyboardInterrupt: no orphan gh download.
                stop(process)
        need(part.exists() and checked_file(part).st_size == total,
             "INCOMPLETE_RESUME_AVAILABLE")
        if sha(part) != expected_sha:
            emit("hold", total, total, expected_sha, started, verification="fail")
            raise RuntimeError("HOLD_PRODUCT_TRANSPORT_SHA_MISMATCH_PARTIAL_PRESERVED")
        need(not final.exists() and not final.is_symlink(), "CACHE_RACE")
        os.replace(part, final)
        directory = os.open(cache, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        emit("verified", total, total, expected_sha, started, verification="pass")
        return final
    finally:
        os.close(lockfd)


def member(archive, basename, dest, expected_sha=None, limit=1_000_000_000):
    """Extract one exact member; an existing proof is verified, never overwritten."""
    dest = Path(dest)
    need(dest.parent.is_dir() and not dest.parent.is_symlink(), "EXTRACTION_PARENT")
    need(not dest.is_symlink(), "MEMBER_DESTINATION_SYMLINK")
    with zipfile.ZipFile(archive) as zipped:
        entries = zipped.infolist()
        need(0 < len(entries) < 10000, "ZIP_ENTRY_LIMIT")
        names = [entry.filename for entry in entries]
        need(len(names) == len(set(names)), "DUPLICATE_ZIP_MEMBER")
        for entry in entries:
            name = PurePosixPath(entry.filename)
            need(not name.is_absolute() and ".." not in name.parts
                 and "\\" not in entry.filename, "ZIP_PATH")
            need(not stat.S_ISLNK(entry.external_attr >> 16), "ZIP_SYMLINK")
        selected = [entry for entry in entries if entry.filename == basename]
        need(len(selected) == 1 and 0 < selected[0].file_size <= limit,
             "MEMBER_SELECTION")
        if dest.exists():
            checked_file(dest)
            need(expected_sha is not None and sha(dest) == expected_sha,
                 "EXISTING_MEMBER_MISMATCH")
            return dest
        temp = dest.with_name(dest.name + ".part")
        need(not temp.exists() and not temp.is_symlink(), "EXTRACTION_PARTIAL_HOLD")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with zipped.open(selected[0]) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    need(os.write(fd, chunk) == len(chunk), "MEMBER_SHORT_WRITE")
            os.fsync(fd)
        finally:
            os.close(fd)
        if expected_sha is not None:
            need(sha(temp) == expected_sha, "MEMBER_SHA")
        os.replace(temp, dest)
        directory = os.open(dest.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    return dest


def validate_proof(proof_path, source, build, run_id, archive):
    proof = json.loads(Path(proof_path).read_text())
    need(
        proof.get("status") ==
        "PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER"
        and proof.get("source_commit") == source
        and proof.get("build_id") == build and proof.get("run_id") == run_id
        and proof.get("os") == "linux" and proof.get("arch") == "x86_64"
        and proof.get("node") == "v22.22.0"
        and proof.get("financial_authorized") is False
        and proof.get("root_stage_authorized") is False
        and proof.get("public_3032_activation_authorized") is False,
        "INDEPENDENT_PROOF_IDENTITY",
    )
    need(type(proof.get("runtime_entries_verified")) is int and
         1000 < proof["runtime_entries_verified"] < 200000,
         "INDEPENDENT_MEMBER_ACCEPTANCE")
    need(Path(archive).stat().st_size == proof.get("runtime_archive_bytes") and
         sha(archive) == proof.get("runtime_archive_sha256"), "RUNTIME_DIGEST")
    return proof
