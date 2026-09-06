#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import getpass
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "aoe2war"
FINISH_LOCK = ROOT / ".aoe2war-release" / "finish.lock"

DEFAULT_URL = os.getenv("AOE2WAR_OS_BRIDGE_URL", "https://aoe2war.com").rstrip("/")
DEFAULT_TOKEN_FILE = Path(
    os.getenv(
        "AOE2WAR_OS_BRIDGE_TOKEN_FILE",
        "~/.config/aoe2war/os-bridge-token",
    )
).expanduser()

VERSION = "1.3.0"

ACTIONS = {
    "status",
    "audit",
    "doctor",
    "brain",
    "control_refresh",
    "update_plan",
    "update_apply",
    "deploy_plan",
    "deploy",
    "finish",
    "rollback_preview",
    "rollback",
}


class BridgeError(RuntimeError):
    pass


def load_token(token_file: Path = DEFAULT_TOKEN_FILE) -> str:
    env_value = os.getenv("AOE2WAR_OS_BRIDGE_TOKEN", "").strip()
    if env_value:
        return env_value

    try:
        value = token_file.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise BridgeError(
            "AoE2WAR OS bridge token is not configured. "
            f"Set AOE2WAR_OS_BRIDGE_TOKEN or create {token_file}."
        ) from exc

    if not value:
        raise BridgeError(f"Bridge token file is empty: {token_file}")
    return value


def finish_in_progress() -> bool:
    if not FINISH_LOCK.exists():
        return False
    try:
        with FINISH_LOCK.open("a+", encoding="utf-8") as handle:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            return False
    except OSError:
        return False


def bridge_id() -> str:
    configured = os.getenv("AOE2WAR_OS_BRIDGE_ID", "").strip()
    if configured:
        return configured[:100]
    return f"{socket.gethostname()}-{getpass.getuser()}"[:100]


def bridge_fields(current_run_id: str | None = None) -> dict[str, Any]:
    return {
        "bridgeId": bridge_id(),
        "hostname": socket.gethostname(),
        "platform": f"{platform.system()} {platform.machine()}",
        "version": VERSION,
        "capabilities": sorted(ACTIONS),
        "currentRunId": current_run_id,
    }


def post_bridge(
    payload: dict[str, Any],
    *,
    token: str,
    base_url: str = DEFAULT_URL,
    timeout: int = 30,
) -> dict[str, Any]:
    body = {
        **bridge_fields(
            str(payload.get("runId")) if payload.get("runId") else None
        ),
        **payload,
    }
    request = urllib.request.Request(
        f"{base_url}/api/internal/aoe2war-os/bridge",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-aoe2war-os-key": token,
            "User-Agent": f"AoE2WAR-Operator-Bridge/{VERSION}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise BridgeError(
            f"Bridge API HTTP {exc.code}: {detail[:1200]}"
        ) from exc
    except urllib.error.URLError as exc:
        raise BridgeError(f"Bridge API unavailable: {exc}") from exc


def local_head() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        cwd=str(ROOT),
        text=True,
    ).strip()


def command_for_run(run: dict[str, Any]) -> list[str]:
    action = str(run.get("action") or "")
    if action not in ACTIONS:
        raise BridgeError(f"Unsupported bridge action: {action!r}")

    if action == "status":
        return [str(CLI), "status", "--json"]
    if action == "audit":
        return [str(CLI), "audit", "--json"]
    if action == "doctor":
        return [str(CLI), "doctor"]
    if action == "brain":
        return [str(CLI), "brain", "--json"]
    if action == "control_refresh":
        return [str(CLI), "control", "refresh"]
    if action == "update_plan":
        return [str(CLI), "update", "--json"]
    if action == "update_apply":
        return [str(CLI), "update", "--apply"]
    if action == "deploy_plan":
        return [str(CLI), "deploy", "--dry-run"]
    if action == "deploy":
        expected = str(run.get("expectedSourceSha") or "").strip()
        actual = local_head()
        if not expected or expected != actual:
            raise BridgeError(
                "Deploy source moved after the UI request. "
                f"expected={expected or '(missing)'} actual={actual}"
            )
        return [str(CLI), "deploy"]
    if action == "finish":
        parameters = run.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {}
        message = str(parameters.get("message") or "Finish AoE2WAR work")[:200]
        command = [str(CLI), "finish", "--json", "--message", message]
        if parameters.get("dryRun") is True:
            command.append("--dry-run")
        if parameters.get("preserveContextHistory") is True:
            command.append("--preserve-context-history")
        return command
    if action == "rollback_preview":
        return [str(CLI), "rollback", "--dry-run", "--json"]
    if action == "rollback":
        return [str(CLI), "rollback"]

    raise BridgeError(f"Unhandled action: {action}")


def try_parse_json(text: str) -> Any:
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def send_event(
    run_id: str,
    message: str,
    *,
    token: str,
    base_url: str,
    kind: str = "stdout",
) -> None:
    post_bridge(
        {
            "op": "event",
            "runId": run_id,
            "kind": kind,
            "message": message[:8000],
        },
        token=token,
        base_url=base_url,
    )


def publish_snapshot(
    *,
    token: str,
    base_url: str,
    run_id: str | None,
    source_action: str,
    payload: dict[str, Any],
) -> None:
    post_bridge(
        {
            "op": "snapshot",
            "runId": run_id,
            "sourceAction": source_action,
            "payload": payload,
        },
        token=token,
        base_url=base_url,
        timeout=45,
    )


def publish_kingdom_intelligence(
    *,
    token: str,
    base_url: str,
    run_id: str | None,
    source_action: str,
    payload: dict[str, Any],
) -> None:
    post_bridge(
        {
            "op": "kingdom_intelligence",
            "runId": run_id,
            "sourceAction": source_action,
            "payload": payload,
        },
        token=token,
        base_url=base_url,
        timeout=45,
    )


def run_kingdom_intelligence_snapshot(
    *,
    token: str,
    base_url: str,
    run_id: str | None,
    source_action: str,
) -> dict[str, Any] | None:
    process = subprocess.run(
        [str(CLI), "brain", "--json"],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=240,
    )
    if process.returncode not in (0, 1):
        return None

    payload = try_parse_json(process.stdout)
    if not isinstance(payload, dict):
        return None
    if payload.get("kind") != "aoe2war-kingdom-intelligence":
        return None

    publish_kingdom_intelligence(
        token=token,
        base_url=base_url,
        run_id=run_id,
        source_action=source_action,
        payload=payload,
    )
    return payload


def kingdom_intelligence_loop(
    stop: threading.Event,
    *,
    token: str,
    base_url: str,
    interval_seconds: float,
) -> None:
    interval = max(120.0, interval_seconds)
    while not stop.wait(interval):
        if finish_in_progress():
            continue
        try:
            snapshot = run_kingdom_intelligence_snapshot(
                token=token,
                base_url=base_url,
                run_id=None,
                source_action="bridge_periodic",
            )
            if snapshot:
                print(
                    "[kingdom intelligence] "
                    f"{snapshot.get('war_date')} · "
                    f"{snapshot.get('operating_state')}",
                    flush=True,
                )
        except Exception as exc:
            print(
                f"[kingdom intelligence warning] {exc}",
                file=sys.stderr,
                flush=True,
            )


def run_audit_snapshot(
    *,
    token: str,
    base_url: str,
    run_id: str | None,
    source_action: str,
) -> dict[str, Any] | None:
    process = subprocess.run(
        [str(CLI), "audit", "--json"],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=360,
    )
    if process.returncode not in (0, 1):
        return None

    payload = try_parse_json(process.stdout)
    if not isinstance(payload, dict):
        return None

    publish_snapshot(
        token=token,
        base_url=base_url,
        run_id=run_id,
        source_action=source_action,
        payload=payload,
    )
    return payload


def heartbeat_loop(
    stop: threading.Event,
    *,
    token: str,
    base_url: str,
    run_id: str | None,
) -> None:
    while not stop.wait(10):
        try:
            post_bridge(
                {
                    "op": "heartbeat",
                    "currentRunId": run_id,
                },
                token=token,
                base_url=base_url,
            )
        except Exception as exc:
            print(f"[bridge heartbeat warning] {exc}", file=sys.stderr, flush=True)


def execute_run(
    run: dict[str, Any],
    *,
    token: str,
    base_url: str,
) -> int:
    run_id = str(run.get("id") or "")
    action = str(run.get("action") or "")
    if not run_id:
        raise BridgeError("Claimed run is missing id.")

    try:
        command = command_for_run(run)
    except Exception as exc:
        post_bridge(
            {
                "op": "complete",
                "runId": run_id,
                "exitCode": 2,
                "error": str(exc),
                "stdoutTail": "",
            },
            token=token,
            base_url=base_url,
        )
        raise

    send_event(
        run_id,
        "$ " + " ".join(command),
        token=token,
        base_url=base_url,
        kind="system",
    )

    stop = threading.Event()
    heartbeat = threading.Thread(
        target=heartbeat_loop,
        kwargs={
            "stop": stop,
            "token": token,
            "base_url": base_url,
            "run_id": run_id,
        },
        daemon=True,
    )
    heartbeat.start()

    output_lines: list[str] = []
    process: subprocess.Popen[str] | None = None

    try:
        child_env = os.environ.copy()
        child_env["AOE2WAR_OPERATOR_BRIDGE_RUN_ID"] = run_id
        process = subprocess.Popen(
            command,
            cwd=str(ROOT),
            env=child_env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
        )
        assert process.stdout is not None

        for line in process.stdout:
            clean = line.rstrip("\n")
            output_lines.append(clean)
            if len(output_lines) > 1200:
                output_lines = output_lines[-1200:]
            try:
                send_event(
                    run_id,
                    clean or " ",
                    token=token,
                    base_url=base_url,
                )
            except Exception as exc:
                print(f"[bridge event warning] {exc}", file=sys.stderr, flush=True)

        exit_code = process.wait()
    finally:
        stop.set()
        heartbeat.join(timeout=2)

    output = "\n".join(output_lines)
    result = try_parse_json(output)
    error = None if exit_code == 0 else output[-20_000:]

    post_bridge(
        {
            "op": "complete",
            "runId": run_id,
            "exitCode": exit_code,
            "result": result,
            "error": error,
            "stdoutTail": output[-40_000:],
        },
        token=token,
        base_url=base_url,
    )

    if exit_code == 0:
        if action == "brain" and isinstance(result, dict):
            publish_kingdom_intelligence(
                token=token,
                base_url=base_url,
                run_id=run_id,
                source_action=action,
                payload=result,
            )
        elif action == "audit" and isinstance(result, dict):
            publish_snapshot(
                token=token,
                base_url=base_url,
                run_id=run_id,
                source_action=action,
                payload=result,
            )
        elif action in {
            "control_refresh",
            "update_apply",
            "deploy",
            "finish",
            "rollback",
        }:
            run_audit_snapshot(
                token=token,
                base_url=base_url,
                run_id=run_id,
                source_action=action,
            )
            try:
                run_kingdom_intelligence_snapshot(
                    token=token,
                    base_url=base_url,
                    run_id=run_id,
                    source_action=action,
                )
            except Exception as exc:
                print(
                    f"[kingdom intelligence warning] {exc}",
                    file=sys.stderr,
                    flush=True,
                )

    return exit_code


def run_bridge(
    *,
    token: str,
    base_url: str,
    once: bool,
    interval: float,
    initial_audit: bool,
) -> int:
    print("⚔️  AoE2WAR OS Operator Bridge", flush=True)
    print(f"bridge: {bridge_id()}", flush=True)
    print(f"endpoint: {base_url}", flush=True)

    post_bridge(
        {"op": "heartbeat"},
        token=token,
        base_url=base_url,
    )

    if initial_audit:
        print("publishing initial estate audit snapshot...", flush=True)
        snapshot = run_audit_snapshot(
            token=token,
            base_url=base_url,
            run_id=None,
            source_action="bridge_startup",
        )
        print(
            "initial snapshot: "
            + (
                f"P0={snapshot.get('p0')} P1={snapshot.get('p1')}"
                if snapshot
                else "unavailable"
            ),
            flush=True,
        )

    print("publishing initial Kingdom Intelligence snapshot...", flush=True)
    try:
        intelligence = run_kingdom_intelligence_snapshot(
            token=token,
            base_url=base_url,
            run_id=None,
            source_action="bridge_startup",
        )
        print(
            "Kingdom Intelligence: "
            + (
                f"{intelligence.get('war_date')} · "
                f"{intelligence.get('operating_state')}"
                if intelligence
                else "unavailable"
            ),
            flush=True,
        )
    except Exception as exc:
        print(
            f"[kingdom intelligence warning] {exc}",
            file=sys.stderr,
            flush=True,
        )

    intelligence_stop = threading.Event()
    intelligence_thread = threading.Thread(
        target=kingdom_intelligence_loop,
        kwargs={
            "stop": intelligence_stop,
            "token": token,
            "base_url": base_url,
            "interval_seconds": float(
                os.getenv("AOE2WAR_KI_REFRESH_SECONDS", "300")
            ),
        },
        daemon=True,
    )
    intelligence_thread.start()

    while True:
        if finish_in_progress():
            post_bridge(
                {"op": "heartbeat"},
                token=token,
                base_url=base_url,
            )
            if once:
                print("finish in progress; no command claimed", flush=True)
                return 0
            time.sleep(max(1.0, interval))
            continue

        response = post_bridge(
            {"op": "claim"},
            token=token,
            base_url=base_url,
        )
        run = response.get("run")

        if isinstance(run, dict):
            print(
                f"claimed {run.get('id')} · {run.get('action')}",
                flush=True,
            )
            try:
                exit_code = execute_run(
                    run,
                    token=token,
                    base_url=base_url,
                )
                print(
                    f"completed {run.get('id')} exit={exit_code}",
                    flush=True,
                )
                if run.get("action") == "finish":
                    print(
                        "reloading Operator Bridge after finish...",
                        flush=True,
                    )
                    os.execv(sys.executable, [sys.executable, *sys.argv])
            except Exception as exc:
                print(f"run failed: {exc}", file=sys.stderr, flush=True)
        elif once:
            print("no queued command", flush=True)

        if once:
            return 0

        time.sleep(max(1.0, interval))


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war bridge",
        description=(
            "Outbound-only Operator Bridge between the AoE2WAR Admin War Room "
            "and the local protected aoe2war CLI."
        ),
    )
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=float, default=3.0)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--no-initial-audit", action="store_true")
    args = parser.parse_args()

    try:
        token = load_token()
        return run_bridge(
            token=token,
            base_url=args.url.rstrip("/"),
            once=args.once,
            interval=args.interval,
            initial_audit=not args.no_initial_audit,
        )
    except KeyboardInterrupt:
        print("\nbridge stopped", flush=True)
        return 130
    except Exception as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
