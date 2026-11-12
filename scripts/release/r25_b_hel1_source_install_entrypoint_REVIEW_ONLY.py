#!/usr/bin/env python3
"""Owner-Central admitted HEL1 ONLY root transaction entrypoint.

THIS SOURCE IN PRODUCT IS NEVER AN EXECUTABLE PERMIT. A separate Central
approved immutable root copy, independent HEL1 public signer, one-use packet,
and exact original host preimage are required BEFORE running source-install.
No operation touches website 3032, nginx, or FINANCIAL services.
"""
from __future__ import annotations

import os
from pathlib import Path
import sys

HERE=Path("/usr/local/libexec/aoe2war-b-v22-source-install-v1")
SELF=HERE/"r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py"
BOOT="/proc/sys/kernel/random/boot_id"
HOST="ubuntu-4gb-hel1-11"
KNOWN_BOOT="6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"

def admitted_root_only(argv, *, self_path=SELF):
    # Zero implicit operation, no unrestricted CLI and no non-root access.
    if argv not in (["source-install"], ["recover-exact-original"]):
        raise ValueError("HOLD:B_HEL1_EXACT_SOURCE_INSTALL_OPERATION")
    if os.geteuid()!=0 or not sys.platform.startswith("linux"):
        raise ValueError("HOLD:B_HEL1_NATIVE_ROOT_LINUX_ONLY")
    if Path(__file__).resolve()!=self_path:
        raise ValueError("HOLD:B_HEL1_NOT_IMMUTABLE_INSTALLED_ENTRYPOINT")
    if os.uname().nodename!=HOST:
        raise ValueError("HOLD:B_HEL1_HOST_CHANGED")
    # New installs are pinned to the approved boot. Exact old-source inverse
    # MUST remain possible after a reboot changes the boot UUID.
    if (argv==["source-install"] and
        Path(BOOT).read_text().strip()!=KNOWN_BOOT):
        raise ValueError("HOLD:B_HEL1_INSTALL_BOOT_CHANGED")
    # The source itself is resident only in a root-private parent. The host
    # adapter verifies all six individual modules and the fixed root packet.
    import stat
    pst=HERE.lstat()
    st=self_path.lstat()
    if (not stat.S_ISDIR(pst.st_mode) or pst.st_uid!=0 or
        stat.S_IMODE(pst.st_mode)!=0o700 or
        not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_nlink!=1 or
        stat.S_IMODE(st.st_mode)!=0o500):
        raise ValueError("HOLD:B_HEL1_ENTRYPOINT_ROOT_METADATA")
    return argv[0]

def run_fixed_root_transaction(command):
    # Import only from separately source-hashed root-owned siblings. The host
    # checks their exact root metadata and signature BEFORE mutating anything.
    if str(HERE) not in sys.path:
        sys.path.insert(0,str(HERE))
    from r25_b_v22_linux_host_adapter_REVIEW_ONLY import HEL1SourceInstallHost
    from r25_b_v22_source_install_coordinator_REVIEW_ONLY import SourceInstallCoordinator
    host=HEL1SourceInstallHost()
    if command=="source-install":
        host.require_immutable_root_executor()
        # Authenticate real Central BEFORE constructing transaction/fence.
        admission=host.validate_root_packet_and_independent_central()
        tx=host.make_transaction()
        return SourceInstallCoordinator(host,tx,admission).install()
    if command=="recover-exact-original":
        host.require_root_recovery_executor()
        tx=host.make_transaction()
        return SourceInstallCoordinator(host,tx,{"source_install_only":False,
            "public_activation":False,"financial_authority":False}).recover_original()
    raise ValueError("HOLD:B_HEL1_UNREVIEWED_OPERATION")

if __name__=="__main__":
    try:
        cmd=admitted_root_only(sys.argv[1:])
        import json
        print(json.dumps(run_fixed_root_transaction(cmd),sort_keys=True))
    except Exception as e:
        # Never print private packet / key / signed content / environment.
        print("HOLD:B_HEL1_OWNER_SOURCE_INSTALL_NOT_ADMITTED:"+type(e).__name__)
        sys.exit(3)
