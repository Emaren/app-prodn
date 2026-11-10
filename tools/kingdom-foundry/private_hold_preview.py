#!/usr/bin/env python3
"""F9 explicit OWNER-only offline HOLD preview. Not a scheduled agent.

Only reads an existing owner-private F1 SQLite DB via mode=ro,
requires every F8 observation source UNKNOWN/HOLD and zero scheduler jobs,
then creates one never-overwritten 0600 static HTML file.
No remote service, credential, code execution, live HTTP or trade access.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from foundry import Rejected
from foundry_dashboard import write_private_export
from foundry_hold_only import preview_untrusted_observations
from foundry_secure import PROTECTED_PARTS


def export_hold_only(*, product_root: Path, db_path: Path,
                     private_output_root: Path, destination: Path,
                     max_rows: int = 80):
    root=Path(product_root).expanduser().resolve(strict=True)
    out_root=Path(private_output_root).expanduser().resolve(strict=True)
    if (not out_root.is_dir() or not out_root.is_relative_to(root) or
        any(x.lower() in PROTECTED_PARTS for x in out_root.parts) or
        out_root.stat().st_mode & 0o077):
        raise Rejected("HOLD_PREVIEW_OUTPUT_NOT_PRIVATE_PRODUCT")
    report=preview_untrusted_observations(
        db_path,product_root=root,max_rows=max_rows)
    receipt=write_private_export(
        report,destination,private_root=out_root)
    return {
        "schema":"kingdom.foundry.f9-private-hold-preview.v1",
        "status":"PASS_OWNER_PRIVATE_UNSEALED_HOLD_ONLY_EXPORT",
        "records":report["entriesShown"],
        "sha256":receipt["sha256"],
        "bytes":receipt["bytes"],
        "sourceAuthenticated":False,
        "sourceLedgerExternallyAnchored":False,
        "auditReceipts":0,
        "agentsExecuted":0,
        "networkCalls":0,
        "publicRoutesMounted":0,
        "paperNewOrdersPermitted":False,
        "fundedTradingPermitted":False,
        "financeMutations":0,
    }


def main(argv=None):
    parser=argparse.ArgumentParser(
        description="Offline PRODUCT-only untrusted HOLD records; NEVER a daemon")
    parser.add_argument("--product-root",required=True,type=Path)
    parser.add_argument("--journal",required=True,type=Path)
    parser.add_argument("--private-output-root",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--max-rows",type=int,default=80)
    args=parser.parse_args(argv)
    try:
        proof=export_hold_only(
            product_root=args.product_root,
            db_path=args.journal,
            private_output_root=args.private_output_root,
            destination=args.output,max_rows=args.max_rows)
    except (Rejected,OSError,ValueError):
        # Never print raw paths, report text, tokens or the original exception.
        print("HOLD_F9_PRIVATE_SOURCE_OR_OUTPUT_NOT_ADMITTED",file=sys.stderr)
        return 2
    print(json.dumps(proof,sort_keys=True,separators=(",",":")))
    return 0


if __name__=="__main__":
    sys.exit(main())
