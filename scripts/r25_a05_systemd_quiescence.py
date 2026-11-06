"""R25 A05: bounded systemd quiescence, with no import-time host effects.

The failed Nov 6 public promotion gave systemctl stop a 50-second client
timeout while the reviewed web service had TimeoutStopUSec=90 seconds.
This isolated helper makes the state transition explicit, avoiding a false
failure, and refuses to interpret a failed or restarted unit as quiesced.

This module does NOT perform a production deployment or authorize funds.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

ALLOWED_UNITS = frozenset({
    "aoe2hdbets-web-prod.service",
    "aoe2war-r25-1c4ffe0-candidate-v2.service",
})


class QuiescenceHold(RuntimeError):
    """Bounded stop request could not prove complete systemd quiescence."""


@dataclass(frozen=True)
class Observation:
    active_state: str
    main_pid: int

    @classmethod
    def parse(cls, props: dict[str, str]) -> "Observation":
        active = props.get("ActiveState")
        pid_str = props.get("MainPID")
        if active not in {"active", "deactivating", "inactive", "failed"}:
            raise QuiescenceHold("UNRECOGNIZED_SYSTEMD_STATE")
        if not isinstance(pid_str, str) or not pid_str.isdecimal():
            raise QuiescenceHold("UNRECOGNIZED_SYSTEMD_PID")
        return cls(active_state=active, main_pid=int(pid_str))


def await_systemd_stop(
    unit: str,
    *,
    stop_nonblocking: Callable[[str], None],
    observe: Callable[[str], dict[str, str]],
    monotonic: Callable[[], float],
    sleep: Callable[[float], None],
    grace_seconds: float = 125.0,
    interval_seconds: float = 1.0,
) -> Observation:
    """Request a single nonblocking stop and prove a bounded final state.

    Callers must supply the pre-reviewed native systemctl command and reader.
    Unlike waiting on the CLI process, this observes systemd after the request
    and allows the native service's 90-second graceful-stop policy to finish.
    No forced signals, restarts, extra units, or network changes are made here.
    """
    if unit not in ALLOWED_UNITS:
        raise QuiescenceHold("UNIT_OUTSIDE_EXACT_A05_SCOPE")
    if not (105.0 <= grace_seconds <= 180.0):
        raise QuiescenceHold("UNREVIEWED_STOP_DEADLINE")
    if not (0.25 <= interval_seconds <= 5.0):
        raise QuiescenceHold("UNREVIEWED_POLL_INTERVAL")

    before = Observation.parse(observe(unit))
    if before.active_state == "inactive" and before.main_pid == 0:
        return before
    if before.active_state != "active" or before.main_pid <= 1:
        raise QuiescenceHold("INVALID_BEFORE_STOP_STATE")

    deadline = monotonic() + grace_seconds
    stop_nonblocking(unit)
    was_deactivating = False
    while True:
        current = Observation.parse(observe(unit))
        if current.active_state == "inactive" and current.main_pid == 0:
            return current
        if current.active_state == "failed":
            raise QuiescenceHold("SYSTEMD_STOP_FAILED")
        if current.active_state == "inactive" and current.main_pid != 0:
            raise QuiescenceHold("INACTIVE_UNIT_RETAINS_PROCESS")
        if current.active_state == "deactivating":
            was_deactivating = True
        if current.active_state == "active" and (
            current.main_pid != before.main_pid or was_deactivating
        ):
            raise QuiescenceHold("SERVICE_REACTIVATED_DURING_STOP")
        if current.active_state == "deactivating" and current.main_pid not in (
            0, before.main_pid
        ):
            raise QuiescenceHold("PROCESS_IDENTITY_CHANGED_DURING_STOP")
        now = monotonic()
        if now >= deadline:
            raise QuiescenceHold("BOUNDED_STOP_EXPIRED_WITHOUT_INACTIVE_PID0")
        sleep(min(interval_seconds, deadline - now))
