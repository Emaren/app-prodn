#!/usr/bin/env python3
"""B-owner artifact delivery. gh retains OAuth locally; URLs are never logged."""
import concurrent.futures
import fcntl
import queue
import shutil
import tempfile
import threading
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


def gh_stream(artifact_id, offset, end=None, cancel=None):
    command = [GH, "api", "--include", "-H", "Accept: application/vnd.github+json"]
    if offset or end is not None:
        command += ["-H", "Range: bytes=" + str(offset) + "-" +
                    (str(end) if end is not None else "")]
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
            need(cancel is None or not cancel.is_set(), "RANGE_CANCELLED_RESUME_AVAILABLE")
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



# Same authenticated GitHub API and exact-range contract as the accepted
# B-owner prefetch helper. OAuth and redirect URLs stay inside local gh.
PARALLEL_RANGE_BYTES = 1024 * 1024
PARALLEL_RANGE_WORKERS = 10
PARALLEL_MIN_BYTES = 8 * 1024 * 1024
PARALLEL_RANGE_TIMEOUT = 80
PARALLEL_DOWNLOAD_TIMEOUT = 1800


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def range_json(path, value):
    """Publish one immutable private receipt after its payload is fsynced."""
    raw = (json.dumps(value, sort_keys=True) + "\n").encode()
    need(not path.is_symlink(), "RANGE_RECEIPT_AUTHORITY")
    if path.exists():
        checked_file(path)
        need(path.read_bytes() == raw, "RANGE_RECEIPT_COLLISION")
        return
    descriptor, temporary = tempfile.mkstemp(prefix=".range-receipt-", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        offset = 0
        while offset < len(raw):
            written = os.write(descriptor, raw[offset:])
            need(written > 0, "RANGE_RECEIPT_SHORT_WRITE")
            offset += written
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        # link() cannot overwrite an unexpected existing receipt.
        os.link(temporary, path, follow_symlinks=False)
        os.unlink(temporary)
        temporary = None
        fsync_directory(path.parent)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None and os.path.lexists(temporary):
            os.unlink(temporary)


def range_read_json(path):
    info = checked_file(path)
    need(info.st_size <= 4096, "RANGE_RECEIPT_SIZE")
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        raise RuntimeError("HOLD_PRODUCT_TRANSPORT_RANGE_RECEIPT_PARSE") from None
    need(type(value) is dict, "RANGE_RECEIPT_PARSE")
    return value


def range_body(fetch, artifact_id, start, end, total, cancel):
    """Read at most one MiB plus one byte; kill gh on every exit path."""
    process = None
    began = time.monotonic()
    expected_length = end - start + 1
    try:
        code, headers, stream, process = fetch(artifact_id, start, end, cancel)
        need(code == 206, "RANGE_HTTP_STATUS_" + str(code))
        need(headers.get("content-range") == f"bytes {start}-{end}/{total}",
             "RANGE_IDENTITY")
        if "content-length" in headers:
            length = headers["content-length"]
            need(type(length) is str and length.isdigit() and
                 int(length) == expected_length, "RANGE_CONTENT_LENGTH")
        body = bytearray()
        while True:
            need(not cancel.is_set(), "RANGE_CANCELLED_RESUME_AVAILABLE")
            need(time.monotonic() - began < PARALLEL_RANGE_TIMEOUT,
                 "RANGE_TIMEOUT_RESUME_AVAILABLE")
            if process is not None:
                ready, _, _ = select.select([stream], [], [], 1)
                if not ready:
                    continue
                part = os.read(stream.fileno(), min(65536, expected_length + 1 - len(body)))
            else:
                part = stream.read(min(65536, expected_length + 1 - len(body)))
            if not part:
                break
            body.extend(part)
            need(len(body) <= expected_length, "RANGE_BODY_OVERSIZE")
        need(len(body) == expected_length, "RANGE_BODY_TRUNCATED")
        if process is not None:
            remaining = max(1, min(15, PARALLEL_RANGE_TIMEOUT - (time.monotonic() - began)))
            need(process.wait(timeout=remaining) == 0, "RANGE_GH_AUTH_OR_NETWORK")
        return bytes(body)
    finally:
        stop(process)


def parallel_download(cache, artifact_id, total, expected_sha, fetch, retries, started):
    """Resume only receipt-backed ranges, never apparent preallocated bytes.

    The old contiguous <sha>.part is not opened or modified. A sparse private
    payload avoids keeping a second full assembled archive. Completed-range
    receipts remain immutable during interrupted acquisition. Whole-ZIP SHA
    remains mandatory before the payload can become the ordinary cache ZIP.
    """
    directory = private_dir(cache / (expected_sha + ".ranges-v1"))
    identity_path = directory / "identity.json"
    payload = directory / "payload.part"
    identity = {
        "schema": "aoe2war.product.range-cache.v1",
        "artifactId": artifact_id, "artifactBytes": total,
        "artifactSha256": expected_sha, "chunkBytes": PARALLEL_RANGE_BYTES,
    }
    need(not identity_path.is_symlink() and not payload.is_symlink(),
         "RANGE_CACHE_AUTHORITY")
    if identity_path.exists():
        need(range_read_json(identity_path) == identity, "RANGE_CACHE_IDENTITY")
    else:
        need(not any(directory.iterdir()), "RANGE_CACHE_UNCLASSIFIED_CONTENT")
        range_json(identity_path, identity)
    ranges = [(start, min(start + PARALLEL_RANGE_BYTES, total) - 1)
              for start in range(0, total, PARALLEL_RANGE_BYTES)]
    need(len(ranges) <= 2000, "RANGE_COUNT_BUDGET")
    receipts = {
        start: directory / (str(start).zfill(10) + "-" + str(end).zfill(10) + ".json")
        for start, end in ranges
    }
    has_receipts = any(path.exists() or path.is_symlink() for path in receipts.values())
    need(payload.exists() or not has_receipts, "RANGE_PAYLOAD_MISSING_WITH_RECEIPTS")
    descriptor = None
    cancel = threading.Event()
    updates = queue.Queue()
    completed = set()
    count = resumed = retry_count = 0

    def drain():
        nonlocal count, retry_count
        while True:
            try:
                kind, start, amount = updates.get_nowait()
            except queue.Empty:
                return
            if kind == "retry":
                retry_count += 1
            elif start not in completed:
                completed.add(start)
                count += amount

    def receipt_base(start, end):
        return {
            "schema": "aoe2war.product.range-receipt.v1",
            "artifactId": artifact_id, "artifactBytes": total,
            "artifactSha256": expected_sha,
            "start": start, "end": end, "bytes": end - start + 1,
        }

    def valid_completed(start, end):
        path = receipts[start]
        need(not path.is_symlink(), "RANGE_RECEIPT_AUTHORITY")
        if not path.exists():
            return False
        value = range_read_json(path)
        base = receipt_base(start, end)
        need(set(value) == set(base) | {"sha256"} and
             all(value[key] == expected for key, expected in base.items()),
             "RANGE_RECEIPT_IDENTITY")
        digest = value["sha256"]
        need(type(digest) is str and re.fullmatch("[0-9a-f]{64}", digest),
             "RANGE_RECEIPT_DIGEST")
        actual = os.pread(descriptor, end - start + 1, start)
        need(len(actual) == end - start + 1 and
             hashlib.sha256(actual).hexdigest() == digest, "RANGE_CHUNK_DIGEST")
        return True

    def worker(start, end):
        for attempt in range(retries + 1):
            need(not cancel.is_set(), "RANGE_CANCELLED_RESUME_AVAILABLE")
            try:
                body = range_body(fetch, artifact_id, start, end, total, cancel)
                need(not cancel.is_set(), "RANGE_CANCELLED_RESUME_AVAILABLE")
                offset = 0
                while offset < len(body):
                    written = os.pwrite(descriptor, body[offset:], start + offset)
                    need(written > 0, "RANGE_PAYLOAD_SHORT_WRITE")
                    offset += written
                os.fsync(descriptor)
                digest = hashlib.sha256(body).hexdigest()
                actual = os.pread(descriptor, len(body), start)
                need(len(actual) == len(body) and hashlib.sha256(actual).hexdigest() == digest,
                     "RANGE_PAYLOAD_READBACK")
                range_json(receipts[start], {**receipt_base(start, end), "sha256": digest})
                updates.put(("complete", start, len(body)))
                return
            except (OSError, RuntimeError, subprocess.TimeoutExpired):
                if cancel.is_set() or attempt == retries:
                    raise
                updates.put(("retry", start, 0))
                if cancel.wait(min(attempt + 1, 3)):
                    raise RuntimeError("HOLD_PRODUCT_TRANSPORT_RANGE_CANCELLED_RESUME_AVAILABLE")

    try:
        if payload.exists():
            info = checked_file(payload)
            descriptor = os.open(payload, os.O_RDWR | os.O_NOFOLLOW)
            current = os.fstat(descriptor)
            need((current.st_dev, current.st_ino) == (info.st_dev, info.st_ino),
                 "RANGE_PAYLOAD_RACE")
            if info.st_size == 0 and not has_receipts:
                os.ftruncate(descriptor, total)
                os.fsync(descriptor)
            else:
                need(info.st_size == total, "RANGE_PAYLOAD_SIZE")
        else:
            descriptor = os.open(payload, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(descriptor, 0o600)
            os.ftruncate(descriptor, total)
            os.fsync(descriptor)
            fsync_directory(directory)
        checked_file(payload)
        emit("range-validating", 0, total, expected_sha, started)
        last_progress = time.monotonic()
        for start, end in ranges:
            if valid_completed(start, end):
                completed.add(start)
                count += end - start + 1
            if time.monotonic() - last_progress >= 1:
                emit("range-validating", count, total, expected_sha, started, count)
                last_progress = time.monotonic()
        resumed = count
        emit("range-resuming" if resumed else "range-running",
             count, total, expected_sha, started, resumed)
        need(shutil.disk_usage(cache).free >= total - count + 64 * 1024 * 1024,
             "RANGE_CACHE_HEADROOM")
        missing = [(start, end) for start, end in ranges if start not in completed]
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=PARALLEL_RANGE_WORKERS)
        futures = set()
        try:
            futures = {pool.submit(worker, start, end) for start, end in missing}
            pending = set(futures)
            last_progress = time.monotonic()
            while pending:
                need(time.monotonic() - started < PARALLEL_DOWNLOAD_TIMEOUT,
                     "RANGE_DEADLINE_RESUME_AVAILABLE")
                done, pending = concurrent.futures.wait(
                    pending, timeout=1, return_when=concurrent.futures.FIRST_COMPLETED
                )
                prior_count, prior_retries = count, retry_count
                drain()
                for future in done:
                    future.result()
                now = time.monotonic()
                if now - last_progress >= 1 or retry_count != prior_retries:
                    state = "range-retry" if retry_count != prior_retries else (
                        "range-running" if count > prior_count else "range-waiting"
                    )
                    emit(state, count, total, expected_sha, started, resumed, retry_count)
                    last_progress = now
            drain()
        finally:
            cancel.set()
            for future in futures:
                future.cancel()
            pool.shutdown(wait=True, cancel_futures=True)
            drain()
        need(count == total, "RANGE_COMPLETED_BYTE_COUNT")
        os.fsync(descriptor)
        emit("range-verifying", count, total, expected_sha, started, resumed, retry_count)
        if sha(payload) != expected_sha:
            raise RuntimeError("HOLD_PRODUCT_TRANSPORT_SHA_MISMATCH_RANGES_PRESERVED")
        final = cache / (expected_sha + ".zip")
        need(not final.exists() and not final.is_symlink(), "CACHE_RACE")
        os.replace(payload, final)
        fsync_directory(directory)
        fsync_directory(cache)
        checked_file(final)
        emit("verified", total, total, expected_sha, started, resumed, retry_count,
             verification="pass")
        return final
    except BaseException as error:
        cancel.set()
        drain()
        emit("hold", count, total, expected_sha, started, resumed, retry_count,
             verification="fail" if "SHA_MISMATCH" in str(error) else "pending")
        raise
    finally:
        if descriptor is not None:
            os.close(descriptor)


def download(cache, artifact_id, total, expected_sha, fetch=gh_stream, retries=2, range_fetch=None):
    need(
        type(artifact_id) is int and artifact_id > 0 and type(total) is int
        and 0 < total < 2_000_000_000 and type(expected_sha) is str
        and re.fullmatch("[0-9a-f]{64}", expected_sha)
        and expected_sha != "0" * 64, "ARTIFACT_IDENTITY",
    )
    need(type(retries) is int and 0 <= retries <= 5, "RETRY_BUDGET")
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
        contiguous = checked_file(part).st_size if part.exists() else 0
        need(contiguous <= total, "PARTIAL_OVERSIZE")
        # Injected sequential fetchers and small proof ZIPs retain their
        # existing path. A complete contiguous part still gets whole-SHA
        # verification rather than another acquisition.
        if (total >= PARALLEL_MIN_BYTES and contiguous < total and
                (fetch is gh_stream or range_fetch is not None)):
            return parallel_download(
                cache, artifact_id, total, expected_sha, range_fetch or gh_stream,
                retries, started,
            )
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
