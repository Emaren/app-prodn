#!/usr/bin/env python3
"""F10 explicit one-shot read-only PRODUCT observer, NO daemon or executor.

Only fixed host probes, no network, output file or private credentials.
stdout is restricted to fixed fields and source SHA "unknown"; failures
print a generic HOLD without leaking service logs or host file paths.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import sys

from foundry import Rejected
from nightforge_host_probes import (
    HOST_SYSTEMD, probe_systemd_local, probe_local_storage,
    evaluate_untrusted_local_probe
)


def one_shot(kind: str, *, lane: str, unit: str | None = None,
             linux_identity_sha256: str | None = None):
    if lane not in ("PRODUCT_B", "PRODUCT_C"):
        raise Rejected("HOLD_PROBE_CLI_LANE")
    observed=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if kind=="systemd":
        if linux_identity_sha256 is not None or unit not in HOST_SYSTEMD:
            raise Rejected("HOLD_PROBE_CLI_SYSTEMD_SCOPE")
        raw=probe_systemd_local(unit,lane=lane,observed_utc=observed)
    elif kind=="mac-storage":
        if unit is not None or linux_identity_sha256 is not None:
            raise Rejected("HOLD_PROBE_CLI_MAC_SCOPE")
        raw=probe_local_storage(
            "M1_MAC_LOCAL",lane=lane,observed_utc=observed)
    elif kind=="hel1-root":
        if unit is not None:
            raise Rejected("HOLD_PROBE_CLI_ROOT_SCOPE")
        raw=probe_local_storage("HEL1_ROOT_LOCAL",lane=lane,
            observed_utc=observed,
            approved_linux_machine_id_sha256=linux_identity_sha256)
    else:
        raise Rejected("HOLD_PROBE_CLI_UNAPPROVED_KIND")
    current=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    analysis=evaluate_untrusted_local_probe(raw,owner_now_utc=current)
    if (analysis["status"] != "HOLD_UNVERIFIED_SOURCE_NO_TASK_ADMISSION" or
        analysis["sourceGitSHA"] != "unknown" or
        analysis["dispatchAllowed"] is not False or
        analysis["executionEnabled"] is not False):
        raise Rejected("HOLD_PROBE_CLI_TRUST_ESCALATION")
    observed_values=json.loads(raw)["data"]
    return {
        "schema":"kingdom.nightforge.f10-manual-readonly.v1",
        "status":"HOLD_UNATTESTED_LOCAL_SOURCE",
        "lane":lane,
        "kind":kind,
        "observedUtcSelfReported":observed,
        "diagnosticCode":analysis["code"],
        "severity":analysis["severity"],
        "contentSHA256":sha256(raw).hexdigest(),
        "sourceGitSHA":"unknown",
        "observedServiceState":(
            observed_values["active"] if kind=="systemd" else None),
        "availableMiBSelfReported":(
            observed_values["available_mib"] if kind!="systemd" else None),
        "sourceExternallyAttested":False,
        "backupCertified":False,
        "nativePaperPriceVerified":False,
        "agentExecutionEnabled":False,
        "dispatchAllowed":False,
        "paperOrdersAllowed":False,
        "realOrdersAllowed":False,
        "financeAllowed":False,
        "networkCalls":0,
        "fileWrites":0,
    }


def main(argv=None):
    parser=argparse.ArgumentParser(
        description="One-shot, read-only, untrusted PRODUCT observation (never an agent)")
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--systemd-unit",choices=sorted(HOST_SYSTEMD))
    group.add_argument("--mac-storage",action="store_true")
    group.add_argument("--hel1-root",action="store_true")
    parser.add_argument("--lane",choices=("PRODUCT_B","PRODUCT_C"),
                        default="PRODUCT_C")
    parser.add_argument("--approved-linux-machine-id-sha256")
    args=parser.parse_args(argv)
    kind=("systemd" if args.systemd_unit else
          "mac-storage" if args.mac_storage else "hel1-root")
    try:
        result=one_shot(
            kind,lane=args.lane,unit=args.systemd_unit,
            linux_identity_sha256=args.approved_linux_machine_id_sha256)
    except (Rejected,OSError,ValueError):
        print("HOLD_F10_HOST_PROBE_NOT_ADMITTED",file=sys.stderr)
        return 2
    print(json.dumps(result,sort_keys=True,separators=(",",":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
